// Single, stable place to import GUI+reducers from source when @scratch/scratch-gui
// is linked (file:../scratch-gui). We also provide compatibility re-exports.

// GUI (component)
import GUIComponent from '@scratch/scratch-gui/src/components/gui/gui.jsx';

// App HOC & utilities (exported by GUI's src/index.js in this version)
import {
  AppStateHOC,
  setAppElement
  // (we won't export initFullScreen / initPlayer / initLocale here —
  //  AppStateHOC will handle init from initial state we pass in app.jsx)
} from '@scratch/scratch-gui/src/index.js';

// Project state bits
import {
  LoadingStates,
  onFetchedProjectData,
  onLoadedProject,
  requestNewProject,
  requestProjectUpload,
  setProjectId,
  defaultProjectId
} from '@scratch/scratch-gui/src/reducers/project-state';

// Locales initial state (THIS is where isRtl comes from)
import {localesInitialState} from '@scratch/scratch-gui/src/reducers/locales';

// Modals (telemetry button etc.)
import {openTelemetryModal} from '@scratch/scratch-gui/src/reducers/modals';

// Re-exports used by desktop
export {
  GUIComponent,
  AppStateHOC,
  setAppElement,
  LoadingStates,
  onFetchedProjectData,
  onLoadedProject,
  requestNewProject,
  requestProjectUpload,
  setProjectId,
  defaultProjectId,
  openTelemetryModal,
  localesInitialState
};

// Back-compat aliases (older desktop names)
export const openLoadingProject  = onFetchedProjectData;
export const closeLoadingProject = onLoadedProject;

// Keep default so `import GUI from '@scratch-gui-adapter'` works
export default GUIComponent;
