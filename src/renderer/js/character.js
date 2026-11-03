import * as THREE from 'three';
import { toonColor, glossyColor, withOutline, sphere, capsule, tapered, strand } from './toon.js';
import { createFaceTextures } from './face.js';

export const PALETTE = {
  skin: 0xffe6da,
  skinShade: 0xf7c9b8,
  hair: 0xa9736b,
  hairLight: 0xc89287,
  hairDark: 0x825249,
  dress: 0xfdfbfd,
  plaid: 0xdfe4f2,
  plaidDeep: 0xc4cde6,
  skirtMain: 0x1a237e,
  apron: 0xfdfbff,
  apronShade: 0xe9e6f2,
  lace: 0xfffafd,
  bowRed: 0xd23f4e,
  bowWhite: 0xfff7fa,
  button: 0xd9d2e8,
  // 兼容旧键
  uniform: 0xfdfbfd,
  uniformLight: 0xffffff,
  white: 0xfffdff,
  ribbon: 0x6b3fa0,
  beretMain: 0x7a5fa8,
  beretWhite: 0xf7f4fc,
  earOuter: 0x4a2e5c,
  earInner: 0xd9a7b8,
  iris: 0xe8b23a,
  boots: 0x1e1b22,
  socks: 0x1e1b22,
  sockStripe: 0xfbf8ff,
  belt: 0x3b2455,
  buckle: 0xd9b26a,
  outline: 0x2e1b34,
  tail: 0x3b2455,
  hatDiamond: 0xfff7fa
};

export function plaidTexture(baseColor = 0xffffff, lineColor = PALETTE.plaid, size = 256, repeatX = 4, repeatY = 3) {
  const canvasEl = document.createElement('canvas');
  canvasEl.width = size;
  canvasEl.height = size;
  const ctx = canvasEl.getContext('2d');
  const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex(baseColor);
  ctx.fillRect(0, 0, size, size);
  const step = size / 8;
  ctx.strokeStyle = hex(lineColor);
  ctx.lineWidth = Math.max(2, size / 40);
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  ctx.strokeStyle = hex(PALETTE.plaidDeep);
  ctx.lineWidth = Math.max(1, size / 90);
  for (let i = step / 2; i < size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

/**
 */
function spherePatch(radius, phiCenter, phiSpan, thetaCenter, thetaSpan, segW = 24, segH = 24) {
  return new THREE.SphereGeometry(
    radius,
    segW,
    segH,
    phiCenter - phiSpan / 2,
    phiSpan,
    thetaCenter - thetaSpan / 2,
    thetaSpan
  );
}

function mirrorTexture(texture) {
  const copy = texture.clone();
  copy.wrapS = THREE.RepeatWrapping;
  copy.repeat.x = -1;
  copy.offset.x = 1;
  copy.needsUpdate = true;
  return copy;
}

/**
 */
function smoothNormals(geo, tol = 0.004) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const buckets = new Map();
  const keys = new Array(pos.count);
  for (let i = 0; i < pos.count; i += 1) {
    const key = `${Math.round(pos.getX(i) / tol)}|${Math.round(pos.getY(i) / tol)}|${Math.round(pos.getZ(i) / tol)}`;
    keys[i] = key;
    let acc = buckets.get(key);
    if (!acc) {
      acc = [0, 0, 0];
      buckets.set(key, acc);
    }
    acc[0] += nor.getX(i);
    acc[1] += nor.getY(i);
    acc[2] += nor.getZ(i);
  }
  for (let i = 0; i < pos.count; i += 1) {
    const acc = buckets.get(keys[i]);
    const len = Math.hypot(acc[0], acc[1], acc[2]) || 1;
    nor.setXYZ(i, acc[0] / len, acc[1] / len, acc[2] / len);
  }
  nor.needsUpdate = true;
  return geo;
}

function hairBladeGeometry(width, length, thickness = 0.07, tipBend = 0.0) {
  const shape = new THREE.Shape();
  const halfW = width / 2;
  shape.moveTo(-halfW, 0);
  shape.quadraticCurveTo(-halfW * 1.05, -length * 0.55, tipBend, -length);
  shape.quadraticCurveTo(halfW * 1.05, -length * 0.55, halfW, 0);
  shape.quadraticCurveTo(0, length * 0.12, -halfW, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.45,
    bevelSize: thickness * 0.4,
    bevelSegments: 3,
    curveSegments: 20
  });
  geo.center();
  geo.computeVertexNormals();
  smoothNormals(geo);
  return geo;
}

