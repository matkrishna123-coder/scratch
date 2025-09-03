// Single, stable place to import GUI + helpers from @scratch/scratch-gui source.
// This version pulls the *container* (not the presentational component) so the
// renderer is attached to the VM before <Stage> mounts.

//
// GUI (container) + AppState HOC
//
import GUIContainer from '@scratch/scratch-gui/src/containers/gui.jsx';
import AppStateHOC  from '@scratch/scratch-gui/src/lib/app-state-hoc.jsx';

// Some initializer helpers & a11y hook live in src/index.js
export { initLocale, initFullScreen, initPlayer, setAppElement } from '@scratch/scratch-gui/src/index.js';

//
// Project state bits (names are stable across recent GUIs)
//
export {
  LoadingStates,
  onFetchedProjectData,
  onLoadedProject,
  requestNewProject,
  requestProjectUpload,
  setProjectId,
  defaultProjectId
} from '@scratch/scratch-gui/src/reducers/project-state';

//
// Modals (telemetry button etc.)
//
export { openTelemetryModal } from '@scratch/scratch-gui/src/reducers/modals';

// What desktop code expects:
export const GUIComponent = GUIContainer;     // named export
export { AppStateHOC };                       // named export

// Keep default export so `import GUI from '@scratch-gui-adapter'` would also work
export default GUIContainer;
