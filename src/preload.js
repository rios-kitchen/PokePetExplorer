// Exposes a small, whitelisted IPC bridge to the renderer pages.
const { contextBridge, ipcRenderer } = require('electron');

const SEND = new Set([
  'pet:ignore', 'pet:fit', 'pet:drag-start', 'pet:drag-end', 'pet:menu', 'pet:action',
  'panel:open', 'timer:cmd', 'todo:add', 'todo:set-done', 'todo:edit', 'todo:delete',
  'todo:clear-done', 'todo:reorder', 'settings:set', 'pomodoro:set', 'pet:reset-pos',
  'pokemon:select', 'pokemon:remove', 'poop:clean', 'expedition:recall', 'evolution:later', 'update:show', 'ai:clear', 'ai:open'
]);
const INVOKE = new Set(['state:get', 'pet:move-by', 'pet:pat', 'pokemon:assets',
  'care:use', 'care:diagnose', 'diary:portrait', 'diary:week', 'expedition:start', 'evolution:choose', 'shop:buy', 'egg:adopt', 'settings:extra', 'update:check', 'update:download', 'photo:save', 'photo:get', 'ai:chat', 'ai:history', 'ai:set-key', 'ai:models', 'ai:test']);
const ON = new Set(['state', 'pet:event', 'panel:tab', 'input', 'chat']);

contextBridge.exposeInMainWorld('api', {
  send(channel, ...args) { if (SEND.has(channel)) ipcRenderer.send(channel, ...args); },
  invoke(channel, ...args) {
    return INVOKE.has(channel) ? ipcRenderer.invoke(channel, ...args) : Promise.reject(new Error('blocked'));
  },
  on(channel, cb) {
    if (!ON.has(channel)) return () => {};
    const fn = (_e, data) => cb(data);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  }
});
