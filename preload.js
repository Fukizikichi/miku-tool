const { contextBridge, ipcRenderer } = require('electron');

const api = {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, callback) => {
    const handler = (event, ...args) => callback(event, ...args);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
};

try {
  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld('electronAPI', api);
  } else {
    window.electronAPI = api;
  }
} catch (e) {
  window.electronAPI = api;
}
