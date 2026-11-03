import * as THREE from 'three';

const EYE_TEXTURE_KEYS = ['normal', 'focus', 'happy', 'closed', 'sleepy'];

/** 弹簧参数：k 越大越快，d 越小越弹。临界阻尼约 d = 2*sqrt(k)。 */
const K = 165;
const D = 20;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/**
 * 活动（自主行为）定义表。
 * 每一项描述一个动作片段的时长与姿态目标。
 */
const ACTIVITIES = {
  idle: { duration: 0 },
  look: { duration: 2.2 },
  lookAround: { duration: 3.4 },
  nod: { duration: 0.9 },
  shake: { duration: 0.9 },
  stretch: { duration: 2.6 },
  groom: { duration: 2.4 },
  wave: { duration: 2.0 },
  hop: { duration: 0.9 },
  walk: { duration: 3.2 },
  sit: { duration: 8 },
  sleep: { duration: 26 },
  doze: { duration: 6 },
  giggle: { duration: 1.4 },
  shy: { duration: 1.6 },
  surprised: { duration: 1.1 },
  annoyed: { duration: 1.3 },
  eat: { duration: 3.0 }
};

/**
 * 角色动画控制器：弹簧驱动 + 多段次级动画 + 部位反应。
 */
export class Animator {
  constructor(character) {
    this.character = character;
    this.parts = character.parts;
    this.root = character.root;

    this.mood = 'idle';
    this.moodTimer = 0;
    this.moodDuration = 0;

    this.activity = 'idle';
    this.activityTime = 0;
    this.activityDuration = 0;

    // 弹簧状态
    const keys = [
      'rootY', 'rootX', 'leanX', 'leanZ',
      'headX', 'headY', 'headZ',
      'armLZ', 'armRZ', 'armLX', 'armRX',
      'legLX', 'legRX',
      'earLX', 'earRX', 'earLZ', 'earRZ',
      'torsoX', 'torsoZ'
    ];
    this.cur = {};
    this.vel = {};
    this.tgt = {};
    for (const key of keys) {
      this.cur[key] = 0;
      this.vel[key] = 0;
      this.tgt[key] = 0;
    }
    this.armBase = 0.30;
    this.cur.armLZ = -this.armBase;
    this.cur.armRZ = this.armBase;
    this.cur.earLX = -0.26;
    this.cur.earRX = -0.26;
    this.cur.earLZ = -0.42;
    this.cur.earRZ = 0.42;

    this.blinkCountdown = 1.6 + Math.random() * 2.4;
    this.blinkPhase = 0;
    this.blinkDuration = 0.14;
    this.doubleBlink = false;

    this.look = new THREE.Vector2(0, 0);
    this.lookSmooth = new THREE.Vector2(0, 0);

    this.time = 0;
    this.breath = 0;
    this.jumpOffset = 0;
    this.jumpVelocity = 0;

    this.dragging = false;
    this.dragLean = new THREE.Vector2(0, 0);

    this.expression = 'normal';
    this.eyeMaterialCache = this.buildEyeMaterialCache();
    this.setExpression('normal');
    this.setMouth('soft');

    this.baseRootY = this.root.position.y;
    this.baseRootX = this.root.position.x;

    // 尾巴/耳朵相位累积器，用于多段延迟
    this.tailAngle = 0;
    this.tailSpeed = 1.4;
    this.tailAmp = 0.30;

    // 反应（点击部位触发）
    this.reaction = null;
    this.reactionTime = 0;

    // 走路
    this.walkPhase = 0;
    this.walkSpeed = 7.2;
    this.walkAmp = 0.55;

    this.gazeBias = new THREE.Vector2(0, 0);
    this.gazeTarget = new THREE.Vector2(0, 0);
    this.gazeTimer = 0;
  }

  buildEyeMaterialCache() {
    const textures = this.character.textures.eyes;
    const cache = {};
    for (const key of EYE_TEXTURE_KEYS) {
      if (!textures[key]) continue;
      cache[key] = { right: textures[key], left: textures[key] };
    }
    return cache;
  }

  setExpression(key) {
    const entry = this.eyeMaterialCache[key];
    if (!entry) return;
    this.expression = key;
    this.parts.eyes.right.material.map = entry.right;
    this.parts.eyes.right.material.needsUpdate = true;
    this.parts.eyes.left.material.map = entry.left;
    this.parts.eyes.left.material.needsUpdate = true;
  }