function buildHead(faceTextures) {
  const group = new THREE.Group();
  group.name = 'head';

  const headMesh = sphere(0.72, toonColor(PALETTE.skin, { steps: 4 }), 72);
  headMesh.position.set(0, 0.95, 0);
  headMesh.scale.set(1, 0.96, 0.94);
  headMesh.name = 'headCore';
  withOutline(headMesh, 0.012, PALETTE.outline);
  group.add(headMesh);

  const faceGroup = new THREE.Group();
  faceGroup.position.set(0, 0.95, 0);
  faceGroup.scale.set(1, 0.96, 0.94);
  faceGroup.name = 'face';

  const eyeRadius = 0.775;
  const eyeTheta = 1.72;
  const eyeSpanTheta = 0.46;
  const eyeSpanPhi = 0.54;
  const eyeOffsetPhi = 0.40;

  const eyes = {};
  const eyeGeometry = spherePatch(eyeRadius, Math.PI / 2 + eyeOffsetPhi, eyeSpanPhi, eyeTheta, eyeSpanTheta, 36, 36);

  const eyeMatRight = new THREE.MeshBasicMaterial({
    map: faceTextures.eyes.normal,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  const eyeMatLeft = new THREE.MeshBasicMaterial({
    map: faceTextures.eyes.normal,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });

  const eyeRight = new THREE.Mesh(eyeGeometry, eyeMatRight);
  eyeRight.name = 'eyeRight';
  eyeRight.renderOrder = 5;
  const eyeLeft = new THREE.Mesh(eyeGeometry, eyeMatLeft);
  eyeLeft.name = 'eyeLeft';
  eyeLeft.scale.x = -1;
  eyeLeft.renderOrder = 5;
  faceGroup.add(eyeRight, eyeLeft);
  eyes.right = eyeRight;
  eyes.left = eyeLeft;

  // 鍢?
  const mouthGeometry = spherePatch(eyeRadius + 0.002, Math.PI / 2, 0.26, 2.00, 0.26, 18, 18);
  const mouthMaterial = new THREE.MeshBasicMaterial({
    map: faceTextures.mouths.smile,
    transparent: true,
    depthWrite: false,
    toneMapped: false
  });
  const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
  mouth.name = 'mouth';
  mouth.renderOrder = 6;
  faceGroup.add(mouth);

  // 腮红
  const blushMaterial = new THREE.MeshBasicMaterial({
    map: faceTextures.blush,
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
    toneMapped: false
  });
  const blushRight = new THREE.Mesh(
    spherePatch(eyeRadius + 0.001, Math.PI / 2 + 0.54, 0.40, 1.84, 0.36, 18, 18),
    blushMaterial
  );
  const blushLeft = new THREE.Mesh(
    spherePatch(eyeRadius + 0.001, Math.PI / 2 - 0.54, 0.40, 1.84, 0.36, 18, 18),
    blushMaterial
  );
  blushRight.renderOrder = 4;
  blushLeft.renderOrder = 4;
  blushRight.name = 'blushRight';
  blushLeft.name = 'blushLeft';
  faceGroup.add(blushRight, blushLeft);
  eyes.blushRight = blushRight;
  eyes.blushLeft = blushLeft;
  eyes.mouth = mouth;

  const lashMat = new THREE.MeshBasicMaterial({
    color: 0x5a3547,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });
  for (const sign of [-1, 1]) {
    const lash = new THREE.Mesh(
      spherePatch(eyeRadius + 0.002, Math.PI / 2 + sign * eyeOffsetPhi, eyeSpanPhi * 0.86, eyeTheta - 0.218, 0.072, 20, 6),
      lashMat
    );
    lash.renderOrder = 6;
    lash.name = sign < 0 ? 'lashLeft' : 'lashRight';
    lash.raycast = () => {};
    faceGroup.add(lash);
  }

  group.add(faceGroup);

  const ears = {};
  for (const sign of [-1, 1]) {
    const earPivot = new THREE.Group();
    earPivot.position.set(sign * 0.78, 1.94, -0.08);
    earPivot.rotation.set(-0.16, 0, sign * 0.50);
    earPivot.name = sign < 0 ? 'earLeft' : 'earRight';

    // 外侧深棕
    const earMat = toonColor(PALETTE.earOuter, { steps: 4 });
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.180, 0.74, 20, 1), earMat);
    ear.position.y = 0.34;
    ear.scale.set(1, 1, 0.64);
    ear.name = 'earShell';
    withOutline(ear, 0.009, PALETTE.outline);
    earPivot.add(ear);

    // 内侧浅粉
    const innerMat = toonColor(PALETTE.earInner, { steps: 3 });
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.118, 0.58, 18, 1), innerMat);
    inner.position.set(0, 0.315, 0.060);
    inner.scale.set(1, 1, 0.42);
    inner.raycast = () => {};
    earPivot.add(inner);

    const tuftMat = toonColor(PALETTE.hairLight, { steps: 3 });
    const tuft = sphere(0.145, tuftMat, 16);
    tuft.scale.set(1.05, 0.72, 0.86);
    tuft.position.set(sign * -0.02, 0.0, 0.0);
    tuft.raycast = () => {};
    earPivot.add(tuft);

    group.add(earPivot);
    ears[sign < 0 ? 'left' : 'right'] = earPivot;
  }

  return { group, eyes, ears, faceGroup };
}

