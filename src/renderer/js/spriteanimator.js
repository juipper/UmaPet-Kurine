import * as THREE from 'three';

/**
 * 伪 3D 贴图动画器（v2）。
 *
 * 与 3D 版 Animator 保持完全一致的对外接口（play / setMood / setLook / setDragging /
 * setDragVelocity / react / update / look / walkX / isBusy），behavior.js、ui、托盘逻辑
 * 无需任何改动。
 *
 * v2 相对 v1 的三处结构性改动：
 *  1. 转身不再用「双平面交叉淡入」（两张贴图同时半透明叠加 = 明显双影），改为滑动擦除
 *     + 横向收缩；静止时自动吸附到整帧，彻底消除残影与接缝。
 *  2. 眨眼不再用固定的正面闭眼块，而是逐朝向闭眼贴片，与身体共用同一套擦除遮罩，
 *     侧身 90° 用侧脸闭眼、背面 135/180/225 不出现眼睛。
 *  3. 动作全部改为「目标姿势 + 弹簧阻尼」驱动，并加入预备动作（anticipation）、
 *     跟随迟滞（follow-through）与落地缓冲（settle），消除数学正弦式的僵硬感；
 *     伸懒腰 / 打哈欠 / 歪头 / 欢呼等动作用关键帧时间轴编排。
 */

const D2R = Math.PI / 180;

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
 * 每个动作都遵守「蓄力(anticipation) → 主体(main) → 保持区间(hold) → 回落缓冲(settle)」，
 * 峰值处留一段 hold，真人做动作时顶点本来就会停顿几十毫秒，同时让截图/肉眼都抓得住。
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

export class SpriteAnimator {
  constructor(character) {
    this.character = character;
    this.root = character.root;
    this.pivot = character.pivot;
    this.primary = character.primary;
    this.secondary = character.secondary;
    this.textures = character.textures;
    this.eyeTextures = character.eyeTextures || null;
    this.setWipe = character.setWipe || (() => {});
    this.degrees = character.DEGREES;

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

    this.yaw = 0;
    this.yawVel = 0;
    this.fixedYaw = null; // 调试/截图用：锁定朝向
    this.debugWipe = null; // 调试/截图用：强制擦除进度 0..1
    this.debugClose = null; // 调试/截图用：强制闭眼程度 0..1
    this.blinkTimer = 2 + Math.random() * 2;
    this.blinkPhase = 0;
    this.noBlink = false;
    this.blushVal = 0;
    this.freezePose = false; // 调试/截图用：锁定姿势，便于像素对比
    this.expression = character.expression || null;
    this.phase = Math.random() * 10;

    // 姿势弹簧：值 + 速度，欠阻尼以保证“过冲—回摆—稳定”的自然节奏
    this.sBob = new Spring(0, 210, 26);
    this.sLeanZ = new Spring(0, 105, 16);
    this.sLeanX = new Spring(0, 105, 16);
    this.sScaleY = new Spring(1, 165, 21);

    this.gait = 0;
    this.anticipateCd = 0;
    this.yawnEye = 0;

    this._degA = -1;
    this._degB = -1;
    this._p = 0;
    this._lastYaw = 0;

    this.applyFacing(1 / 60);
  }

