import * as THREE from 'three';
import { buildSpriteCharacter, partFromUV } from './spritechar.js';
import { SpriteAnimator } from './spriteanimator.js';
import { Behavior } from './behavior.js';
import {
  showBubble,
  say,
  randomLine,
  loadAffection,
  updateAffection,
  getAffection,
  affectionLevelName
} from './ui.js';

const canvas = document.getElementById('stage');

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  premultipliedAlpha: true,
  powerPreference: 'high-performance'
});
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const VIEW_CENTER_Y = 0.60;
camera.position.set(0, VIEW_CENTER_Y, 6.4);
camera.lookAt(0, VIEW_CENTER_Y, 0);

// 灯光：卡通渲染需要干净的明暗分层，总强度必须压在 1.2 以内，否则色阶全部顶亮
const hemi = new THREE.HemisphereLight(0xffffff, 0xbfa8dd, 0.62);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xfff6ef, 1.05);
keyLight.position.set(2.6, 4.6, 4.2);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xffc3e0, 0.52);
rimLight.position.set(-3.4, 2.0, -2.8);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xc6dcff, 0.26);
fillLight.position.set(-2.4, 0.6, 3.4);
scene.add(fillLight);

const ambient = new THREE.AmbientLight(0xffffff, 0.16);
scene.add(ambient);

// 脚下的柔和投影，让角色有落地感
function createContactShadow() {
  const size = 256;
  const canvasShadow = document.createElement('canvas');
  canvasShadow.width = size;
  canvasShadow.height = size;
  const ctx = canvasShadow.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(72, 40, 96, 0.42)');
  grad.addColorStop(0.55, 'rgba(72, 40, 96, 0.16)');
  grad.addColorStop(1, 'rgba(72, 40, 96, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvasShadow);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -1.43, 0.05);
  mesh.renderOrder = -2;
  return mesh;
}

const character = buildSpriteCharacter();
scene.add(character.root);
const contactShadow = createContactShadow();
scene.add(contactShadow);

const animator = new SpriteAnimator(character);
animator.root.position.y = 0;

// 命中包围盒脏标记（resize 会用到，必须提前声明）
let boundsDirty = true;

// ---------- 尺寸适配 ----------
// 桌宠整体缩小：角色在窗口内所占高度比例下调，留出呼吸空间
function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;

  const targetHeight = 5.00;
  const targetWidth = 3.70;
  const fovRad = (camera.fov * Math.PI) / 180;
  const distByHeight = targetHeight / 2 / Math.tan(fovRad / 2);
  const distByWidth = targetWidth / 2 / (Math.tan(fovRad / 2) * camera.aspect);
  camera.position.z = Math.max(distByHeight, distByWidth);
  camera.position.y = VIEW_CENTER_Y;
  camera.lookAt(0, VIEW_CENTER_Y, 0);
  camera.updateProjectionMatrix();
  boundsDirty = true;
}

window.addEventListener('resize', resize);
resize();

// ---------- 命中检测与鼠标穿透 ----------
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2(0, 0);
let hoveringCharacter = false;
let lastIgnoreState = null;
let dragging = false;
let dragStartPoint = null;
let downPart = null;
let lastPointer = { x: 0, y: 0, t: 0 };

let boundsTimer = 0;
const worldBox = new THREE.Box3();
const screenBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const _v = new THREE.Vector3();

function setIgnore(ignore) {
  if (lastIgnoreState === ignore) return;
  lastIgnoreState = ignore;
  if (window.petBridge) window.petBridge.setIgnoreMouse(ignore);
}

/** 每 0.2s 或角色移动后刷新一次屏幕包围矩形。 */
function refreshScreenBox() {
  worldBox.setFromObject(character.root);
  const rect = renderer.domElement.getBoundingClientRect();
  screenBox.minX = Infinity;
  screenBox.minY = Infinity;
  screenBox.maxX = -Infinity;
  screenBox.maxY = -Infinity;
  for (let i = 0; i < 8; i += 1) {
    _v.set(
      i & 1 ? worldBox.max.x : worldBox.min.x,
      i & 2 ? worldBox.max.y : worldBox.min.y,
      i & 4 ? worldBox.max.z : worldBox.min.z
    );
    _v.project(camera);
    const sx = ((_v.x + 1) / 2) * rect.width + rect.left;
    const sy = ((1 - _v.y) / 2) * rect.height + rect.top;
    if (sx < screenBox.minX) screenBox.minX = sx;
    if (sx > screenBox.maxX) screenBox.maxX = sx;
    if (sy < screenBox.minY) screenBox.minY = sy;
    if (sy > screenBox.maxY) screenBox.maxY = sy;
  }
  boundsDirty = false;
}

