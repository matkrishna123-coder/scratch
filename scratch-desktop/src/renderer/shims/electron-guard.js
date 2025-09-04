// This file is bundled if something imports "electron" from the renderer.
// That is not allowed with contextIsolation & nodeIntegration: false.
throw new Error(
  'Renderer tried to import "electron". Use window.desktop.* from preload instead.'
);
