import React from 'react';
import {render} from 'react-dom';

import {
  GUIComponent as GUI,
  AppStateHOC,
  setAppElement,
  initLocale,
  initFullScreen,
  initPlayer,
  guiInitialState,
  localesInitialState
} from '@scratch-gui-adapter';

import ScratchDesktopGUIHOC from './ScratchDesktopGUIHOC.jsx';

// Wrap GUI with desktop HOC + app-state HOC (same pattern as upstream)
const Wrapped = AppStateHOC(ScratchDesktopGUIHOC(GUI));

// Tell react-modal which element is the app root (a11y)
setAppElement(document.getElementById('app'));

// Initialize GUI bits in the expected order
initFullScreen(guiInitialState);
// IMPORTANT: initLocale expects a messagesByLocale map, not the whole reducer state
initLocale((localesInitialState && localesInitialState.messagesByLocale) || {});
initPlayer(guiInitialState);

// Mount the app
render(<Wrapped isScratchDesktop />, document.getElementById('app'));
