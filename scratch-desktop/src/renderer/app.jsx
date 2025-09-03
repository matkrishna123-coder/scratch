import React from 'react';
import {render} from 'react-dom';

// Ensure the renderer class is registered so the VM can attach a renderer
import 'scratch-render';

import {
  GUIComponent as GUI,   // this is the *container* from your adapter shim
  AppStateHOC,
  setAppElement
} from '@scratch-gui-adapter';

import ScratchDesktopGUIHOC from './ScratchDesktopGUIHOC.jsx';

// Compose: desktop HOC around the GUI container, then the AppState HOC
const Wrapped = AppStateHOC(ScratchDesktopGUIHOC(GUI));

const root = document.getElementById('app');
setAppElement(root);

// Render the editor
render(<Wrapped isScratchDesktop />, root);
