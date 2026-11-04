import * as THREE from 'three';

/**
 * 贴图动画器（正面单视角版）。
 *
 * 对外接口与旧版保持一致（play / setMood / setLook / setDragging / setDragVelocity /
 * react / update / look / walkX / isBusy），behavior.js、ui 与托盘逻辑无需改动。
 *
 * 相对上一版的改动：
 *  1. 取消转身：删除 yaw / yawVel / 锁定朝向 / 擦除进度 / 横向透视旋转等整套朝向逻辑，
 *     角色始终正面朝向用户，动作只通过「升降 + 侧倾 + 俯仰 + 缩放」表达。
 *  2. 点击反馈收敛：弹簧冲量（kick）全部按「峰值角度 ≤ 约 7°、回弹一次即稳定」重新标定，
 *     不再出现被拍一下整个人大幅甩出去、晃好几下的飘忽感。
 *  3. 动作仍由「目标姿势 + 弹簧阻尼」驱动，并保留预备动作、跟随迟滞与落地缓冲，
 *     伸懒腰 / 打哈欠 / 歪头 / 欢呼用关键帧时间轴编排。
 */

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function damp(cur, target, lambda, dt) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** 极简弹簧：欠阻尼时有自然过冲，比指数阻尼更接近人体惯性。 */
class Spring {
  constructor(value, stiffness, damping) {
    this.value = value;
    this.vel = 0;
    this.k = stiffness;
    this.c = damping;
  }

  step(target, dt) {
    const acc = (target - this.value) * this.k - this.vel * this.c;
    this.vel += acc * dt;
    this.value += this.vel * dt;
    return this.value;
  }

  kick(v) {
    this.vel += v;
  }

  reset(v, vel = 0) {
    this.value = v;
    this.vel = vel;
  }
}

/** 关键帧采样：keys 按 t 升序，段内用 smoothstep 过渡。 */
function sampleKeys(keys, u) {
  const t = clamp(u, 0, 1);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
  const k0 = keys[i];
  const k1 = keys[i + 1];
  const span = Math.max(1e-5, k1.t - k0.t);
  const k = smoothstep((t - k0.t) / span);
  const out = {};
  for (const key of Object.keys(k0)) {
    if (key === 't') continue;
    const v0 = k0[key] === undefined ? 0 : k0[key];
    const v1 = k1[key] === undefined ? 0 : k1[key];
    out[key] = v0 + (v1 - v0) * k;
  }
  return out;
}

/**
 * 可读性约定（本文件所有关键帧通用）：
 *  - bob   躯干整体升降（世界单位，角色高 4.6，0.1 ≈ 2% 身高）
 *  - sy    纵向缩放（>1 伸展、<1 压缩；超过 1.13 会被读成"图像被拉长"）
 *  - lx    前后倾（rotation.x，负值=后仰弓背）
 *  - lz    左右倾（rotation.z）
 * 每个动作都遵守「蓄力(anticipation) → 主体(main) → 保持区间(hold) → 回落缓冲(settle)」。
 */

/** 伸懒腰：微蹲蓄力 → 舒展后仰（抬肩拔起）→ 顶点微颤保持 → 回落缓冲。 */
const STRETCH_KEYS = [
  { t: 0.0, bob: 0, sy: 1, lx: 0, lz: 0 },
  { t: 0.14, bob: -0.062, sy: 0.962, lx: 0.052, lz: -0.008 },
  { t: 0.34, bob: 0.03, sy: 1.055, lx: -0.115, lz: 0.008 },
  { t: 0.5, bob: 0.108, sy: 1.104, lx: -0.216, lz: 0.018 },
  { t: 0.62, bob: 0.106, sy: 1.102, lx: -0.212, lz: 0.014 },
  { t: 0.74, bob: 0.092, sy: 1.086, lx: -0.172, lz: -0.012 },
  { t: 0.88, bob: 0.004, sy: 1.004, lx: 0.028, lz: 0.0 },
  { t: 1.0, bob: 0, sy: 1, lx: 0, lz: 0 }
];

