// 转身中途擦除态截图（检查闭眼贴片在过渡带是否出现双影/半遮）
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, 'shots_blink');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  { name: 'w-front-020-050', yaw: 10, wipe: 0.5 },
  { name: 'w-045-090-050', yaw: 68, wipe: 0.5 },
  { name: 'w-090-135-050', yaw: 112, wipe: 0.5 },
  { name: 'w-180-225-050', yaw: 202, wipe: 0.5 }
];

app.whenReady().then(async () => {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    width: 640, height: 696, x: workArea.x + 20, y: workArea.y + 20,
    transparent: true, frame: false, hasShadow: false, resizable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
    }
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  win.showInactive();
  await delay(900);
  await win.webContents.executeJavaScript("document.body.style.background='#f2ecff';true;");
  await delay(5400);
  for (const c of CASES) {
    await win.webContents.executeJavaScript(`
      (() => {
        const a = window.__umaPet.animator;
        if (window.__umaPet.behavior) window.__umaPet.behavior.setPaused(true);
        a.setMood('idle'); a.play('idle', 0);
        a.fixedYaw = ${c.yaw};
        a.freezePose = true; a.noBlink = true; a.debugClose = 1;
        a.debugWipe = ${c.wipe};
        return true;
      })()
    `);
    await delay(650);
    const st = await win.webContents.executeJavaScript(`
      (() => { const a = window.__umaPet.animator;
        return { degA: a._degA, degB: a._degB, p: Number(a._p.toFixed(3)), maskOff: Number(a.primary.material.alphaMap.offset.x.toFixed(3)) };
      })()
    `);
    console.log(c.name, JSON.stringify(st));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, c.name + '.png'), img.toPNG());
  }
  app.exit(0);
});
