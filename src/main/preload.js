'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet:set-ignore-mouse', ignore),
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  showContextMenu: () => ipcRenderer.send('pet:show-context-menu'),
  quit: () => ipcRenderer.send('pet:quit'),
  getConfig: () => ipcRenderer.invoke('pet:get-config'),
  onScaleChanged: (handler) => {
    const listener = (_event, scale) => handler(scale);
    ipcRenderer.on('pet:scale-changed', listener);
    return () => ipcRenderer.removeListener('pet:scale-changed', listener);
  }
});
