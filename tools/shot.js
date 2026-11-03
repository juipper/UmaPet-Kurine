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
  { name: '23-still-blush', mood: 'shy', wait: 1500, still: true, yaw: 0, noBlink: true }
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

  for (const state of STATES) {
    await win.webContents.executeJavaScript(`
      (() => {
        const a = window.__umaPet.animator;
        const b = window.__umaPet.behavior;
        if (b) b.setPaused(true);
        a.setMood(${JSON.stringify(state.mood)});
        ${state.look ? `a.setLook(${state.look[0]}, ${state.look[1]});` : ''}
        ${state.action ? `a.play(${JSON.stringify(state.action)}, 30);` : "a.play('idle', 0);"}
        a.walkX = undefined;
        a.fixedYaw = ${state.yaw === undefined ? 'null' : state.yaw};
        a.freezePose = ${state.still ? 'true' : 'false'};
        ${state.forceBlink ? 'a.blinkTimer = 0; a.blinkPhase = 0.42;' : ''}
        ${state.noBlink ? 'a.blinkTimer = 999; a.blinkPhase = 0;' : ''}
        return true;
      })()
    `);
    await delay(state.wait);
    const image = await win.webContents.capturePage();
    const file = path.join(OUT_DIR, `${state.name}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log('saved', file);
  }

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
