'use strict';

/**
 * 开发期诊断脚本：导出角色贴图与部件包围盒，用于定位渲染问题。
 * 运行： npx electron tools/diag.js
 */

const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'diag');
fs.mkdirSync(OUT_DIR, { recursive: true });

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.whenReady().then(async () => {
  const { workArea } = screen.getPrimaryDisplay();
  const win = new BrowserWindow({
    width: 460,
    height: 700,
    x: workArea.x + 20,
    y: workArea.y + 20,
    transparent: true,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'src', 'main', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  win.webContents.on('console-message', (e, level, message) => {
    console.log(`[renderer:${level}] ${message}`);
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  win.showInactive();
  await delay(1200);

  const ready = await win.webContents.executeJavaScript('Boolean(window.__umaPet)');
  if (!ready) {
    console.error('renderer 未就绪');
    app.exit(1);
    return;
  }

  // 导出所有贴图
  const texDump = await win.webContents.executeJavaScript(`
    (() => {
      const c = window.__umaPet.character;
      const out = {};
      const grab = (tex, name) => {
        if (!tex || !tex.image) return;
        try { out[name] = tex.image.toDataURL('image/png'); } catch (err) { out[name] = 'ERR:' + err.message; }
      };
      const t = c.textures || {};
      for (const k of Object.keys(t.eyes || {})) grab(t.eyes[k], 'eyes_' + k);
      for (const k of Object.keys(t.mouths || {})) grab(t.mouths[k], 'mouths_' + k);
      grab(t.blush, 'blush');
      return out;
    })()
  `);

  for (const [name, dataUrl] of Object.entries(texDump)) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
      console.log('tex skip', name, String(dataUrl).slice(0, 40));
      continue;
    }
    const b64 = dataUrl.split(',')[1];
    fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), Buffer.from(b64, 'base64'));
    console.log('tex saved', name);
  }

  // 导出部件世界包围盒
  const info = await win.webContents.executeJavaScript(`
    (() => {
      const root = window.__umaPet.character.root;
      root.updateWorldMatrix(true, true);
      const rows = [];
      root.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone();
        b.applyMatrix4(o.matrixWorld);
        const mat = o.material;
        let col = '';
        if (mat && mat.color) col = '#' + mat.color.getHexString();
        rows.push({
          name: o.name || o.type,
          type: mat ? mat.type : '',
          color: col,
          transparent: mat ? !!mat.transparent : false,
          renderOrder: o.renderOrder,
          min: [+b.min.x.toFixed(2), +b.min.y.toFixed(2), +b.min.z.toFixed(2)],
          max: [+b.max.x.toFixed(2), +b.max.y.toFixed(2), +b.max.z.toFixed(2)]
        });
      });
      return rows;
    })()
  `);

  fs.writeFileSync(path.join(OUT_DIR, 'parts.json'), JSON.stringify(info, null, 2));
  console.log('parts', info.length);

  // 相机取景参数
  const cam = await win.webContents.executeJavaScript(`
    (() => {
      const c = window.__umaPet.camera;
      return { pos: [c.position.x, c.position.y, c.position.z], fov: c.fov, aspect: c.aspect };
    })()
  `);
  console.log('camera', JSON.stringify(cam));

  app.exit(0);
});
