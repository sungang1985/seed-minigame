'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const EventBus = require('../minigame/src/core/EventBus');
const Scene = require('../minigame/src/core/Scene');
const SceneManager = require('../minigame/src/core/SceneManager');
const Game = require('../minigame/src/core/Game');
const WeChatPlatform = require('../minigame/src/platform/WeChatPlatform');
const BrowserPlatform = require('../minigame/src/platform/BrowserPlatform');
const Storage = require('../minigame/src/services/Storage');
const AudioManager = require('../minigame/src/services/AudioManager');
const defaults = require('../minigame/src/config/game');

function fakePlatform(info = {}) {
  const callbacks = new Map();
  const frames = new Map();
  const storage = new Map();
  const images = [];
  const context = new Proxy({}, {
    get(target, key) {
      return key in target ? target[key] : () => {};
    },
  });
  let frameId = 0;
  const platform = {
    canvas: { width: 0, height: 0, getContext: () => context },
    info: { windowWidth: 375, windowHeight: 812, pixelRatio: 2, ...info },
    clock: 0,
    callbacks,
    frames,
    images,
    errors: [],
    getWindowInfo() { return this.info; },
    now() { return this.clock; },
    requestFrame(callback) { const id = ++frameId; frames.set(id, callback); return id; },
    cancelFrame(id) { frames.delete(id); },
    getStorage(key) { return storage.get(key); },
    setStorage(key, value) { storage.set(key, value); },
    removeStorage(key) { storage.delete(key); },
    createImage() { const image = {}; images.push(image); return image; },
    logError(error) { this.errors.push(error); },
    emit(name, payload) { if (callbacks.has(name)) callbacks.get(name)(payload); },
    step(milliseconds) {
      this.clock += milliseconds;
      assert.equal(frames.size, 1, 'exactly one animation frame should be pending');
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback();
    },
  };
  for (const name of ['Resize', 'Pointer', 'Show', 'Hide']) {
    platform[`on${name}`] = (callback) => {
      callbacks.set(name, callback);
      return () => callbacks.delete(name);
    };
  }
  return platform;
}

class ProbeScene extends Scene {
  enter(data) {
    this.data = data;
    this.deltas = [];
    this.pointers = [];
    this.exited = false;
  }
  update(delta) { this.deltas.push(delta); }
  onPointer(event) { this.pointers.push(event); }
  exit() { this.exited = true; }
}

function createGame(platform = fakePlatform(), options = {}) {
  const game = new Game(platform, { ...defaults, ...options });
  game.scenes.register('menu', ProbeScene);
  return game;
}

test('EventBus once is removed before recursive emit and unsubscribe is idempotent', () => {
  const events = new EventBus();
  const values = [];
  events.once('ready', (value) => {
    values.push(value);
    events.emit('ready', 'recursive');
  });
  events.emit('ready', 'first');
  events.emit('ready', 'second');
  assert.deepEqual(values, ['first']);

  const unsubscribe = events.on('score', (value) => values.push(value));
  events.emit('score', 3);
  unsubscribe();
  unsubscribe();
  events.emit('score', 4);
  assert.deepEqual(values, ['first', 3]);
});

test('scene transitions dispose subscriptions, create fresh state and preserve current scene on an unknown name', () => {
  const game = { events: new EventBus() };
  const manager = new SceneManager(game);
  let deliveries = 0;
  class ListeningScene extends ProbeScene {
    enter(data) {
      super.enter(data);
      this.listen('score', () => { deliveries += 1; });
    }
  }
  manager.register('play', ListeningScene);
  const first = manager.change('play', { round: 1 });
  game.events.emit('score');
  assert.equal(deliveries, 1);
  assert.throws(() => manager.change('missing'), /场景未注册/);
  assert.equal(manager.current, first);
  assert.equal(first.exited, false);

  const second = manager.change('play', { round: 2 });
  assert.notEqual(first, second);
  assert.equal(first.exited, true);
  assert.deepEqual(second.data, { round: 2 });
  game.events.emit('score');
  assert.equal(deliveries, 2, 'old scene must not keep an event listener');
  manager.clear();
  game.events.emit('score');
  assert.equal(deliveries, 2);
  assert.equal(manager.current, null);
});

