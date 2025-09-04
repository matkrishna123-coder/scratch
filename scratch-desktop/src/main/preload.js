// // src/main/preload.js
// const {contextBridge, ipcRenderer, shell} = require('electron');

// contextBridge.exposeInMainWorld('electronAPI', {
//   openAbout: () => ipcRenderer.send('open-about-window'),
//   openPrivacy: () => ipcRenderer.send('open-privacy-policy-window'),
//   getInitialProjectData: () => ipcRenderer.invoke('get-initial-project-data'),
//   onSetTitleFromSave: (cb) => ipcRenderer.on('setTitleFromSave', (_e, a) => cb(a)),
//   openExternal: (url) => shell.openExternal(url),
//   showMessageBox: (opts) => ipcRenderer.invoke('show-message-box', opts)
// });


// // Plain CommonJS; no ESM syntax here.
// const { contextBridge, ipcRenderer } = require('electron');

// contextBridge.exposeInMainWorld('electronAPI', {
//   onReadyToShow: (handler) => ipcRenderer.on('ready-to-show', handler),
//   send: (channel, payload) => ipcRenderer.send(channel, payload),
//   invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
// });

// // Helpful sanity log – will appear in DevTools Console for the window
// try {
//   console.log('[preload] loaded with Electron', process.versions.electron, 'Node', process.versions.node);
// } catch {}

// src/main/preload.js
const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  ipc: {
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, listener) => {
      const wrapped = (_e, ...a) => listener(...a);
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    },
    removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener)
  },
  openAbout: () => ipcRenderer.send('open-about-window'),
  openPrivacy: () => ipcRenderer.send('open-privacy-policy-window'),
  showMessageBox: (options) => ipcRenderer.invoke('dialog:showMessageBox', options)
});