function buildHair() {
  const group = new THREE.Group();
  group.name = 'hair';

  const hairMat = toonColor(PALETTE.hair, { steps: 4 });
  const hairLightMat = toonColor(PALETTE.hairLight, { steps: 4 });
  const hairDarkMat = toonColor(PALETTE.hairDark, { steps: 4 });

  const backShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.795, 44, 32, Math.PI * 0.98, Math.PI * 1.04, 0, Math.PI * 0.62),
    hairMat
  );
  backShell.position.set(0, 0.95, -0.02);
  backShell.scale.set(1.04, 1.02, 1.08);
  backShell.name = 'backShell';
  withOutline(backShell, 0.012, PALETTE.outline);
  group.add(backShell);

  const topShell = new THREE.Mesh(
    new THREE.SphereGeometry(0.722, 44, 32, 0, Math.PI * 2, 0, Math.PI * 0.40),
    hairMat
  );
  topShell.position.set(0, 0.96, -0.01);
  topShell.scale.set(1.02, 1.0, 1.03);
  topShell.name = 'topShell';
  withOutline(topShell, 0.012, PALETTE.outline);
  group.add(topShell);

  const lowerBack = new THREE.Mesh(
    new THREE.CylinderGeometry(0.74, 0.62, 0.95, 40, 1, true, Math.PI * 0.5, Math.PI),
    hairMat
  );
  lowerBack.position.set(0, 0.40, -0.04);
  lowerBack.scale.set(1.02, 1, 1.05);
  lowerBack.name = 'lowerBack';
  withOutline(lowerBack, 0.011, PALETTE.outline);
  group.add(lowerBack);

  const bangConfigs = [
    { phi: -0.82, width: 0.22, length: 0.50, tilt: 0.22, bend: 0.06 },
    { phi: -0.52, width: 0.21, length: 0.54, tilt: 0.14, bend: 0.04 },
    { phi: -0.20, width: 0.20, length: 0.52, tilt: 0.06, bend: 0.02 },
    { phi: 0.10, width: 0.20, length: 0.50, tilt: -0.05, bend: -0.02 },
    { phi: 0.42, width: 0.21, length: 0.53, tilt: -0.13, bend: -0.04 },
    { phi: 0.76, width: 0.22, length: 0.49, tilt: -0.21, bend: -0.06 }
  ];

  for (const cfg of bangConfigs) {
    const geo = hairBladeGeometry(cfg.width, cfg.length, 0.075, cfg.bend);
    const blade = new THREE.Mesh(geo, hairMat);
    const radius = 0.70;
    // 发片几何已居中（长度以中心对称），中心放在眉上位置即自然垂到眉间
    blade.position.set(
      Math.sin(cfg.phi) * radius,
      1.34,
      Math.cos(cfg.phi) * radius * 0.96 + 0.01
    );
    blade.rotation.set(0.24, cfg.phi, cfg.tilt);
    blade.name = `bang_${cfg.phi}`;
    withOutline(blade, 0.009, PALETTE.outline);
    group.add(blade);
  }

  for (const sign of [-1, 1]) {
    const isLeft = sign < 0;
    const mainLen = isLeft ? 1.02 : 0.94;
    const mainW = isLeft ? 0.46 : 0.40;
    const geo = hairBladeGeometry(mainW, mainLen, 0.14, sign * 0.10);
    const side = new THREE.Mesh(geo, hairMat);
    side.position.set(sign * 0.66, 1.02, 0.03);
    side.rotation.set(0.02, sign * 0.26, sign * 0.05);
    side.name = isLeft ? 'sideHairLeft' : 'sideHairRight';
    withOutline(side, 0.010, PALETTE.outline);
    group.add(side);

    // 发梢螺旋卷（参考图：长卷发，发梢向内卷成筒状）
    for (let c = 0; c < 3; c += 1) {
      const rad = 0.175 - c * 0.022;
      const curl = new THREE.Mesh(
        new THREE.TorusGeometry(rad, 0.072, 12, 26, Math.PI * 1.65),
        c % 2 === 0 ? hairMat : hairDarkMat
      );
      curl.position.set(
        sign * (0.70 - c * 0.045),
        0.60 - c * 0.30,
        0.14 - c * 0.075
      );
      curl.rotation.set(0.18, sign * 0.42, Math.PI * 0.10);
      curl.scale.set(1.0, 1.25, 1.0);
      curl.name = `${isLeft ? 'curlL' : 'curlR'}_${c}`;
      curl.raycast = () => {};
      if (c === 0) withOutline(curl, 0.008, PALETTE.outline);
      group.add(curl);
    }
    if (isLeft) {
      const extra = new THREE.Mesh(hairBladeGeometry(0.30, 0.94, 0.10, -0.14), hairMat);
      extra.position.set(-0.54, 0.96, 0.20);
      extra.rotation.set(0.04, -0.10, -0.04);
      extra.raycast = () => {};
      group.add(extra);
    }

    // 内层细发束：增加层次，避免侧面成为一整块
    for (let k = 0; k < 2; k += 1) {
      const inner = new THREE.Mesh(
        hairBladeGeometry(0.20 + k * 0.04, 0.80 + k * 0.12, 0.06, sign * (0.08 + k * 0.05)),
        k === 0 ? hairDarkMat : hairMat
      );
      inner.position.set(sign * (0.52 + k * 0.07), 1.00, 0.12 - k * 0.10);
      inner.rotation.set(0.02, sign * (0.34 + k * 0.1), sign * 0.05);
      inner.raycast = () => {};
      group.add(inner);
    }

    const streak = new THREE.Mesh(hairBladeGeometry(0.12, 0.78, 0.02, sign * 0.06), hairLightMat);
    streak.position.set(sign * 0.74, 0.94, 0.16);
    streak.rotation.set(0.02, sign * 0.26, sign * 0.04);
    streak.raycast = () => {};
    group.add(streak);
  }

  for (let i = 0; i < 11; i += 1) {
    const t = (i / 10) * 2 - 1;
    const ang = t * 1.05;
    const rx = Math.sin(ang) * 0.60;
    const rz = Math.cos(ang) * -0.56;
    const lock = strand(
      [
        [rx * 0.80, 1.22, rz * 0.80],
        [rx * 0.99, 0.78, rz * 1.00],
        [rx * 1.06 + (i % 2 ? 0.03 : -0.03), 0.34, rz * 1.04]
      ],
      0.100,
      0.024,
      i % 3 === 0 ? hairLightMat : hairMat,
      10,
      18
    );
    lock.raycast = () => {};
    group.add(lock);
  }

  const ahogeMat = hairLightMat;
  const ahoge1 = new THREE.Mesh(new THREE.ConeGeometry(0.046, 0.16, 14), ahogeMat);
  ahoge1.position.set(0.10, 1.98, 0.02);
  ahoge1.rotation.set(-0.55, 0, 0.30);
  ahoge1.name = 'ahoge';
  ahoge1.raycast = () => {};
  group.add(ahoge1);

  for (const sign of [-1, 1]) {
    const flip = new THREE.Mesh(hairBladeGeometry(0.22, 0.26, 0.10, sign * 0.18), hairMat);
    flip.position.set(sign * 0.50, 0.34, -0.28);
    flip.rotation.set(-0.25, sign * 0.5, Math.PI + sign * 0.28);
    flip.raycast = () => {};
    group.add(flip);
  }

  // 后发阴影层次
  const backShade = new THREE.Mesh(
    new THREE.SphereGeometry(0.80, 32, 24, Math.PI * 1.05, Math.PI * 0.9, Math.PI * 0.42, Math.PI * 0.3),
    hairDarkMat
  );
  backShade.position.set(0, 0.95, -0.03);
  backShade.scale.set(1.03, 1.02, 1.06);
  backShade.raycast = () => {};
  group.add(backShade);

  return group;
}

