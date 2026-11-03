'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.juipper.umapet');
}

const BASE_W = 340;
const BASE_H = 370;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2.0;

let mainWindow = null;
let tray = null;
let statePath = null;
let dragTimer = null;
let dragOrigin = null;

const appState = {
  x: null,
  y: null,
  scale: 1,
  alwaysOnTop: true,
  clickThrough: true,
  visible: true
};

function ensureStatePath() {
  if (!statePath) {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    statePath = path.join(dir, 'state.json');
  }
  return statePath;
}

function loadState() {
  try {
    const raw = fs.readFileSync(ensureStatePath(), 'utf8');
    const parsed = JSON.parse(raw);
    for (const key of Object.keys(appState)) {
      if (parsed[key] !== undefined) appState[key] = parsed[key];
    }
  } catch (err) {
    // 首次启动没有存档，使用默认值
  }
}

function persistState() {
  try {
    fs.writeFileSync(ensureStatePath(), JSON.stringify(appState, null, 2), 'utf8');
  } catch (err) {
    // 忽略写入失败
  }
}

function clampScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
}

function windowSize() {
  const s = appState.scale;
  return { width: Math.round(BASE_W * s), height: Math.round(BASE_H * s) };
}

function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  const { width, height } = windowSize();
  return {
    x: workArea.x + workArea.width - width - 40,
    y: workArea.y + workArea.height - height + 20
  };
}

function isPositionVisible(pos) {
  if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return false;
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    const overlapX = Math.min(pos.x + 80, area.x + area.width) - Math.max(pos.x, area.x);
    const overlapY = Math.min(pos.y + 80, area.y + area.height) - Math.max(pos.y, area.y);
    return overlapX > 40 && overlapY > 40;
  });
}

function createWindow() {
  const { width, height } = windowSize();
  const fallback = defaultPosition();
  const startX = isPositionVisible({ x: appState.x, y: appState.y }) ? appState.x : fallback.x;
  const startY = isPositionVisible({ x: appState.x, y: appState.y }) ? appState.y : fallback.y;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: startX,
    y: startY,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: appState.alwaysOnTop,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  mainWindow.setAlwaysOnTop(appState.alwaysOnTop, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(appState.clickThrough, { forward: true });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (appState.visible) mainWindow.showInactive();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      appState.visible = false;
      persistState();
      updateTrayMenu();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('moved', () => {
    if (!mainWindow) return;
    const [x, y] = mainWindow.getPosition();
    appState.x = x;
    appState.y = y;
  });
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.showInactive();
  }
  appState.visible = true;
  persistState();
  updateTrayMenu();
}

function hideWindow() {
  if (mainWindow) mainWindow.hide();
  appState.visible = false;
  persistState();
  updateTrayMenu();
}

function setAlwaysOnTop(value) {
  appState.alwaysOnTop = !!value;
  if (mainWindow) mainWindow.setAlwaysOnTop(appState.alwaysOnTop, 'screen-saver');
  persistState();
  updateTrayMenu();
}

function setScale(value) {
  appState.scale = clampScale(value);
  const { width, height } = windowSize();
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    mainWindow.setBounds({ x, y, width, height });
  }
  persistState();
  sendToRenderer('pet:scale-changed', appState.scale);
  updateTrayMenu();
}

function centerOnScreen() {
  if (!mainWindow) return;
  const fallback = defaultPosition();
  mainWindow.setPosition(fallback.x, Math.round(screen.getPrimaryDisplay().workArea.y + screen.getPrimaryDisplay().workArea.height - windowSize().height + 20));
  appState.x = fallback.x;
  appState.y = mainWindow.getPosition()[1];
  persistState();
}