/** 打哈欠：吸气蓄势 → 仰头张口（闭眼）→ 顶点保持 → 缓慢低头回神 + 收尾小鼾。 */
const YAWN_KEYS = [
  { t: 0.0, bob: 0, sy: 1, lx: 0, lz: 0, eye: 0 },
  { t: 0.16, bob: -0.03, sy: 0.982, lx: 0.044, lz: -0.006, eye: 0.12 },
  { t: 0.34, bob: 0.046, sy: 1.052, lx: -0.198, lz: 0.006, eye: 0.96 },
  { t: 0.58, bob: 0.044, sy: 1.05, lx: -0.194, lz: 0.004, eye: 1 },
  { t: 0.68, bob: 0.036, sy: 1.04, lx: -0.17, lz: -0.008, eye: 1 },
  { t: 0.82, bob: -0.016, sy: 0.978, lx: 0.05, lz: 0, eye: 0.44 },
  { t: 0.92, bob: 0.008, sy: 1.014, lx: -0.008, lz: 0, eye: 0.08 },
  { t: 1.0, bob: 0, sy: 1, lx: 0, lz: 0, eye: 0 }
];

/** 歪头：好奇地侧头打量，先快速偏过去、顶点停顿，再慢慢回正。 */
const TILT_KEYS = [
  { t: 0.0, bob: 0, sy: 1, lx: 0, lz: 0 },
  { t: 0.2, bob: 0.012, sy: 1.012, lx: -0.012, lz: 0.132 },
  { t: 0.5, bob: 0.016, sy: 1.014, lx: -0.008, lz: 0.142 },
  { t: 0.66, bob: 0.014, sy: 1.012, lx: -0.01, lz: 0.136 },
  { t: 0.86, bob: -0.006, sy: 0.994, lx: 0.01, lz: 0.024 },
  { t: 1.0, bob: 0, sy: 1, lx: 0, lz: 0 }
];

/** 欢呼：蹲下蓄力 → 第一次弹跳（顶点 hold）→ 落地压缩 → 第二次小弹跳 → 收势。 */
const CHEER_KEYS = [
  { t: 0.0, bob: 0, sy: 1, lz: 0, lx: 0 },
  { t: 0.12, bob: -0.072, sy: 0.944, lz: -0.012, lx: 0.038 },
  { t: 0.28, bob: 0.19, sy: 1.056, lz: 0.03, lx: -0.034 },
  { t: 0.38, bob: 0.186, sy: 1.054, lz: 0.028, lx: -0.032 },
  { t: 0.5, bob: 0.0, sy: 0.952, lz: 0.004, lx: 0.022 },
  { t: 0.66, bob: 0.152, sy: 1.044, lz: -0.026, lx: -0.026 },
  { t: 0.73, bob: 0.148, sy: 1.042, lz: -0.024, lx: -0.024 },
  { t: 0.86, bob: 0.0, sy: 0.968, lz: 0, lx: 0.014 },
  { t: 0.94, bob: 0.07, sy: 1.022, lz: 0.008, lx: -0.008 },
  { t: 1.0, bob: 0, sy: 1, lz: 0, lx: 0 }
];

/**
 * 点击反馈冲量表（bob / leanZ / leanX 为弹簧速度冲量，scaleY 为缩放冲量）。
 *
 * 标定依据（弹簧 k/c：bob 210/26、lean 105/16、scaleY 165/21）：
 * 旧版 leanZ 冲量高达 42（峰值约 70°）且 yawVel 冲量 ±74，
 * 正是"被拍一下就整个人甩出去、还晃半天"的根源。现按实测标定重写：
 *   leanZ 峰值 ≈ kick × 1.65°、bob 峰值 ≈ kick × 0.017、scaleY 峰值 ≈ kick × 0.011，
 * 取 leanZ 冲量 0.8~2.6（峰值约 1.3°~4.3°），一次受力只过冲一次、0.3~0.6s 收敛。
 */
const REACT = {
  ear: { bob: -0.9, leanZ: 2.6, leanX: 0, scaleY: 0.6 },
  hat: { bob: -0.8, leanZ: -2.2, leanX: 0, scaleY: 0.5 },
  hair: { bob: -0.7, leanZ: 2.2, leanX: 0, scaleY: 0.5 },
  face: { bob: 0.8, leanZ: 1.9, leanX: 0, scaleY: 1.2 },
  torso: { bob: 0.9, leanZ: 1.3, leanX: 0, scaleY: 1.3 },
  skirt: { bob: 0.4, leanZ: 2.2, leanX: -1.2, scaleY: 0.5 },
  tail: { bob: -0.5, leanZ: -1.8, leanX: 0.4, scaleY: 0.4 },
  leg: { bob: -1.0, leanZ: 2.0, leanX: 0, scaleY: 0.5 },
  happy: { bob: 0.9, leanZ: 0, leanX: 0, scaleY: 1.0 },
  body: { bob: 1.0, leanZ: 1.4, leanX: 0, scaleY: 1.2 }
};