function buildBeret() {
  const group = new THREE.Group();
  group.name = 'beret';
  group.position.set(0, 1.62, 0);
  group.rotation.set(-0.06, 0, 0.10);

  const purpleMat = toonColor(PALETTE.beretMain, { steps: 4 });
  const whiteBandMat = toonColor(PALETTE.beretWhite, { steps: 4 });
  const goldMat = toonColor(0xd9b26a, { steps: 3 });
  const bowRedMat = toonColor(0xc0392b, { steps: 4 });

  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.55),
    purpleMat
  );
  crown.scale.set(1.16, 0.66, 1.16);
  crown.position.set(0.03, 0.02, -0.02);
  crown.name = 'beretCrown';
  withOutline(crown, 0.010, PALETTE.outline);
  group.add(crown);

  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.660, 0.078, 14, 48), whiteBandMat);
  brim.rotation.x = Math.PI / 2;
  brim.position.set(0.02, -0.06, 0);
  brim.scale.set(1.10, 1.06, 1.08);
  brim.name = 'beretBrim';
  withOutline(brim, 0.008, PALETTE.outline);
  group.add(brim);

  // 金色纽扣（帽顶）
  const button = sphere(0.055, goldMat, 16);
  button.position.set(0.12, 0.46, 0.08);
  button.name = 'beretButton';
  withOutline(button, 0.005, PALETTE.outline);
  group.add(button);

  // 侧边装饰：红色蝴蝶结 + 蓝色圆饰
  const deco = new THREE.Group();
  deco.name = 'beretDeco';
  deco.position.set(-0.74, 0.12, 0.52);
  deco.rotation.set(0.16, -0.54, 0.22);
  group.add(deco);

  const redMat = toonColor(PALETTE.bowRed, { steps: 4 });

  // 结心
  const knot = sphere(0.076, redMat, 18);
  knot.scale.set(1.0, 0.86, 0.62);
  knot.name = 'hairBowKnot';
  withOutline(knot, 0.006, PALETTE.outline);
  deco.add(knot);

  // 两片扁平翅膀
  for (const sign of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.26, 4), redMat);
    wing.rotation.set(0, 0, sign * Math.PI / 2);
    wing.position.set(sign * 0.145, 0.014, 0);
    wing.scale.set(1, 1, 0.44);
    wing.name = sign < 0 ? 'hairBowWingL' : 'hairBowWingR';
    withOutline(wing, 0.006, PALETTE.outline);
    deco.add(wing);
  }

  // 帽体上的白色菱形点缀（参考图：紫色帽面散布菱形纹样）
  const diamondMat = toonColor(PALETTE.hatDiamond, { steps: 3 });
  const diamonds = [
    [-0.28, 0.30, 0.62], [0.30, 0.26, 0.60], [0.02, 0.40, 0.52],
    [-0.10, 0.22, 0.74], [0.46, 0.14, 0.46], [-0.46, 0.16, 0.44]
  ];
  for (let i = 0; i < diamonds.length; i += 1) {
    const [dx, dy, dz] = diamonds[i];
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.014), diamondMat);
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    d.position.set(dx, dy, dz);
    d.rotation.set(0, Math.atan2(dx, dz), Math.PI / 4);
    d.raycast = () => {};
    group.add(d);
  }

  // 帽后红色大蝴蝶结与两条飘带（参考图背面特征）
  const backBow = new THREE.Group();
  backBow.name = 'beretBackBow';
  backBow.position.set(0, -0.20, -0.66);
  backBow.rotation.set(0.34, 0, 0);
  group.add(backBow);

  const backKnot = sphere(0.085, bowRedMat, 18);
  backKnot.scale.set(1.0, 0.88, 0.66);
  backKnot.name = 'beretBackKnot';
  withOutline(backKnot, 0.006, PALETTE.outline);
  backBow.add(backKnot);

  for (const sign of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.ConeGeometry(0.115, 0.30, 4), bowRedMat);
    loop.rotation.set(0, 0, sign * Math.PI / 2);
    loop.position.set(sign * 0.165, 0.02, 0);
    loop.scale.set(1, 1, 0.42);
    withOutline(loop, 0.006, PALETTE.outline);
    backBow.add(loop);

    const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.62, 0.030), bowRedMat);
    ribbon.position.set(sign * 0.115, -0.42, -0.08);
    ribbon.rotation.set(-0.16, 0, sign * 0.20);
    ribbon.name = sign < 0 ? 'beretRibbonL' : 'beretRibbonR';
    withOutline(ribbon, 0.006, PALETTE.outline);
    backBow.add(ribbon);
  }

  return group;
}

