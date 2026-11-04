'use strict';

/**
 * 冒烟验证脚本（正面单视角版）。
 *
 * 一次跑完三件事：
 *   1. 结构断言：确认转身相关逻辑与字段已彻底移除（yaw / fixedYaw / 擦除 / 双平面）；
 *   2. 行为断言：点击反馈的峰值幅度与稳定时间落在"轻拍即止"的区间内，命中判定可用；
 *   3. 视觉截图：把正面待机 / 眨眼 / 脸红 / 各动作 / 点击反馈逐帧落盘到 tools/shots。
 *
 * 运行：npx electron tools/smoke.js
 */

const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail === undefined ? '' : ' | ' + detail}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 待截图的动作状态：actionDur 必须等于动作真实时长，wait 取动作中段。 */
const STATES = [
  { name: '01-idle', wait: 900, mood: 'idle' },
  { name: '02-blink', wait: 60, mood: 'idle', blink: true },
  { name: '03-blush', wait: 1200, mood: 'shy' },
  { name: '04-sleep', wait: 1400, mood: 'sleep', action: 'sleep', actionDur: 30 },
  { name: '05-sit', wait: 1200, mood: 'idle', action: 'sit', actionDur: 30 },
  { name: '06-walk', wait: 900, mood: 'idle', action: 'walk', actionDur: 30 },
  { name: '07-stretch-mid', wait: 1200, actionDur: 2.4, action: 'stretch' },
  { name: '08-yawn-mid', wait: 1250, actionDur: 2.6, action: 'yawn' },
  { name: '09-tilt-mid', wait: 800, actionDur: 2.0, action: 'tilt' },
  { name: '10-cheer-mid', wait: 420, actionDur: 1.2, action: 'cheer' },
  { name: '11-giggle', wait: 500, actionDur: 1.4, action: 'giggle' },
  { name: '12-apron-alpha', wait: 700, alpha: true }
];

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

  const consoleErrors = [];
  const consoleWarns = [];
  const KNOWN_WARN = [/THREE\.Clock/i, /deprecated/i];
  win.webContents.on('console-message', (event, level, message) => {
    if (level >= 3) consoleErrors.push(message);
    else if (level === 2) consoleWarns.push(message);
    console.log(`[renderer:${level}] ${message}`);
  });
  win.webContents.on('render-process-gone', (event, detail) => {
    consoleErrors.push(`render-process-gone: ${JSON.stringify(detail)}`);
  });

  await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html'));
  win.showInactive();
  await delay(900);

  const bridgeDelay = 900;
  await delay(bridgeDelay);

  const ready = await win.webContents.executeJavaScript(
    'Boolean(window.__umaPet && window.__umaPet.animator && window.__umaPet.character)'
  );
  check('渲染器就绪（window.__umaPet）', ready);
  if (!ready) {
    app.exit(1);
    return;
  }

  await win.webContents.executeJavaScript(`
    document.body.style.background = 'radial-gradient(circle at 50% 42%, #f6f1ff 0%, #ded4f0 55%, #c9bfe0 100%)';
    true;
  `);

  // ---------- 1. 结构断言：转身逻辑是否彻底移除 ----------
  const structure = await win.webContents.executeJavaScript(`
    (() => {
      const p = window.__umaPet;
      const a = p.animator;
      const c = p.character;
      const pivot = c.pivot;
      let meshCount = 0;
      c.root.traverse((o) => { if (o.isMesh) meshCount += 1; });
      return {
        animatorKeys: ['yaw', 'yawVel', 'fixedYaw', 'debugWipe', 'turnSpin', '_degA', '_degB', '_p', 'anticipateCd']
          .filter((k) => a[k] !== undefined),
        animatorMethods: ['applyFacing', 'setWipe'].filter((k) => typeof a[k] === 'function'),
        characterKeys: ['DEGREES', 'setWipe', 'textures', 'eyeTextures', 'secondary', 'primary']
          .filter((k) => c[k] !== undefined),
        pivotRotY: pivot.rotation.y,
        meshCount,
        pivotChildren: pivot.children.length,
        bodyUrl: c.body && c.body.material && c.body.material.map && c.body.material.map.image
          ? (c.body.material.map.image.src || '').split('/').slice(-2).join('/')
          : '',
        eyeVisibleAtRest: c.eye ? c.eye.visible : null,
        hasBody: !!c.body,
        hasEye: !!c.eye
      };
    })()
  `);
  check('animator 无转向字段', structure.animatorKeys.length === 0, JSON.stringify(structure.animatorKeys));
  check('animator 无转向方法', structure.animatorMethods.length === 0, JSON.stringify(structure.animatorMethods));
  check('character 无朝向/擦除接口', structure.characterKeys.length === 0, JSON.stringify(structure.characterKeys));
  check('pivot.rotation.y 恒为 0', Math.abs(structure.pivotRotY) < 1e-9, structure.pivotRotY);
  check('单平面结构（body + eye + 腮红组）', structure.pivotChildren === 3, `children=${structure.pivotChildren}`);
  check('身体使用正面贴图 deg_000.png', /deg_000\.png$/.test(structure.bodyUrl), structure.bodyUrl);
  check('闭眼贴片默认隐藏', structure.eyeVisibleAtRest === false, structure.eyeVisibleAtRest);

  // ---------- 2. 眨眼 / 闭眼贴片开关 ----------
  const eyeProbe = await win.webContents.executeJavaScript(`
    (() => {
      const a = window.__umaPet.animator;
      const eye = window.__umaPet.character.eye;
      const out = {};
      a.debugClose = 1;
      a.updateExpression(0.016, { eyeClose: 0 });
      out.closed = { visible: eye.visible, opacity: +eye.material.opacity.toFixed(3) };
      a.debugClose = 0.5;
      a.updateExpression(0.016, { eyeClose: 0 });
      out.half = { visible: eye.visible, opacity: +eye.material.opacity.toFixed(3) };
      a.debugClose = null;
      a.updateExpression(0.016, { eyeClose: 0 });
      out.open = { visible: eye.visible, opacity: +eye.material.opacity.toFixed(3) };
      return out;
    })()
  `);
  check('闭眼贴片关（opacity=1）', eyeProbe.closed.visible && eyeProbe.closed.opacity > 0.95, JSON.stringify(eyeProbe.closed));
  check('闭眼贴片半闭（0.5）', eyeProbe.half.visible && Math.abs(eyeProbe.half.opacity - 0.5) < 0.02, JSON.stringify(eyeProbe.half));
  check('睁眼时贴片隐藏', eyeProbe.open.visible === false, JSON.stringify(eyeProbe.open));

  // ---------- 3. 命中判定（UV 反推部位） ----------
  const hitProbe = await win.webContents.executeJavaScript(`
    (() => {
      const p = window.__umaPet;
      const rect = p.renderer.domElement.getBoundingClientRect();
      const parts = {};
      let hit = 0;
      for (let x = rect.left + 4; x < rect.right; x += 8) {
        for (let y = rect.top + 4; y < rect.bottom; y += 8) {
          const part = p.raycastPart(x, y);
          if (part) { hit += 1; parts[part] = (parts[part] || 0) + 1; }
        }
      }
      return { hit, parts };
    })()
  `);
  const partNames = Object.keys(hitProbe.parts);
  check('命中判定可识别多个部位', hitProbe.hit > 200 && partNames.length >= 3, `hit=${hitProbe.hit} parts=${partNames.join(',')}`);
  check('脸/头发部位可命中', partNames.includes('face') || partNames.includes('hair'), partNames.join(','));

  // ---------- 4. 点击反馈幅度与稳定时间 ----------
  async function measureReact(part) {
    await win.webContents.executeJavaScript(`
      (() => {
        const a = window.__umaPet.animator;
        const b = window.__umaPet.behavior;
        if (b) b.setPaused(true);
        a.setMood(null);
        a.play('idle', 0);
        a.freezePose = false;
        a.noBlink = true;
        a.debugClose = null;
        a.walkX = undefined;
        a.sBob.reset(0);
        a.sLeanZ.reset(0);
        a.sLeanX.reset(0);
        a.sScaleY.reset(1);
        window.__probe = [];
        const t0 = performance.now();
        let last = t0;
        let fired = false;
        const tick = () => {
          const now = performance.now();
          const t = (now - t0) / 1000;
          // 每帧强制回到 idle：否则 behavior 已排队的动作（wave/look/giggle 等）
          // 自身的侧倾摆动会污染基线，测出来的"稳定时间"其实是动作还没播完。
          a.play('idle', 0);
          if (!fired && t > 0.02) { a.react(${JSON.stringify(part)}); fired = true; }
          window.__probe.push({
            t,
            leanZ: a.sLeanZ.value,
            leanX: a.sLeanX.value,
            bob: a.sBob.value,
            scaleY: a.sScaleY.value
          });
          if (t < 2.0) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        return true;
      })()
    `);
    await delay(2300);
    const samples = await win.webContents.executeJavaScript('window.__probe');
    return analyse(samples);
  }

  function analyse(samples) {
    if (!samples || samples.length < 10) return { ok: false };
    const base = samples[0];
    const peak = { leanZ: 0, leanX: 0, bob: 0, scaleY: 1 };
    for (const s of samples) {
      if (Math.abs(s.leanZ - base.leanZ) > Math.abs(peak.leanZ)) peak.leanZ = s.leanZ - base.leanZ;
      if (Math.abs(s.leanX - base.leanX) > Math.abs(peak.leanX)) peak.leanX = s.leanX - base.leanX;
      if (Math.abs(s.bob - base.bob) > Math.abs(peak.bob)) peak.bob = s.bob - base.bob;
      if (Math.abs(s.scaleY - base.scaleY) > Math.abs(peak.scaleY - 1)) peak.scaleY = s.scaleY;
    }
    // 稳定时间：只看侧倾。idle 呼吸本身会让 bob 在 ±0.02 内摆动，不能拿 bob 当判据。
    // 阈值 1.2°（0.021 rad）> 待机呼吸的侧倾幅度 0.011 rad，故只会被外力响应触发。
    let settle = 0;
    let maxAbs = 0;
    const thrLean = 0.021;
    for (const s of samples) {
      const d = Math.abs(s.leanZ - base.leanZ);
      if (d > maxAbs) maxAbs = d;
      if (d > thrLean) settle = s.t;
    }
    return {
      ok: true,
      peakLeanZ: +peak.leanZ.toFixed(4),
      peakLeanZDeg: +((Math.abs(peak.leanZ) * 180) / Math.PI).toFixed(2),
      peakBob: +peak.bob.toFixed(4),
      peakScaleY: +(Math.abs(peak.scaleY - 1)).toFixed(4),
      settle: +settle.toFixed(2),
      maxLeanAbs: +maxAbs.toFixed(4),
      sampleCount: samples.length
    };
  }

  const faceReact = await measureReact('face');
  console.log('react(face) ->', JSON.stringify(faceReact));
  check('摸脸峰值侧倾 ≤ 8°', faceReact.ok && faceReact.peakLeanZDeg <= 8, `${faceReact.peakLeanZDeg}°`);
  check('摸脸峰值升降 ≤ 0.05（约 1% 身高）', faceReact.ok && Math.abs(faceReact.peakBob) <= 0.05, faceReact.peakBob);
  check('摸脸回弹在 0.8s 内稳定', faceReact.ok && faceReact.settle <= 0.8, `${faceReact.settle}s`);
  check('摸脸峰值侧倾不低于 0.5°（有反馈感）', faceReact.ok && faceReact.peakLeanZDeg >= 0.5, `${faceReact.peakLeanZDeg}°`);

  const earReact = await measureReact('ear');
  console.log('react(ear) ->', JSON.stringify(earReact));
  check('摸耳峰值侧倾 ≤ 12°', earReact.ok && earReact.peakLeanZDeg <= 12, `${earReact.peakLeanZDeg}°`);
  check('摸耳回弹在 1.0s 内稳定', earReact.ok && earReact.settle <= 1.0, `${earReact.settle}s`);

  const tailReact = await measureReact('tail');
  console.log('react(tail) ->', JSON.stringify(tailReact));
  check('尾巴峰值侧倾 ≤ 10°', tailReact.ok && tailReact.peakLeanZDeg <= 10, `${tailReact.peakLeanZDeg}°`);

  // ---------- 5. 截图 ----------
  await delay(4200); // 避开 app.js 启动 2.2s 后的开机问候
  for (const state of STATES) {
    await win.webContents.executeJavaScript(`
      (() => {
        const a = window.__umaPet.animator;
        const b = window.__umaPet.behavior;
        if (b) b.setPaused(true);
        a.setMood(${JSON.stringify(state.mood || 'idle')});
        ${state.action ? `a.play(${JSON.stringify(state.action)}, ${state.actionDur || 30});` : "a.play('idle', 0);"}
        a.walkX = ${state.action === 'walk' ? '-0.35' : 'undefined'};
        a.freezePose = ${state.name === '12-apron-alpha' ? 'true' : 'false'};
        a.noBlink = ${state.blink ? 'false' : 'true'};
        a.blinkTimer = ${state.blink ? '0' : '999'};
        a.blinkPhase = ${state.blink ? '0.45' : '0'};
        a.debugClose = ${state.blink ? '1' : 'null'};
        ${state.alpha ? "document.body.style.background = 'transparent';" : ''}
        return true;
      })()
    `);
    await delay(state.wait);
    const image = await win.webContents.capturePage();
    const file = path.join(OUT_DIR, `${state.name}.png`);
    fs.writeFileSync(file, image.toPNG());
    console.log('saved', file);
  }

  // 点击反馈连拍：轻拍一下，按 60ms 间隔抓 6 帧，检查有没有大幅甩动
  await win.webContents.executeJavaScript(`
    document.body.style.background = 'radial-gradient(circle at 50% 42%, #f6f1ff 0%, #ded4f0 55%, #c9bfe0 100%)';
    (() => {
      const a = window.__umaPet.animator;
      a.setMood(null);
      a.play('idle', 0);
      a.freezePose = false;
      a.noBlink = true;
      a.walkX = undefined;
      a.sBob.reset(0);
      a.sLeanZ.reset(0);
      a.sLeanX.reset(0);
      a.sScaleY.reset(1);
      a.react('face');
      return true;
    })()
  `);
  for (let i = 0; i < 6; i += 1) {
    await delay(60);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT_DIR, `20-tap-${String(i).padStart(2, '0')}.png`), img.toPNG());
  }

  // ---------- 6. 收尾 ----------
  check('无控制台报错（level>=3）', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));
  check('无未识别告警（three.js 弃用提示除外）',
    consoleWarns.filter((m) => !KNOWN_WARN.some((re) => re.test(m))).length === 0,
    consoleWarns.filter((m) => !KNOWN_WARN.some((re) => re.test(m))).slice(0, 2).join(' || '));

  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(
    path.join(OUT_DIR, 'smoke-result.json'),
    JSON.stringify({ at: new Date().toISOString(), total: results.length, failed: failed.length, results, faceReact, earReact, tailReact }, null, 2),
    'utf8'
  );
  console.log(`\n===== SMOKE ${failed.length === 0 ? 'PASS' : 'FAIL'} (${results.length - failed.length}/${results.length}) =====`);
  app.exit(failed.length === 0 ? 0 : 2);
});