  setMouth(key) {
    const texture = this.character.textures.mouths[key];
    if (!texture) return;
    this.parts.eyes.mouth.material.map = texture;
    this.parts.eyes.mouth.material.needsUpdate = true;
  }

  // ---------- 活动控制 ----------
  play(activity, duration = null, options = {}) {
    if (!ACTIVITIES[activity]) return;
    const def = ACTIVITIES[activity];
    this.activity = activity;
    this.activityTime = 0;
    this.activityDuration = duration !== null ? duration : def.duration;
    if (options.speed) this.walkSpeed = options.speed;
    if (options.tailSpeed) this.tailSpeed = options.tailSpeed;
    if (options.expression) this.setExpression(options.expression);
    if (options.mouth) this.setMouth(options.mouth);
  }

  isBusy() {
    return this.activity !== 'idle' || this.mood !== 'idle' || this.reaction !== null;
  }

  setMood(mood, duration = 0) {
    this.mood = mood;
    this.moodTimer = 0;
    this.moodDuration = duration;
    this.applyMoodExpression(mood);
  }

  applyMoodExpression(mood) {
    switch (mood) {
      case 'happy':
        this.setExpression('happy');
        this.setMouth('open');
        break;
      case 'shy':
        this.setExpression('closed');
        this.setMouth('cat');
        break;
      case 'sleepy':
      case 'sleep':
        this.setExpression('sleepy');
        this.setMouth('soft');
        break;
      case 'angry':
        this.setExpression('focus');
        this.setMouth('cat');
        break;
      case 'sad':
        this.setExpression('sleepy');
        this.setMouth('soft');
        break;
      case 'drag':
        this.setExpression('focus');
        this.setMouth('open');
        break;
      default:
        this.setExpression('normal');
        this.setMouth('soft');
    }
  }

  setLook(x, y) {
    this.look.set(clamp(x, -1, 1), clamp(y, -1, 1));
  }

  setDragging(isDragging) {
    this.dragging = isDragging;
    if (isDragging) {
      this.reaction = null;
      this.play('idle');
      this.setMood('drag', 0);
    } else if (this.mood === 'drag') {
      this.setMood('idle');
    }
  }

  setDragVelocity(vx, vy) {
    this.dragLean.x = clamp(vx * 0.022, -0.4, 0.4);
    this.dragLean.y = clamp(vy * 0.022, -0.3, 0.3);
  }

  triggerHappy() {
    this.setMood('happy', 1.2);
    this.play('giggle', 1.4);
    this.jumpVelocity = 2.4;
  }

  /** 点击部位反应。 */
  react(part) {
    this.reaction = part;
    this.reactionTime = 0;
    switch (part) {
      case 'ear':
        this.play('surprised', 1.0);
        this.setExpression('focus');
        this.setMouth('open');
        this.jumpVelocity = 1.6;
        break;
      case 'face':
        this.play('shy', 1.8);
        this.setExpression('closed');
        this.setMouth('cat');
        break;
      case 'hair':
      case 'hat':
        this.play('groom', 1.6);
        this.setExpression('happy');
        this.setMouth('smile');
        break;
      case 'torso':
        this.play('giggle', 1.4);
        this.setExpression('happy');
        this.setMouth('open');
        this.jumpVelocity = 1.2;
        break;
      case 'skirt':
        this.play('annoyed', 1.4);
        this.setExpression('focus');
        this.setMouth('cat');
        break;
      case 'tail':
        this.play('surprised', 1.2);
        this.setExpression('shy' in this.eyeMaterialCache ? 'closed' : 'normal');
        this.setMouth('open');
        this.jumpVelocity = 2.0;
        this.tailSpeed = 9;
        break;
      case 'leg':
        this.play('annoyed', 1.0);
        this.setExpression('focus');
        this.setMouth('cat');
        break;
      default:
        this.play('giggle', 1.0);
        break;
    }
  }