function buildTorso() {
  const group = new THREE.Group();
  group.name = 'torso';

  const uniformMat = toonColor(PALETTE.uniform, { steps: 4 });
  const whiteMat = toonColor(PALETTE.apron, { steps: 4 });
  const skinMat = toonColor(PALETTE.skin, { steps: 4 });

  // 脖子
  const neck = capsule(0.135, 0.10, skinMat, 8, 20);
  neck.position.set(0, 0.24, 0.0);
  neck.raycast = () => {};
  group.add(neck);

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.36, 0.62, 40, 1), uniformMat);
  chest.position.set(0, -0.10, 0);
  chest.scale.set(1.0, 1, 0.82);
  chest.name = 'chest';
  withOutline(chest, 0.012, PALETTE.outline);
  group.add(chest);

  // 肩部圆润过渡
  const shoulders = sphere(0.34, uniformMat, 32);
  shoulders.scale.set(1.02, 0.52, 0.84);
  shoulders.position.set(0, 0.16, 0);
  shoulders.raycast = () => {};
  group.add(shoulders);

  // 白色内衬领口
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.27, 0.16, 32), whiteMat);
  collar.position.set(0, 0.26, 0);
  collar.scale.set(1, 1, 0.9);
  collar.raycast = () => {};
  group.add(collar);

  const sailorCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.40, 0.22, 32, 1, true, Math.PI * 0.42, Math.PI * 1.16), uniformMat);
  sailorCollar.position.set(0, 0.20, -0.02);
  sailorCollar.scale.set(1.02, 1, 0.94);
  sailorCollar.raycast = () => {};
  group.add(sailorCollar);

  // 领口白边
  const collarTrim = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.030, 12, 36), whiteMat);
  collarTrim.rotation.x = Math.PI / 2;
  collarTrim.position.set(0, 0.335, 0.0);
  collarTrim.raycast = () => {};
  group.add(collarTrim);

  // 绾㈣壊铦磋澏缁?
  const ribbonMat = toonColor(PALETTE.ribbon, { steps: 4 });
  const knot = sphere(0.075, ribbonMat, 20);
  knot.position.set(0, 0.20, 0.30);
  withOutline(knot, 0.007, PALETTE.outline);
  group.add(knot);

  for (const sign of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.26, 4), ribbonMat);
    wing.rotation.set(0, 0, sign * Math.PI / 2);
    wing.rotation.z = sign * -Math.PI / 2;
    wing.position.set(sign * 0.16, 0.21, 0.29);
    wing.scale.set(1, 1, 0.55);
    wing.name = 'ribbonWing';
    withOutline(wing, 0.007, PALETTE.outline);
    group.add(wing);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.20, 4), ribbonMat);
    tail.position.set(sign * 0.05, 0.10, 0.29);
    tail.rotation.z = sign * 0.35;
    tail.rotation.x = 0.2;
    tail.scale.set(1, 1, 0.6);
    tail.raycast = () => {};
    group.add(tail);
  }

  // 胸前的浅色装饰线
  const seamMat = toonColor(0xe6dfe9, { steps: 3 });
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.42, 0.03), seamMat);
  placket.position.set(0, -0.16, 0.30);
  placket.rotation.x = 0.03;
  placket.raycast = () => {};
  group.add(placket);

  const hollowMat = toonColor(0x3b2b3f, { steps: 3 });
  const hollow = new THREE.Mesh(new THREE.CircleGeometry(0.088, 4), hollowMat);
  hollow.position.set(0, 0.055, 0.315);
  hollow.rotation.z = Math.PI / 4;
  hollow.scale.set(0.85, 1.15, 1);
  hollow.name = 'chestHollow';
  hollow.raycast = () => {};
  group.add(hollow);

  // 妫曡壊鏉熻叞甯?+ 閲戝睘鎵?
  const belt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.368, 0.382, 0.145, 36),
    toonColor(PALETTE.belt, { steps: 3 })
  );
  belt.position.set(0, -0.40, 0);
  belt.scale.set(1, 1, 0.86);
  belt.name = 'waistBelt';
  withOutline(belt, 0.007, PALETTE.outline);
  group.add(belt);

  const buckle = new THREE.Mesh(
    new THREE.BoxGeometry(0.085, 0.075, 0.030),
    toonColor(PALETTE.buckle, { steps: 3 })
  );
  buckle.position.set(0, -0.40, 0.352);
  buckle.name = 'beltBuckle';
  withOutline(buckle, 0.005, PALETTE.outline);
  group.add(buckle);

  return group;
}

