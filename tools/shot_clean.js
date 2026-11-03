'use strict';

/** 隐藏 UI 层后的纯净角色截图，用于测量角色在窗口内的真实占比。 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 640,
    height: 880,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((r) => setTimeout(r, 1600));

  await win.webContents.executeJavaScript(`
    (() => {
      const b = document.getElementById('bubble');
      const a = document.getElementById('affection');
      if (b) b.style.display = 'none';
      if (a) a.style.display = 'none';
      const pet = window.__umaPet;
      if (pet && pet.scene) {
        pet.scene.traverse((o) => {
          if (o.userData && o.userData.shadow) o.visible = false;
          if (o.name && String(o.name).toLowerCase().includes('shadow')) o.visible = false;
        });
      }
      return 'ok';
    })()
  `);

  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage();
  const outDir = path.join(__dirname, 'shots');
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'clean.png');
  fs.writeFileSync(file, img.toPNG());
  console.log('saved ' + file);
  app.exit(0);
});