  // ---------- 目标计算 ----------
  computeTargets(elapsed, dt) {
    const t = this.tgt;
    // 复位到中性位
    t.rootY = 0;
    t.rootX = 0;
    t.leanX = 0;
    t.leanZ = 0;
    t.headX = this.lookSmooth.y * -0.5;
    t.headY = this.lookSmooth.x * 0.9;
    t.headZ = Math.sin(elapsed * 1.1) * 0.02;
    t.armLZ = -this.armBase;
    t.armRZ = this.armBase;
    t.armLX = 0;
    t.armRX = 0;
    t.legLX = 0;
    t.legRX = 0;
    t.earLX = -0.26 + Math.sin(elapsed * 1.7) * 0.035;
    t.earRX = -0.26 + Math.sin(elapsed * 1.7 + 0.5) * 0.035;
    t.earLZ = -0.42;
    t.earRZ = 0.42;
    t.torsoX = 0;
    t.torsoZ = 0;

    let tailSpeed = 1.4;
    let tailAmp = 0.30;

    // ---- 活动姿态 ----
    switch (this.activity) {
      case 'look': {
        t.headY = this.gazeBias.x * 0.55;
        t.headX = this.gazeBias.y * 0.3;
        t.leanZ = this.gazeBias.x * 0.05;
        break;
      }
      case 'lookAround': {
        const p = Math.sin(this.activityTime * 1.5);
        t.headY = p * 0.55;
        t.headZ = p * 0.05;
        t.leanZ = p * 0.05;
        break;
      }
      case 'nod': {
        const p = Math.sin(this.activityTime * 9);
        t.headX = 0.10 + p * 0.16;
        break;
      }
      case 'shake': {
        const p = Math.sin(this.activityTime * 12);
        t.headY = p * 0.24;
        t.headZ = p * 0.06;
        break;
      }
      case 'stretch': {
        const p = Math.sin(Math.min(1, this.activityTime / 2.4) * Math.PI);
        t.armLZ = -1.9;
        t.armRZ = 1.9;
        t.armLX = -0.5;
        t.armRX = -0.5;
        t.headX = -0.22 * p;
        t.leanX = -0.10 * p;
        t.spineStretch = p;
        t.rootY = 0.045 * p;
        break;
      }
      case 'groom': {
        const p = Math.sin(Math.min(1, this.activityTime / 2.0) * Math.PI);
        t.armRZ = 0.30 + p * 1.35;
        t.armRX = -p * 0.9;
        t.headZ = 0.05 * p;
        break;
      }
      case 'wave': {
        const p = Math.sin(this.activityTime * 10);
        t.armRZ = 1.85 + p * 0.22;
        t.armRX = -0.35;
        t.headZ = 0.06 + p * 0.03;
        break;
      }
      case 'hop': {
        const p = Math.sin(this.activityTime * 12);
        t.legLX = p * 0.28;
        t.legRX = -p * 0.28;
        t.armLZ = -0.55;
        t.armRZ = 0.55;
        break;
      }
      case 'walk': {
        this.walkPhase += dt * this.walkSpeed;
        const p = Math.sin(this.walkPhase);
        t.legLX = p * this.walkAmp;
        t.legRX = -p * this.walkAmp;
        t.armLZ = -this.armBase - p * 0.22;
        t.armRZ = this.armBase - p * 0.22;
        t.leanZ = p * 0.045;
        t.rootY = Math.abs(Math.cos(this.walkPhase)) * 0.035 - 0.01;
        t.headZ = -p * 0.03;
        tailSpeed = 4.2;
        tailAmp = 0.34;
        break;
      }
      case 'sit': {
        t.rootY = -0.42;
        t.legLX = -1.35;
        t.legRX = -1.35;
        t.armLZ = -0.22;
        t.armRZ = 0.22;
        t.armLX = -0.35;
        t.armRX = -0.35;
        t.headX = 0.06;
        tailSpeed = 0.9;
        tailAmp = 0.14;
        break;
      }
      case 'sleep': {
        t.rootY = -0.46;
        t.legLX = -1.3;
        t.legRX = -1.3;
        t.headX = 0.34;
        t.headZ = 0.10;
        t.armLZ = -0.12;
        t.armRZ = 0.12;
        t.armLX = -0.3;
        t.armRX = -0.3;
        t.leanX = 0.05;
        t.earLX = 0.12;
        t.earRX = 0.12;
        t.earLZ = -0.62;
        t.earRZ = 0.62;
        tailSpeed = 0.5;
        tailAmp = 0.07;
        break;
      }
      case 'doze': {
        t.rootY = -0.08;
        t.headX = 0.2;
        t.earLX = 0.02;
        t.earRX = 0.02;
        tailSpeed = 0.8;
        tailAmp = 0.10;
        break;
      }
      case 'giggle': {
        const p = Math.sin(this.activityTime * 16);
        t.rootY = Math.abs(p) * 0.055;
        t.headZ = p * 0.05;
        t.leanZ = p * 0.035;
        t.armLZ = -0.62;
        t.armRZ = 0.62;
        tailSpeed = 9;
        tailAmp = 0.55;
        break;
      }
      case 'shy': {
        t.headX = 0.22;
        t.headZ = -0.09;
        t.armLZ = 0.06;
        t.armRZ = -0.06;
        t.armLX = -0.55;
        t.armRX = -0.55;
        t.leanX = 0.05;
        t.earLX = 0.18;
        t.earRX = 0.18;
        t.earLZ = -0.30;
        t.earRZ = 0.30;
        tailSpeed = 2.4;
        tailAmp = 0.2;
        break;
      }
      case 'surprised': {
        const p = Math.sin(Math.min(1, this.activityTime / 0.8) * Math.PI);
        t.rootY = 0.06;
        t.headX = -0.14 * p;
        t.earLX = -0.55;
        t.earRX = -0.55;
        t.armLZ = -0.78;
        t.armRZ = 0.78;
        tailSpeed = 10;
        tailAmp = 0.5;
        break;
      }
      case 'annoyed': {
        const p = Math.sin(this.activityTime * 10);
        t.headZ = p * 0.07;
        t.headX = -0.04;
        t.armLZ = -0.42;
        t.armRZ = 0.42;
        t.earLX = -0.12;
        t.earRX = -0.12;
        t.earLZ = -0.26;
        t.earRZ = 0.26;
        t.leanZ = p * 0.03;
        tailSpeed = 6;
        tailAmp = 0.36;
        break;
      }
      case 'eat': {
        const p = Math.sin(this.activityTime * 7);
        t.armRZ = 0.62;
        t.armRX = -1.15 + p * 0.12;
        t.headX = 0.08 + p * 0.05;
        break;
      }
      default:
        break;
    }

    // ---- 情绪叠加 ----
    switch (this.mood) {
      case 'happy': {
        const p = Math.sin(elapsed * 8);
        t.leanZ += p * 0.035;
        t.rootY += Math.abs(p) * 0.03;
        tailSpeed = 8;
        tailAmp = 0.5;
        break;
      }
      case 'shy':
        t.headX += 0.18;
        t.headY *= 0.4;
        t.earLZ = -0.3;
        t.earRZ = 0.3;
        break;
      case 'sleep':
        t.headX += 0.3;
        break;
      case 'sleepy':
        t.headX += 0.12;
        break;
      case 'sad':
        t.headX += 0.16;
        t.earLX = 0.1;
        t.earRX = 0.1;
        tailSpeed = 0.8;
        tailAmp = 0.12;
        break;
      case 'angry':
        t.headX -= 0.05;
        t.headZ += Math.sin(elapsed * 14) * 0.03;
        t.earLX = -0.05;
        t.earRX = -0.05;
        break;
      case 'drag':
        t.leanZ = -this.dragLean.x * 0.55;
        t.leanX = -this.dragLean.y * 0.4;
        t.headX = -this.dragLean.y * 0.6;
        t.headY = this.dragLean.x * 1.0;
        t.armLZ = -0.72;
        t.armRZ = 0.72;
        t.legLX = -0.25 + Math.sin(elapsed * 6) * 0.1;
        t.legRX = -0.25 - Math.sin(elapsed * 6) * 0.1;
        break;
      default: {
        const p = Math.sin(elapsed * 1.1);
        t.leanZ += p * 0.014;
        t.headZ += p * 0.012;
        break;
      }
    }

    // 呼吸幅度
    const breathSpeed = this.activity === 'sleep' ? 0.85 : this.activity === 'walk' ? 2.4 : 1.5;
    const breathAmp = this.activity === 'sleep' ? 0.024 : 0.013;
    this.breathValue = Math.sin(this.breath) * breathAmp;
    this.breath += 0; // breath 由 update 累加

    this.tailSpeedTarget = tailSpeed;
    this.tailAmpTarget = tailAmp;
    this.breathSpeed = breathSpeed;
    this.breathAmpValue = breathAmp;
  }