export function starryTexture(baseColor = PALETTE.skirtMain, starColor = 0xfff7fa, size = 256) {
  const canvasEl = document.createElement('canvas');
  canvasEl.width = size;
  canvasEl.height = size;
  const ctx = canvasEl.getContext('2d');
  const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex(baseColor);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = hex(starColor);
  let seed = 20261103;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const drawStar = (cx, cy, r) => {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.42;
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };
  for (let i = 0; i < 46; i += 1) {
    drawStar(rand() * size, rand() * size, 3 + rand() * 5);
  }
  const texture = new THREE.CanvasTexture(canvasEl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  texture.anisotropy = 4;
  return texture;
}

function buildSkirt() {
  const group = new THREE.Group();
  group.name = 'skirt';

  const starMat = new THREE.MeshToonMaterial({
    map: starryTexture(PALETTE.skirtMain, 0xfff7fa, 256),
    color: 0xffffff,
    side: THREE.DoubleSide
  });
  const whiteMat = starMat;

  const geometry = new THREE.CylinderGeometry(0.33, 0.575, 0.40, 112, 10, true);
  const pos = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i);
    const angle = Math.atan2(v.z, v.x);
    const depth = Math.min(1, Math.max(0, (0.20 - v.y) / 0.40)); // 0 顶部 1 底部
    const pleat = Math.sin(angle * 16);
    const micro = Math.sin(angle * 47 + 1.1) * 0.18;
    const wave = (pleat + micro) * 0.050 * Math.pow(depth, 1.4);
    const flare = 1 + Math.sin(angle * 16 + 0.6) * 0.055 * depth;
    pos.setX(i, v.x * flare + Math.cos(angle) * wave);
    pos.setZ(i, v.z * flare + Math.sin(angle) * wave);
    pos.setY(i, v.y - Math.abs(Math.sin(angle * 16)) * 0.020 * depth);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const skirt = new THREE.Mesh(geometry, whiteMat);
  skirt.position.set(0, -0.615, 0);
  skirt.scale.set(1, 1, 0.92);
  skirt.name = 'skirtMesh';
  withOutline(skirt, 0.010, PALETTE.outline);
  group.add(skirt);

  const innerMat = toonColor(0x141a5c, { steps: 3 });
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.47, 0.35, 40, 1, false), innerMat);
  inner.position.set(0, -0.575, 0);
  inner.scale.set(1, 1, 0.92);
  inner.raycast = () => {};
  group.add(inner);

  const trimMat = toonColor(0x2a3596, { steps: 4, side: THREE.DoubleSide });
  const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.37, 0.06, 56, 1, true), trimMat);
  trim.position.set(0, -0.455, 0);
  trim.scale.set(1, 1, 0.93);
  trim.raycast = () => {};
  group.add(trim);

  const frillMat = toonColor(0xfdfbff, { steps: 3, side: THREE.DoubleSide });

  function frillBand(rTop, rBottom, height, waves, amp) {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, height, 96, 4, true);
    const p = geo.attributes.position;
    const tmp = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 1) {
      tmp.fromBufferAttribute(p, i);
      const angle = Math.atan2(tmp.z, tmp.x);
      const depth = Math.min(1, Math.max(0, (height / 2 - tmp.y) / height)); // 0 顶部 1 底部
      const wave = Math.sin(angle * waves);
      const factor = 1 + wave * amp * Math.pow(depth, 1.2);
      p.setX(i, tmp.x * factor);
      p.setZ(i, tmp.z * factor * 0.94);
      p.setY(i, tmp.y + wave * 0.016 * depth);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, frillMat);
    mesh.raycast = () => {};
    return mesh;
  }

  const frillOuter = frillBand(0.560, 0.598, 0.098, 26, 0.034);
  frillOuter.position.set(0, -0.752, 0);
  group.add(frillOuter);

  const frillInner = frillBand(0.542, 0.568, 0.072, 24, 0.028);
  frillInner.position.set(0, -0.726, 0);
  group.add(frillInner);

  return group;
}

/**
 */
function buildApron() {
  const group = new THREE.Group();
  group.name = 'apron';

  const apronMat = toonColor(PALETTE.apron, { steps: 3, side: THREE.DoubleSide });
  const shadeMat = toonColor(PALETTE.apronShade, { steps: 3, side: THREE.DoubleSide });

  const bib = new THREE.Mesh(
    new THREE.CylinderGeometry(0.318, 0.386, 0.76, 56, 8, true, -Math.PI * 0.37, Math.PI * 0.74),
    apronMat
  );
  bib.position.set(0, 0.02, 0);
  bib.scale.set(1, 1, 0.95);
  bib.name = 'apronBib';
  withOutline(bib, 0.008, PALETTE.outline);
  group.add(bib);

  const topEdge = new THREE.Mesh(
    new THREE.TorusGeometry(0.322, 0.016, 8, 40, Math.PI * 0.74),
    shadeMat
  );
  topEdge.rotation.x = Math.PI / 2;
  topEdge.rotation.z = -Math.PI * 0.37 - Math.PI / 2;
  topEdge.position.set(0, 0.398, 0);
  topEdge.raycast = () => {};
  group.add(topEdge);

  // 腰间荷叶边：沿前侧弧面起伏的白色布带
  const waistGeo = new THREE.CylinderGeometry(0.372, 0.432, 0.115, 96, 4, true, -Math.PI * 0.5, Math.PI);
  const wp = waistGeo.attributes.position;
  const tmp = new THREE.Vector3();
  for (let i = 0; i < wp.count; i += 1) {
    tmp.fromBufferAttribute(wp, i);
    const angle = Math.atan2(tmp.x, tmp.z);
    const depth = Math.min(1, Math.max(0, (0.115 / 2 - tmp.y) / 0.115));
    const wave = Math.sin(angle * 16);
    const factor = 1 + wave * 0.055 * Math.pow(depth, 1.2);
    wp.setX(i, tmp.x * factor);
    wp.setZ(i, tmp.z * factor * 0.95);
    wp.setY(i, tmp.y + wave * 0.012 * depth);
  }
  wp.needsUpdate = true;
  waistGeo.computeVertexNormals();
  const waistFrill = new THREE.Mesh(waistGeo, apronMat);
  waistFrill.position.set(0, -0.34, 0);
  waistFrill.name = 'apronWaistFrill';
  waistFrill.raycast = () => {};
  group.add(waistFrill);

  const hemGeo = new THREE.CylinderGeometry(0.470, 0.560, 0.130, 96, 4, true, -Math.PI * 0.55, Math.PI * 1.1);
  const hp = hemGeo.attributes.position;
  for (let i = 0; i < hp.count; i += 1) {
    tmp.fromBufferAttribute(hp, i);
    const angle = Math.atan2(tmp.x, tmp.z);
    const depth = Math.min(1, Math.max(0, (0.130 / 2 - tmp.y) / 0.130));
    const wave = Math.sin(angle * 13);
    const factor = 1 + wave * 0.05 * Math.pow(depth, 1.1);
    hp.setX(i, tmp.x * factor);
    hp.setZ(i, tmp.z * factor * 0.94);
    hp.setY(i, tmp.y + wave * 0.014 * depth);
  }
  hp.needsUpdate = true;
  hemGeo.computeVertexNormals();
  const hem = new THREE.Mesh(hemGeo, apronMat);
  hem.position.set(0, -0.71, 0);
  hem.name = 'apronHem';
  hem.raycast = () => {};
  group.add(hem);

  return group;
}

