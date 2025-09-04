// src/renderer/showPrivacyPolicy.js

// Don’t import from 'electron' in the renderer when nodeIntegration=false.
// Use the preload bridge exposed on `window.desktop`.
const {desktop} = window;
const ipc = desktop && desktop.ipc;

const showPrivacyPolicy = event => {
  if (event && event.preventDefault) event.preventDefault();

  if (ipc) {
    // Ask main process to open the dedicated Privacy window
    ipc.send('open-privacy-policy-window');
  } else {
    // Fallback: navigate this window to the privacy route
    // (useful if the preload bridge isn’t available in dev)
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('route', 'privacy');
      window.location.href = url.toString();
    } catch {
      // last-resort no-op
    }
  }
  return false;
};

export default showPrivacyPolicy;
