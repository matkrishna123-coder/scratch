// src/main/preload.js
const {contextBridge, ipcRenderer, shell} = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openAbout: () => ipcRenderer.send('open-about-window'),
  openPrivacy: () => ipcRenderer.send('open-privacy-policy-window'),
  getInitialProjectData: () => ipcRenderer.invoke('get-initial-project-data'),
  onSetTitleFromSave: (cb) => ipcRenderer.on('setTitleFromSave', (_e, a) => cb(a)),
  openExternal: (url) => shell.openExternal(url),
  showMessageBox: (opts) => ipcRenderer.invoke('show-message-box', opts)
});
