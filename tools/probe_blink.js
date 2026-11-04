// 探针：输出当前朝向对应的 degA/degB/p 以及眼贴片实际绑定的贴图，用于定位"闭眼贴片未渲染"
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'shots_blink');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const YAWS = [0, 20, 45, 68, 90, 135, 180, 225, 270, 315, -90];

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
  await win.webContents.executeJavaScript(
    `document.body.style.background = '#f2ecff'; true;`
  );
  const ready = await win.webContents.executeJavaScript(
    'Boolean(window.__umaPet && window.__umaPet.animator)'
  );
  if (!ready) {
    console.error('renderer not ready');
    app.exit(1);
    return;
  }
  await delay(600);
  await delay(4200);

  for (const yaw of YAWS) {
    const info = await win.webContents.executeJavaScript(`
      (() => {
        const a = window.__umaPet.animator;
        const b = window.__umaPet.behavior;
        if (b) b.setPaused(true);
        a.setMood('idle');
        a.play('idle', 0);
        a.walkX = undefined;
        a.fixedYaw = ${yaw};
        a.debugWipe = null;
        a.freezePose = true;
        a.noBlink = true;
        a.debugClose = 1;
        return true;
      })()
    `);
    await delay(700);
    const st = await win.webContents.executeJavaScript(`
      (() => {
        const a = window.__umaPet.animator;
        const eyes = (a.expression && a.expression.eyes) || [];
        const nm = (t) => {
          if (!t || !t.image || !t.image.src) return null;
          return String(t.image.src).split('/').pop();
        };
        return {
          yaw: a.yaw,
          degA: a._degA,
          degB: a._degB,
          p: Number(a._p && a._p.toFixed ? a._p.toFixed(3) : a._p),
          eye0: { vis: eyes[0] && eyes[0].visible, op: eyes[0] && Number(eyes[0].material.opacity.toFixed(2)), map: eyes[0] && nm(eyes[0].material.map), ro: eyes[0] && eyes[0].renderOrder },
          eye1: { vis: eyes[1] && eyes[1].visible, op: eyes[1] && Number(eyes[1].material.opacity.toFixed(2)), map: eyes[1] && nm(eyes[1].material.map) },
          body0: nm(a.primary && a.primary.material.map),
          body1: nm(a.secondary && a.secondary.material.map),
          maskOff: a.primary && Number(a.primary.material.alphaMap.offset.x.toFixed(3))
        };
      })()
    `);
    console.log(JSON.stringify(st));
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `p-${String(yaw).replace('-', 'm')}.png`), img.toPNG());
  }
  app.exit(0);
});
