// src/renderer/index.js
// Async-load the heavy routes (esp. app.jsx) so the splash screen in index.html
// can show immediately while the bundles are fetched.

// ⚠️ Do NOT import from 'electron' here. With contextIsolation on and
// nodeIntegration off, use the preload bridge instead:
const {desktop} = window;
const ipcRenderer = desktop?.ipc;
const ipc = desktop && desktop.ipc;

import ReactDOM from 'react-dom';
import log from '../common/log.js';

// Wait for the main process to say the window is ready, if the bridge exists.
if (ipc && typeof ipc.on === 'function') {
  ipc.on('ready-to-show', () => {
    // Start without any element in focus; otherwise first link might appear focused.
    try {
      document.activeElement && document.activeElement.blur();
    } catch (_) { /* ignore */ }
  });
}

const route = new URLSearchParams(window.location.search).get('route') || 'app';

let routeModulePromise;
switch (route) {
  case 'app':
    routeModulePromise = import('./app.jsx');
    break;
  case 'about':
    routeModulePromise = import('./about.jsx');
    break;
  case 'privacy':
    routeModulePromise = import('./privacy.jsx');
    break;
  case 'usb':
    routeModulePromise = import('./usb.jsx');
    break;
  default:
    // Fallback to app for unknown routes
    routeModulePromise = import('./app.jsx');
    break;
}

routeModulePromise
  .then(routeModule => {
    const appTarget = document.getElementById('app');
    const routeElement = routeModule.default;
    ReactDOM.render(routeElement, appTarget);
  })
  .catch(error => log.error('Error rendering app: ', error));
