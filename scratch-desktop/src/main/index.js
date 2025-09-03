import {BrowserWindow, Menu, app, dialog, ipcMain, shell, systemPreferences} from 'electron';
import fs from 'fs-extra';
import path from 'path';
import {URL} from 'url';
import {promisify} from 'util';

import argv from './argv';
import {getFilterForExtension} from './FileFilters';
import telemetry from './ScratchDesktopTelemetry';
import MacOSMenu from './MacOSMenu';
import log from '../common/log.js';
import packageJson from '../../package.json';

// ------------------------------------------------------------
// Global setup / switches
// ------------------------------------------------------------

// Will be default in newer Electron, keep for clarity
app.allowRendererProcessReuse = true;

// Force-enable GPU / WebGL early
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-webgl');
// Windows ANGLE backend (optional)
if (process.platform === 'win32') {
    app.commandLine.appendSwitch('use-angle', 'd3d11');
}

// Allow Scratch Link without DNS
app.commandLine.appendSwitch('host-resolver-rules', 'MAP device-manager.scratch.mit.edu 127.0.0.1');

// Avoid Chrome extensions trouble in dev (Redux/React DevTools etc.)
app.commandLine.appendSwitch('disable-extensions');

telemetry.appWasOpened();

// ------------------------------------------------------------
// Constants
// ------------------------------------------------------------
const defaultSize = {width: 1280, height: 800}; // Good for MAS screenshots
const isDevelopment = process.env.NODE_ENV !== 'production';
const _windows = {}; // keep references
const PORT = process.env.PORT || 8601;

// DevTools shortcut
const devToolKey = (process.platform === 'darwin')
    ? {alt: true, control: false, meta: true, shift: false, code: 'KeyI'}
    : {alt: false, control: true, meta: false, shift: true, code: 'KeyI'};

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const displayPermissionDeniedWarning = (browserWindow, permissionType) => {
    let title;
    let message;
    switch (permissionType) {
    case 'camera':
        title = 'Camera Permission Denied';
        message = 'Permission to use the camera has been denied. Scratch will not be able to take a photo or use video sensing blocks.';
        break;
    case 'microphone':
        title = 'Microphone Permission Denied';
        message = 'Permission to use the microphone has been denied. Scratch will not be able to record sounds or detect loudness.';
        break;
    default:
        title = 'Permission Denied';
        message = 'A permission has been denied.';
    }

    const instructions = (process.platform === 'darwin')
        ? 'To change Scratch permissions, please check "Security & Privacy" in System Preferences.'
        : 'To change Scratch permissions, please check your system settings and restart Scratch.';

    dialog.showMessageBox(browserWindow, {
        type: 'warning',
        title,
        message: `${message}\n\n${instructions}`
    });
};

const makeFullUrl = (url, search = null) => {
    const baseUrl = (isDevelopment
        ? `http://localhost:${PORT}/`
        : `file://${path.join(__dirname, '../renderer')}/`
    );
    const fullUrl = new URL(url, baseUrl);
    if (search) fullUrl.search = search;
    return fullUrl.toString();
};

const askForMediaAccess = mediaType => {
    if (systemPreferences.askForMediaAccess) {
        // macOS only; returns a Promise<boolean>
        return systemPreferences.askForMediaAccess(mediaType);
    }
    // Other platforms: assume allowed
    return true;
};

const handlePermissionRequest = async (webContents, permission, callback, details) => {
    if (!_windows.main || webContents !== _windows.main.webContents) return callback(false);
    if (!details.isMainFrame) return callback(false);
    if (permission !== 'media') return callback(false);

    const requiredBase = makeFullUrl('');
    if (!details.requestingUrl.startsWith(requiredBase)) return callback(false);

    let askMic = false;
    let askCam = false;
    for (const mediaType of details.mediaTypes) {
        if (mediaType === 'audio') askMic = true;
        else if (mediaType === 'video') askCam = true;
        else return callback(false);
    }

    const parentWindow = _windows.main;

    if (askMic) {
        const ok = await askForMediaAccess('microphone');
        if (!ok) {
            displayPermissionDeniedWarning(parentWindow, 'microphone');
            return callback(false);
        }
    }
    if (askCam) {
        const ok = await askForMediaAccess('camera');
        if (!ok) {
            displayPermissionDeniedWarning(parentWindow, 'camera');
            return callback(false);
        }
    }
    return callback(true);
};

const getIsProjectSave = downloadItem =>
    downloadItem.getMimeType() === 'application/x.scratch.sb3';

