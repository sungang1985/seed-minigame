const test = require('node:test');
const assert = require('node:assert/strict');
const Storage = require('../minigame/src/services/Storage');
const ResourceManager = require('../minigame/src/services/ResourceManager');
const AudioManager = require('../minigame/src/services/AudioManager');
const Request = require('../minigame/src/services/Request');

function createStoragePlatform() {
  const values = new Map();
  return {
    values,
    getStorage: key => values.get(key),
    setStorage: (key, value) => values.set(key, value),
    removeStorage: key => values.delete(key),
  };
}

function createImagePlatform({ automatic = false } = {}) {
  const images = [];
  return {
    images,
    createImage() {
      const image = {};
      Object.defineProperty(image, 'src', {
        get() { return this.source; },
        set(value) {
          this.source = value;
          if (automatic) queueMicrotask(() => this.onload());
        },
      });
      images.push(image);
      return image;
    },
  };
}

function createAudioPlatform() {
  const contexts = [];
  const errors = [];
  return {
    contexts,
    errors,
    logError(error) { errors.push(error); },
    createAudio() {
      const context = {
        plays: 0,
        pauses: 0,
        stops: 0,
        destroys: 0,
        play() { this.plays += 1; },
        pause() { this.pauses += 1; },
        stop() { this.stops += 1; },
        destroy() { this.destroys += 1; },
        onError(listener) { this.errorListener = listener; },
        onEnded(listener) { this.endedListener = listener; },
      };
      contexts.push(context);
      return context;
    },
  };
}

test('Storage preserves falsy values and isolates namespaces', () => {
  const platform = createStoragePlatform();
  const one = new Storage(platform, 'one');
  const two = new Storage(platform, 'two');
  for (const value of [0, false, '']) {
    assert.equal(one.set('value', value), true);
    assert.equal(one.get('value', 'fallback'), value);
    assert.equal(two.get('value', 'fallback'), 'fallback');
  }
  one.set('nil', null);
  assert.equal(one.get('nil', 'fallback'), 'fallback');
  assert.equal(one.get('missing', 'fallback'), 'fallback');
  assert.equal(one.remove('value'), true);
  assert.equal(one.get('value', 'fallback'), 'fallback');
});

test('Storage reports platform errors and returns safe fallback values', () => {
  const failures = [];
  const failure = new Error('storage unavailable');
  const storage = new Storage({
    getStorage() { throw failure; },
    setStorage() { throw failure; },
    removeStorage() { throw failure; },
    logError(error) { failures.push(error); },
  });
  assert.equal(storage.get('score', 12), 12);
  assert.equal(storage.set('score', 12), false);
  assert.equal(storage.remove('score'), false);
  assert.equal(failures.length, 3);
});

test('ResourceManager deduplicates images and rejects conflicting resource keys', async () => {
  const platform = createImagePlatform();
  const resources = new ResourceManager(platform);
  const first = resources.loadImage('player', '/player.png');
  const second = resources.loadImage('player', '/player.png');
  await assert.rejects(resources.loadImage('player', '/other.png'));
  assert.equal(platform.images.length, 1);
  platform.images[0].onload();
  const loaded = await Promise.all([first, second]);
  assert.equal(loaded[0], loaded[1]);
  assert.equal(resources.get('player'), loaded[0]);
  assert.equal(await resources.loadImage('player', '/player.png'), loaded[0]);
  assert.equal(platform.images.length, 1);
});

test('ResourceManager propagates load errors and permits a subsequent retry', async () => {
  const platform = createImagePlatform();
  const resources = new ResourceManager(platform);
  const failed = resources.loadImage('player', '/player.png');
  const rejection = assert.rejects(failed);
  await Promise.resolve();
  platform.images[0].onerror(new Error('image unavailable'));
  await rejection;
  assert.equal(resources.get('player'), undefined);
  const retry = resources.loadImage('player', '/player.png');
  await Promise.resolve();
  assert.equal(platform.images.length, 2);
  platform.images[1].onload();
  assert.equal(await retry, platform.images[1]);
});

test('ResourceManager.clear prevents an old request from replacing or deleting a new request', async () => {
  const platform = createImagePlatform();
  const resources = new ResourceManager(platform);
  const oldRequest = resources.loadImage('player', '/player.png');
  await Promise.resolve();
  resources.clear();
  const currentRequest = resources.loadImage('player', '/player.png');
  await Promise.resolve();
  assert.equal(platform.images.length, 2);
  platform.images[0].onload();
  assert.equal(await oldRequest, platform.images[0]);
  assert.equal(resources.get('player'), undefined);
  const sharedRequest = resources.loadImage('player', '/player.png');
  assert.equal(platform.images.length, 2);
  platform.images[1].onload();
  assert.equal(await currentRequest, platform.images[1]);
  assert.equal(await sharedRequest, platform.images[1]);
  assert.equal(resources.get('player'), platform.images[1]);
  resources.clear();
  assert.equal(resources.get('player'), undefined);
});