  // ---------- 弹簧积分 ----------
  step(dt) {
    const keys = Object.keys(this.tgt);
    for (const key of keys) {
      const target = this.tgt[key];
      if (target === undefined) continue;
      const accel = (target - this.cur[key]) * K - this.vel[key] * D;
      this.vel[key] += accel * dt;
      this.cur[key] += this.vel[key] * dt;
    }
  }

  update(dt, elapsed) {
    this.time = elapsed;

    // 情绪计时
    if (this.moodDuration > 0) {
      this.moodTimer += dt;
      if (this.moodTimer >= this.moodDuration) {
        this.moodDuration = 0;
        this.setMood(this.dragging ? 'drag' : 'idle');
      }
    }

    // 活动计时
    if (this.activityDuration > 0) {
      this.activityTime += dt;
      if (this.activityTime >= this.activityDuration) {
        this.activity = 'idle';
        this.activityTime = 0;
        this.activityDuration = 0;
        this.setExpression(this.mood === 'sleepy' ? 'sleepy' : 'normal');
        this.setMouth('soft');
      }
    }

    // 视线惯性
    this.lookSmooth.x = damp(this.lookSmooth.x, this.look.x * 0.42, 5, dt);
    this.lookSmooth.y = damp(this.lookSmooth.y, this.look.y * 0.26, 5, dt);

    // 张望目标漂移
    this.gazeTimer -= dt;
    if (this.gazeTimer <= 0) {
      this.gazeTimer = 1.6 + Math.random() * 3.2;
      this.gazeTarget.set((Math.random() * 2 - 1) * 0.8, (Math.random() * 2 - 1) * 0.5);
    }
    this.gazeBias.x = damp(this.gazeBias.x, this.gazeTarget.x, 2.4, dt);
    this.gazeBias.y = damp(this.gazeBias.y, this.gazeTarget.y, 2.4, dt);

    this.computeTargets(elapsed, dt);
    this.breath += dt * (this.breathSpeed || 1.6);
    this.step(dt);
    this.applyTransforms(dt, elapsed);
    this.updateBlink(dt);
    this.updateTailSecondary(dt, elapsed);
    this.updateJump(dt);

    if (this.reaction) {
      this.reactionTime += dt;
      if (this.reactionTime > 1.6) this.reaction = null;
    }
  }

