// src/renderer/ScratchDesktopGUIHOC.jsx

// NOTE: do NOT import from 'electron' in the renderer.
// All Electron access must go through the preload bridge:
const { desktop } = window;
const ipcRenderer = desktop && desktop.ipc;

import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import { connect } from 'react-redux';

import {
  LoadingStates,
  onFetchedProjectData,
  onLoadedProject,
  defaultProjectId,
  requestNewProject,
  requestProjectUpload,
  setProjectId,
  openTelemetryModal
} from '@scratch-gui-adapter';

import ElectronStorageHelper from '../common/ElectronStorageHelper';
import showPrivacyPolicy from './showPrivacyPolicy';

/**
 * Higher-order component to add desktop logic to the GUI.
 * @param {Component} WrappedComponent - a GUI-like component to wrap.
 * @returns {Component} - a component similar to GUI with desktop-specific logic added.
 */
const ScratchDesktopGUIHOC = function (WrappedComponent) {
  class ScratchDesktopGUIComponent extends React.Component {
    constructor (props) {
      super(props);
      bindAll(this, [
        'handleProjectTelemetryEvent',
        'handleSetTitleFromSave',
        'handleStorageInit',
        'handleUpdateProjectTitle',
        'handleClickAbout'
      ]);

      this.state = { projectTitle: '' };

      // Load a file passed on the CLI (if any); otherwise start fresh.
      if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
        ipcRenderer.invoke('get-initial-project-data').then(initialProjectData => {
          const hasInitialProject = !!(initialProjectData && initialProjectData.length > 0);

          // Tell GUI whether we’ll load from a file (matches sb-file-uploader flow)
          this.props.onHasInitialProject(hasInitialProject, this.props.loadingState);

          if (!hasInitialProject) {
            // No file passed: GUI will create a fresh default project
            return;
          }

          // Inform GUI we have bytes to load (transitions state out of NOT_LOADED)
          this.props.onFetchedInitialProjectData(initialProjectData, this.props.loadingState);

          // Load project bytes into VM
          this.props.vm.loadProject(initialProjectData).then(
            () => {
              this.props.onLoadedProject(this.props.loadingState, true);
            },
            e => {
              this.props.onLoadedProject(this.props.loadingState, false);
              // Show a dialog via the preload bridge
              if (window.desktop && typeof window.desktop.showMessageBox === 'function') {
                window.desktop.showMessageBox({
                  type: 'error',
                  title: 'Failed to load project',
                  message: 'Invalid or corrupt project file.',
                  detail: e && e.message ? e.message : String(e)
                });
              }

              // Reset to default project and start fresh
              this.props.onHasInitialProject(false, this.props.loadingState);
              this.props.onRequestNewProject();
            }
          );
        });
      }
    }

    componentDidMount () {
      if (ipcRenderer && typeof ipcRenderer.on === 'function') {
        ipcRenderer.on('setTitleFromSave', this.handleSetTitleFromSave);
      }
    }

    componentWillUnmount () {
      if (ipcRenderer && typeof ipcRenderer.removeListener === 'function') {
        ipcRenderer.removeListener('setTitleFromSave', this.handleSetTitleFromSave);
      }
    }

    handleClickAbout () {
      // Prefer a direct helper exposed by preload, but fall back to IPC channel name.
      if (window.desktop && typeof window.desktop.openAbout === 'function') {
        window.desktop.openAbout();
      } else if (ipcRenderer && typeof ipcRenderer.send === 'function') {
        ipcRenderer.send('open-about-window');
      }
    }

    handleProjectTelemetryEvent (event, metadata) {
      if (ipcRenderer && typeof ipcRenderer.send === 'function') {
        ipcRenderer.send(event, metadata);
      }
    }

    handleSetTitleFromSave (_event, args) {
      if (args && args.title) this.handleUpdateProjectTitle(args.title);
    }

    handleStorageInit (storageInstance) {
      storageInstance.addHelper(new ElectronStorageHelper(storageInstance));
    }

    handleUpdateProjectTitle (newTitle) {
      this.setState({ projectTitle: newTitle });
    }

    render () {
      // Strip desktop-only props so they don't leak into the GUI/DOM:
      const {
        loadingState,
        onFetchedInitialProjectData,
        onHasInitialProject,
        onLoadedProject,
        onRequestNewProject,
        onTelemetrySettingsClicked,
        // keep the rest (incl. vm) to pass to GUI
        ...safeProps
      } = this.props;

      return (
        <WrappedComponent
          canEditTitle
          canSave={false}
          canModifyCloudData={false}
          onClickAbout={[
            { title: 'About', onClick: () => this.handleClickAbout() },
            { title: 'Privacy Policy', onClick: () => showPrivacyPolicy() },
            { title: 'Data Settings', onClick: () => onTelemetrySettingsClicked && onTelemetrySettingsClicked() }
          ]}
          onProjectTelemetryEvent={this.handleProjectTelemetryEvent}
          onShowPrivacyPolicy={showPrivacyPolicy}
          onStorageInit={this.handleStorageInit}
          onUpdateProjectTitle={this.handleUpdateProjectTitle}
          platform="DESKTOP"
          {...safeProps}
        />
      );
    }
  }

  ScratchDesktopGUIComponent.propTypes = {
    loadingState: PropTypes.oneOf(Object.values(LoadingStates)),
    onFetchedInitialProjectData: PropTypes.func,
    onHasInitialProject: PropTypes.func,
    onLoadedProject: PropTypes.func,
    onRequestNewProject: PropTypes.func,
    onTelemetrySettingsClicked: PropTypes.func,
    vm: PropTypes.object.isRequired
  };

  const mapStateToProps = state => {
    const loadingState = state.scratchGui.projectState.loadingState;
    return {
      loadingState,
      vm: state.scratchGui.vm
    };
  };

  const mapDispatchToProps = dispatch => ({
    // If we have initial bytes, emulate the sb-file-uploader path
    onHasInitialProject: (hasInitialProject, loadingState) => {
      if (hasInitialProject) {
        return dispatch(requestProjectUpload(loadingState));
      }
      return dispatch(setProjectId(defaultProjectId));
    },

    onFetchedInitialProjectData: (projectData, loadingState) =>
      dispatch(onFetchedProjectData(projectData, loadingState)),

    onLoadedProject: (loadingState, loadSuccess) => {
      const canSaveToServer = false;
      return dispatch(onLoadedProject(loadingState, canSaveToServer, loadSuccess));
    },

    onRequestNewProject: () => dispatch(requestNewProject(false)),
    onTelemetrySettingsClicked: () => dispatch(openTelemetryModal())
  });

  return connect(mapStateToProps, mapDispatchToProps)(ScratchDesktopGUIComponent);
};

export default ScratchDesktopGUIHOC;
