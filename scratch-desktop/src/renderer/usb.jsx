// src/renderer/usb.jsx
import React, {useEffect, useState} from 'react';
// ❌ Don’t import from 'electron' in the renderer when nodeIntegration=false.
// Use the preload bridge instead:
const {desktop} = window;
const ipc = desktop && desktop.ipc;

import styles from './usb.css';

const UsbElement = () => {
  const [deviceList, setDeviceList] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(null);

  useEffect(() => {
    if (!ipc) return;

    const listener = (_event, usbDeviceList) => {
      setDeviceList(usbDeviceList);
      // Keep selection only if the device still exists
      setSelectedDeviceId(prev =>
        usbDeviceList.some(d => d.deviceId === prev) ? prev : null
      );
    };

    ipc.on('usb-device-list', listener);
    return () => ipc.removeListener('usb-device-list', listener);
  }, [ipc]);

  const selectHandler = deviceId => () => setSelectedDeviceId(deviceId);

  const deviceHandler = deviceId => () => {
    if (ipc) ipc.send('usb-device-selected', deviceId);
    setSelectedDeviceId(null);
  };

  return (
    <main>
      Select your USB device:
      <fieldset className={styles.devices}>
        {deviceList.map(device => (
          <div
            className={`${styles.device} ${
              selectedDeviceId === device.deviceId ? styles.selected : ''
            }`}
            key={device.deviceId}
          >
            <input
              checked={selectedDeviceId === device.deviceId}
              id={`device-${device.deviceId}`}
              name="usbDevice"
              onChange={selectHandler(device.deviceId)}
              type="radio"
              value={device.deviceId}
            />
            <label htmlFor={`device-${device.deviceId}`}>
              {device.productName || `Device ${device.deviceId}`}
            </label>
          </div>
        ))}
      </fieldset>

      <div className={styles.buttons}>
        <button className={styles.cancelButton} onClick={deviceHandler(null)}>
          Cancel
        </button>
        <button
          className={styles.connectButton}
          disabled={!selectedDeviceId}
          onClick={deviceHandler(selectedDeviceId)}
        >
          Connect
        </button>
      </div>

      {!ipc && (
        <p style={{marginTop: 8}}>
          (USB bridge unavailable — preload not loaded or no IPC.)
        </p>
      )}
    </main>
  );
};

export default <UsbElement />;