  applyTransforms(dt, elapsed) {
    const c = this.cur;
    this.root.position.y = this.baseRootY + c.rootY + this.jumpOffset;
    const targetX = this.walkX !== undefined ? this.walkX : this.baseRootX + c.rootX;
    this.root.position.x = damp(this.root.position.x, targetX, 5, dt);
    this.root.rotation.z = c.leanZ;
    this.root.rotation.x = c.leanX;

    const head = this.parts.headPivot;
    head.rotation.x = c.headX;
    head.rotation.y = c.headY;
    head.rotation.z = c.headZ;

    const { left, right } = this.parts.arms;
    left.rotation.z = c.armLZ;
    right.rotation.z = c.armRZ;
    left.rotation.x = c.armLX;
    right.rotation.x = c.armRX;

    const joints = this.parts.legJoints;
    if (joints) {
      joints.left.rotation.x = c.legLX;
      joints.right.rotation.x = c.legRX;
    }

    const ears = this.parts.ears;
    ears.left.rotation.x = c.earLX;
    ears.right.rotation.x = c.earRX;
    ears.left.rotation.z = c.earLZ;
    ears.right.rotation.z = c.earRZ;

    // 呼吸：胸腔与裙摆轻微缩放
    const bv = (this.breathValue || 0);
    const torsoScaleY = 1 + Math.sin(this.breath) * (this.breathAmpValue || 0.013);
    this.parts.torso.scale.set(1 + (torsoScaleY - 1) * 0.35, torsoScaleY, 1 + (torsoScaleY - 1) * 0.35);
    this.parts.skirt.scale.set(1 + (torsoScaleY - 1) * 0.4, 1, 1 + (torsoScaleY - 1) * 0.4);
    if (this.parts.apron) {
      this.parts.apron.scale.set(1 + (torsoScaleY - 1) * 0.4, 1, 1 + (torsoScaleY - 1) * 0.4);
    }

    // 头发随头部运动轻微滞后（通过 headPivot 与根节点的差实现）
    if (this.parts.hair) {
      this.parts.hair.rotation.z = damp(this.parts.hair.rotation.z, c.headZ * 0.4 - c.leanZ * 0.6, 5, dt);
      this.parts.hair.rotation.x = damp(this.parts.hair.rotation.x, -c.headX * 0.25, 5, dt);
    }
    if (this.parts.beret) {
      this.parts.beret.rotation.z = damp(this.parts.beret.rotation.z, c.headZ * 0.6 - c.leanZ * 0.4, 5, dt);
    }

    // ---------- 微动作层 ----------
    // 静止时也保持重心转移 / 头部微漂 / 手臂微摆，避免动作之间变成“雕像”，
    // 各通道使用互质频率与不同相位，防止头身四肢同步导致的机械感。
    const t = this.time;
    const idle = this.activity === 'idle' && this.mood === 'idle' ? 1 : 0.3;
    this.root.position.x += Math.sin(t * 0.61) * 0.014 * idle + Math.sin(t * 1.33 + 1.1) * 0.005;
    this.root.rotation.z += Math.sin(t * 0.61 + 0.6) * 0.011 * idle;
    head.rotation.z += Math.sin(t * 0.51 + 0.9) * 0.013 * idle;
    head.rotation.x += Math.sin(t * 0.83 + 2.1) * 0.009 * idle;
    head.rotation.y += Math.sin(t * 0.37 + 0.4) * 0.017 * idle;
    left.rotation.z += Math.sin(t * 1.27 + 0.5) * 0.019 * idle;
    right.rotation.z -= Math.sin(t * 1.27 + 0.9) * 0.019 * idle;
    ears.left.rotation.z += Math.sin(t * 1.93) * 0.011;
    ears.right.rotation.z -= Math.sin(t * 1.93 + 0.7) * 0.011;
  }

