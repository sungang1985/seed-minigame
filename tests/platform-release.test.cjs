'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const WeChatPlatform = require('../minigame/src/platform/WeChatPlatform');
const AudioManager = require('../minigame/src/services/AudioManager');
const SoundService = require('../minigame/src/services/SoundService');

function wechatPlatform(api = {}) {
  return new WeChatPlatform({ createCanvas: () => ({}), ...api });
}

function audioPlatform() {
  const platform = {
    contexts: [],
    errors: [],
    nextFailure: null,
    logError(error) { this.errors.push(error); },
    createAudio() {
      const context = {
        plays: 0,
        pauses: 0,
        seeks: [],
        play() {
          this.plays += 1;
          const failure = platform.nextFailure;
          platform.nextFailure = null;
          if (failure) {
            if (failure.mode === 'throw') throw failure.error;
            if (failure.mode === 'reject') return Promise.reject(failure.error);
            this.errorListener(failure.error);
          }
        },
        pause() { this.pauses += 1; },
        stop() {},
        seek(seconds) { this.seeks.push(seconds); },
        destroy() { this.destroyed = true; },
        onError(listener) { this.errorListener = listener; },
        onEnded(listener) { this.endedListener = listener; },
      };
      platform.contexts.push(context);
      return context;
    },
  };
  return platform;
}

test('cloud authentication initializes once for concurrent calls in the same environment and explicitly targets every call', async () => {
  const initializations = [];
  const calls = [];
  const result = { user: { id: 'server-identity' }, issuedAt: 42 };
  const platform = wechatPlatform({ cloud: {
    init(options) { initializations.push(options); },
    async callFunction(options) { calls.push(options); return { result }; },
  } });

  const sessions = await Promise.all([
    platform.authenticate({ cloudEnv: 'production', functionName: 'game-login' }),
    platform.authenticate({ cloudEnv: 'production', functionName: 'game-login' }),
  ]);
  assert.equal(sessions[0], result);
  assert.equal(sessions[1], result);
  assert.deepEqual(initializations, [{ env: 'production', traceUser: false }]);
  assert.deepEqual(calls, [
    { name: 'game-login', data: {}, config: { env: 'production' } },
    { name: 'game-login', data: {}, config: { env: 'production' } },
  ]);

  await platform.authenticate({ cloudEnv: 'staging', functionName: 'staging-login' });
  assert.deepEqual(initializations[1], { env: 'staging', traceUser: false });
  assert.deepEqual(calls[2], { name: 'staging-login', data: {}, config: { env: 'staging' } });
});

test('a failed cloud initialization preserves the error and can initialize successfully on retry', async () => {
  const failure = new Error('cloud init unavailable');
  let initializations = 0;
  let calls = 0;
  const platform = wechatPlatform({ cloud: {
    init() { initializations += 1; if (initializations === 1) throw failure; },
    async callFunction() { calls += 1; return { result: { fromServer: true } }; },
  } });
  await assert.rejects(platform.authenticate({ cloudEnv: 'production', functionName: 'game-login' }), error => error === failure);
  assert.equal(calls, 0);
  assert.deepEqual(await platform.authenticate({ cloudEnv: 'production', functionName: 'game-login' }), { fromServer: true });
  assert.equal(initializations, 2);
  assert.equal(calls, 1);
});

test('cloud call failures retain their original details and retry without unnecessary initialization', async () => {
  const failure = { errCode: -502001, errMsg: 'function unavailable' };
  let initializations = 0;
  let calls = 0;
  const platform = wechatPlatform({ cloud: {
    init() { initializations += 1; },
    async callFunction() {
      calls += 1;
      if (calls === 1) throw failure;
      return { result: { authenticatedByServer: true } };
    },
  } });
  await assert.rejects(platform.authenticate({ cloudEnv: 'production', functionName: 'game-login' }), error => error === failure);
  assert.deepEqual(await platform.authenticate({ cloudEnv: 'production', functionName: 'game-login' }), { authenticatedByServer: true });
  assert.equal(initializations, 1);
  assert.equal(calls, 2);
});