test('ResourceManager loads a manifest with progress and handles an empty manifest', async () => {
  const platform = createImagePlatform({ automatic: true });
  const resources = new ResourceManager(platform);
  const progress = [];
  const loaded = await resources.load([
    { key: 'player', type: 'image', src: '/player.png' },
    { key: 'star', type: 'image', src: '/star.png' },
  ], (completed, total, entry) => progress.push({ completed, total, key: entry.key }));
  assert.equal(loaded.player, resources.get('player'));
  assert.equal(loaded.star, resources.get('star'));
  assert.deepEqual(progress.map(item => item.completed), [1, 2]);
  assert.deepEqual(progress.map(item => item.total), [2, 2]);
  assert.deepEqual(progress.map(item => item.key).sort(), ['player', 'star']);
  assert.deepEqual(Object.keys(await resources.load([])), []);
  await assert.rejects(resources.load([{ key: 'bad', type: 'unknown', src: '/bad' }]));
});

test('AudioManager restores active sounds after a lifecycle pause and never revives stopped sounds', () => {
  const platform = createAudioPlatform();
  const storage = new Storage(createStoragePlatform());
  const audio = new AudioManager(platform, storage);
  const context = audio.play('music', '/music.mp3', { loop: true, volume: 0.35 });
  assert.equal(context, platform.contexts[0]);
  assert.equal(context.src, '/music.mp3');
  assert.equal(context.loop, true);
  assert.equal(context.volume, 0.35);
  assert.equal(context.plays, 1);
  audio.pauseAll();
  assert.equal(context.pauses, 1);
  audio.resumeAll();
  assert.equal(context.plays, 2);
  audio.pauseAll();
  audio.stop('music');
  assert.equal(context.destroys, 1);
  audio.resumeAll();
  assert.equal(context.plays, 2);
});

test('AudioManager persists mute preference, preserves volume and releases contexts', () => {
  const platform = createAudioPlatform();
  const storage = new Storage(createStoragePlatform());
  const audio = new AudioManager(platform, storage);
  const first = audio.play('music', '/music.mp3', { volume: 0.4 });
  audio.setMuted(true);
  assert.equal(audio.muted, true);
  assert.equal(storage.get('audio.muted'), true);
  assert.ok(first.pauses >= 1);
  const silent = audio.play('silent', '/silent.mp3');
  assert.equal(silent.plays, 0);
  audio.setMuted(false);
  assert.equal(audio.muted, false);
  assert.equal(storage.get('audio.muted'), false);
  assert.equal(first.volume, 0.4);
  assert.ok(first.plays >= 2);
  const replacement = audio.play('music', '/other.mp3');
  assert.equal(first.destroys, 1);
  assert.notEqual(replacement, first);
  audio.destroy();
  assert.equal(replacement.destroys, 1);
  assert.equal(silent.destroys, 1);
});

test('AudioManager never replays a completed one-shot sound on lifecycle resume', () => {
  const platform = createAudioPlatform();
  const audio = new AudioManager(platform, new Storage(createStoragePlatform()));
  const context = audio.play('collect', '/collect.mp3');
  assert.equal(context.plays, 1);
  context.endedListener();
  audio.pauseAll();
  audio.resumeAll();
  audio.setMuted(true);
  audio.setMuted(false);
  assert.equal(context.plays, 1);
  audio.destroy();
});

test('AudioManager starts muted from storage and reports asynchronous play failures', async () => {
  const platform = createAudioPlatform();
  const storage = new Storage(createStoragePlatform());
  storage.set('audio.muted', true);
  const audio = new AudioManager(platform, storage);
  const context = audio.play('music', '/music.mp3');
  assert.equal(audio.muted, true);
  assert.equal(context.plays, 0);
  const failure = new Error('autoplay blocked');
  context.play = () => Promise.reject(failure);
  audio.setMuted(false);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(platform.errors.includes(failure));
  const decoderFailure = new Error('decoder failed');
  context.errorListener(decoderFailure);
  assert.ok(platform.errors.includes(decoderFailure));
  audio.destroy();
});

test('Request joins base URL boundaries and forwards request options', async () => {
  const calls = [];
  const response = { statusCode: 200, data: { score: 5 }, header: {} };
  const request = new Request({
    request(options) { calls.push(options); return Promise.resolve(response); },
  }, { baseUrl: 'https://api.example.com/v1/', timeout: 4200 });
  const query = { limit: 10 };
  assert.equal(await request.get('/scores', query), response);
  assert.equal(calls[0].url, 'https://api.example.com/v1/scores');
  assert.equal(calls[0].method, 'GET');
  assert.deepEqual(calls[0].data, query);
  assert.equal(calls[0].timeout, 4200);
  await request.post('scores', { score: 5 });
  assert.equal(calls[1].url, 'https://api.example.com/v1/scores');
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(calls[1].data, { score: 5 });
  await request.request('https://other.example.com/live', {
    method: 'PUT', data: { enabled: true }, header: { 'X-Request-ID': 'test' }, timeout: 100,
  });
  assert.equal(calls[2].url, 'https://other.example.com/live');
  assert.equal(calls[2].method, 'PUT');
  assert.equal(calls[2].timeout, 100);
  assert.equal(calls[2].header['X-Request-ID'], 'test');
});

test('Request rejects non-2xx responses with useful response details', async () => {
  const response = { statusCode: 503, data: { message: 'unavailable' }, header: {} };
  const request = new Request({ request: async () => response });
  await assert.rejects(request.get('/scores'), error => {
    assert.equal(error.statusCode, 503);
    assert.equal(error.data, response.data);
    assert.equal(error.response, response);
    return true;
  });
});

test('Request preserves platform failures instead of fabricating successful data', async () => {
  const failure = new Error('request timed out');
  const request = new Request({ request: async () => { throw failure; } });
  await assert.rejects(request.post('/scores', { score: 5 }), error => error === failure);
});
