import * as THREE from 'three';

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * 自主行为调度器。
 * 桌宠不再靠固定计时器随机换表情，而是按「精力 / 无聊度 / 时段 / 鼠标位置」自己决定做什么。
 */
export class Behavior {
  constructor(animator, options = {}) {
    this.animator = animator;
    this.root = animator.root;

    this.bounds = options.bounds || { minX: -0.55, maxX: 0.55 };
    this.onSpeak = options.onSpeak || (() => {});
    this.onWalk = options.onWalk || (() => {});

    this.paused = false;
    this.night = false;

    this.decisionTimer = rand(2.5, 5.0);
    this.current = 'idle';
    this.currentTime = 0;
    this.currentDuration = 0;

    this.energy = 1.0;         // 精力：活动消耗，休息恢复
    this.boredom = 0.0;        // 无聊度：无人交互时累加，驱动主动行为
    this.idleSince = 0;        // 距上次交互的秒数

    this.mouse = new THREE.Vector2(0, 0);
    this.mouseActive = false;
    this.mouseIdleTimer = 0;

    this.walkTarget = 0;
    this.walkSpeed = 0.75;
    this.queue = [];

    // 长时间挂机计时（秒）
    this.totalTime = 0;
    this.lastSpeak = -100;
  }

  setNight(isNight) {
    this.night = !!isNight;
  }

  setPaused(paused) {
    this.paused = !!paused;
    if (paused) this.stopActivity();
  }

  notifyInteraction() {
    this.idleSince = 0;
    this.boredom = 0;
    this.decisionTimer = Math.max(this.decisionTimer, 3.0);
  }

  setMouse(nx, ny, active = true) {
    this.mouse.set(nx, ny);
    if (active) {
      this.mouseActive = true;
      this.mouseIdleTimer = 0;
    }
  }

  stopActivity() {
    this.current = 'idle';
    this.currentTime = 0;
    this.currentDuration = 0;
    this.animator.play('idle');
    this.animator.walkX = undefined;
  }

  startActivity(name, duration, options = {}) {
    this.current = name;
    this.currentTime = 0;
    this.currentDuration = duration;
    this.animator.play(name === 'wander' ? 'walk' : name, duration, options);

    switch (name) {
      case 'wander': {
        const span = this.bounds.maxX - this.bounds.minX;
        let target = this.bounds.minX + Math.random() * span;
        if (Math.abs(target - this.animator.root.position.x) < 0.18) {
          target = target > 0 ? this.bounds.minX : this.bounds.maxX;
        }
        this.walkTarget = clamp(target, this.bounds.minX, this.bounds.maxX);
        this.animator.walkX = this.walkTarget;
        this.animator.play('walk', duration, { speed: rand(6.4, 8.4) });
        break;
      }
      case 'peek': {
        const target = this.animator.root.position.x >= 0 ? this.bounds.minX : this.bounds.maxX;
        this.walkTarget = target;
        this.animator.walkX = target;
        this.animator.play('walk', duration, { speed: 7.0 });
        break;
      }
      case 'sit':
        this.animator.walkX = undefined;
        this.queue = [];
        break;
      case 'sleep':
        this.onSpeak('sleep');
        break;
      default:
        break;
    }
  }

  /** 主更新。 */
  update(dt, elapsed) {
    this.totalTime += dt;
    if (this.paused) return;

    this.idleSince += dt;
    this.boredom = clamp(this.boredom + dt / 90, 0, 1);
    this.mouseIdleTimer += dt;
    if (this.mouseIdleTimer > 3) this.mouseActive = false;

    // 精力消耗与恢复
    const s = this.current;
    if (s === 'walk' || s === 'wander' || s === 'peek') this.energy = clamp(this.energy - dt * 0.018, 0, 1);
    else if (s === 'sleep') this.energy = clamp(this.energy + dt * 0.05, 0, 1);
    else if (s === 'sit' || s === 'idle') this.energy = clamp(this.energy + dt * 0.012, 0, 1);
    else this.energy = clamp(this.energy - dt * 0.006, 0, 1);

    // 鼠标离开后自动归位
    if (this.current === 'walk' && this.animator.walkX !== undefined) {
      const dist = this.animator.root.position.x - this.animator.walkX;
      if (Math.abs(dist) < 0.05) {
        this.currentTime += dt;
        if (this.currentTime > 0.3) this.finishActivity();
        return;
      }
    }

    // 当前动作计时
    if (this.current !== 'idle') {
      this.currentTime += dt;
      if (this.currentDuration > 0 && this.currentTime >= this.currentDuration) {
        this.finishActivity();
        return;
      }
    }

    this.decisionTimer -= dt;
    if (this.decisionTimer > 0) return;

    // 决策间隔：无聊度越高越想搞事
    this.decisionTimer = rand(2.0, 4.6) * (1 - this.boredom * 0.5);
    if (this.current !== 'idle') return;
    this.decide();

    // 长时间挂机的自言自语
    if (elapsed - this.lastSpeak > 42 + Math.random() * 45) {
      this.lastSpeak = elapsed;
      if (this.current !== 'sleep' && Math.random() < 0.6) this.onSpeak('idle');
    }
  }