test('missing cloud support or environment rejects instead of creating a local identity', async () => {
  let initialized = false;
  let called = false;
  const usableCloud = {
    init() { initialized = true; },
    callFunction() { called = true; return Promise.resolve({ result: { user: { id: 'fake' } } }); },
  };
  const cases = [
    { api: {}, cloudEnv: 'production' },
    { api: { cloud: {} }, cloudEnv: 'production' },
    { api: { cloud: usableCloud }, cloudEnv: '' },
  ];
  for (const { api, cloudEnv } of cases) {
    await assert.rejects(wechatPlatform(api).authenticate({ cloudEnv, functionName: 'game-login' }), /云登录当前不可用/);
  }
  assert.equal(initialized, false);
  assert.equal(called, false);
});

test('sharing registers and removes the exact menu handler and does not claim delivery via callbacks', async () => {
  let registered;
  let removed;
  const menus = [];
  const requests = [];
  const platform = wechatPlatform({
    showShareMenu(options) { menus.push(options); },
    onShareAppMessage(handler) { registered = handler; },
    offShareAppMessage(handler) { removed = handler; },
    shareAppMessage(options) { requests.push(options); },
  });
  const dispose = platform.enableShare();
  assert.deepEqual(menus, [{ menus: ['shareAppMessage'] }]);
  assert.equal(typeof registered, 'function');
  const metadata = registered();
  assert.equal(typeof metadata.title, 'string');
  assert.ok(metadata.title.length > 0);
  assert.equal(typeof metadata.imageUrl, 'string');
  assert.equal(await platform.share(), undefined, 'resolved value only means the share UI was requested');
  assert.deepEqual(requests, [metadata]);
  for (const key of ['success', 'fail', 'complete']) {
    assert.equal(Object.hasOwn(metadata, key), false);
    assert.equal(Object.hasOwn(requests[0], key), false);
  }
  dispose();
  assert.equal(removed, registered);
});

test('unsupported sharing rejects rather than fabricating a successful request', async () => {
  const platform = wechatPlatform();
  const dispose = platform.enableShare();
  assert.doesNotThrow(dispose);
  await assert.rejects(platform.share(), /不支持分享/);
});

test('repeated unlock gestures keep one BGM playing while lifecycle and mute changes can resume it', () => {
  const platform = audioPlatform();
  const audio = new AudioManager(platform);
  const sound = new SoundService(audio);
  try {
    sound.unlock();
    sound.unlock();
    sound.unlock();
    assert.equal(platform.contexts.length, 1);
    const bgm = platform.contexts[0];
    assert.equal(bgm.loop, true);
    assert.equal(bgm.plays, 1);
    audio.pauseAll();
    audio.resumeAll();
    sound.unlock();
    assert.equal(bgm.plays, 2);
    sound.setMuted(true);
    sound.unlock();
    assert.equal(bgm.plays, 2);
    sound.setMuted(false);
    sound.unlock();
    assert.equal(bgm.plays, 3);
    assert.deepEqual(bgm.seeks, [], 'looping BGM must not rewind on gestures');
  } finally { audio.destroy(); }
});

for (const mode of ['throw', 'reject', 'event']) {
  test(`a later unlock retries BGM after an initial ${mode} playback failure without restarting successful playback`, async () => {
    const platform = audioPlatform();
    const audio = new AudioManager(platform);
    const sound = new SoundService(audio);
    const failure = new Error(`${mode} playback unavailable`);
    platform.nextFailure = { mode, error: failure };
    try {
      sound.unlock();
      await Promise.resolve();
      assert.deepEqual(platform.errors, [failure]);
      assert.equal(platform.contexts[0].plays, 1);
      sound.unlock();
      assert.equal(platform.contexts[0].plays, 2);
      sound.unlock();
      assert.equal(platform.contexts[0].plays, 2);
      assert.equal(platform.contexts.length, 1);
    } finally { audio.destroy(); }
  });
}

test('repeated collect effects reuse the context and rewind so each collection is audible', () => {
  const platform = audioPlatform();
  const audio = new AudioManager(platform);
  const sound = new SoundService(audio);
  try {
    sound.collect();
    sound.collect();
    sound.collect();
    assert.equal(platform.contexts.length, 1);
    const collect = platform.contexts[0];
    assert.equal(collect.loop, false);
    assert.equal(collect.plays, 3);
    assert.deepEqual(collect.seeks, [0, 0]);
  } finally { audio.destroy(); }
});