  // ---------- 兼容 3D 版接口 ----------

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
    this.reactTimer = Math.max(this.reactTimer, 0.5);
    this.reactPart = 'happy';
    this.sBob.kick(0.9);
    this.sScaleY.kick(0.9);
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
    this.jumpVel = 3.4;
    this.sScaleY.kick(1.6); // 起跳前向上拉伸
  }

  /**
   * 点击反馈：给弹簧一个脉冲，由弹簧自然完成“受力—回弹—稳定”，
   * 而不是叠加一段正弦抖动（正弦叠加是最容易显得机械的做法）。
   */
  react(part) {
    this.reactTimer = 0.7;
    this.reactPart = part || 'body';
    this.reactStrength = 1;
    switch (part) {
      case 'ear':
      case 'hair':
        this.sBob.kick(-1.5);
        this.sLeanZ.kick(42);
        this.yawVel += 34;
        break;
      case 'hat':
        this.sBob.kick(-1.2);
        this.sLeanZ.kick(-36);
        this.yawVel -= 26;
        break;
      case 'face':
        this.yawVel += 62;
        this.sScaleY.kick(1.1);
        break;
      case 'torso':
        this.sBob.kick(0.8);
        this.sScaleY.kick(1.5);
        break;
      case 'skirt':
        this.sLeanX.kick(-2.4);
        this.sLeanZ.kick(38);
        this.sBob.kick(0.5);
        break;
      case 'tail':
        this.yawVel -= 74;
        this.sLeanZ.kick(-22);
        break;
      case 'leg':
        this.sBob.kick(-1.6);
        this.sLeanZ.kick(30);
        break;
      default:
        this.sBob.kick(1.1);
        this.sLeanZ.kick(16);
        break;
    }
  }

  // ---------- 朝向贴图：滑动擦除 ----------

  /** 按当前朝向选择相邻两帧，并把擦除进度推到该角度对应的位置。 */
  applyFacing(dt) {
    const degAbs = ((this.yaw % 360) + 360) % 360;
    const list = this.degrees;
    let a = list[0];
    let b = list[1];
    let t = 0;
    for (let i = 0; i < list.length; i += 1) {
      const cur = list[i];
      const next = list[(i + 1) % list.length];
      const span = (next - cur + 360) % 360;
      const local = (degAbs - cur + 360) % 360;
      if (local <= span) {
        a = cur;
        b = next;
        t = span > 0 ? local / span : 0;
        break;
      }
    }

    if (a !== this._degA) {
      this.primary.material.map = this.textures.get(a);
      if (this.eyeTextures && this.expression && this.expression.eyes[0]) {
        this.expression.eyes[0].material.map = this.eyeTextures.get(a);
      }
      this._degA = a;
    }
    if (b !== this._degB) {
      this.secondary.material.map = this.textures.get(b);
      if (this.eyeTextures && this.expression && this.expression.eyes[1]) {
        this.expression.eyes[1].material.map = this.eyeTextures.get(b);
      }
      this._degB = b;
    }

    // 角速度大 → 保留完整擦除；几乎静止 → 吸附到最近整帧（避免静止时出现竖向接缝）
    let p = t;
    if (this.debugWipe === null || this.debugWipe === undefined) {
      const spin = Math.abs(this.yawVel);
      let moving = clamp((spin - 12) / 30, 0, 1);
      moving = moving * moving * (3 - 2 * moving);
      if (moving < 1) {
        const snapped = t < 0.5 ? 0 : 1;
        p = snapped + (t - snapped) * moving;
      }
    } else {
      p = this.debugWipe;
    }
    this._p = damp(this._p, p, 34, dt);
    // p 越大越靠 B 帧：擦除带由右向左扫，转身方向与贴图变化方向一致
    this.setWipe(this._p);
    this.turnSpin = Math.abs(this.yawVel);
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
      this.reactStrength = this.reactTimer / 0.7;
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
        this.sScaleY.kick(-1.9); // 落地缓冲
        this.sBob.kick(-0.6);
      }
    }

    let targetBob = pose.bob;
    let targetLeanZ = pose.leanZ;
    let targetLeanX = pose.leanX;
    let targetScaleY = pose.scaleY;
    let yawTarget = pose.yawTarget;

    // 情绪叠加
    if (this.mood === 'shy') {
      yawTarget += 16;
      targetLeanZ += Math.sin(t * 2.1) * 0.012;
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
      targetLeanZ += clamp(-this.dragVelSmooth.x * 0.00018, -0.17, 0.17);
      targetLeanX += clamp(this.dragVelSmooth.y * 0.00011, -0.13, 0.13);
      targetBob += 0.05;
      yawTarget += clamp(this.dragVelSmooth.x * 0.02, -45, 45);
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

    // ---- 朝向：带预备动作的弹簧转身 ----
    if (this.fixedYaw !== null && this.fixedYaw !== undefined) {
      this.yaw = this.fixedYaw;
      this.yawVel = 0;
    } else {
      const err = clamp(yawTarget, -180, 180) - this.yaw;
      this.anticipateCd = Math.max(0, this.anticipateCd - dt);
      // 大幅转向时先反向微转再甩过去，模仿真实转身的重心准备
      if (Math.abs(err) > 46 && this.anticipateCd <= 0) {
        this.yawVel -= Math.sign(err) * 26;
        this.anticipateCd = 0.55;
      }
      const k = this.activity === 'lookAround' ? 34 : 46;
      const acc = err * k - this.yawVel * 11;
      this.yawVel += acc * dt;
      this.yaw += this.yawVel * dt;
      if (this.yaw > 180) {
        this.yaw = 180;
        this.yawVel = 0;
      } else if (this.yaw < -180) {
        this.yaw = -180;
        this.yawVel = 0;
      }
    }

    // 侧倾时贴图绕脚底中心转动，会让较低一侧的底角扎进地面（看起来像"陷进地里"）。
    // 按倾角把整体抬高一截，使较低一侧恰好落在地面线上，重心转移才符合人体。
    const leanZ = this.sLeanZ.value;
    const groundLift =
      Math.sin(Math.min(Math.abs(leanZ), 0.4)) * (this.character.width || 4.35) * 0.5 * 0.62;

    // 应用整体变换
    this.root.position.y = this.baseRootY + this.sBob.value + this.jumpOffset + groundLift;
    this.root.rotation.z = 0;
    this.root.rotation.x = 0;

    const scaleY = clamp(this.sScaleY.value, 0.8, 1.2);
    const pivotScaleX = 1 - (scaleY - 1) * 0.45;
    // 快速转身时横向收缩：模拟平面转向的透视缩短，抑制“扇形双影”的读感
    const turnSquash = clamp(Math.abs(this.yawVel) / 190, 0, 1) * 0.075;
    this.pivot.scale.set(pivotScaleX * (1 - turnSquash), scaleY, 1);
    this.pivot.rotation.z = leanZ;
    this.pivot.rotation.x = this.sLeanX.value;
    // 贴图角度 + 透视旋转共同表现立体转身（旋转方向与贴图侧脸方向一致）
    this.pivot.rotation.y = -THREE.MathUtils.degToRad(this.yaw) * 0.42;

    // 走动位移
    if (this.walkX !== undefined) {
      const targetX = this.walkX;
      this.root.position.x = damp(this.root.position.x, targetX, 3.6, dt);
      if (Math.abs(this.root.position.x - targetX) < 0.01) this.root.position.x = targetX;
    } else {
      this.root.position.x = damp(this.root.position.x, this.baseRootX, 2.6, dt);
    }

    this.applyFacing(dt);
    this.updateExpression(dt, pose);
  }

  /** 计算当前动作的目标姿势（未过弹簧）。 */
  computePose(t, dt) {
    let bob = 0;
    let leanZ = 0;
    let leanX = 0;
    let scaleY = 1;
    let yawTarget = this.lookSmooth.x * 24;
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
          const dir = Math.sign(this.walkX - this.root.position.x) || 1;
          yawTarget = dir * 58;
        }
        break;
      }
      case 'sit':
        bob = -0.115;
        scaleY = 0.915;
        leanX = 0.032;
        leanZ = Math.sin(t * 0.9) * 0.008;
        yawTarget = yawTarget * 0.6 + 5;
        break;
      case 'sleep':
        bob = -0.135 + Math.sin(t * 1.05) * 0.007;
        scaleY = 0.935 + Math.sin(t * 1.05) * 0.005;
        leanZ = Math.sin(t * 0.42) * 0.022;
        leanX = 0.055 + Math.sin(t * 1.05) * 0.004;
        yawTarget = 8 + Math.sin(t * 0.25) * 5;
        break;
      case 'doze':
        bob = -0.075 + Math.sin(t * 1.2) * 0.006;
        scaleY = 0.962;
        leanZ = Math.sin(t * 0.5) * 0.026;
        leanX = 0.03;
        yawTarget = 5;
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
        yawTarget = Math.sin(t * 0.8) * 4;
        break;
      }
      case 'yawn': {
        const k = sampleKeys(YAWN_KEYS, u);
        bob = k.bob;
        scaleY = k.sy;
        leanX = k.lx;
        leanZ = k.lz + (u > 0.3 && u < 0.72 ? Math.sin(t * 18) * 0.003 : 0);
        eyeClose = k.eye;
        yawTarget = Math.sin(t * 0.7) * 3;
        break;
      }
      case 'tilt': {
        const k = sampleKeys(TILT_KEYS, u);
        bob = k.bob;
        scaleY = k.sy;
        leanX = k.lx;
        leanZ = k.lz + Math.sin(t * 1.6) * 0.006;
        yawTarget = 10 + Math.sin(t * 1.1) * 5;
        break;
      }
      case 'cheer': {
        // 两次带蓄力与落地压缩的弹跳（关键帧），比等幅正弦更像真人在蹦
        const k = sampleKeys(CHEER_KEYS, u);
        bob = k.bob;
        scaleY = k.sy;
        leanZ = k.lz;
        leanX = k.lx;
        yawTarget = 8 + Math.sin(t * 1.6) * 7;
        break;
      }
      case 'groom':
        leanZ = Math.sin(t * 3.1) * 0.026 + 0.02;
        leanX = 0.02 + Math.sin(t * 3.1) * 0.008;
        bob = -0.02;
        yawTarget += 12 + Math.sin(t * 1.4) * 9;
        break;
      case 'hop':
        bob = Math.max(0, this.jumpOffset);
        yawTarget = this.lookSmooth.x * 20;
        break;
      case 'giggle':
        bob = Math.abs(Math.sin(t * 8.2)) * 0.038;
        leanZ = Math.sin(t * 5.6) * 0.045;
        scaleY = 1 + Math.sin(t * 8.2) * 0.009;
        break;
      case 'shy':
        bob = -0.035;
        scaleY = 0.982;
        yawTarget += 22;
        leanZ = Math.sin(t * 1.9) * 0.018;
        leanX = 0.02;
        break;
      case 'nod': {
        // 一次完整点头：快速下沉 + 缓慢回位（比等幅正弦更像真人）
        const cyc = (u > 0 ? u : (t % 1.2) / 1.2);
        const drop = Math.sin(clamp(cyc, 0, 1) * Math.PI);
        leanX = drop * 0.075;
        bob = -drop * 0.012;
        break;
      }
      case 'wave':
      case 'greet':
        leanZ = Math.sin(t * 4.6) * 0.05;
        yawTarget = 14 + Math.sin(t * 2.2) * 7;
        bob = Math.abs(Math.sin(t * 4.6)) * 0.012;
        break;
      case 'look':
        yawTarget = this.lookSmooth.x * 34;
        leanZ = Math.sin(t * 1.3) * 0.01;
        break;
      case 'lookAround':
        yawTarget = Math.sin(t * 0.72) * 36;
        leanZ = Math.sin(t * 0.72) * 0.018;
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

    return { bob, leanZ, leanX, scaleY, yawTarget, eyeClose };
  }

  /** 表情覆盖层：眨眼 / 闭眼 / 脸红；闭眼贴片按朝向切换，侧身不再错用正脸。 */
  updateExpression(dt, pose) {
    const expr = this.expression;
    if (!expr) return;

    const yawAbs = Math.abs(this.yaw);

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
    for (const eye of expr.eyes) {
      if (finalClose < 0.02) {
        eye.visible = false;
        continue;
      }
      eye.visible = true;
      eye.material.opacity = clamp(finalClose, 0, 1);
    }

    // 脸红：害羞 / 开心 / 被摸脸；侧脸后淡出（腮红位置按正面标注，超过 58° 不再显示）
    const wantBlush =
      this.mood === 'shy' ||
      this.mood === 'happy' ||
      this.activity === 'shy' ||
      this.activity === 'giggle' ||
      (this.reactTimer > 0 && (this.reactPart === 'face' || this.reactPart === 'happy'))
        ? 1
        : 0;
    this.blushVal = damp(this.blushVal, wantBlush, 5.5, dt);
    const faceVisible = clamp((58 - yawAbs) / 22, 0, 1);
    const blushOpacity = this.blushVal * faceVisible * 0.9;
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