function buildArms() {
  const group = new THREE.Group();
  group.name = 'arms';

  const skinMat = toonColor(PALETTE.skin, { steps: 4 });
  const uniformMat = toonColor(PALETTE.uniform, { steps: 4 });
  const whiteMat = toonColor(PALETTE.white, { steps: 4 });

  const arms = {};
  for (const sign of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.385, 0.10, 0.11);
    pivot.name = sign < 0 ? 'armLeft' : 'armRight';

    // 短袖
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.145, 0.20, 24, 1), uniformMat);
    sleeve.position.y = -0.06;
    sleeve.scale.set(1, 1, 0.95);
    withOutline(sleeve, 0.009, PALETTE.outline);
    pivot.add(sleeve);

    const sleeveTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.148, 0.150, 0.045, 24, 1, true), whiteMat);
    sleeveTrim.position.y = -0.155;
    sleeveTrim.raycast = () => {};
    pivot.add(sleeveTrim);

    // 手臂
    const arm = capsule(0.072, 0.26, skinMat, 8, 18);
    arm.position.y = -0.30;
    arm.name = 'armMesh';
    withOutline(arm, 0.008, PALETTE.outline);
    pivot.add(arm);

    // 手套袖口
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.078, 0.09, 20, 1, true), whiteMat);
    cuff.position.y = -0.425;
    cuff.raycast = () => {};
    pivot.add(cuff);

    // 鎵?
    const hand = sphere(0.095, skinMat, 20);
    hand.scale.set(1, 0.92, 0.88);
    hand.position.y = -0.50;
    hand.name = 'hand';
    withOutline(hand, 0.008, PALETTE.outline);
    pivot.add(hand);

    // 拇指与并指，让圆手更可爱
    const thumb = sphere(0.040, skinMat, 12);
    thumb.scale.set(1, 1.15, 0.9);
    thumb.position.set(sign * -0.062, -0.472, 0.040);
    thumb.rotation.z = sign * 0.35;
    thumb.raycast = () => {};
    pivot.add(thumb);

    for (let f = -1; f <= 1; f += 1) {
      const finger = sphere(0.032, skinMat, 10);
      finger.position.set(sign * 0.020 + f * 0.038, -0.560, 0.012);
      finger.raycast = () => {};
      pivot.add(finger);
    }

    pivot.rotation.z = sign * 0.30;
    group.add(pivot);
    arms[sign < 0 ? 'left' : 'right'] = pivot;
  }

  return { group, arms };
}

function buildLegs() {
  const group = new THREE.Group();
  group.name = 'legs';

  const skinMat = toonColor(PALETTE.skin, { steps: 4 });
  const bootMat = toonColor(PALETTE.boots, { steps: 4 });
  const whiteMat = toonColor(PALETTE.apron, { steps: 3 });
  const sockMat = toonColor(PALETTE.socks, { steps: 4 });

  const hipY = -0.70;
  const legs = { left: null, right: null };

  for (const sign of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sign * 0.155, hipY, 0);
    pivot.name = sign < 0 ? 'legLeft' : 'legRight';

    const leg = capsule(0.098, 0.40, skinMat, 8, 18);
    leg.position.set(0, -0.28, 0);
    leg.name = 'legMesh';
    withOutline(leg, 0.009, PALETTE.outline);
    pivot.add(leg);

    const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.100, 0.52, 24, 1), sockMat);
    sock.position.set(0, -0.33, 0.005);
    sock.raycast = () => {};
    pivot.add(sock);

    // 琚滃彛鐧借壊缁嗘潯绾?
    for (let i = 0; i < 2; i += 1) {
      const sockTrim = new THREE.Mesh(
        new THREE.TorusGeometry(0.105, 0.011, 8, 28),
        toonColor(PALETTE.sockStripe, { steps: 3 })
      );
      sockTrim.rotation.x = Math.PI / 2;
      sockTrim.position.set(0, -0.10 - i * 0.042, 0.005);
      sockTrim.raycast = () => {};
      pivot.add(sockTrim);
    }

    // 棕色圆头短靴
    // 靴筒金色搭扣（参考图靴子带金属扣带）
    const goldBuckleMat = toonColor(PALETTE.buckle, { steps: 3 });
    for (let gb = 0; gb < 2; gb += 1) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.113, 0.012, 8, 26), goldBuckleMat);
      strap.rotation.x = Math.PI / 2;
      strap.position.set(0, -0.435 - gb * 0.075, 0.012);
      strap.raycast = () => {};
      pivot.add(strap);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.042, 0.018), goldBuckleMat);
      plate.position.set(0, -0.435 - gb * 0.075, 0.118);
      plate.raycast = () => {};
      pivot.add(plate);
    }

    const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.110, 0.118, 0.22, 24, 1), bootMat);
    boot.position.set(0, -0.56, 0.01);
    boot.name = 'boot';
    withOutline(boot, 0.009, PALETTE.outline);
    pivot.add(boot);

    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 18), bootMat);
    foot.scale.set(1, 0.74, 1.42);
    foot.position.set(0, -0.665, 0.055);
    foot.name = 'foot';
    withOutline(foot, 0.009, PALETTE.outline);
    pivot.add(foot);

    // 靴口深棕压边
    const bootTrim = new THREE.Mesh(
      new THREE.TorusGeometry(0.112, 0.020, 10, 26),
      toonColor(0x5d453b, { steps: 3 })
    );
    bootTrim.rotation.x = Math.PI / 2;
    bootTrim.position.set(0, -0.455, 0.01);
    bootTrim.raycast = () => {};
    pivot.add(bootTrim);

    // 鞋底：深色片状底，避免鞋头只有一颗球
    const soleMat = toonColor(0x2a1f1a, { steps: 3 });
    const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.110, 0.102, 0.048, 24, 1), soleMat);
    sole.scale.set(1, 1, 1.40);
    sole.position.set(0, -0.742, 0.052);
    sole.name = 'bootSole';
    sole.raycast = () => {};
    pivot.add(sole);

    // 交叉鞋带（参考图：鞋面十字系带）
    const laceMat = toonColor(0xf3e9de, { steps: 3 });
    for (const dir of [-1, 1]) {
      const lace = new THREE.Mesh(new THREE.BoxGeometry(0.150, 0.020, 0.022), laceMat);
      lace.position.set(0, -0.575, 0.118);
      lace.rotation.set(-0.20, 0, dir * 0.62);
      lace.raycast = () => {};
      pivot.add(lace);
    }
    const laceKnot = sphere(0.028, laceMat, 10);
    laceKnot.position.set(0, -0.575, 0.132);
    laceKnot.raycast = () => {};
    pivot.add(laceKnot);

    group.add(pivot);
    legs[sign < 0 ? 'left' : 'right'] = pivot;
    pivot.userData.part = 'leg';
  }

  return { group, legs };
}

