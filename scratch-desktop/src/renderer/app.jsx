
import React from 'react';
import {render} from 'react-dom';

import {
  GUIComponent as GUI,
  AppStateHOC,
  setAppElement,
  localesInitialState
} from '@scratch-gui-adapter';

import ScratchDesktopGUIHOC from './ScratchDesktopGUIHOC.jsx';
import ElectronStorageHelper from '../common/ElectronStorageHelper';

// Wrap GUI with desktop HOC, then wrap that with AppStateHOC.
// 2nd arg: init-state transform (none for desktop)
// 3rd arg: locales payload so locales.isRtl etc are defined
const localesPayload = localesInitialState ?? {messagesByLocale: {}, locale: 'en', isRtl: false};
const Wrapped = AppStateHOC(ScratchDesktopGUIHOC(GUI), null, localesPayload);

// react-modal needs to know the app root
setAppElement(document.getElementById('app'));

// Let the HOC initialize storage helpers (this must be passed to the HOC itself)
const handleStorageInit = storage => {
  storage.addHelper(new ElectronStorageHelper(storage));
};

render(
  <Wrapped
    isScratchDesktop
    canSave={false}
    canEditTitle
    onStorageInit={handleStorageInit}
  />,
  document.getElementById('app')
);
