import * as THREE from 'three';

/**
 * 伪 3D 贴图角色。
 *
 * 素材来自用户提供的 7 张同一角色多角度截图，经抠图 / 归一化（统一身高、脚底对齐、
 * 脚部中线对齐）后生成 9 个朝向的贴图，再由本模块组成「双层平面 + 交叉淡入」结构：
 *   - pivot 承载整体伪 3D 变换（yaw / lean / scale）
 *   - planeA / planeB 分别持有当前朝向与切向朝向的贴图，切换时交叉淡入消除跳变
 *
 * 命中判定不再依赖 3D 部件，而是用 raycast 命中的 UV 坐标反推部位，保持点击反馈完整。
 */

export const SPRITE_ASPECT = 1060 / 1120; // 贴图画布宽高比
export const SPRITE_BODY_TOP = 1 - 64 / 1120; // 角色头顶在贴图中的 v
export const SPRITE_BODY_BOTTOM = 1 - 1063 / 1120; // 角色脚底在贴图中的 v

const DEGREES = [0, 20, 45, 90, 135, 180, 225, 270, 315];

function spriteUrl(deg) {
  const key = String(deg).padStart(3, '0');
  return `../../assets/sprites/deg_${key}.png`;
}

/** 贴图 UV -> 身体部位。 */
export function partFromUV(u, v) {
  const span = SPRITE_BODY_TOP - SPRITE_BODY_BOTTOM;
  const t = (v - SPRITE_BODY_BOTTOM) / span; // 0=脚底 1=头顶
  const du = Math.abs(u - 0.5);

  if (t > 0.75) {
    if (du > 0.21 && t > 0.79) return 'ear';
    if (t > 0.9) return 'hat';
    if (du < 0.135 && t < 0.9) return 'face';
    return 'hair';
  }
  if (du > 0.33 && t > 0.28 && t < 0.64) return 'tail';
  if (t > 0.5) return 'torso';
  if (t > 0.26) return 'skirt';
  return 'leg';
}

/** 表情覆盖层：眨眼 / 闭眼 / 脸红。贴图静态，靠叠加小平面补足表情变化。 */
const EYE_PX = [{ x: 520, y: 527 }, { x: 672, y: 522 }];
const EYE_W_PX = 116;
const EYE_H_PX = 92;
const BLUSH_PX = [{ x: 472, y: 632 }, { x: 726, y: 626 }];
const BLUSH_W_PX = 152;
const BLUSH_H_PX = 84;
const SPRITE_CW = 1060;
const SPRITE_CH = 1120;

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** 眼睛/腮红在贴图坐标系下的位置换算到 pivot 局部坐标。 */
function pxToLocal(px, py, width, height, planeY) {
  return {
    x: (px / SPRITE_CW - 0.5) * width,
    y: planeY + (0.5 - py / SPRITE_CH) * height
  };
}

function buildExpressionLayer(width, height, planeY) {
  const group = new THREE.Group();

  const lidTexture = canvasTexture(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    // 肤色覆盖块（椭圆裁剪，避免方形硬边）
    const grad = ctx.createRadialGradient(s * 0.5, s * 0.42, s * 0.06, s * 0.5, s * 0.52, s * 0.52);
    grad.addColorStop(0, 'rgba(252,222,206,1)');
    grad.addColorStop(0.75, 'rgba(250,216,199,0.98)');
    grad.addColorStop(1, 'rgba(248,210,192,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.5, s * 0.5, s * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 闭合的眼缝（睫毛线）
    ctx.strokeStyle = 'rgba(96,54,44,0.95)';
    ctx.lineWidth = s * 0.055;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s * 0.16, s * 0.56);
    ctx.quadraticCurveTo(s * 0.5, s * 0.84, s * 0.84, s * 0.56);
    ctx.stroke();
  });

  const blushTexture = canvasTexture(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    const grad = ctx.createRadialGradient(s * 0.5, s * 0.5, s * 0.04, s * 0.5, s * 0.5, s * 0.5);
    grad.addColorStop(0, 'rgba(255,128,158,0.62)');
    grad.addColorStop(0.55, 'rgba(255,140,168,0.34)');
    grad.addColorStop(1, 'rgba(255,150,175,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(s * 0.5, s * 0.5, s * 0.5, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  const lidW = (EYE_W_PX / SPRITE_CW) * width;
  const lidH = (EYE_H_PX / SPRITE_CH) * height;
  const lids = [];
  for (const eye of EYE_PX) {
    const geo = new THREE.PlaneGeometry(lidW, lidH);
    geo.translate(0, -lidH / 2, 0); // 支点放到上边缘，便于自上而下闭合
    const mat = new THREE.MeshBasicMaterial({
      map: lidTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false
    });
    mat.opacity = 0;
    const mesh = new THREE.Mesh(geo, mat);
    const pos = pxToLocal(eye.x, eye.y - EYE_H_PX * 0.42, width, height, planeY);
    mesh.position.set(pos.x, pos.y, 0.05);
    mesh.scale.y = 0.02;
    mesh.renderOrder = 6;
    mesh.visible = false;
    group.add(mesh);
    lids.push(mesh);
  }

  const blushW = (BLUSH_W_PX / SPRITE_CW) * width;
  const blushH = (BLUSH_H_PX / SPRITE_CH) * height;
  const blushes = [];
  for (const cheek of BLUSH_PX) {
    const mat = new THREE.MeshBasicMaterial({
      map: blushTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false
    });
    mat.opacity = 0;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(blushW, blushH), mat);
    const pos = pxToLocal(cheek.x, cheek.y, width, height, planeY);
    mesh.position.set(pos.x, pos.y, 0.04);
    mesh.renderOrder = 5;
    mesh.visible = false;
    group.add(mesh);
    blushes.push(mesh);
  }

  return { group, lids, blushes };
}

export function buildSpriteCharacter() {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);

  const loader = new THREE.TextureLoader();
  const textures = new Map();
  for (const deg of DEGREES) {
    const tex = loader.load(spriteUrl(deg));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    textures.set(deg, tex);
  }

  const height = 4.6;
  const width = height * SPRITE_ASPECT;
  const geometry = new THREE.PlaneGeometry(width, height);

  function makePlane(order) {
    const material = new THREE.MeshBasicMaterial({
      map: textures.get(0),
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.userData.part = 'torso';
    mesh.userData.spriteRole = order === 0 ? 'primary' : 'secondary';
    mesh.userData.deg = 0;
    return mesh;
  }

  const primary = makePlane(0);
  const secondary = makePlane(1);
  secondary.material.opacity = 0;

  // 脚底对齐：让纹理中脚底所在位置落在 pivot 局部 y = -1.44（与原接触阴影一致）
  const footOffset = (SPRITE_BODY_BOTTOM - 0.5) * height;
  const footY = -1.44;
  const planeY = footY - footOffset;
  primary.position.y = planeY;
  secondary.position.y = planeY;

  pivot.add(primary);
  pivot.add(secondary);

  // 表情覆盖层（眨眼 / 闭眼 / 脸红）
  const expression = buildExpressionLayer(width, height, planeY);
  pivot.add(expression.group);

  root.userData.sprite = {
    textures,
    primary,
    secondary,
    expression,
    width,
    height,
    footY,
    planeY,
    DEGREES
  };

  return {
    root,
    pivot,
    primary,
    secondary,
    textures,
    expression,
    width,
    height,
    footY,
    planeY,
    DEGREES
  };
}