/** 精确判定命中的身体部位（贴图方案：用命中点 UV 反推部位）。 */
function raycastPart(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObject(character.root, true);
  for (const hit of hits) {
    if (hit.uv) return partFromUV(hit.uv.x, hit.uv.y);
    let node = hit.object;
    while (node) {
      if (node.userData && node.userData.part) return node.userData.part;
      node = node.parent;
    }
  }
  return null;
}

/**
 * 组合判定：屏幕包围盒（宽容 12px）负责“能不能点得到”，
 * raycast 负责“点到的是哪个部位”。这样既不会漏点，也不会误吞窗口外的点击。
 */
const HIT_PADDING = 12;

function hitTest(clientX, clientY) {
  if (boundsDirty) refreshScreenBox();
  const inBox =
    clientX >= screenBox.minX - HIT_PADDING &&
    clientX <= screenBox.maxX + HIT_PADDING &&
    clientY >= screenBox.minY - HIT_PADDING &&
    clientY <= screenBox.maxY + HIT_PADDING;

  const part = raycastPart(clientX, clientY);
  return { hit: inBox || part !== null, part };
}

function handlePointerMove(event) {
  const result = hitTest(event.clientX, event.clientY);
  hoveringCharacter = result.hit;

  if (!dragging) {
    setIgnore(!result.hit);
    document.body.style.cursor = result.hit ? 'grab' : 'default';
  } else {
    document.body.style.cursor = 'grabbing';
    const now = performance.now();
    const dt = Math.max(1, now - lastPointer.t);
    const vx = ((event.clientX - lastPointer.x) / dt) * 1000;
    const vy = ((event.clientY - lastPointer.y) / dt) * 1000;
    animator.setDragVelocity(vx, vy);
  }

  lastPointer = { x: event.clientX, y: event.clientY, t: performance.now() };
  updateLook(event.clientX, event.clientY);
}

function updateLook(clientX, clientY) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const nx = (clientX / width) * 2 - 1;
  const ny = (clientY / height) * 2 - 1;
  animator.setLook(nx * 1.2, ny * 1.2);
  behavior.setMouse(nx, ny, true);
}

canvas.addEventListener('pointermove', handlePointerMove);

canvas.addEventListener('pointerleave', () => {
  hoveringCharacter = false;
  if (!dragging) {
    setIgnore(true);
    animator.setLook(0, 0);
  }
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  const result = hitTest(event.clientX, event.clientY);
  if (!result.hit) return;
  dragging = true;
  downPart = result.part;
  dragStartPoint = { x: event.clientX, y: event.clientY, t: performance.now() };
  lastPointer = { x: event.clientX, y: event.clientY, t: performance.now() };
  animator.setDragging(true);
  behavior.notifyInteraction();
  setIgnore(false);
  document.body.style.cursor = 'grabbing';
  if (window.petBridge) window.petBridge.dragStart();
  canvas.setPointerCapture?.(event.pointerId);
});

/** 短按且几乎没移动 => 视为点击（按部位反应）。 */
function isTap(startPoint, event) {
  if (!startPoint) return false;
  const dx = event ? event.clientX - startPoint.x : 0;
  const dy = event ? event.clientY - startPoint.y : 0;
  const moved = Math.hypot(dx, dy);
  const held = performance.now() - startPoint.t;
  return moved < 10 && held < 500;
}

function endDrag(event) {
  if (!dragging) return;
  dragging = false;
  animator.setDragging(false);
  document.body.style.cursor = hoveringCharacter ? 'grab' : 'default';
  if (window.petBridge) window.petBridge.dragEnd();

  if (isTap(dragStartPoint, event)) {
    handleTap(downPart);
  } else {
    say('drag', 2200);
  }
  dragStartPoint = null;
  downPart = null;
  boundsDirty = true;
}

