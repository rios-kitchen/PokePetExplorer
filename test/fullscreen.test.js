// macOS fullscreen check: when does the pet step aside?
const test = require('node:test');
const assert = require('node:assert/strict');
const { macFullscreen, MAC_SCRIPT } = require('../src/main/fullscreen');

const SELF = 100, BROWSER = 200, OTHER = 300;
// a 13" MacBook Air: 1470 × 956 points, camera notch
const screens = [{ x: 0, w: 1470, h: 956 }];
const win = (pid, X, Y, Width, Height, layer = 0) =>
  ({ kCGWindowLayer: layer, kCGWindowOwnerPID: pid, kCGWindowAlpha: 1, kCGWindowBounds: { X, Y, Width, Height } });
const statusIcons = win(1, 1000, 0, 400, 37, 25);
const check = (o) => macFullscreen({ self: SELF, frontPid: BROWSER, fullscreenSpace: false, screens, ...o });

test('a fullscreen Space always counts (fullscreen web video in a browser, #8)', () => {
  assert.equal(check({ fullscreenSpace: true, windows: [statusIcons, win(BROWSER, 300, 200, 600, 400)] }), true);
});

test('a window covering the screen, or below the notch with the menu bar gone, counts', () => {
  assert.equal(check({ windows: [win(BROWSER, 0, 0, 1470, 956)] }), true);
  assert.equal(check({ windows: [win(BROWSER, 0, 32, 1470, 924)] }), true);
});

test('a zoomed window below the menu bar does not count', () => {
  assert.equal(check({ windows: [statusIcons, win(BROWSER, 0, 37, 1470, 919)] }), false);
  assert.equal(check({ windows: [win(BROWSER, 0, 37, 1470, 800)] }), false);
});

test("the browser's own small windows in front of its fullscreen video don't get in the way (#8)", () => {
  const bubble = win(BROWSER, 535, 60, 400, 50), toolbar = win(BROWSER, 0, 32, 1470, 80);
  assert.equal(check({ windows: [bubble, toolbar, win(BROWSER, 0, 32, 1470, 924)] }), true);
});

test("another app's fullscreen window behind the front app doesn't count", () => {
  assert.equal(check({ windows: [win(BROWSER, 300, 200, 600, 400), win(OTHER, 0, 0, 1470, 956)] }), false);
});

test('our own windows never count; with us in front the frontmost other window decides', () => {
  assert.equal(check({ frontPid: SELF, windows: [win(SELF, 0, 0, 1470, 956), win(OTHER, 0, 0, 1470, 956)] }), true);
  assert.equal(check({ frontPid: SELF, windows: [win(SELF, 0, 0, 1470, 956), win(OTHER, 10, 40, 800, 600)] }), false);
});

test('the helper script carries the check and parses', () => {
  assert.match(MAC_SCRIPT, /function macFullscreen/);
  assert.doesNotThrow(() => new Function(MAC_SCRIPT));
});
