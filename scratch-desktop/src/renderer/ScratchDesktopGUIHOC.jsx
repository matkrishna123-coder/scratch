import {ipcRenderer, remote} from 'electron';
import bindAll from 'lodash.bindall';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

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
        'handleUpdateProjectTitle'
      ]);

      // Load a file passed on the CLI (if any); otherwise start fresh.
      ipcRenderer.invoke('get-initial-project-data').then(initialProjectData => {
        const hasInitialProject = !!(initialProjectData && initialProjectData.length > 0);

        // Tell GUI whether we’ll load from a file (matches sb-file-uploader flow)
        this.props.onHasInitialProject(hasInitialProject, this.props.loadingState);

        if (!hasInitialProject) {
          // No file passed: GUI will create a fresh default project via setProjectId(defaultProjectId)
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
            remote.dialog.showMessageBox(remote.getCurrentWindow(), {
              type: 'error',
              title: 'Failed to load project',
              message: 'Invalid or corrupt project file.',
              detail: e.message
            });

            // Reset to default project and start fresh
            this.props.onHasInitialProject(false, this.props.loadingState);
            this.props.onRequestNewProject();
          }
        );
      });
    }

    componentDidMount () {
      ipcRenderer.on('setTitleFromSave', this.handleSetTitleFromSave);
    }
    componentWillUnmount () {
      ipcRenderer.removeListener('setTitleFromSave', this.handleSetTitleFromSave);
    }

    handleClickAbout () {
      ipcRenderer.send('open-about-window');
    }
    handleProjectTelemetryEvent (event, metadata) {
      ipcRenderer.send(event, metadata);
    }
    handleSetTitleFromSave (_event, args) {
      this.handleUpdateProjectTitle(args.title);
    }
    handleStorageInit (storageInstance) {
      storageInstance.addHelper(new ElectronStorageHelper(storageInstance));
    }
    handleUpdateProjectTitle (newTitle) {
      this.setState({projectTitle: newTitle});
    }

    render () {
      // IMPORTANT: don’t pass HOC-internal props (incl. vm) down to GUI
      const childProps = omit(this.props, Object.keys(ScratchDesktopGUIComponent.propTypes));

      return (
        <WrappedComponent
          canEditTitle
          canSave={false}
          canModifyCloudData={false}
          onClickAbout={[
            { title: 'About', onClick: () => this.handleClickAbout() },
            { title: 'Privacy Policy', onClick: () => showPrivacyPolicy() },
            { title: 'Data Settings', onClick: () => this.props.onTelemetrySettingsClicked() }
          ]}
          onProjectTelemetryEvent={this.handleProjectTelemetryEvent}
          onShowPrivacyPolicy={showPrivacyPolicy}
          onStorageInit={this.handleStorageInit}
          onUpdateProjectTitle={this.handleUpdateProjectTitle}
          platform="DESKTOP"
          {...childProps}
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
      // set default project id (acts like “create new”)
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
