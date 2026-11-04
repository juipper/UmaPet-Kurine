import * as THREE from 'three';

/**
 * 伪 3D 贴图角色。
 *
 * 素材来自用户提供的同一角色多角度截图，经抠图 / 归一化（统一身高、脚底对齐、
 * 脚部中线对齐）后生成 9 个朝向的贴图。朝向切换不再使用「双层平面 + 交叉淡入」
 * （两张半透明贴图叠加会形成明显的双影 / 残留轮廓），而是改用**滑动擦除**
 * （sliding wipe）：
 *   - planeA / planeB 各持一张朝向贴图，透明度由同一张渐变 alphaMap 反向遮罩控制
 *   - 两张 alphaMap 互为镜像，offset 同步滑动，任意像素上只会以 1:0 的权重
 *     呈现其中一帧，只有一条很窄的过渡带（约占角色宽度 10%）同时混合两帧
 *   - 角色静止（角速度趋近 0）时过渡带自动吸附到最近的整帧，避免静止时出现竖向接缝
 *
 * 眨眼 / 闭眼同样改为**逐朝向贴片**（assets/sprites/blink/deg_XXX_eye.png），
 * 侧身、背面不再复用正面闭眼块，从而彻底消除“侧脸却用正脸眨眼”的错位。
 *
 * 命中判定不再依赖 3D 部件，而是用 raycast 命中的 UV 坐标反推部位，保持点击反馈完整。
 */

export const SPRITE_ASPECT = 1060 / 1120; // 贴图画布宽高比
export const SPRITE_BODY_TOP = 1 - 64 / 1120; // 角色头顶在贴图中的 v
export const SPRITE_BODY_BOTTOM = 1 - 1063 / 1120; // 角色脚底在贴图中的 v

const DEGREES = [0, 20, 45, 90, 135, 180, 225, 270, 315];

/**
 * 遮罩在平面 UV 上的重复次数：repeat 越大，遮罩被"压扁"得越厉害，过渡带在角色身上
 * 的宽度就越窄。repeat=2.4 时过渡带约占角色宽度的 10%（0.25/2.4），既能遮掉两帧之间
 * 的差异，又不会出现大面积半透明叠影。
 */
export const WIPE_REPEAT = 2.4;
/**
 * 过渡带中心在平面 UV 上的可滑动范围：p=0 时整条带停在右侧画面之外（只显示 A 帧），
 * p=1 时停在左侧画面之外（只显示 B 帧）。两端都要留出 > 半个带宽的余量，
 * 否则静止时会残留一条半透明接缝。
 */
export const WIPE_SPAN = [-0.05, 1.05];

function spriteUrl(deg) {
  const key = String(deg).padStart(3, '0');
  return `../../assets/sprites/deg_${key}.png`;
}