/** 点击反馈的持续时间（秒），仅用于安抚表情与调试强度，与实际回弹无关（回弹由弹簧决定）。 */
const REACT_TIME = 0.6;

export class SpriteAnimator {
  constructor(character) {
    this.character = character;
    this.root = character.root;
    this.pivot = character.pivot;
    this.body = character.body;
    this.eye = character.eye;
    this.expression = character.expression || null;

    this.baseRootY = this.root.position.y;
    this.baseRootX = this.root.position.x;

    this.activity = 'idle';
    this.activityTime = 0;
    this.activityDuration = 0;
    this.activityOptions = {};
    this.busy = false;

    this.mood = null;
    this.moodTime = 0;

    this.look = new THREE.Vector2(0, 0);
    this.lookSmooth = new THREE.Vector2(0, 0);

    this.walkX = undefined;
    this.walkSpeed = 7.0;

    this.dragging = false;
    this.dragVel = { x: 0, y: 0 };
    this.dragVelSmooth = { x: 0, y: 0 };

    this.reactTimer = 0;
    this.reactPart = null;
    this.reactStrength = 0;

    this.jumpOffset = 0;
    this.jumpVel = 0;
    this.jumpActive = false;

    this.debugClose = null; // 调试/截图用：强制闭眼程度 0..1
    this.freezePose = false; // 调试/截图用：锁定姿势，便于像素对比
    this.blinkTimer = 2 + Math.random() * 2;
    this.blinkPhase = 0;
    this.noBlink = false;
    this.blushVal = 0;
    this.phase = Math.random() * 10;

    // 姿势弹簧：值 + 速度，欠阻尼以保证“过冲—回摆—稳定”的自然节奏
    this.sBob = new Spring(0, 210, 26);
    this.sLeanZ = new Spring(0, 105, 16);
    this.sLeanX = new Spring(0, 105, 16);
    this.sScaleY = new Spring(1, 165, 21);

    this.gait = 0;
  }

  // ---------- 对外接口 ----------

  isBusy() {
    return this.busy || this.activity !== 'idle';
  }

  play(activity, duration = null, options = {}) {
    const next = activity || 'idle';
    if (next !== this.activity) {
      this.activityTime = 0;
      this.gait = 0;
    }
    this.activity = next;
    this.activityTime = 0;
    this.activityDuration = duration || 0;
    this.activityOptions = options || {};
    this.busy = next !== 'idle';
    if (next === 'hop') this.jump();
    if (next === 'walk') this.walkSpeed = options.speed || 7.0;
  }

  setMood(mood, duration = 0) {
    this.mood = mood;
    this.moodTime = duration || 0;
    if (mood === 'happy') this.triggerHappy();
  }

  applyMoodExpression() {
    // 贴图方案下表情由姿态表达，此处保留接口
  }

  setExpression() {}
  setMouth() {}

  triggerHappy() {
    this.reactTimer = Math.max(this.reactTimer, REACT_TIME);
    this.reactPart = 'happy';
    this.applyReact('happy');
  }

  setLook(x, y) {
    this.look.set(x, y);
  }

  setDragging(isDragging) {
    this.dragging = !!isDragging;
    if (!isDragging) {
      this.dragVel.x = 0;
      this.dragVel.y = 0;
    }
  }

  setDragVelocity(vx, vy) {
    this.dragVel.x = vx;
    this.dragVel.y = vy;
  }

  jump() {
    this.jumpActive = true;
    this.jumpVel = 2.8;
    this.sScaleY.kick(1.0); // 起跳前向上拉伸
  }

  /**
   * 点击反馈：给弹簧一个脉冲，由弹簧自然完成“受力—回弹—稳定”，
   * 而不是叠加一段正弦抖动（正弦叠加是最容易显得机械的做法）。
   * 冲量见 REACT 表，幅度刻意压小：轻拍一下就够，不要整个人甩出去。
   */
  react(part) {
    this.reactTimer = REACT_TIME;
    this.reactPart = part || 'body';
    this.reactStrength = 1;
    this.applyReact(part || 'body');
  }

  applyReact(part) {
    const k = REACT[part] || REACT.body;
    if (k.bob) this.sBob.kick(k.bob);
    if (k.leanZ) this.sLeanZ.kick(k.leanZ);
    if (k.leanX) this.sLeanX.kick(k.leanX);
    if (k.scaleY) this.sScaleY.kick(k.scaleY);
  }

