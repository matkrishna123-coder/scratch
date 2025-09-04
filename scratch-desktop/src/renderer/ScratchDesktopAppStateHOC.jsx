// src/renderer/ScratchDesktopAppStateHOC.jsx

// Do NOT import from 'electron' in the renderer when contextIsolation is on.
// Use the preload bridge instead:
const {desktop} = window;
const ipc = desktop && desktop.ipc;

import bindAll from 'lodash.bindall';
import React from 'react';

/**
 * Higher-order component to add desktop logic to AppStateHOC.
 * Works with a preload bridge (window.desktop) instead of importing 'electron'.
 * @param {Component} WrappedComponent - an AppStateHOC-like component to wrap.
 * @returns {Component} - a component similar to AppStateHOC with desktop-specific logic added.
 */
const ScratchDesktopAppStateHOC = function (WrappedComponent) {
  class ScratchDesktopAppStateComponent extends React.Component {
    constructor (props) {
      super(props);
      bindAll(this, [
        'handleTelemetryModalOptIn',
        'handleTelemetryModalOptOut'
      ]);

      // Prefer a synchronous getter if your preload exposes one;
      // otherwise start undefined and resolve asynchronously below.
      const initial = (desktop && typeof desktop.getTelemetryDidOptInSync === 'function')
        ? desktop.getTelemetryDidOptInSync()
        : undefined;

      this.state = {
        telemetryDidOptIn: initial // true | false | undefined (unknown)
      };

      // If we didn’t have a sync value, fetch it asynchronously.
      if (typeof this.state.telemetryDidOptIn !== 'boolean' && ipc && typeof ipc.invoke === 'function') {
        ipc.invoke('getTelemetryDidOptIn').then(val => {
          if (typeof val === 'boolean') this.setState({telemetryDidOptIn: val});
        }).catch(() => {
          // ignore; keep as undefined so the modal can prompt
        });
      }
    }

    handleTelemetryModalOptIn () {
      // Tell main we opted in, then refresh local state
      if (ipc && typeof ipc.send === 'function') ipc.send('setTelemetryDidOptIn', true);
      if (ipc && typeof ipc.invoke === 'function') {
        ipc.invoke('getTelemetryDidOptIn').then(telemetryDidOptIn => {
          this.setState({telemetryDidOptIn});
        });
      } else {
        this.setState({telemetryDidOptIn: true});
      }
    }

    handleTelemetryModalOptOut () {
      if (ipc && typeof ipc.send === 'function') ipc.send('setTelemetryDidOptIn', false);
      if (ipc && typeof ipc.invoke === 'function') {
        ipc.invoke('getTelemetryDidOptIn').then(telemetryDidOptIn => {
          this.setState({telemetryDidOptIn});
        });
      } else {
        this.setState({telemetryDidOptIn: false});
      }
    }

    render () {
      // Show the modal if we don’t yet have a boolean answer.
      const shouldShowTelemetryModal = (typeof this.state.telemetryDidOptIn !== 'boolean');

      return (
        <WrappedComponent
          isTelemetryEnabled={this.state.telemetryDidOptIn === true}
          onTelemetryModalOptIn={this.handleTelemetryModalOptIn}
          onTelemetryModalOptOut={this.handleTelemetryModalOptOut}
          showTelemetryModal={shouldShowTelemetryModal}

          // allow passed-in props to override any of the above
          {...this.props}
        />
      );
    }
  }

  return ScratchDesktopAppStateComponent;
};

export default ScratchDesktopAppStateHOC;
