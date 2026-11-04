import * as THREE from 'three';

/**
 * 贴图角色（正面单视角版）。
 *
 * 早期版本用 9 张不同朝向的贴图 + 滑动擦除遮罩做"伪 3D 转身"，逻辑复杂且容易在
 * 过渡带留下接缝。桌宠常驻桌面，永远正对用户才是最自然的姿态，因此本版直接固定
 * 正面贴图：单平面 + 单张正面闭眼贴片，不再有朝向状态、擦除遮罩与透视旋转。
 *
 * 命中判定沿用 raycast 命中的 UV 坐标反推部位，点击反馈完整保留。
 */

// 贴图已裁到角色本体（马耳顶端到长靴，保留原始 alpha，不做连通域过滤），画布 1060x1120 -> 617x970。
// 下列常量全部按新画布换算，改图时须同步（见 tools/sprite_crop.json）。
export const SPRITE_ASPECT = 617 / 970; // 贴图画布宽高比
export const SPRITE_BODY_TOP = 1 - 3 / 970; // 角色头顶（马耳）在贴图中的 v
export const SPRITE_BODY_BOTTOM = 1 - 966 / 970; // 角色脚底（长靴底）在贴图中的 v

const BODY_SRC = '../../assets/sprites/deg_000.png';
const EYE_SRC = '../../assets/sprites/blink/deg_000_eye.png';

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

/** 表情覆盖层：脸红（位置按正面贴图标注，已随贴图同比减去裁切偏移 x-320 / y-61）。 */
const BLUSH_PX = [{ x: 152, y: 571 }, { x: 406, y: 565 }];
const BLUSH_W_PX = 152;
const BLUSH_H_PX = 84;
const SPRITE_CW = 617;
const SPRITE_CH = 970;

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

function buildBlushLayer(width, height, planeY) {
  const group = new THREE.Group();

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
    mesh.position.set(pos.x, pos.y, 0.05);
    mesh.renderOrder = 5;
    mesh.visible = false;
    group.add(mesh);
    blushes.push(mesh);
  }

  return { group, blushes };
}

export function buildSpriteCharacter() {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);

  const loader = new THREE.TextureLoader();

  const bodyTexture = loader.load(BODY_SRC);
  bodyTexture.colorSpace = THREE.SRGBColorSpace;
  bodyTexture.anisotropy = 8;
  bodyTexture.minFilter = THREE.LinearMipmapLinearFilter;
  bodyTexture.magFilter = THREE.LinearFilter;
  bodyTexture.generateMipmaps = true;
  bodyTexture.wrapS = THREE.ClampToEdgeWrapping;
  bodyTexture.wrapT = THREE.ClampToEdgeWrapping;

  const eyeTexture = loader.load(EYE_SRC);
  eyeTexture.colorSpace = THREE.SRGBColorSpace;
  eyeTexture.anisotropy = 4;
  eyeTexture.minFilter = THREE.LinearFilter;
  eyeTexture.magFilter = THREE.LinearFilter;
  eyeTexture.generateMipmaps = false;
  eyeTexture.wrapS = THREE.ClampToEdgeWrapping;
  eyeTexture.wrapT = THREE.ClampToEdgeWrapping;

  const height = 4.6;
  const width = height * SPRITE_ASPECT;
  const geometry = new THREE.PlaneGeometry(width, height);

  // 脚底对齐：让纹理中脚底所在位置落在 pivot 局部 y = -1.44（与原接触阴影一致）
  const footOffset = (SPRITE_BODY_BOTTOM - 0.5) * height;
  const footY = -1.44;
  const planeY = footY - footOffset;

  const body = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: bodyTexture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  body.renderOrder = 0;
  body.userData.part = 'torso';
  body.position.y = planeY;
  pivot.add(body);

  // 闭眼贴片：与身体同尺寸，只在眨眼/睡眠/打哈欠时按 opacity 浮现
  const eyeMaterial = new THREE.MeshBasicMaterial({
    map: eyeTexture,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  eyeMaterial.opacity = 0;
  const eye = new THREE.Mesh(geometry, eyeMaterial);
  eye.position.y = planeY;
  eye.renderOrder = 6;
  eye.visible = false;
  eye.userData.part = 'face';
  pivot.add(eye);

  const expression = buildBlushLayer(width, height, planeY);
  pivot.add(expression.group);

  return {
    root,
    pivot,
    body,
    eye,
    expression: { eye, blushes: expression.blushes },
    width
  };
}
