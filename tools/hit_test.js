'use strict';

/**
 * 点击部位识别自测：把每个 body part 的可见网格投影到屏幕坐标，
 * 再走 renderer 内部 hitTest/raycastPart，统计命中率与误判。
 * 运行： npx electron tools/hit_test.js
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
  await new Promise((resolve) => setTimeout(resolve, 1400));

  const report = await win.webContents.executeJavaScript(`
    (() => {
      const pet = window.__umaPet;
      if (!pet || !pet.hitTest) return { error: 'NO_PET' };
      const THREE_V = new (pet.camera.position.constructor)();
      const root = pet.character.root;
      if (pet.refreshScreenBox) pet.refreshScreenBox();
      const rect = pet.renderer.domElement.getBoundingClientRect();

      // 按 part 收集网格的代表点（世界坐标）
      const groups = new Map();
      root.traverse((obj) => {
        if (!obj.isMesh || !obj.geometry) return;
        let node = obj;
        let part = null;
        while (node) {
          if (node.userData && node.userData.part) { part = node.userData.part; break; }
          node = node.parent;
        }
        if (!part) return;
        if (obj.raycast && obj.raycast.toString().includes('return')) {
          // 不可拾取的装饰件跳过（其 raycast 被置空）
          try { if (obj.raycast() === undefined && obj.raycast.length === 0) {} } catch (e) { /* ignore */ }
        }
        obj.geometry.computeBoundingSphere();
        const c = obj.geometry.boundingSphere ? obj.geometry.boundingSphere.center.clone() : null;
        if (!c) return;
        obj.localToWorld(c);
        if (!groups.has(part)) groups.set(part, []);
        groups.get(part).push(c);
      });

      const result = [];
      for (const [part, points] of groups) {
        const picked = points.slice(0, 6);
        let ok = 0;
        const seen = new Set();
        for (const p of picked) {
          THREE_V.copy(p).project(pet.camera);
          const sx = ((THREE_V.x + 1) / 2) * rect.width + rect.left;
          const sy = ((1 - THREE_V.y) / 2) * rect.height + rect.top;
          const hit = pet.hitTest(sx, sy);
          seen.add(String(hit.part));
          if (hit.hit) ok += 1;
          if (hit.part === part) ok += 0;
        }
        result.push({ part, samples: picked.length, hitRate: ok + '/' + picked.length, picked: Array.from(seen) });
      }

      // 屏幕中心与四角（角色外区域）应判定为未命中
      const probes = [
        ['center', rect.width / 2, rect.height / 2],
        ['topleft', 4, 4],
        ['topright', rect.width - 4, 4],
        ['bottomleft', 4, rect.height - 4],
        ['bottomright', rect.width - 4, rect.height - 4]
      ].map(([name, x, y]) => {
        const r = pet.hitTest(x, y);
        return name + ': hit=' + r.hit + ' part=' + r.part;
      });

      return { parts: result, probes, box: pet.__box || null };
    })()
  `);

  console.log(JSON.stringify(report, null, 1));
  app.exit(0);
});
