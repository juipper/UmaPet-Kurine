// 仅截图"逐朝向闭眼"用例，用于验证闭眼是否完全遮住睁眼、有无双影/错位
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'shots_blink');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const STATES = [
  { name: 'o00-front', yaw: 0, close: 0 },
  { name: 'o45-q45', yaw: 45, close: 0 },
  { name: 'o90-side', yaw: 90, close: 0 },
  { name: 'o135-q135', yaw: 135, close: 0 },
  { name: 'o180-back', yaw: 180, close: 0 },
  { name: 'o270-side', yaw: -90, close: 0 },
  { name: 'b00-front', yaw: 0 },
  { name: 'b45-q45', yaw: 45 },
  { name: 'b90-side', yaw: 90 },
  { name: 'b135-q135', yaw: 135 },
  { name: 'b180-back', yaw: 180 },
  { name: 'b270-side', yaw: -90 }
];

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  win.showInactive();
  await delay(900);
  await win.webContents.executeJavaScript(`
    document.body.style.background = 'radial-gradient(circle at 50% 42%, #f6f1ff 0%, #ded4f0 55%, #c9bfe0 100%)';
    true;
  `);

  const ready = await win.webContents.executeJavaScript(
    'Boolean(window.__umaPet && window.__umaPet.animator)'
  );
  if (!ready) {
    console.error('renderer 未就绪');
    app.exit(1);
    return;
  }
  await delay(600);
  await delay(4200);

  for (const s of STATES) {
    await win.webContents.executeJavaScript(`
      (() => {
        const a = window.__umaPet.animator;
        const b = window.__umaPet.behavior;
        if (b) b.setPaused(true);
        a.setMood('idle');
        a.play('idle', 0);
        a.walkX = undefined;
        a.fixedYaw = ${s.yaw};
        a.debugWipe = null;
        a.freezePose = true;
        a.blinkTimer = 999;
        a.blinkPhase = 0;
        a.noBlink = true;
        a.debugClose = ${s.close === undefined ? 1 : s.close};
        return true;
      })()
    `);
    await delay(320);
    const img = await win.webContents.capturePage();
    const f = path.join(OUT_DIR, `${s.name}.png`);
    fs.writeFileSync(f, img.toPNG());
    console.log('saved', f);
  }

  console.log('done');
  app.exit(0);
});