// ------------------------------------------------------------
// Window creation
// ------------------------------------------------------------
const createWindow = ({search = null, url = 'index.html', ...browserWindowOptions}) => {
    const window = new BrowserWindow({
        useContentSize: true,
        show: false,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'preload.js') // ensure dist/main/preload.js exists
        },
        ...browserWindowOptions
    });

    const webContents = window.webContents;

    webContents.session.setPermissionRequestHandler(handlePermissionRequest);

    // DevTools shortcut
    webContents.on('before-input-event', (event, input) => {
        if (input.code === devToolKey.code &&
            input.alt === devToolKey.alt &&
            input.control === devToolKey.control &&
            input.meta === devToolKey.meta &&
            input.shift === devToolKey.shift &&
            input.type === 'keyDown' &&
            !input.isAutoRepeat &&
            !input.isComposing) {
            event.preventDefault();
            webContents.openDevTools({mode: 'detach', activate: true});
        }
    });

    // Open target=_blank in external browser (modern)
    webContents.setWindowOpenHandler(({url}) => {
        shell.openExternal(url);
        return {action: 'deny'};
    });

    // Legacy safety
    webContents.on('new-window', (event, newWindowUrl) => {
        event.preventDefault();
        shell.openExternal(newWindowUrl);
    });

    const fullUrl = makeFullUrl(url, search);
    console.log('Main process: Loading URL:', fullUrl);
    window.loadURL(fullUrl);

    window.once('ready-to-show', () => {
        console.log('Main process: Window ready to show');
        webContents.send('ready-to-show');
    });

    return window;
};

const createAboutWindow = () => createWindow({
    width: 400,
    height: 400,
    parent: _windows.main,
    search: 'route=about',
    title: `About ${packageJson.productName}`
});

const createPrivacyWindow = () => createWindow({
    width: Math.floor(defaultSize.width * 0.8),
    height: Math.floor(defaultSize.height * 0.8),
    parent: _windows.main,
    search: 'route=privacy',
    title: `${packageJson.productName} Privacy Policy`
});

const createUsbWindow = () => {
    const window = createWindow({
        width: 400,
        height: 300,
        parent: _windows.main,
        search: 'route=usb',
        modal: true,
        frame: false
    });

    // Only micro:bit currently uses navigator.usb
    const getIsMicroBit = device => device.vendorId === 0x0d28 && device.productId === 0x0204;
    let deviceList = [];
    let selectedDeviceCallback;

    _windows.main.webContents.session.on('select-usb-device', (event, details, callback) => {
        deviceList = details.deviceList.filter(getIsMicroBit);
        selectedDeviceCallback = callback;

        window.webContents.send('usb-device-list', deviceList);
        window.show();

        event.preventDefault();
    });

    _windows.main.webContents.session.on('usb-device-added', (_event, device) => {
        if (!getIsMicroBit(device)) return;
        deviceList.push(device);
        window.webContents.send('usb-device-list', deviceList);
    });

    _windows.main.webContents.session.on('usb-device-removed', (_event, device) => {
        if (!getIsMicroBit(device)) return;
        deviceList = deviceList.filter(existing => existing.deviceId !== device.deviceId);
        window.webContents.send('usb-device-list', deviceList);
    });

    ipcMain.on('usb-device-selected', (_event, message) => {
        if (selectedDeviceCallback) selectedDeviceCallback(message);
        window.hide();
    });

    return window;
};

