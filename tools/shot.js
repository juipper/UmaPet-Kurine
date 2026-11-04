'use strict';

/**
 * 开发期截图脚本：渲染角色并截取多种情绪的预览图，用于检查外观。
 * 运行： npx electron tools/shot.js
 */

const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const STATES = [
  { name: '01-idle', mood: 'idle', wait: 900 },
  { name: '02-happy', mood: 'happy', wait: 300 },
  { name: '03-shy', mood: 'shy', wait: 800 },
  { name: '04-sleep', mood: 'sleep', wait: 900 },
  { name: '05-look', mood: 'idle', wait: 600, look: [0.9, 0.2] },
  { name: '06-walk', mood: 'idle', wait: 900, action: 'walk' },
  { name: '07-stretch', mood: 'idle', wait: 900, action: 'stretch' },
  { name: '08-sit', mood: 'idle', wait: 1200, action: 'sit' },
  { name: '09-back-tail', mood: 'idle', wait: 900, yaw: 180 },
  { name: '10-side', mood: 'idle', wait: 900, yaw: 90 },
  { name: '13-q45', mood: 'idle', wait: 900, yaw: 45 },
  { name: '14-q135', mood: 'idle', wait: 900, yaw: 135 },
  { name: '15-blink', mood: 'idle', wait: 70, forceBlink: true },
  { name: '16-blush', mood: 'shy', wait: 1200 },
  { name: '20-still', mood: 'idle', wait: 900, still: true, yaw: 0, noBlink: true },
  { name: '21-still-blink', mood: 'idle', wait: 30, still: true, yaw: 0, forceBlink: true },
  { name: '22-still-sleep', mood: 'sleep', wait: 1200, still: true, yaw: 0 },
  { name: '23-still-blush', mood: 'shy', wait: 1500, still: true, yaw: 0, noBlink: true },
  // 转身过渡：强制 50% 擦除，检查是否还有双影（应只有一条窄过渡带，不是两个整人）
  { name: '30-wipe50', mood: 'idle', wait: 700, still: true, yaw: 68, wipe: 0.5, noBlink: true },
  { name: '31-wipe50-side', mood: 'idle', wait: 700, still: true, yaw: 112, wipe: 0.5, noBlink: true },
  // 侧身眨眼：90° 应该用侧脸眼的贴片闭合，而不是正面眼
  // 注意：不能写死 wipe:0。yaw 落在两帧之间时会以 B 帧为主（例如 -90 对应 225→270 段），
  // 强行 wipe:0 会把画面停在上一帧（225 无眼），拍出来像“侧身不眨眼”。
  // 这里交给 applyFacing 的自然吸附（yawVel≈0 时吸附到最近整帧）。
  { name: '32-side-blink', mood: 'idle', wait: 200, still: true, yaw: 90, close: 1 },
  { name: '33-side270-blink', mood: 'idle', wait: 200, still: true, yaw: -90, close: 1 },
  { name: '34-back-blink', mood: 'idle', wait: 200, still: true, yaw: 180, close: 1 },
  { name: '35-q45-blink', mood: 'idle', wait: 200, still: true, yaw: 45, close: 1 },
  { name: '36-q135-blink', mood: 'idle', wait: 200, still: true, yaw: 135, close: 1 },
  { name: '37-front-blink', mood: 'idle', wait: 200, still: true, yaw: 0, close: 1 },
  // 新增动作：伸懒腰 / 打哈欠 / 歪头 / 欢呼
  // actionDur 必须等于动作的真实时长，wait 取动作中段（u = wait / actionDur），
  // 否则默认 30s 时长会让 u 停在 0.03~0.05，截到的只是动作起始的待机姿势。
  // 关键帧峰值/保持区间：stretch u≈0.50~0.62（sy 1.12 / lx -0.20，实测 wait 1300 → u 0.54）、
  // yawn u≈0.34~0.68（闭眼保持 + 仰头）、tilt u≈0.20~0.66（lz 0.16）、
  // cheer 第一次弹跳峰值 u≈0.43（弹簧过冲点，wait 520 实测 bob 0.096 / sy 1.045）。
  { name: '40-stretch-mid', mood: 'idle', wait: 1300, action: 'stretch', actionDur: 2.4, noBlink: true },
  { name: '41-yawn-mid', mood: 'idle', wait: 1300, action: 'yawn', actionDur: 2.6, noBlink: false },
  { name: '42-tilt', mood: 'idle', wait: 1100, action: 'tilt', actionDur: 1.8, noBlink: true },
  { name: '43-cheer', mood: 'idle', wait: 520, action: 'cheer', actionDur: 1.2, noBlink: true }
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.whenReady().then(async () => {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    width: 640,
    height: 696,
    x: workArea.x + 20,
    y: workArea.y + 20,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');

  win.webContents.on('console-message', (event, level, message) => {
    console.log(`[renderer:${level}] ${message}`);
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  win.showInactive();
  await delay(900);

  // 加浅色渐变背景，方便观察透明边缘与描边
  await win.webContents.executeJavaScript(`
    document.body.style.background = 'radial-gradient(circle at 50% 42%, #f6f1ff 0%, #ded4f0 55%, #c9bfe0 100%)';
    document.documentElement.style.background = 'transparent';
    true;
  `);

  const ready = await win.webContents.executeJavaScript(
    'Boolean(window.__umaPet && window.__umaPet.animator)'
  );
  if (!ready) {
    console.error('renderer 未就绪：window.__umaPet 不存在');
    app.exit(1);
    return;
  }

  await delay(600);

  // app.js 在启动 2.2s 后会播放一次开机问候（白天 wave / 夜间 yawn，时长 2.0~2.6s）。
  // 这段定时器不受 behavior.setPaused 控制，若不留足时间，前几张图会被它覆盖，
  // 拍出来的是 greeting 动作而不是目标状态。这里等问候彻底结束再开始逐状态截图。
  await delay(4200);

  for (const state of STATES) {
    await win.webContents.executeJavaScript(`
      (() => {
        const a = window.__umaPet.animator;
        const b = window.__umaPet.behavior;
        if (b) b.setPaused(true);
        a.setMood(${JSON.stringify(state.mood)});
        ${state.look ? `a.setLook(${state.look[0]}, ${state.look[1]});` : ''}
        ${state.action ? `a.play(${JSON.stringify(state.action)}, ${state.actionDur || 30});` : "a.play('idle', 0);"}
        a.walkX = undefined;
        a.fixedYaw = ${state.yaw === undefined ? 'null' : state.yaw};
        a.debugWipe = ${state.wipe === undefined ? 'null' : state.wipe};
        a.freezePose = ${state.still ? 'true' : 'false'};
        ${state.forceBlink ? 'a.blinkTimer = 0; a.blinkPhase = 0.42;' : ''}
        ${state.noBlink ? 'a.blinkTimer = 999; a.blinkPhase = 0; a.noBlink = true;' : 'a.noBlink = false;'}
        a.debugClose = ${state.close === undefined ? 'null' : state.close};
        ${state.action === 'yawn' ? "a.debugClose = null;" : ''}
        return true;
      })()
    `);
    await delay(state.wait);
    const image = await win.webContents.capturePage();
    const file = path.join(OUT_DIR, `${state.name}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log('saved', file);
  }

  // ---- 真实转身连拍：检查擦除过程中是否还有"两个完整人影"叠加 ----
  await win.webContents.executeJavaScript(`
    (() => {
      const a = window.__umaPet.animator;
      a.fixedYaw = null;
      a.debugWipe = null;
      a.debugClose = null;
      a.freezePose = false;
      a.noBlink = true;
      a.yaw = 0;
      a.yawVel = 0;
      a.setMood(null);
      a.play('idle', 0);
      a.setLook(6.0, 0);
      return true;
    })()
  `);
  for (let i = 0; i < 10; i += 1) {
    await delay(70);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT_DIR, `50-turn-${String(i).padStart(2, '0')}.png`), img.toPNG());
  }
  console.log('saved turn burst');

  // ---- 反向转身连拍 ----
  await win.webContents.executeJavaScript(`
    (() => {
      const a = window.__umaPet.animator;
      a.setLook(-6.0, 0);
      return true;
    })()
  `);
  for (let i = 0; i < 10; i += 1) {
    await delay(70);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT_DIR, `51-back-${String(i).padStart(2, '0')}.png`), img.toPNG());
  }
  console.log('saved reverse turn burst');

  // 额外截一张纯透明背景，检查 alpha
  await win.webContents.executeJavaScript(`
    document.body.style.background = 'transparent';
    (() => {
      const a = window.__umaPet.animator;
      a.fixedYaw = null;
      a.setLook(0, 0);
      a.setMood(null);
      a.play('idle', 0);
    })();
    true;
  `);
  await delay(700);
  const alphaShot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT_DIR, '11-alpha.png'), alphaShot.toPNG());

  // 气泡与好感度界面截图
  await win.webContents.executeJavaScript(`
    document.body.style.background = 'radial-gradient(circle at 50% 42%, #f6f1ff 0%, #ded4f0 55%, #c9bfe0 100%)';
    const b = document.getElementById('bubble');
    b.textContent = '训练员，今天也一起加油吧！';
    b.classList.add('show');
    const a = document.getElementById('affection');
    a.classList.add('show');
    document.getElementById('affLevel').textContent = '亲近';
    document.getElementById('affFill').style.width = '62%';
    true;
  `);
  await delay(500);
  const uiShot = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT_DIR, '12-ui.png'), uiShot.toPNG());
  console.log('saved ui');

  app.exit(0);
});
