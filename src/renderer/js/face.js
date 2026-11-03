import * as THREE from 'three';

const EYE_W = 256;
const EYE_H = 300;

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function toTexture(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 画一只睁开的眼睛（后续水平翻转得到另一只）。
 */
function drawEyeOpen(ctx, options = {}) {
  const { squint = 0, pupilShift = 0 } = options;
  const w = EYE_W;
  const h = EYE_H;
  ctx.clearRect(0, 0, w, h);

  const cx = w * 0.5;
  const cy = h * 0.54;
  const rx = w * 0.38;
  const ry = h * 0.42 * (1 - squint * 0.55);
  const cyShift = cy + ry * squint * 0.35;

  ctx.save();

  // 眼白底色（略偏暖，边缘带淡紫）
  const sclera = ctx.createLinearGradient(0, cyShift - ry, 0, cyShift + ry);
  sclera.addColorStop(0, '#fffaf6');
  sclera.addColorStop(1, '#fff2e6');
  ctx.beginPath();
  ctx.ellipse(cx, cyShift, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = sclera;
  ctx.fill();
  ctx.clip();

  // 虹膜：琥珀黄（参考图瞳色 #E8B04A）
  const iris = ctx.createLinearGradient(0, cyShift - ry * 0.9, 0, cyShift + ry * 0.9);
  iris.addColorStop(0, '#7a4a12');
  iris.addColorStop(0.42, '#c98a24');
  iris.addColorStop(0.78, '#edb957');
  iris.addColorStop(1, '#fde6a8');
  ctx.beginPath();
  ctx.ellipse(cx + pupilShift * rx * 0.25, cyShift + ry * 0.06, rx * 0.76, ry * 0.86, 0, 0, Math.PI * 2);
  ctx.fillStyle = iris;
  ctx.fill();

  // 瞳孔
  ctx.beginPath();
  ctx.ellipse(cx + pupilShift * rx * 0.3, cyShift + ry * 0.1, rx * 0.36, ry * 0.44, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#4a2c12';
  ctx.fill();

  // 瞳孔下缘反光
  ctx.beginPath();
  ctx.ellipse(cx + pupilShift * rx * 0.3, cyShift + ry * 0.46, rx * 0.24, ry * 0.16, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 226, 170, 0.60)';
  ctx.fill();

  // 主高光
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.34, cyShift - ry * 0.38, rx * 0.34, ry * 0.28, -0.35, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();

  // 次高光
  ctx.beginPath();
  ctx.ellipse(cx + rx * 0.3, cyShift + ry * 0.28, rx * 0.12, ry * 0.1, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fill();

  // 上方阴影（眼睑投影）
  const lid = ctx.createLinearGradient(0, cyShift - ry, 0, cyShift - ry * 0.35);
  lid.addColorStop(0, 'rgba(58, 37, 25, 0.55)');
  lid.addColorStop(1, 'rgba(58, 37, 25, 0)');
  ctx.beginPath();
  ctx.ellipse(cx, cyShift - ry * 0.9, rx * 1.05, ry * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = lid;
  ctx.fill();

  ctx.restore();

  // 眼睛外轮廓
  ctx.beginPath();
  ctx.ellipse(cx, cyShift, rx, ry, 0, 0, Math.PI * 2);
  ctx.lineWidth = w * 0.05;
  ctx.strokeStyle = '#3a2519';
  ctx.stroke();

  // 上睫毛加粗
  ctx.beginPath();
  ctx.ellipse(cx, cyShift, rx, ry, 0, Math.PI * 1.02, Math.PI * 1.98);
  ctx.lineWidth = w * 0.11;
  ctx.strokeStyle = '#2b1b12';
  ctx.lineCap = 'round';
  ctx.stroke();

  // 外眼角睫毛尖
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.96, cyShift - ry * 0.42);
  ctx.quadraticCurveTo(cx - rx * 1.28, cyShift - ry * 0.72, cx - rx * 1.42, cyShift - ry * 0.86);
  ctx.lineWidth = w * 0.055;
  ctx.strokeStyle = '#2b1b12';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.72, cyShift - ry * 0.86);
  ctx.quadraticCurveTo(cx - rx * 0.95, cyShift - ry * 1.06, cx - rx * 1.04, cyShift - ry * 1.2);
  ctx.lineWidth = w * 0.045;
  ctx.stroke();
}

/**
 * 弯弯的笑眼（^ ^）。
 */
function drawEyeHappy(ctx) {
  const w = EYE_W;
  const h = EYE_H;
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.62;
  const rx = w * 0.36;
  const ry = h * 0.24;

  ctx.beginPath();
  ctx.moveTo(cx - rx, cy + ry * 0.3);
  ctx.quadraticCurveTo(cx, cy - ry * 1.35, cx + rx, cy + ry * 0.3);
  ctx.lineWidth = w * 0.1;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2b1b12';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.98, cy + ry * 0.26);
  ctx.quadraticCurveTo(cx - rx * 1.24, cy - ry * 0.1, cx - rx * 1.3, cy - ry * 0.5);
  ctx.lineWidth = w * 0.05;
  ctx.stroke();
}

/**
 * 闭眼（一条下弯的弧线 + 睫毛）。
 */
function drawEyeClosed(ctx) {
  const w = EYE_W;
  const h = EYE_H;
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.56;
  const rx = w * 0.36;

  ctx.beginPath();
  ctx.moveTo(cx - rx, cy);
  ctx.quadraticCurveTo(cx, cy + h * 0.1, cx + rx, cy);
  ctx.lineWidth = w * 0.075;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2b1b12';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.96, cy);
  ctx.quadraticCurveTo(cx - rx * 1.2, cy - rx * 0.14, cx - rx * 1.28, cy - rx * 0.34);
  ctx.lineWidth = w * 0.045;
  ctx.stroke();
}

/**
 * 困倦眼（上眼皮压下来一半）。
 */
function drawEyeSleepy(ctx) {
  const w = EYE_W;
  const h = EYE_H;
  ctx.clearRect(0, 0, w, h);
  const cx = w * 0.5;
  const cy = h * 0.56;
  const rx = w * 0.38;
  const ry = h * 0.42;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  const iris = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
  iris.addColorStop(0, '#7a4a12');
  iris.addColorStop(0.6, '#d99a30');
  iris.addColorStop(1, '#fde6a8');
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.2, rx * 0.78, ry * 0.86, 0, 0, Math.PI * 2);
  ctx.fillStyle = iris;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.26, rx * 0.4, ry * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#4a2c12';
  ctx.fill();
  // 上眼皮遮住上半部分
  ctx.fillStyle = '#f7d8cf';
  ctx.fillRect(0, cy - ry * 1.1, w, ry * 1.05);
  ctx.restore();

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 1.02, Math.PI * 1.98);
  ctx.lineWidth = w * 0.06;
  ctx.strokeStyle = '#3a2519';
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx - rx, cy - ry * 0.05);
  ctx.quadraticCurveTo(cx, cy + ry * 0.12, cx + rx, cy - ry * 0.05);
  ctx.lineWidth = w * 0.095;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2b1b12';
  ctx.stroke();
}

