"use strict";
/**
 * 真实鼠标事件链自测：经 Electron sendInputEvent 在角色各部位点击，
 * 校验渲染层是否把点击分派到正确部位。
 * 运行： npx electron tools/click_test.js
 */
const { app, BrowserWindow } = require('electron');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 280,
    height: 370,
    show: false,
    transparent: true,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  await sleep(1600);

  const coords = await win.webContents.executeJavaScript(`
    (() => {
      const pet = window.__umaPet;
      if (!pet) return { error: 'NO_PET' };
      const V = new (pet.camera.position.constructor)();
      const rect = pet.renderer.domElement.getBoundingClientRect();
      const want = ['face', 'ear', 'hair', 'hat', 'torso', 'skirt', 'leg', 'tail', 'arm'];
      const out = {};
      pet.character.root.updateWorldMatrix(true, true);
      pet.character.root.traverse((o) => {
        if (!o.isMesh || !o.geometry || o.raycast.length === 0) return;
        let n = o, part = null;
        while (n) { if (n.userData && n.userData.part) { part = n.userData.part; break; } n = n.parent; }
        if (!part || out[part] || want.indexOf(part) < 0) return;
        o.geometry.computeBoundingSphere();
        const c = o.geometry.boundingSphere.center.clone();
        o.localToWorld(c);
        V.copy(c).project(pet.camera);
        out[part] = {
          x: Math.round(((V.x + 1) / 2) * rect.width + rect.left),
          y: Math.round(((1 - V.y) / 2) * rect.height + rect.top),
          z: V.z
        };
      });
      return { coords: out, w: rect.width, h: rect.height };
    })()
  `);

  if (coords.error) {
    console.log(JSON.stringify(coords));
    app.exit(0);
    return;
  }

  const results = [];
  for (const [part, pt] of Object.entries(coords.coords)) {
    await win.webContents.executeJavaScript('window.__lastTap = null;');
    win.webContents.sendInputEvent({ type: 'mouseMove', x: pt.x, y: pt.y });
    await sleep(70);
    win.webContents.sendInputEvent({ type: 'mouseDown', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(60);
    win.webContents.sendInputEvent({ type: 'mouseUp', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await sleep(320);
    const got = await win.webContents.executeJavaScript('window.__lastTap');
    results.push({
      expect: part,
      at: pt.x + ',' + pt.y,
      got: got ? got.part : null,
      ok: got ? got.part === part : false
    });
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(JSON.stringify({ pass: pass + '/' + results.length, results }, null, 1));
  app.exit(0);
});
