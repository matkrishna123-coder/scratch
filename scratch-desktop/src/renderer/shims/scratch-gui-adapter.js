// A single stable import surface for @scratch/scratch-gui, whether linked from source
// (file:../scratch-gui) or installed from npm.
//
// We export the *bare* presentational GUI as default, plus the AppState HOC and
// the initializer helpers from GUI's src/index.js. We also re-export the action
// creators/enums desktop uses.

//
// Helpers + initial state builders from GUI's src/index.js
//
import {
  setAppElement,
  initLocale,
  initFullScreen,
  initPlayer,
  initEmbedded,
  guiInitialState,
  localesInitialState
} from '@scratch/scratch-gui/src/index.js';

//
// Bare GUI component & AppState HOC
//
import GUIComponent from '@scratch/scratch-gui/src/components/gui/gui.jsx';
import AppStateHOC  from '@scratch/scratch-gui/src/lib/app-state-hoc.jsx';

//
// Project-state bits desktop needs
//
import {
  LoadingStates,
  onFetchedProjectData,
  onLoadedProject,
  requestNewProject,
  requestProjectUpload,
  setProjectId,
  defaultProjectId
} from '@scratch/scratch-gui/src/reducers/project-state';

//
// Modals
//
import {openTelemetryModal} from '@scratch/scratch-gui/src/reducers/modals';

// Default export = *bare* GUI (not already wrapped)
export default GUIComponent;

export {
  // components / HOCs
  GUIComponent,
  AppStateHOC,

  // boot helpers + initial states
  setAppElement,
  initLocale,
  initFullScreen,
  initPlayer,
  initEmbedded,
  guiInitialState,
  localesInitialState,

  // project-state bits
  LoadingStates,
  onFetchedProjectData,
  onLoadedProject,
  requestNewProject,
  requestProjectUpload,
  setProjectId,
  defaultProjectId,

  // modals
  openTelemetryModal
};

// Back-compat aliases many desktop branches still call
export const openLoadingProject  = onFetchedProjectData;
export const closeLoadingProject = onLoadedProject;