/** 点击不同部位，给不同反应。 */
function handleTap(part) {
  window.__lastTap = { part: part || 'body', at: Date.now() };
  behavior.notifyInteraction();
  behavior.setPaused(false);

  const before = getAffection();
  const after = updateAffection(1);

  animator.react(part || 'body');

  switch (part) {
    case 'ear':
      showBubble(randomLine(['耳、耳朵很敏感啦！', '别拽耳朵呀…', '呜…耳朵不行的！']), 2200);
      break;
    case 'face':
      showBubble(randomLine(['脸、脸也别捏…', '会害羞的啦。', '再摸就生气了哦。']), 2200);
      break;
    case 'hat':
    case 'hair':
      showBubble(randomLine(['帽子要歪了啦。', '头发会乱的…', '整理一下就好。']), 2200);
      break;
    case 'torso':
      showBubble(randomLine(['嘿嘿，痒痒的。', '这是要抱抱吗？', '训练员今天心情不错？']), 2200);
      break;
    case 'skirt':
      showBubble(randomLine(['裙、裙子不行！', '无礼之徒！', '不许掀裙子！']), 2400);
      break;
    case 'tail':
      showBubble(randomLine(['尾巴不能抓！', '呀！别碰尾巴…', '马尾会炸毛的！']), 2400);
      break;
    case 'leg':
      showBubble(randomLine(['脚、脚也不行…', '站不稳了啦。', '要摔倒了！']), 2200);
      break;
    default:
      say(after >= 55 && Math.random() < 0.4 ? 'patShy' : 'pat', 2400);
      break;
  }

  if (before < 25 && after >= 25) showBubble('我们…好像熟悉一点了？', 3000);
  else if (before < 55 && after >= 55) {
    showBubble('开始有点亲近了呢。', 3000);
    animator.play('cheer', 2.0);
  } else if (before < 80 && after >= 80) {
    showBubble('训练员是我最信赖的人！', 3200);
    animator.play('cheer', 2.0);
  }
}

canvas.addEventListener('pointerup', endDrag);
window.addEventListener('pointerup', endDrag);
window.addEventListener('blur', endDrag);

canvas.addEventListener('dblclick', (event) => {
  const result = hitTest(event.clientX, event.clientY);
  if (!result.hit) return;
  behavior.notifyInteraction();
  animator.setMood('shy', 1.6);
  showBubble('别、别连点啦！', 2200);
});

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  const result = hitTest(event.clientX, event.clientY);
  if (result.hit && window.petBridge) {
    window.petBridge.showContextMenu();
  }
});

// 启动后先接收事件，鼠标移开再进入穿透模式
if (window.petBridge) {
  window.petBridge.setIgnoreMouse(false);
  lastIgnoreState = false;
}

// ---------- 自主行为 ----------
loadAffection();

const behavior = new Behavior(animator, {
  bounds: { minX: -0.5, maxX: 0.5 },
  onSpeak: (group) => {
    say(group, 2800);
  }
});

const hourNow = new Date().getHours();
behavior.setNight(hourNow >= 23 || hourNow < 7);

let sitTimer = 45 * 60;

setTimeout(() => {
  const hour = new Date().getHours();
  if (hour >= 23 || hour < 7) {
    showBubble('这么晚还在忙…要注意休息哦。', 3800);
    animator.play('yawn', 2.6);
    animator.setMood('sleepy', 2.2);
  } else {
    animator.play('wave', 2.0);
    say('greeting', 3400);
  }
}, 2200);

function scheduleSitReminder(dt) {
  sitTimer -= dt;
  if (sitTimer <= 0) {
    sitTimer = 45 * 60;
    say('sit', 4200);
  }
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  animator.update(dt, elapsed);
  behavior.update(dt, elapsed);
  scheduleSitReminder(dt);

  // 角色走动时同步投影位置，并刷新命中包围盒
  contactShadow.position.x = character.root.position.x;
  boundsTimer += dt;
  if (boundsTimer > 0.15) {
    boundsTimer = 0;
    boundsDirty = true;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// 供调试面板使用
window.__umaPet = { scene, camera, renderer, character, animator, behavior, hitTest, raycastPart, refreshScreenBox };
