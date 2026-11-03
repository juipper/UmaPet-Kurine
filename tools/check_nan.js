'use strict';

/**
 * 排查 NaN 顶点：遍历场景所有几何体，找出 position 属性含 NaN 的网格。
 * 运行： npx electron tools/check_nan.js
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 640,
    height: 880,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const report = await win.webContents.executeJavaScript(`
    (() => {
      const out = [];
      const root = window.__umaPet && window.__umaPet.character && window.__umaPet.character.root;
      if (!root) return ['NO_ROOT'];
      root.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry) return;
        const pos = obj.geometry.getAttribute('position');
        if (!pos) return;
        const arr = pos.array;
        let bad = 0;
        for (let i = 0; i < arr.length; i += 1) {
          if (!Number.isFinite(arr[i])) bad += 1;
        }
        if (bad > 0) {
          const chain = [];
          let n = obj;
          while (n && n !== root.parent) {
            chain.push(n.name || n.type);
            n = n.parent;
          }
          out.push(chain.join(' < ') + ' | geo=' + obj.geometry.type + ' | nan=' + bad + '/' + arr.length + ' | mat=' + (obj.material && obj.material.type));
        }
      });
      return out;
    })()
  `);

  console.log('NaN report count:', report.length);
  for (const line of report) console.log(line);

  app.exit(0);
});