function buildContextMenu() {
  return Menu.buildFromTemplate([
    {
      label: appState.visible ? '隐藏桌宠' : '显示桌宠',
      click: () => (appState.visible ? hideWindow() : showWindow())
    },
    { type: 'separator' },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: appState.alwaysOnTop,
      click: (item) => setAlwaysOnTop(item.checked)
    },
    {
      label: '空白处鼠标穿透',
      type: 'checkbox',
      checked: appState.clickThrough,
      click: (item) => {
        appState.clickThrough = item.checked;
        if (mainWindow) mainWindow.setIgnoreMouseEvents(appState.clickThrough, { forward: true });
        persistState();
        updateTrayMenu();
      }
    },
    {
      label: '桌宠大小',
      submenu: [
        { label: '60%', type: 'radio', checked: Math.abs(appState.scale - 0.6) < 0.01, click: () => setScale(0.6) },
        { label: '80%', type: 'radio', checked: Math.abs(appState.scale - 0.8) < 0.01, click: () => setScale(0.8) },
        { label: '100%', type: 'radio', checked: Math.abs(appState.scale - 1) < 0.01, click: () => setScale(1) },
        { label: '125%', type: 'radio', checked: Math.abs(appState.scale - 1.25) < 0.01, click: () => setScale(1.25) },
        { label: '150%', type: 'radio', checked: Math.abs(appState.scale - 1.5) < 0.01, click: () => setScale(1.5) }
      ]
    },
    { label: '回到屏幕右下角', click: centerOnScreen },
    { type: 'separator' },
    {
      label: '重新加载外观',
      click: () => {
        if (mainWindow) mainWindow.webContents.reload();
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        persistState();
        app.quit();
      }
    }
  ]);
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildContextMenu());
  tray.setToolTip('赛马娘桌宠');
}

function createTray() {
  const iconCandidates = [
    path.join(__dirname, '..', '..', 'assets', 'tray.png'),
    path.join(__dirname, '..', '..', 'assets', 'icon.png')
  ];
  let image = nativeImage.createEmpty();
  for (const candidate of iconCandidates) {
    if (fs.existsSync(candidate)) {
      const loaded = nativeImage.createFromPath(candidate);
      if (!loaded.isEmpty()) {
        image = loaded.resize({ width: 20, height: 20 });
        break;
      }
    }
  }
  tray = new Tray(image);
  tray.setToolTip('赛马娘桌宠');
  tray.on('click', () => {
    if (appState.visible) hideWindow();
    else showWindow();
  });
  tray.on('right-click', () => {
    tray.popUpContextMenu(buildContextMenu());
  });
  updateTrayMenu();
}

ipcMain.on('pet:set-ignore-mouse', (event, ignore) => {
  if (!mainWindow) return;
  const shouldIgnore = appState.clickThrough ? !!ignore : false;
  mainWindow.setIgnoreMouseEvents(shouldIgnore, { forward: true });
});

ipcMain.on('pet:drag-start', () => {
  if (!mainWindow) return;
  if (dragTimer) clearInterval(dragTimer);
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = mainWindow.getPosition();
  dragOrigin = { cursorX: cursor.x, cursorY: cursor.y, winX: wx, winY: wy };
  dragTimer = setInterval(() => {
    if (!mainWindow || !dragOrigin) return;
    const now = screen.getCursorScreenPoint();
    const nextX = dragOrigin.winX + (now.x - dragOrigin.cursorX);
    const nextY = dragOrigin.winY + (now.y - dragOrigin.cursorY);
    mainWindow.setPosition(Math.round(nextX), Math.round(nextY));
  }, 16);
});

ipcMain.on('pet:drag-end', () => {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
  dragOrigin = null;
  if (mainWindow) {
    const [x, y] = mainWindow.getPosition();
    appState.x = x;
    appState.y = y;
    persistState();
  }
});

ipcMain.on('pet:show-context-menu', () => {
  const menu = buildContextMenu();
  if (mainWindow) menu.popup({ window: mainWindow });
});

ipcMain.on('pet:quit', () => {
  app.isQuitting = true;
  persistState();
  app.quit();
});

ipcMain.handle('pet:get-config', () => ({
  scale: appState.scale,
  alwaysOnTop: appState.alwaysOnTop,
  clickThrough: appState.clickThrough,
  platform: process.platform,
  version: app.getVersion()
}));

app.whenReady().then(() => {
  loadState();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  persistState();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 桌宠常驻托盘，不随窗口关闭退出
  }
});
