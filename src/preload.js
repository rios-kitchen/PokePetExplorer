// Exposes a small, whitelisted IPC bridge to the renderer pages.
const { contextBridge, ipcRenderer } = require('electron');

const SEND = new Set([
  'pet:ignore', 'pet:fit', 'pet:drag-start', 'pet:drag-end', 'pet:menu', 'pet:action',
  'panel:open', 'timer:cmd', 'todo:add', 'todo:set-done', 'todo:edit', 'todo:delete',
  'todo:clear-done', 'todo:reorder', 'settings:set', 'pomodoro:set', 'pet:reset-pos',
  'pokemon:select', 'pokemon:remove', 'poop:clean', 'expedition:recall', 'evolution:later', 'update:show', 'ai:clear', 'ai:open', 'fish:lost', 'fish:open', 'quiz:open', 'catch:open', 'memory:open', 'whack:open', 'types:open', 'rps:open', 'starter:open', 'pet:unpeek', 'battle:close', 'wild:open', 'party:toggle', 'update:page', 'link:open'
]);
const INVOKE = new Set(['state:get', 'pet:move-by', 'pet:pat', 'pokemon:assets',
  'care:use', 'care:diagnose', 'diary:portrait', 'diary:week', 'expedition:start', 'evolution:choose', 'shop:buy', 'settings:extra', 'update:check', 'update:download', 'photo:save', 'photo:get', 'photo:fav', 'fish:bite', 'fish:land', 'quiz:ask', 'quiz:answer', 'catch:start', 'catch:finish', 'memory:start', 'memory:finish', 'whack:start', 'whack:finish', 'types:start', 'types:answer', 'rps:start', 'rps:throw', 'starter:choose', 'join:answer', 'daily:sign', 'daily:claim', 'weather:city', 'wild:explore', 'wild:outing', 'wild:state', 'battle:act', 'battle:assets', 'ai:chat', 'ai:history', 'ai:set-key', 'ai:models', 'ai:test']);
const ON = new Set(['state', 'pet:event', 'panel:tab', 'input', 'chat', 'wild:encounter', 'wild:refresh']);

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
