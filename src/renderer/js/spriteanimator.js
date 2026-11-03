import * as THREE from 'three';
import { SPRITE_BODY_BOTTOM, SPRITE_BODY_TOP } from './spritechar.js';

const D2R = Math.PI / 180;

function damp(cur, target, lambda, dt) {
  return cur + (target - cur) * (1 - Math.exp(-lambda * dt));
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * 伪 3D 贴图动画器。
 *
 * 与 3D 版 Animator 保持完全一致的对外接口（play / setMood / setLook / setDragging /
 * setDragVelocity / react / update / look / walkX / isBusy），因此 behavior.js、ui、托盘
 * 逻辑无需任何改动。差异只在于：动画不再驱动骨骼，而是驱动「整体透视变换 + 朝向贴图切换」。
 */
export class SpriteAnimator {
  constructor(character) {
    this.character = character;
    this.root = character.root;
    this.pivot = character.pivot;
    this.primary = character.primary;
    this.secondary = character.secondary;
    this.textures = character.textures;
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

    this.jumpOffset = 0;
    this.jumpVel = 0;
    this.jumpActive = false;

    this.yaw = 0;
    this.fixedYaw = null; // 调试/截图用：锁定朝向
    this.blinkTimer = 2 + Math.random() * 2;
    this.blinkPhase = 0;
    this.blushVal = 0;
    this.freezePose = false; // 调试/截图用：锁定姿势，便于像素对比
    this.expression = character.expression || null;
    this.phase = Math.random() * 10;

    this._degA = 0;
    this._degB = 0;
    this._mixT = 0;
    this.applyFacing(0, 1);
  }

  // ---------- 兼容 3D 版接口 ----------

  isBusy() {
    return this.busy || this.activity !== 'idle';
  }

  play(activity, duration = null, options = {}) {
    const next = activity || 'idle';
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
    // 贴图方案下表情由运动表达，此处保留接口
  }

  setExpression() {}
  setMouth() {}
  triggerHappy() {
    this.reactTimer = Math.max(this.reactTimer, 0.5);
    this.reactPart = 'happy';
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
  }

  react(part) {
    this.reactTimer = 0.75;
    this.reactPart = part || 'body';
  }

  /** 朝向贴图切换：按角度在相邻两张之间交叉淡入。 */
  applyFacing(degAbs, mixTarget) {
    const list = this.degrees;
    let a = 0;
    let b = 0;
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
      this.primary.material.needsUpdate = true;
      this._degA = a;
    }
    if (b !== this._degB) {
      this.secondary.material.map = this.textures.get(b);
      this.secondary.material.needsUpdate = true;
      this._degB = b;
    }
    this._mixT = damp(this._mixT, clamp(t, 0, 0.92), 18, 1 / 60);
    this.primary.material.opacity = 1;
    this.secondary.material.opacity = this._mixT * 0.85;
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
    if (this.reactTimer > 0) this.reactTimer = Math.max(0, this.reactTimer - dt);

    this.lookSmooth.x = damp(this.lookSmooth.x, this.look.x, 6, dt);
    this.lookSmooth.y = damp(this.lookSmooth.y, this.look.y, 6, dt);
    this.dragVelSmooth.x = damp(this.dragVelSmooth.x, this.dragVel.x, 8, dt);
    this.dragVelSmooth.y = damp(this.dragVelSmooth.y, this.dragVel.y, 8, dt);

    let bob = 0; // 竖直位移
    let leanZ = 0; // 左右倾
    let leanX = 0; // 前后倾
    let scaleY = 1;
    let yawTarget = this.lookSmooth.x * 24;

    let speed = this.walkSpeed;

    switch (this.activity) {
      case 'walk':
      case 'peek': {
        const rate = speed * 0.5;
        bob = Math.abs(Math.sin(t * rate)) * 0.085;
        leanZ = Math.sin(t * rate) * 0.045;
        leanX = -0.035;
        scaleY = 1 + Math.sin(t * rate * 2) * 0.012;
        if (this.walkX !== undefined) {
          const dir = Math.sign(this.walkX - this.root.position.x) || 1;
          yawTarget = dir * 62;
        }
        break;
      }
      case 'sit':
        bob = -0.10;
        scaleY = 0.94;
        leanX = 0.02;
        yawTarget *= 0.6;
        break;
      case 'sleep':
        bob = -0.16 + Math.sin(t * 0.9) * 0.008;
        scaleY = 0.9 + Math.sin(t * 0.9) * 0.006;
        leanZ = Math.sin(t * 0.42) * 0.02;
        leanX = 0.05;
        yawTarget = 8 + Math.sin(t * 0.25) * 4;
        break;
      case 'doze':
        bob = -0.08 + Math.sin(t * 1.1) * 0.006;
        scaleY = 0.96;
        leanZ = Math.sin(t * 0.5) * 0.025;
        yawTarget = 5;
        break;
      case 'stretch': {
        const k = Math.sin(Math.min(1, this.activityTime / 0.9) * Math.PI);
        bob = 0.06 * k;
        scaleY = 1 + 0.06 * k;
        leanX = -0.05 * k;
        break;
      }
      case 'groom':
        leanZ = Math.sin(t * 4.2) * 0.03;
        yawTarget += 12 + Math.sin(t * 1.4) * 8;
        break;
      case 'hop':
        bob = Math.max(0, this.jumpOffset);
        break;
      case 'giggle':
        bob = Math.abs(Math.sin(t * 9)) * 0.045;
        leanZ = Math.sin(t * 6) * 0.05;
        scaleY = 1 + Math.sin(t * 9) * 0.01;
        break;
      case 'shy':
        bob = -0.04;
        scaleY = 0.98;
        yawTarget += 20;
        leanZ = Math.sin(t * 2.4) * 0.02;
        break;
      case 'nod':
        leanX = Math.sin(t * 8) * 0.055;
        break;
      case 'wave':
      case 'greet':
        leanZ = Math.sin(t * 7) * 0.055;
        yawTarget = 14 + Math.sin(t * 3) * 6;
        break;
      case 'look':
        yawTarget = this.lookSmooth.x * 34;
        leanZ = Math.sin(t * 1.6) * 0.014;
        break;
      case 'lookAround':
        yawTarget = Math.sin(t * 1.05) * 34;
        leanZ = Math.sin(t * 1.05) * 0.02;
        break;
      default: {
        // idle
        bob = Math.sin(t * 1.5) * 0.014;
        scaleY = 1 + Math.sin(t * 1.5 + 0.4) * 0.007;
        leanZ = Math.sin(t * 0.72) * 0.013;
        leanX = this.lookSmooth.y * -0.02;
        break;
      }
    }

    // 情绪叠加
    if (this.mood === 'shy') {
      yawTarget += 16;
      leanZ += Math.sin(t * 3.1) * 0.018;
    } else if (this.mood === 'happy') {
      bob += Math.abs(Math.sin(t * 6)) * 0.03;
    } else if (this.mood === 'sleepy') {
      bob -= 0.03;
      scaleY *= 0.985;
    } else if (this.mood === 'angry') {
      leanX += 0.02;
    }

    // 被点击后的部位反应
    if (this.reactTimer > 0) {
      const k = this.reactTimer / 0.75;
      switch (this.reactPart) {
        case 'ear':
        case 'hat':
        case 'hair':
          bob -= 0.03 * k;
          leanZ += Math.sin(t * 14) * 0.03 * k;
          yawTarget += 10 * k;
          break;
        case 'face':
          yawTarget += Math.sin(t * 16) * 14 * k;
          bob -= 0.02 * k;
          break;
        case 'torso':
          bob += 0.045 * k;
          scaleY *= 1 + 0.02 * k;
          break;
        case 'skirt':
          leanX -= 0.04 * k;
          leanZ += Math.sin(t * 18) * 0.035 * k;
          bob += Math.abs(Math.sin(t * 12)) * 0.02 * k;
          break;
        case 'tail':
          leanZ += Math.sin(t * 12) * 0.05 * k;
          yawTarget -= 14 * k;
          break;
        case 'leg':
          bob -= 0.05 * k;
          leanZ += Math.sin(t * 15) * 0.04 * k;
          break;
        default:
          bob += Math.abs(Math.sin(t * 10)) * 0.035 * k;
          leanZ += Math.sin(t * 8) * 0.025 * k;
          break;
      }
    }

    // 拖拽：随速度倾斜，营造重量感
    if (this.dragging) {
      leanZ += clamp(-this.dragVelSmooth.x * 0.00016, -0.16, 0.16);
      leanX += clamp(this.dragVelSmooth.y * 0.0001, -0.12, 0.12);
      bob += 0.05;
      yawTarget += clamp(this.dragVelSmooth.x * 0.02, -45, 45);
    }

    // 跳跃物理
    if (this.jumpActive) {
      this.jumpVel -= 16 * dt;
      this.jumpOffset += this.jumpVel * dt;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.jumpVel = 0;
        this.jumpActive = false;
      }
    }

    // 截图调试：锁定姿势
    if (this.freezePose) {
      bob = 0;
      leanZ = 0;
      leanX = 0;
      scaleY = 1;
    }

    // 朝向往目标平滑（-180..180）
    if (this.fixedYaw !== null && this.fixedYaw !== undefined) {
      this.yaw = this.fixedYaw;
    } else {
      this.yaw = damp(this.yaw, clamp(yawTarget, -180, 180), 5.5, dt);
    }

    // 应用整体变换
    this.root.position.y = this.baseRootY + bob + this.jumpOffset;
    this.root.rotation.z = 0;
    this.root.rotation.x = 0;

    const pivotScaleY = scaleY;
    const pivotScaleX = 1 - (pivotScaleY - 1) * 0.45;
    this.pivot.scale.set(pivotScaleX, pivotScaleY, 1);
    this.pivot.rotation.z = leanZ;
    this.pivot.rotation.x = leanX;
    // 贴图角度 + 透视旋转共同表现立体转身（旋转方向需与贴图侧脸方向一致）
    this.pivot.rotation.y = -THREE.MathUtils.degToRad(this.yaw) * 0.42;

    // 走动位移
    if (this.walkX !== undefined) {
      const targetX = this.walkX;
      this.root.position.x = damp(this.root.position.x, targetX, 3.6, dt);
      if (Math.abs(this.root.position.x - targetX) < 0.01) this.root.position.x = targetX;
    } else {
      this.root.position.x = damp(this.root.position.x, this.baseRootX, 2.6, dt);
    }

    // 朝向贴图：yaw 正值 = 角色朝屏幕右转，对应 deg_045 起的右向序列
    const degAbs = (((Math.round(this.yaw) % 360) + 360) % 360);
    this.applyFacing(degAbs, 1);

    this.updateExpression(dt);
  }

  /** 表情覆盖层：眨眼、闭眼、脸红；侧身后自动淡出。 */
  updateExpression(dt) {
    const expr = this.expression;
    if (!expr) return;

    const yawAbs = Math.abs(this.yaw);
    const faceVisible = clamp((86 - yawAbs) / 26, 0, 1);

    // 眨眼节奏
    if (this.blinkPhase > 0) {
      this.blinkPhase += dt / 0.17;
      if (this.blinkPhase >= 1) this.blinkPhase = 0;
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkTimer = 2.4 + Math.random() * 4.2;
        this.blinkPhase = 0.0001;
      }
    }
    let blinkClose = 0;
    if (this.blinkPhase > 0) {
      blinkClose = this.blinkPhase < 0.5 ? this.blinkPhase / 0.5 : (1 - this.blinkPhase) / 0.5;
    }

    // 睡眠 / 打瞌睡时持续闭眼
    let sleepClose = 0;
    if (this.activity === 'sleep' || this.activity === 'doze') sleepClose = 1;
    else if (this.mood === 'sleep' || this.mood === 'sleepy') sleepClose = 0.78;
    else if (this.reactTimer > 0 && this.reactPart === 'face') sleepClose = 0;

    const close = Math.max(blinkClose, sleepClose);
    const lidOpacity = faceVisible * (close > 0.02 ? 1 : 0);
    for (const lid of expr.lids) {
      if (lidOpacity < 0.02) {
        lid.visible = false;
        continue;
      }
      lid.visible = true;
      lid.material.opacity = lidOpacity;
      lid.scale.y = Math.max(0.02, close);
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
