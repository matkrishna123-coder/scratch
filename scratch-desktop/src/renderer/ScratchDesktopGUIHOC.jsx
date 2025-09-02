import {ipcRenderer, remote} from 'electron';
import bindAll from 'lodash.bindall';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import {
  GUIComponent,
  LoadingStates,
  onFetchedProjectData,
  onLoadedProject,
  defaultProjectId,
  requestNewProject,
  requestProjectUpload,
  setProjectId,
  openTelemetryModal
} from '@scratch-gui-adapter';

import showPrivacyPolicy from './showPrivacyPolicy';

const ScratchDesktopGUIHOC = function (WrappedComponent) {
  class ScratchDesktopGUIComponent extends React.Component {
    constructor (props) {
      super(props);
      bindAll(this, [
        'handleProjectTelemetryEvent',
        'handleSetTitleFromSave'
      ]);

      // kick off initial-project check/load
      ipcRenderer.invoke('get-initial-project-data').then(initialProjectData => {
        const hasInitialProject = initialProjectData && (initialProjectData.length > 0);
        this.props.onHasInitialProject(hasInitialProject, this.props.loadingState);

        if (!hasInitialProject) {
          // no file passed: just land on default project
          return;
        }

        // we asked GUI to enter "uploading" state via requestProjectUpload in onHasInitialProject
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

            // fall back to default project
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
      document.title = `${args.title} — Scratch`;
    }

    render () {
      // Don’t pass HOC-only props down to DOM nodes inside GUI.
      const childProps = omit(this.props, Object.keys(ScratchDesktopGUIComponent.propTypes));

      return (
        <WrappedComponent
          canEditTitle
          canSave={false}
          onClickAbout={[
            { title: 'About', onClick: () => this.handleClickAbout() },
            { title: 'Privacy Policy', onClick: () => showPrivacyPolicy() },
            { title: 'Data Settings', onClick: () => this.props.onTelemetrySettingsClicked() }
          ]}
          onProjectTelemetryEvent={this.handleProjectTelemetryEvent}
          onShowPrivacyPolicy={showPrivacyPolicy}
          platform="DESKTOP"
          {...childProps}
        />
      );
    }
  }

  ScratchDesktopGUIComponent.propTypes = {
    loadingState: PropTypes.oneOf(LoadingStates),
    onFetchedInitialProjectData: PropTypes.func,
    onHasInitialProject: PropTypes.func,
    onLoadedProject: PropTypes.func,
    onRequestNewProject: PropTypes.func,
    onTelemetrySettingsClicked: PropTypes.func,
    vm: GUIComponent.WrappedComponent.propTypes.vm
  };

  const mapStateToProps = state => ({
    loadingState: state.scratchGui.projectState.loadingState,
    vm: state.scratchGui.vm
  });

  const mapDispatchToProps = dispatch => ({
    // NO spinner open/close actions; rely on requestProjectUpload + onLoadedProject
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