  // ---------- 主更新 ----------

  update(dt, elapsed) {
    this.phase += dt;
    const t = elapsed + this.phase;

    if (this.activityDuration > 0) {
      this.activityTime += dt;
      if (this.activityTime >= this.activityDuration) {
        this.activity = 'idle';
        this.activityTime = 0;
        this.activityDuration = 0;
        this.busy = false;
      }
    }

    if (this.moodTime > 0) {
      this.moodTime -= dt;
      if (this.moodTime <= 0) this.mood = null;
    }
    if (this.reactTimer > 0) {
      this.reactTimer = Math.max(0, this.reactTimer - dt);
      this.reactStrength = this.reactTimer / REACT_TIME;
    }

    this.lookSmooth.x = damp(this.lookSmooth.x, this.look.x, 6, dt);
    this.lookSmooth.y = damp(this.lookSmooth.y, this.look.y, 6, dt);
    this.dragVelSmooth.x = damp(this.dragVelSmooth.x, this.dragVel.x, 8, dt);
    this.dragVelSmooth.y = damp(this.dragVelSmooth.y, this.dragVel.y, 8, dt);

    const pose = this.computePose(t, dt);

    // 跳跃物理
    if (this.jumpActive) {
      this.jumpVel -= 16 * dt;
      this.jumpOffset += this.jumpVel * dt;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.jumpVel = 0;
        this.jumpActive = false;
        this.sScaleY.kick(-1.2); // 落地缓冲
        this.sBob.kick(-0.35);
      }
    }

    let targetBob = pose.bob;
    let targetLeanZ = pose.leanZ;
    let targetLeanX = pose.leanX;
    let targetScaleY = pose.scaleY;

    // 情绪叠加
    if (this.mood === 'shy') {
      targetLeanZ += 0.05;
      targetLeanX += 0.012;
      targetBob -= 0.006;
    } else if (this.mood === 'happy') {
      targetBob += Math.sin(t * 3.4) * 0.012 + 0.01;
    } else if (this.mood === 'sleepy') {
      targetBob -= 0.03;
      targetScaleY *= 0.985;
      targetLeanZ += Math.sin(t * 0.7) * 0.02;
    } else if (this.mood === 'angry') {
      targetLeanX += 0.02;
    }

    // 拖拽：被拎起来时身体滞后、四肢下沉
    if (this.dragging) {
      targetLeanZ += clamp(-this.dragVelSmooth.x * 0.0001, -0.09, 0.09);
      targetLeanX += clamp(this.dragVelSmooth.y * 0.00006, -0.07, 0.07);
      targetBob += 0.05;
    }

    if (this.freezePose) {
      targetBob = 0;
      targetLeanZ = 0;
      targetLeanX = 0;
      targetScaleY = 1;
      this.sBob.reset(0);
      this.sLeanZ.reset(0);
      this.sLeanX.reset(0);
      this.sScaleY.reset(1);
    } else {
      this.sBob.step(targetBob, dt);
      this.sLeanZ.step(targetLeanZ, dt);
      this.sLeanX.step(targetLeanX, dt);
      this.sScaleY.step(targetScaleY, dt);
    }

    // 侧倾时贴图绕脚底中心转动，会让较低一侧的底角扎进地面（看起来像"陷进地里"）。
    // 按倾角把整体抬高一截，使较低一侧恰好落在地面线上，重心转移才符合人体。
    const leanZ = this.sLeanZ.value;
    const groundLift =
      Math.sin(Math.min(Math.abs(leanZ), 0.4)) * (this.character.width || 4.35) * 0.5 * 0.62;

    // 应用整体变换（正面视角：只有升降 / 侧倾 / 俯仰 / 缩放，没有转向）
    this.root.position.y = this.baseRootY + this.sBob.value + this.jumpOffset + groundLift;

    const scaleY = clamp(this.sScaleY.value, 0.8, 1.2);
    const pivotScaleX = 1 - (scaleY - 1) * 0.45;
    this.pivot.scale.set(pivotScaleX, scaleY, 1);
    this.pivot.rotation.z = leanZ;
    this.pivot.rotation.x = this.sLeanX.value;