  updateBlink(dt) {
    const canBlink = this.activity !== 'sleep' && this.mood !== 'sleep';
    if (!canBlink) return;
    if (this.expression === 'happy' || this.expression === 'closed') {
      // 闭眼表情期间不重复触发
      if (this.blinkPhase === 0) {
        this.blinkCountdown = Math.max(this.blinkCountdown, 0.4);
        return;
      }
    }

    this.blinkCountdown -= dt;
    if (this.blinkCountdown <= 0 && this.blinkPhase === 0) {
      this.blinkPhase = 0.0001;
      this.setExpression('closed');
    }

    if (this.blinkPhase > 0) {
      this.blinkPhase += dt;
      if (this.blinkPhase >= this.blinkDuration) {
        this.blinkPhase = 0;
        this.setExpression(this.mood === 'sleepy' ? 'sleepy' : 'normal');
        this.doubleBlink = Math.random() < 0.15;
        this.blinkCountdown = this.doubleBlink ? 0.2 : 2.0 + Math.random() * 3.4;
      }
    }
  }

  updateTailSecondary(dt, elapsed) {
    const base = this.parts.tail;
    const mid = this.parts.tailMid;
    const tip = this.parts.tailTip;
    if (!base) return;

    this.tailSpeed = damp(this.tailSpeed, this.tailSpeedTarget || 1.4, 4, dt);
    this.tailAmp = damp(this.tailAmp, this.tailAmpTarget || 0.3, 4, dt);
    this.tailAngle += dt * this.tailSpeed;

    const a = this.tailAmp;
    const ph = this.tailAngle;

    base.rotation.y = Math.sin(ph) * a;
    base.rotation.x = -0.10 + Math.cos(ph * 0.8) * a * 0.22;
    base.rotation.z = Math.sin(ph * 0.6) * a * 0.18;

    if (mid) {
      mid.rotation.y = Math.sin(ph - 0.55) * a * 0.8;
      mid.rotation.x = Math.cos(ph * 0.8 - 0.4) * a * 0.2;
    }
    if (tip) {
      tip.rotation.y = Math.sin(ph - 1.15) * a * 0.65;
      tip.rotation.x = Math.cos(ph * 0.9 - 0.9) * a * 0.26;
    }
  }

  updateJump(dt) {
    if (this.jumpVelocity !== 0 || this.jumpOffset !== 0) {
      this.jumpVelocity -= 9.2 * dt;
      this.jumpOffset += this.jumpVelocity * dt;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.jumpVelocity = 0;
      }
    }
  }
}