function eyeUrl(deg) {
  const key = String(deg).padStart(3, '0');
  return `../../assets/sprites/blink/deg_${key}_eye.png`;
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

/** 表情覆盖层：脸红（位置固定，仅正面使用；眨眼改用逐朝向贴片）。 */
const BLUSH_PX = [{ x: 472, y: 632 }, { x: 726, y: 626 }];
const BLUSH_W_PX = 152;
const BLUSH_H_PX = 84;
const SPRITE_CW = 1060;
const SPRITE_CH = 1120;

function canvasTexture(size, draw, { colorSpace = THREE.SRGBColorSpace } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = colorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

/**
 * 擦除遮罩：宽度 512 的灰度图。
 * 左段全白（=完全可见）、中段线性过渡、右段全黑（=完全透明）。
 * mirror=true 时左右反转，供第二张朝向贴图使用，保证同一像素上两张遮罩之和恒为 1。
 */
const MASK_W = 512;
const MASK_BAND = [192, 320];

function makeWipeMask(mirror) {
  const canvas = document.createElement('canvas');
  canvas.width = MASK_W;
  canvas.height = 4;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(MASK_W, 4);
  for (let x = 0; x < MASK_W; x += 1) {
    let a = 255;
    if (x > MASK_BAND[0]) {
      a = 255 * (1 - Math.min(1, (x - MASK_BAND[0]) / (MASK_BAND[1] - MASK_BAND[0])));
    }
    if (x === MASK_BAND[0]) a = 255;
    const v = mirror ? 255 - a : a;
    for (let y = 0; y < 4; y += 1) {
      const i = (y * MASK_W + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.repeat.set(WIPE_REPEAT, 1);
  tex.offset.set(0, 0);
  return tex;
}

/** 眼睛/腮红在贴图坐标系下的位置换算到 pivot 局部坐标。 */
function pxToLocal(px, py, width, height, planeY) {
  return {
    x: (px / SPRITE_CW - 0.5) * width,
    y: planeY + (0.5 - py / SPRITE_CH) * height
  };
}

function buildExpressionLayer(width, height, planeY, masks) {
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

  return { group, eyes: [], blushes };
}

export function buildSpriteCharacter() {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  root.add(pivot);

  const loader = new THREE.TextureLoader();
  const textures = new Map();
  const eyeTextures = new Map();
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

    const eye = loader.load(eyeUrl(deg));
    eye.colorSpace = THREE.SRGBColorSpace;
    eye.anisotropy = 4;
    eye.minFilter = THREE.LinearFilter;
    eye.magFilter = THREE.LinearFilter;
    eye.generateMipmaps = false;
    eye.wrapS = THREE.ClampToEdgeWrapping;
    eye.wrapT = THREE.ClampToEdgeWrapping;
    eyeTextures.set(deg, eye);
  }

  const height = 4.6;
  const width = height * SPRITE_ASPECT;
  const geometry = new THREE.PlaneGeometry(width, height);

  const maskA = makeWipeMask(false);
  const maskB = makeWipeMask(true);

  function makePlane(order, mask, role) {
    const material = new THREE.MeshBasicMaterial({
      map: textures.get(0),
      alphaMap: mask,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.userData.part = 'torso';
    mesh.userData.spriteRole = role;
    mesh.userData.deg = 0;
    return mesh;
  }

  const primary = makePlane(0, maskA, 'primary');
  const secondary = makePlane(1, maskB, 'secondary');

  // 脚底对齐：让纹理中脚底所在位置落在 pivot 局部 y = -1.44（与原接触阴影一致）
  const footOffset = (SPRITE_BODY_BOTTOM - 0.5) * height;
  const footY = -1.44;
  const planeY = footY - footOffset;
  primary.position.y = planeY;
  secondary.position.y = planeY;

  pivot.add(primary);
  pivot.add(secondary);

  // 表情覆盖层（脸红 + 逐朝向闭眼贴片）
  const expression = buildExpressionLayer(width, height, planeY, { maskA, maskB });

  // 闭眼贴片：与身体共用同一套擦除遮罩，保证切换朝向时眼睛与身体同步
  for (const mask of [maskA, maskB]) {
    const mat = new THREE.MeshBasicMaterial({
      map: eyeTextures.get(0),
      alphaMap: mask,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    mat.opacity = 0;
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.y = planeY;
    mesh.renderOrder = 6;
    mesh.visible = false;
    mesh.userData.part = 'face';
    mesh.userData.spriteRole = 'eye';
    pivot.add(mesh);
    expression.eyes.push(mesh);
  }

  pivot.add(expression.group);

  /**
   * 设置擦除进度：p=0 只显示 A 帧（当前朝向），p=1 只显示 B 帧（相邻朝向）。
   * A 的遮罩白区在左、B 在右，所以过渡带随 p 增大由右向左扫：向右转身时 B 从右缘长出来，
   * 向左转身（p 递减）时 A 从左缘长回来，方向天然正确，不需要额外反转参数。
   * 第二个参数仅为兼容旧调用签名保留。
   */
  function setWipe(p, reversed = false) {
    void reversed;
    const t = Math.min(1, Math.max(0, p));
    const x = WIPE_SPAN[1] + (WIPE_SPAN[0] - WIPE_SPAN[1]) * t;
    const offset = 0.5 - WIPE_REPEAT * x;
    maskA.offset.x = offset;
    maskB.offset.x = offset;
  }
  setWipe(0);

  const spriteData = {
    textures,
    eyeTextures,
    primary,
    secondary,
    expression,
    width,
    height,
    footY,
    planeY,
    DEGREES,
    masks: { a: maskA, b: maskB },
    setWipe
  };

  root.userData.sprite = spriteData;

  return {
    root,
    pivot,
    primary,
    secondary,
    textures,
    eyeTextures,
    expression,
    width,
    height,
    footY,
    planeY,
    DEGREES,
    setWipe,
    ...spriteData
  };
}