function buildTail() {
  const group = new THREE.Group();
  group.name = 'tail';

  const tailMat = toonColor(PALETTE.tail, { steps: 4 });
  const tailLightMat = toonColor(0xfad4c0, { steps: 4 });

  const base = new THREE.Group();
  base.position.set(0.40, -0.44, -0.30);
  base.rotation.set(-0.48, 0.46, 0.28);
  base.scale.setScalar(1.70);
  base.name = 'tailPivot';

  const segA = new THREE.Group();
  segA.name = 'tailSegA';
  const strandA = strand([[0, 0, 0], [0, 0.24, -0.10], [0, 0.50, -0.26]], 0.150, 0.120, tailMat, 16, 28);
  strandA.name = 'tailMainA';
  withOutline(strandA, 0.011, PALETTE.outline);
  segA.add(strandA);
  base.add(segA);

  const mid = new THREE.Group();
  mid.position.set(0, 0.50, -0.26);
  mid.name = 'tailMid';
  const strandB = strand([[0, 0, 0], [0, 0.09, -0.22], [0, -0.02, -0.46]], 0.120, 0.088, tailMat, 16, 28);
  strandB.name = 'tailMainB';
  withOutline(strandB, 0.010, PALETTE.outline);
  mid.add(strandB);
  segA.add(mid);

  const tip = new THREE.Group();
  tip.position.set(0, -0.02, -0.46);
  tip.name = 'tailTip';
  const strandC = strand([[0, 0, 0], [0, -0.26, -0.10], [0, -0.56, 0.02]], 0.088, 0.016, tailMat, 14, 22);
  strandC.name = 'tailMainC';
  withOutline(strandC, 0.009, PALETTE.outline);
  tip.add(strandC);
  mid.add(tip);

  for (let i = 0; i < 15; i += 1) {
    const ang = (i / 15) * Math.PI * 2 + 0.28;
    const spread = 0.140;
    const sx = Math.cos(ang) * spread;
    const sz = Math.sin(ang) * spread * 0.85;
    const len = 0.50 + (i % 4) * 0.15;
    const tuft = strand(
      [
        [sx * 0.35, 0.02, sz * 0.35],
        [sx * 1.05, len * 0.5, sz * 0.6 - 0.08],
        [sx * 1.5, len, sz * 0.85 - 0.16]
      ],
      i % 2 ? 0.072 : 0.086,
      0.010,
      i % 3 === 0 ? tailLightMat : tailMat,
      9,
      16
    );
    tuft.raycast = () => {};
    base.add(tuft);
  }

  group.add(base);
  return { group, pivot: base, midPivot: mid, tipPivot: tip };
}

/**
 */
export function buildCharacter() {
  const faceTextures = createFaceTextures();

  const root = new THREE.Group();
  root.name = 'character';

  const head = buildHead(faceTextures);
  const hair = buildHair();
  const beret = buildBeret();
  const torso = buildTorso();
  const skirt = buildSkirt();
  const apron = buildApron();
  const arms = buildArms();
  const legs = buildLegs();
  const tail = buildTail();

  const headPivot = new THREE.Group();
  headPivot.name = 'headPivot';
  headPivot.position.set(0, 0.30, 0);
  head.group.position.y = -0.30;
  head.group.add(hair, beret);
  headPivot.add(head.group);
  root.add(headPivot);

  const headInner = head.group;

  root.add(torso, skirt, apron, arms.group, legs.group, tail.group);

  // ---------- 点击部位标记 ----------
  function markPart(obj, part, overwrite = false) {
    if (!obj) return;
    obj.traverse((child) => {
      if (!child.isMesh) return;
      if (!overwrite && child.userData.part) return;
      child.userData.part = part;
    });
  }

  markPart(arms.group, 'arm');
  markPart(legs.group, 'leg');
  markPart(tail.group, 'tail');
  markPart(skirt, 'skirt');
  markPart(apron, 'skirt');
  markPart(torso, 'torso');
  markPart(head.group, 'face');
  markPart(head.ears.left, 'ear', true);
  markPart(head.ears.right, 'ear', true);
  markPart(hair, 'hair', true);
  markPart(beret, 'hat', true);

  const outlineState = { visible: true };

  return {
    root,
    parts: {
      headPivot,
      head: head.group,
      faceGroup: head.faceGroup,
      eyes: head.eyes,
      ears: head.ears,
      hair,
      beret,
      torso,
      skirt,
      apron,
      arms: arms.arms,
      legs: legs.group,
      legJoints: legs.legs,
      tail: tail.pivot,
      tailMid: tail.midPivot,
      tailTip: tail.tipPivot
    },
    textures: faceTextures,
    outlineState
  };
}

export { mirrorTexture };