const createMainWindow = () => {
    console.log('Main process: Creating main window');
    const window = createWindow({
        width: defaultSize.width,
        height: defaultSize.height,
        title: `${packageJson.productName} ${packageJson.version}`
    });
    console.log('Main process: Main window created');

    const webContents = window.webContents;

    webContents.session.on('will-download', (willDownloadEvent, downloadItem) => {
        const isProjectSave = getIsProjectSave(downloadItem);
        const itemPath = downloadItem.getFilename();
        const baseName = path.basename(itemPath);
        const extName = path.extname(baseName);
        const options = {defaultPath: baseName};
        if (extName) {
            const extNameNoDot = extName.replace(/^\./, '');
            options.filters = [getFilterForExtension(extNameNoDot)];
        }

        const userChosenPath = dialog.showSaveDialogSync(window, options);
        if (userChosenPath) {
            const userBaseName = path.basename(userChosenPath);
            const tempPath = path.join(app.getPath('temp'), userBaseName);

            downloadItem.setSavePath(tempPath); // only valid during will-download

            downloadItem.on('done', async (doneEvent, doneState) => {
                try {
                    if (doneState !== 'completed') {
                        throw new Error(`save ${doneState}`); // "save cancelled" or "save interrupted"
                    }
                    await fs.move(tempPath, userChosenPath, {overwrite: true});
                    if (isProjectSave) {
                        const newProjectTitle = path.basename(userChosenPath, extName);
                        webContents.send('setTitleFromSave', {title: newProjectTitle});
                        telemetry.projectSaveCompleted(newProjectTitle);
                    }
                } catch (e) {
                    if (isProjectSave) telemetry.projectSaveCanceled();
                    await dialog.showMessageBox(window, {
                        type: 'error',
                        title: 'Failed to save project',
                        message: `Save failed:\n${userChosenPath}`,
                        detail: e.message
                    });
                    fs.exists(tempPath).then(exists => { if (exists) fs.unlink(tempPath); });
                }
            });
        } else {
            downloadItem.cancel();
            if (isProjectSave) telemetry.projectSaveCanceled();
        }
    });

    webContents.on('will-prevent-unload', ev => {
        const choice = dialog.showMessageBoxSync(window, {
            title: packageJson.productName,
            type: 'question',
            message: 'Leave Scratch?',
            detail: 'Any unsaved changes will be lost.',
            buttons: ['Stay', 'Leave'],
            cancelId: 0,
            defaultId: 0
        });
        const shouldQuit = (choice === 1);
        if (shouldQuit) {
            ev.preventDefault();
        }
    });

    window.once('ready-to-show', () => {
        window.show();
    });

    return window;
};

// ------------------------------------------------------------
// Menu
// ------------------------------------------------------------
if (process.platform === 'darwin') {
    const osxMenu = Menu.buildFromTemplate(MacOSMenu(app));
    Menu.setApplicationMenu(osxMenu);
} else {
    Menu.setApplicationMenu(null);
}

// ------------------------------------------------------------
// App lifecycle
// ------------------------------------------------------------
app.on('window-all-closed', () => {
    app.quit();
});

app.on('will-quit', () => {
    telemetry.appWillClose();
});

// Work around old devtools installer issues on Windows
if (process.platform === 'win32') {
    const appUserDataPath = app.getPath('userData');
    const devToolsExtensionsPath = path.join(appUserDataPath, 'DevTools Extensions');
    try { fs.unlinkSync(devToolsExtensionsPath); } catch (_) { /* ignore */ }
}

app.on('ready', () => {
    console.log('Main process: App ready, creating windows');

    // Don’t install React/Redux devtools extensions here (can hang / sandbox errors on newer Electron).
    _windows.main = createMainWindow();
    console.log('Main process: Main window assigned');
    _windows.main.on('closed', () => { delete _windows.main; });

    _windows.about = createAboutWindow();
    _windows.about.on('close', e => { e.preventDefault(); _windows.about.hide(); });

    _windows.privacy = createPrivacyWindow();
    _windows.privacy.on('close', e => { e.preventDefault(); _windows.privacy.hide(); });

    _windows.usb = createUsbWindow();
});

// ------------------------------------------------------------
// IPC
// ------------------------------------------------------------
ipcMain.on('open-about-window', () => {
    if (_windows.about) _windows.about.show();
});

ipcMain.on('open-privacy-policy-window', () => {
    if (_windows.privacy) _windows.privacy.show();
});

// Allow renderer (via preload) to show message boxes in main
ipcMain.handle('show-message-box', (_e, opts) => dialog.showMessageBox(_windows.main, opts));

// ------------------------------------------------------------
// Initial project data prefetch (used by renderer via preload)
// ------------------------------------------------------------
const initialProjectDataPromise = (async () => {
    if (argv._.length === 0) return;
    if (argv._.length > 1) {
        log.warn(`Expected 1 command line argument but received ${argv._.length}.`);
    }
    const projectPath = argv._[argv._.length - 1];
    try {
        const projectData = await promisify(fs.readFile)(projectPath, null);
        return projectData;
    } catch (e) {
        log.error(`Error loading project data: ${e}`);
        dialog.showMessageBox(_windows.main, {
            type: 'error',
            title: 'Failed to load project',
            message: `Could not load project from file:\n${projectPath}`,
            detail: e.message
        });
    }
    // undefined on failure
})();
ipcMain.handle('get-initial-project-data', () => initialProjectDataPromise);
