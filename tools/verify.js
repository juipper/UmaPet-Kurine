'use strict';

/**
 * 功能回归脚本：自动化验证伪 3D（贴图）版本是否保留了全部交互能力。
 * 运行： npx electron tools/verify.js
 */

const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ' | ' + detail : ''}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ipcSeen = [];
for (const channel of [
  'pet:set-ignore-mouse',
  'pet:drag-start',
  'pet:drag-end',
  'pet:show-context-menu'
]) {
  ipcMain.on(channel, (_e, payload) => {
    ipcSeen.push({ channel, payload, at: Date.now() });
  });
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

  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) console.log(`[renderer:${level}] ${message}`);
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  win.showInactive();
  await delay(1500);

  const ready = await win.webContents.executeJavaScript(
    'Boolean(window.__umaPet && window.__umaPet.animator && window.__umaPet.behavior)'
  );
  check('渲染器初始化', ready);
  if (!ready) {
    app.exit(1);
    return;
  }

  // 自动化派发指针事件时没有真实 pointer，屏蔽 setPointerCapture 以免抛错中断脚本
  await win.webContents.executeJavaScript(`
    HTMLElement.prototype.setPointerCapture = function () {};
    HTMLElement.prototype.releasePointerCapture = function () {};
    true;
  `);

  // 1) 部位命中采样：网格扫描屏幕，统计命中到的部位

  const partMap = await win.webContents.executeJavaScript(`
    (() => {
      const p = window.__umaPet;
      const found = {};
      for (let x = 10; x < window.innerWidth; x += 6) {
        for (let y = 10; y < window.innerHeight; y += 6) {
          const part = p.raycastPart(x, y);
          if (part && !found[part]) found[part] = { x, y };
        }
      }
      return { found, scene: p.scene.children.length };
    })()
  `);

  const wanted = ['ear', 'face', 'hat', 'hair', 'torso', 'skirt', 'tail', 'leg'];
  for (const part of wanted) {
    check(`部位命中: ${part}`, Boolean(partMap.found[part]), JSON.stringify(partMap.found[part] || null));
  }

  // 2) 逐部位点击反应：同帧内先定位再点击，读取 __lastTap 与气泡文案

  for (const part of wanted) {
    const tapped = await win.webContents.executeJavaScript(`
      (() => {
        const p = window.__umaPet;
        p.animator.freezePose = true;
        p.animator.fixedYaw = 0;
        p.behavior.setPaused(true);
        // 同一帧内先扫出该部位坐标，避免角色摇晃导致坐标漂移
        let spot = null;
        for (let x = 6; x < window.innerWidth && !spot; x += 4) {
          for (let y = 6; y < window.innerHeight; y += 4) {
            if (p.raycastPart(x, y) === ${JSON.stringify(part)}) { spot = { x, y }; break; }
          }
        }
        if (!spot) return { found: false, part: null, bubble: '', shown: false };
        const canvas = document.querySelector('canvas');
        const bubble = document.getElementById('bubble');
        const diag = p.hitTest(spot.x, spot.y);
        const beforeTap = window.__lastTap ? window.__lastTap.at : 0;
        bubble.textContent = '';
        bubble.classList.remove('show');
        const opts = { clientX: spot.x, clientY: spot.y, button: 0, pointerId: 1, bubbles: true, cancelable: true };
        canvas.dispatchEvent(new PointerEvent('pointerdown', opts));
        window.dispatchEvent(new PointerEvent('pointerup', opts));
        return {
          found: true,
          spot,
          diag,
          tapAdvanced: (window.__lastTap ? window.__lastTap.at : 0) > beforeTap,
          part: window.__lastTap ? window.__lastTap.part : null,
          bubble: bubble.textContent,
          shown: bubble.classList.contains('show')
        };
      })()
    `);
    check(`点击反应: ${part}`, tapped.part === part && tapped.shown, `spot=${JSON.stringify(tapped.spot || null)} diag=${JSON.stringify(tapped.diag || null)} tap=${tapped.tapAdvanced} part=${tapped.part} bubble=${tapped.bubble}`);
    await delay(120);
  }

  // 3) 拖拽：pointerdown -> 大幅 pointermove -> pointerup

  const drag = await win.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector('canvas');
      const spot = ${JSON.stringify(partMap.found.torso || partMap.found.face || { x: 320, y: 400 })};
      const bubble = document.getElementById('bubble');
      bubble.textContent = '';
      bubble.classList.remove('show');
      canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: spot.x, clientY: spot.y, button: 0, pointerId: 2, bubbles: true }));
      const draggingNow = window.__umaPet.animator.dragging;
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: spot.x + 60, clientY: spot.y + 40, pointerId: 2, bubbles: true }));
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: spot.x + 120, clientY: spot.y + 70, pointerId: 2, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: spot.x + 120, clientY: spot.y + 70, pointerId: 2, bubbles: true }));
      return { draggingNow, bubble: bubble.textContent, draggingAfter: window.__umaPet.animator.dragging };
    })()
  `);
  check('拖拽开始', drag.draggingNow === true);
  check('拖拽结束提示', drag.bubble.length > 0, drag.bubble);
  check('拖拽状态复位', drag.draggingAfter === false);
  check('IPC: drag-start', ipcSeen.some((x) => x.channel === 'pet:drag-start'));
  check('IPC: drag-end', ipcSeen.some((x) => x.channel === 'pet:drag-end'));

  // 4) 双击

  const dbl = await win.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector('canvas');
      const spot = ${JSON.stringify(partMap.found.torso || { x: 320, y: 400 })};
      const bubble = document.getElementById('bubble');
      bubble.textContent = '';
      bubble.classList.remove('show');
      canvas.dispatchEvent(new MouseEvent('dblclick', { clientX: spot.x, clientY: spot.y, bubbles: true, cancelable: true }));
      return { bubble: bubble.textContent, mood: window.__umaPet.animator.mood };
    })()
  `);
  check('双击反应', dbl.bubble.length > 0, `${dbl.bubble} / mood=${dbl.mood}`);

  // 5) 右键菜单

  const beforeCtx = ipcSeen.filter((x) => x.channel === 'pet:show-context-menu').length;
  await win.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector('canvas');
      const spot = ${JSON.stringify(partMap.found.torso || { x: 320, y: 400 })};
      canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: spot.x, clientY: spot.y, bubbles: true, cancelable: true }));
      return true;
    })()
  `);
  await delay(200);
  const afterCtx = ipcSeen.filter((x) => x.channel === 'pet:show-context-menu').length;
  check('右键菜单触发', afterCtx > beforeCtx);

  // 6) 鼠标穿透：鼠标移出角色时应进入穿透

  const through = await win.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector('canvas');
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: 4, clientY: 4, pointerId: 3, bubbles: true }));
      return true;
    })()
  `);
  await delay(200);
  check(
    'IPC: set-ignore-mouse(穿透)',
    ipcSeen.some((x) => x.channel === 'pet:set-ignore-mouse' && x.payload === true)
  );

  // 7) 自主行为调度 / 情绪 / 朝向 / 活动

  const behavior = await win.webContents.executeJavaScript(`
    (() => {
      const p = window.__umaPet;
      const b = p.behavior;
      b.setPaused(false);
      const states = ['idle', 'wander', 'peek', 'sit', 'sleep', 'stretch', 'groom', 'hop', 'giggle', 'shy', 'nod', 'wave', 'doze', 'lookAround'];
      const report = {};
      for (const s of states) {
        b.startActivity(s);
        report[s] = { current: b.current, activity: p.animator.activity };
      }
      b.setNight(true);
      const night = p.animator.mood;
      b.setNight(false);
      b.notifyInteraction();
      b.setMouse(0.5, 0.5, true);
      return report;
    })()
  `);
  const activityFail = Object.keys(behavior).filter((k) => behavior[k].current !== k);
  check('行为状态全部可播', activityFail.length === 0, activityFail.join(','));

  // 8) 朝向切换：0/45/90/135/180 是否都能切换贴图且不报错

  const facing = await win.webContents.executeJavaScript(`
    (() => {
      const a = window.__umaPet.animator;
      const seen = [];
      for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
        a.fixedYaw = deg;
        a.update(0.016, performance.now() / 1000);
        seen.push({ deg, index: a._facingIndex === undefined ? null : a._facingIndex, yaw: Math.round(a.yaw) });
      }
      a.fixedYaw = null;
      return seen;
    })()
  `);
  check('朝向贴图切换', facing.every((f) => Math.abs(f.yaw - [0, 45, 90, 135, 180, 225, 270, 315][facing.indexOf(f)]) < 2), JSON.stringify(facing));

  // 9) 好感度系统

  const affection = await win.webContents.executeJavaScript(`
    (() => {
      const a = window.__umaPet.animator;
      const el = document.getElementById('affection');
      return {
        hasPanel: Boolean(el),
        fill: document.getElementById('affFill') ? document.getElementById('affFill').style.width : null,
        level: document.getElementById('affLevel') ? document.getElementById('affLevel').textContent : null
      };
    })()
  `);
  check('好感度面板存在', affection.hasPanel, `${affection.level} ${affection.fill}`);

  // 10) 表情层：眨眼 / 闭眼 / 脸红 是否可驱动

  const expr = await win.webContents.executeJavaScript(`
    (() => {
      const a = window.__umaPet.animator;
      const e = a.expression;
      if (!e) return { ok: false };
      a.fixedYaw = 0;
      a.freezePose = true;
      a.blinkTimer = 999;
      a.blinkPhase = 0;
      a.setMood('idle');
      a.blushVal = 0;
      for (let i = 0; i < 300; i++) a.update(0.016, 1 + i * 0.016);
      const idleVisible = e.lids.some((l) => l.visible) || e.blushes.some((m) => m.visible);
      a.setMood('shy');
      for (let i = 0; i < 120; i++) a.update(0.016, 1 + i * 0.016);
      const blushVisible = e.blushes.every((m) => m.visible) && e.blushes[0].material.opacity > 0.3;
      a.setMood('sleep');
      for (let i = 0; i < 60; i++) a.update(0.016, 2 + i * 0.016);
      const lidVisible = e.lids.every((l) => l.visible) && e.lids[0].scale.y > 0.5;
      a.setMood('idle');
      a.freezePose = false;
      a.fixedYaw = null;
      return { ok: true, idleVisible, blushVisible, lidVisible };
    })()
  `);
  check('表情层挂载', expr.ok === true);
  check('空闲无遮挡', expr.idleVisible === false);
  check('害羞脸红', expr.blushVisible === true);
  check('睡眠闭眼', expr.lidVisible === true);

  console.log('\n==== 汇总 ====');
  const failed = results.filter((r) => !r.ok);
  console.log(`通过 ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    for (const f of failed) console.log(`FAILED: ${f.name} | ${f.detail || ''}`);
  }

  app.exit(failed.length ? 1 : 0);
});