test('the pointer that changes a scene is delivered only to the previous scene', () => {
  const game = { events: new EventBus() };
  const manager = new SceneManager(game);
  class TransitionScene extends ProbeScene {
    onPointer(event) { super.onPointer(event); manager.change('result'); }
  }
  manager.register('play', TransitionScene).register('result', ProbeScene);
  const previous = manager.change('play');
  const pointer = { type: 'down', x: 10, y: 20, id: 1 };
  manager.onPointer(pointer);
  assert.deepEqual(previous.pointers, [pointer]);
  assert.deepEqual(manager.current.pointers, []);
});

test('Game sizes the backing canvas, caps DPR and converts physical input and safe area to design coordinates', async () => {
  const platform = fakePlatform({
    windowWidth: 750, windowHeight: 1600, pixelRatio: 4,
    safeArea: { top: 40, left: 10, right: 730, bottom: 1560 },
    menuBottom: 64,
  });
  const game = createGame(platform);
  await game.start();
  assert.equal(game.width, 375);
  assert.equal(game.height, 800);
  assert.equal(platform.canvas.width, 2250);
  assert.equal(platform.canvas.height, 4800);
  assert.deepEqual(game.safeArea, { top: 36, left: 5, right: 10, bottom: 20 });
  platform.emit('Pointer', { type: 'down', x: 200, y: 400, id: 7 });
  assert.deepEqual(game.scenes.current.pointers, [{ type: 'down', x: 100, y: 200, id: 7 }]);

  platform.info = { windowWidth: 375, windowHeight: 667, pixelRatio: 1 };
  platform.emit('Resize');
  assert.equal(game.height, 667);
  assert.equal(platform.canvas.width, 375);
  platform.emit('Pointer', { type: 'down', x: 200, y: 400, id: 8 });
  assert.equal(game.scenes.current.pointers[1].x, 200);
  game.destroy();
});

test('hide/show is idempotent, keeps a single frame and excludes background time from deltaTime', async () => {
  const platform = fakePlatform();
  const game = createGame(platform);
  await game.start();
  const scene = game.scenes.current;
  platform.step(16);
  platform.step(16);
  assert.deepEqual(scene.deltas, [0, 0.016]);
  platform.emit('Hide');
  platform.emit('Hide');
  assert.equal(platform.frames.size, 0);
  platform.emit('Pointer', { type: 'down', x: 1, y: 1, id: 1 });
  assert.equal(scene.pointers.length, 0);
  platform.clock += 60000;
  platform.emit('Show');
  platform.emit('Show');
  assert.equal(platform.frames.size, 1);
  platform.step(16);
  platform.step(16);
  assert.deepEqual(scene.deltas, [0, 0.016, 0, 0.016]);
  platform.step(1000);
  assert.equal(scene.deltas.at(-1), defaults.maxDeltaTime);
  game.destroy();
  assert.equal(platform.frames.size, 0);
  assert.equal(platform.callbacks.size, 0);
  assert.equal(scene.exited, true);
  game.destroy();
  await assert.rejects(game.start(), /已销毁/);
});

test('destroy during image loading cannot recreate a scene or repopulate resource cache', async () => {
  const platform = fakePlatform();
  const game = createGame(platform, { assets: [{ key: 'hero', type: 'image', src: 'assets/hero.png' }] });
  const starting = game.start();
  await Promise.resolve();
  assert.equal(platform.images.length, 1);
  assert.equal(game.scenes.current, null);
  game.destroy();
  platform.images[0].onload();
  await starting;
  assert.equal(game.scenes.current, null);
  assert.equal(game.resources.get('hero'), undefined);
  assert.equal(game.ready, false);
  assert.equal(platform.frames.size, 0);
  assert.equal(platform.callbacks.size, 0);
});