    // 走动位移
    if (this.walkX !== undefined) {
      const targetX = this.walkX;
      this.root.position.x = damp(this.root.position.x, targetX, 3.6, dt);
      if (Math.abs(this.root.position.x - targetX) < 0.01) this.root.position.x = targetX;
    } else {
      this.root.position.x = damp(this.root.position.x, this.baseRootX, 2.6, dt);
    }

    this.updateExpression(dt, pose);
  }

  /** 计算当前动作的目标姿势（未过弹簧）。 */
  computePose(t, dt) {
    let bob = 0;
    let leanZ = 0;
    let leanX = 0;
    let scaleY = 1;
    let eyeClose = 0;
    const u = this.activityDuration > 0 ? clamp(this.activityTime / this.activityDuration, 0, 1) : 0;

    switch (this.activity) {
      case 'walk':
      case 'peek': {
        // 步态：一步一次的上下起伏 + 落地压缩，并配合躯干左右摆与稳定前倾
        const speed = this.walkSpeed;
        const cadence = 1.35 + speed * 0.075;
        this.gait += dt * cadence * Math.PI * 2;
        const g = this.gait;
        const up = Math.sin(g);
        bob = up * up * 0.052 - 0.014;
        leanZ = Math.sin(g) * 0.03;
        leanX = -0.046 - Math.sin(g * 2) * 0.007;
        scaleY = 1 + Math.cos(g * 2) * 0.013;
        if (this.walkX !== undefined) {
          // 正面视角不转身，用轻微侧倾表现"往哪边走"
          const dir = Math.sign(this.walkX - this.root.position.x) || 1;
          leanZ += dir * 0.03;
        }
        break;
      }
      case 'sit':
        bob = -0.115;
        scaleY = 0.915;
        leanX = 0.032;
        leanZ = Math.sin(t * 0.9) * 0.008 + 0.02;
        break;
      case 'sleep':
        bob = -0.135 + Math.sin(t * 1.05) * 0.007;
        scaleY = 0.935 + Math.sin(t * 1.05) * 0.005;
        leanZ = Math.sin(t * 0.42) * 0.022 + 0.03;
        leanX = 0.055 + Math.sin(t * 1.05) * 0.004;
        break;
      case 'doze':
        bob = -0.075 + Math.sin(t * 1.2) * 0.006;
        scaleY = 0.962;
        leanZ = Math.sin(t * 0.5) * 0.026 + 0.02;
        leanX = 0.03;
        break;
      case 'stretch': {
        const k = sampleKeys(STRETCH_KEYS, u);
        bob = k.bob;
        scaleY = k.sy;
        leanX = k.lx;
        leanZ = k.lz;
        // 拉到极限时肌肉轻微颤抖
        if (u > 0.45 && u < 0.74) {
          const tri = Math.sin(Math.PI * clamp((u - 0.45) / 0.29, 0, 1));
          leanZ += Math.sin(t * 26) * 0.004 * tri;
          bob += Math.sin(t * 21) * 0.0025 * tri;
        }
        break;
      }
      case 'yawn': {
        const k = sampleKeys(YAWN_KEYS, u);
        bob = k.bob;
        scaleY = k.sy;
        leanX = k.lx;
        leanZ = k.lz + (u > 0.3 && u < 0.72 ? Math.sin(t * 18) * 0.003 : 0);
        eyeClose = k.eye;
        break;
      }
      case 'tilt': {
        const k = sampleKeys(TILT_KEYS, u);
        bob = k.bob;
        scaleY = k.sy;
        leanX = k.lx;
        leanZ = k.lz + Math.sin(t * 1.6) * 0.006;
        break;
      }
      case 'cheer': {
        // 两次带蓄力与落地压缩的弹跳（关键帧），比等幅正弦更像真人在蹦
        const k = sampleKeys(CHEER_KEYS, u);
        bob = k.bob;
        scaleY = k.sy;
        leanZ = k.lz;
        leanX = k.lx;
        break;
      }
      case 'groom':
        leanZ = Math.sin(t * 3.1) * 0.026 + 0.02;
        leanX = 0.02 + Math.sin(t * 3.1) * 0.008;
        bob = -0.02;
        break;
      case 'hop':
        bob = Math.max(0, this.jumpOffset);
        break;
      case 'giggle':
        bob = Math.abs(Math.sin(t * 8.2)) * 0.038;
        leanZ = Math.sin(t * 5.6) * 0.045;
        scaleY = 1 + Math.sin(t * 8.2) * 0.009;
        break;
      case 'shy':
        bob = -0.035;
        scaleY = 0.982;
        leanZ = 0.06 + Math.sin(t * 1.9) * 0.018;
        leanX = 0.02;
        break;
      case 'nod': {
        // 一次完整点头：快速下沉 + 缓慢回位（比等幅正弦更像真人）
        const cyc = u > 0 ? u : (t % 1.2) / 1.2;
        const drop = Math.sin(clamp(cyc, 0, 1) * Math.PI);
        leanX = drop * 0.075;
        bob = -drop * 0.012;
        break;
      }
      case 'wave':
      case 'greet':
        leanZ = Math.sin(t * 4.6) * 0.05;
        bob = Math.abs(Math.sin(t * 4.6)) * 0.012;
        break;
      case 'look':
        leanZ = 0.03 + Math.sin(t * 1.3) * 0.02;
        leanX = this.lookSmooth.y * -0.02;
        break;
      case 'lookAround':
        // 不转身，改为左右张望式的轻微重心转移
        leanZ = Math.sin(t * 0.72) * 0.055;
        leanX = Math.sin(t * 0.36) * 0.008;
        break;
      default: {
        // idle：不对称呼吸（吸气快、呼气慢） + 缓慢重心转移
        const bp = (t / 3.9) % 1;
        const breathe =
          bp < 0.38 ? Math.sin((bp / 0.38) * Math.PI * 0.5) : Math.cos(((bp - 0.38) / 0.62) * Math.PI * 0.5);
        bob = breathe * 0.013 - 0.006;
        scaleY = 1 + breathe * 0.008;
        leanZ = Math.sin(t * 0.82) * 0.011;
        leanX = this.lookSmooth.y * -0.016 + Math.sin(t * 0.53) * 0.005;
        break;
      }
    }

    return { bob, leanZ, leanX, scaleY, eyeClose };
  }

  /** 表情覆盖层：眨眼 / 闭眼 / 脸红（正面单张闭眼贴片）。 */
  updateExpression(dt, pose) {
    const expr = this.expression;
    if (!expr) return;

    // 眨眼节奏（真人眨眼 100~150ms）
    if (this.blinkPhase > 0) {
      this.blinkPhase += dt / 0.13;
      if (this.blinkPhase >= 1) this.blinkPhase = 0;
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkTimer = this.noBlink ? 999 : 2.4 + Math.random() * 4.2;
        this.blinkPhase = this.noBlink ? 0 : 0.0001;
      }
    }
    let blinkClose = 0;
    if (this.blinkPhase > 0) {
      blinkClose = this.blinkPhase < 0.5 ? this.blinkPhase / 0.5 : (1 - this.blinkPhase) / 0.5;
    }

    // 睡眠 / 打瞌睡时持续闭眼
    let sleepClose = 0;
    if (this.activity === 'sleep') sleepClose = 1;
    else if (this.activity === 'doze') sleepClose = 0.92;
    else if (this.mood === 'sleep' || this.mood === 'sleepy') sleepClose = 0.8;
    else if (this.reactTimer > 0 && this.reactPart === 'face') sleepClose = 0;

    // 打哈欠时挤眼
    const yawnClose = pose && pose.eyeClose ? pose.eyeClose : 0;

    const close = Math.max(blinkClose, sleepClose, yawnClose);
    // 调试/截图用：强制闭眼程度（一次眨眼只有 130ms，很难稳定截到半闭帧）
    const finalClose =
      this.debugClose === null || this.debugClose === undefined ? close : this.debugClose;

    const eye = expr.eye;
    if (eye) {
      if (finalClose < 0.02) {
        eye.visible = false;
        eye.material.opacity = 0;
      } else {
        eye.visible = true;
        eye.material.opacity = clamp(finalClose, 0, 1);
      }
    }

    // 脸红：害羞 / 开心 / 被摸脸
    const wantBlush =
      this.mood === 'shy' ||
      this.mood === 'happy' ||
      this.activity === 'shy' ||
      this.activity === 'giggle' ||
      (this.reactTimer > 0 && (this.reactPart === 'face' || this.reactPart === 'happy'))
        ? 1
        : 0;
    this.blushVal = damp(this.blushVal, wantBlush, 5.5, dt);
    const blushOpacity = this.blushVal * 0.9;
    for (const cheek of expr.blushes) {
      if (blushOpacity < 0.02) {
        cheek.visible = false;
        continue;
      }
      cheek.visible = true;
      cheek.material.opacity = blushOpacity;
    }
  }
}