  finishActivity() {
    const prev = this.current;
    if (prev === 'wander' || prev === 'peek' || prev === 'walk') {
      this.animator.walkX = undefined;
    }
    this.current = 'idle';
    this.currentTime = 0;
    this.currentDuration = 0;
    this.animator.play('idle', 0);
    this.decisionTimer = Math.min(this.decisionTimer, rand(0.5, 1.6));
  }

  decide() {
    const roll = Math.random();
    const tired = this.energy < 0.35;
    const veryTired = this.energy < 0.16;
    const nightSleepy = this.night && this.energy < 0.7;

    // 极度疲惫 / 深夜：睡
    if (veryTired || (nightSleepy && roll < 0.5)) {
      this.startActivity('sleep', rand(25, 55));
      return;
    }

    // 鼠标在附近：主动凑过去，或看过去打招呼
    if (this.mouseActive && this.mouse.length() > 0.12 && roll < 0.34) {
      const side = this.mouse.x >= 0 ? 1 : -1;
      if (Math.random() < 0.45) {
        this.startActivity('wander', rand(2.2, 3.4));
        this.animator.walkX = clamp(side * (0.28 + Math.random() * 0.22), this.bounds.minX, this.bounds.maxX);
        return;
      }
    }
    if (this.mouseActive && this.mouse.length() > 0.2 && roll < 0.46) {
      this.animator.look.set(this.mouse.x * 1.4, this.mouse.y * 1.4);
      if (Math.random() < 0.5) {
        this.startActivity('wave', 1.8);
        this.onSpeak('greeting');
      } else {
        this.startActivity('look', 2.0);
      }
      return;
    }

    // 无聊度高：主动搞事
    const boredBoost = this.boredom > 0.55;
    const table = [
      { name: 'wander', w: boredBoost ? 30 : 16, dur: [3.0, 5.5] },
      { name: 'lookAround', w: 18, dur: [2.8, 4.2] },
      { name: 'stretch', w: 12, dur: [2.2, 2.8] },
      { name: 'groom', w: 10, dur: [2.0, 2.6] },
      { name: 'hop', w: 8, dur: [0.8, 1.2] },
      { name: 'giggle', w: 8, dur: [1.2, 1.8] },
      { name: 'shy', w: 6, dur: [1.4, 2.0] },
      { name: 'sit', w: tired || boredBoost ? 18 : 8, dur: [6.0, 14.0] },
      { name: 'nod', w: 5, dur: [0.8, 1.2] },
      { name: 'peek', w: boredBoost ? 8 : 3, dur: [2.5, 3.5] },
      { name: 'wave', w: 5, dur: [1.6, 2.2] },
      { name: 'doze', w: tired ? 12 : 3, dur: [4.0, 7.0] }
    ];

    let total = 0;
    for (const item of table) total += item.w;
    let r = roll * total;
    let chosen = table[0];
    for (const item of table) {
      r -= item.w;
      if (r <= 0) {
        chosen = item;
        break;
      }
    }

    const duration = rand(chosen.dur[0], chosen.dur[1]);
    this.startActivity(chosen.name, duration);

    if (chosen.name === 'stretch' && Math.random() < 0.35) this.onSpeak('idle');
    if (chosen.name === 'giggle' && Math.random() < 0.3) this.onSpeak('idle');
    if (chosen.name === 'sit' && Math.random() < 0.25) this.onSpeak('sit');
  }
}