test('a failed startup exposes the failure and never dispatches input to a scene', async () => {
  const platform = fakePlatform();
  const game = createGame(platform, { assets: [{ key: 'hero', type: 'image', src: 'missing.png' }] });
  const starting = game.start();
  await Promise.resolve();
  platform.images[0].onerror(new Error('missing file'));
  await assert.rejects(starting, /Failed to load image/);
  assert.equal(game.ready, false);
  assert.equal(game.scenes.current, null);
  assert.ok(game.error);
  platform.emit('Pointer', { type: 'down', x: 1, y: 1, id: 1 });
  platform.step(16);
  assert.equal(platform.errors.length, 0);
  game.destroy();
});

test('WeChat adapter distinguishes missing storage and empty strings, and releases normalized touch listeners', () => {
  const values = new Map([['test:empty', ''], ['test:zero', 0]]);
  const touchListeners = new Map();
  const api = {
    createCanvas() { return {}; },
    getStorageSync(key) { return values.has(key) ? values.get(key) : ''; },
    getStorageInfoSync() { return { keys: [...values.keys()] }; },
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel']) {
    api[`on${name}`] = (listener) => touchListeners.set(name, listener);
    api[`off${name}`] = (listener) => {
      assert.equal(touchListeners.get(name), listener);
      touchListeners.delete(name);
    };
  }
  const platform = new WeChatPlatform(api);
  const storage = new Storage(platform, 'test');
  assert.equal(storage.get('missing', 12), 12);
  assert.equal(storage.get('empty', 12), '');
  assert.equal(storage.get('zero', 12), 0);

  const delivered = [];
  const unsubscribe = platform.onPointer((event) => delivered.push(event));
  touchListeners.get('TouchStart')({ changedTouches: [{ clientX: 0, clientY: 20, pageX: 10, identifier: 3 }] });
  touchListeners.get('TouchMove')({ touches: [{ pageX: 15, pageY: 25, identifier: 3 }] });
  touchListeners.get('TouchEnd')({ changedTouches: [{ clientX: 17, clientY: 27, identifier: 3 }] });
  touchListeners.get('TouchCancel')({ changedTouches: [{ clientX: 19, clientY: 29, identifier: 3 }] });
  assert.deepEqual(delivered, [
    { type: 'down', x: 0, y: 20, id: 3 },
    { type: 'move', x: 15, y: 25, id: 3 },
    { type: 'up', x: 17, y: 27, id: 3 },
    { type: 'cancel', x: 19, y: 29, id: 3 },
  ]);
  unsubscribe();
  assert.equal(touchListeners.size, 0);
});

test('ended browser audio is not replayed when the application resumes', () => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  const audioInstances = [];
  class FakeAudio {
    constructor() { this.plays = 0; audioInstances.push(this); }
    play() { this.plays += 1; return Promise.resolve(); }
    pause() {}
    load() {}
    removeAttribute() {}
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { getElementById: () => ({ style: {} }) },
  });
  Object.defineProperty(globalThis, 'Audio', { configurable: true, value: FakeAudio });
  try {
    const platform = new BrowserPlatform();
    const audio = new AudioManager(platform);
    audio.play('collect', 'assets/collect.mp3');
    assert.equal(audioInstances[0].plays, 1);
    assert.equal(typeof audioInstances[0].onended, 'function');
    audioInstances[0].onended();
    audio.pauseAll();
    audio.resumeAll();
    assert.equal(audioInstances[0].plays, 1, 'finished one-shot audio must remain stopped');
    audio.destroy();
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
    if (originalAudio) Object.defineProperty(globalThis, 'Audio', originalAudio);
    else delete globalThis.Audio;
  }
});