/**
 * 嘴巴：小微笑。
 */
function drawMouth(ctx, shape) {
  const w = 128;
  const h = 96;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  // 贴图整体放大，保证桌宠尺寸下嘴巴足够明显
  ctx.translate(w * 0.5, h * 0.5);
  ctx.scale(1.5, 1.5);
  ctx.translate(-w * 0.5, -h * 0.5);
  const cx = w * 0.5;
  const cy = h * 0.45;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#8a4a3a';

  if (shape === 'smile') {
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.18, cy);
    ctx.quadraticCurveTo(cx, cy + h * 0.26, cx + w * 0.18, cy);
    ctx.lineWidth = w * 0.055;
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (shape === 'open') {
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.05, w * 0.15, h * 0.17, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#c25a4a';
    ctx.fill();
    ctx.lineWidth = w * 0.04;
    ctx.strokeStyle = '#8a4a3a';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy + h * 0.17, w * 0.1, h * 0.07, 0, 0, Math.PI);
    ctx.fillStyle = '#e8846e';
    ctx.fill();
    ctx.restore();
    return;
  }

  if (shape === 'cat') {
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.2, cy);
    ctx.quadraticCurveTo(cx - w * 0.1, cy + h * 0.16, cx, cy);
    ctx.quadraticCurveTo(cx + w * 0.1, cy + h * 0.16, cx + w * 0.2, cy);
    ctx.lineWidth = w * 0.05;
    ctx.stroke();
    ctx.restore();
    return;
  }

  // 默认：闭着的轻笑
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.14, cy + h * 0.02);
  ctx.quadraticCurveTo(cx, cy + h * 0.18, cx + w * 0.14, cy + h * 0.02);
  ctx.lineWidth = w * 0.05;
  ctx.stroke();
  ctx.restore();
}

/**
 * 腮红圆片（径向渐变，边缘透明）。
 */
function drawBlush(ctx) {
  const size = 128;
  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(240, 122, 122, 0.72)');
  grad.addColorStop(0.55, 'rgba(240, 134, 128, 0.34)');
  grad.addColorStop(1, 'rgba(240, 134, 128, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 生成全部表情贴图。
 */
export function createFaceTextures() {
  // 每张表情必须是独立 canvas，否则共用画布会互相覆盖
  const bake = (w, h, drawFn) => {
    const canvas = makeCanvas(w, h);
    drawFn(canvas.getContext('2d'));
    return toTexture(canvas);
  };

  const eyes = {
    normal: bake(EYE_W, EYE_H, (ctx) => drawEyeOpen(ctx, { squint: 0 })),
    focus: bake(EYE_W, EYE_H, (ctx) => drawEyeOpen(ctx, { squint: 0.35 })),
    happy: bake(EYE_W, EYE_H, drawEyeHappy),
    closed: bake(EYE_W, EYE_H, drawEyeClosed),
    sleepy: bake(EYE_W, EYE_H, drawEyeSleepy)
  };

  const mouths = {};
  for (const shape of ['smile', 'open', 'cat', 'soft']) {
    mouths[shape] = bake(128, 96, (ctx) => drawMouth(ctx, shape));
  }

  const blush = bake(128, 128, drawBlush);

  return { eyes, mouths, blush };
}
