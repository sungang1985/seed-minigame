'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AudioManager = require('../minigame/src/services/AudioManager');

function fixture({ seek = true } = {}) {
  const contexts = [];
  const errors = [];
  const platform = {
    logError(error) { errors.push(error); },
    createAudio() {
      const calls = [];
      const context = {
        calls,
        play() { calls.push(['play']); },
        pause() { calls.push(['pause']); },
        stop() { calls.push(['stop']); },
        destroy() { calls.push(['destroy']); },
        onError(listener) { this.error = listener; },
        onEnded(listener) { this.ended = listener; },
      };
      if (seek) context.seek = (seconds) => calls.push(['seek', seconds]);
      contexts.push(context);
      return context;
    },
  };
  return { audio: new AudioManager(platform), contexts, errors };
}

test('repeated collect effects reuse one context and replay from the beginning, including after completion', () => {
  const { audio, contexts } = fixture();
  const context = audio.play('collect', 'assets/audio/collect.wav');
  audio.play('collect', 'assets/audio/collect.wav');
  context.ended();
  audio.play('collect', 'assets/audio/collect.wav');
  assert.equal(contexts.length, 1);
  assert.deepEqual(context.calls, [['play'], ['seek', 0], ['play'], ['seek', 0], ['play']]);
  audio.destroy();
});

test('one-shot replay falls back to stop when the audio platform has no seek method', () => {
  const { audio } = fixture({ seek: false });
  const context = audio.play('tap', 'assets/audio/tap.wav');
  audio.play('tap', 'assets/audio/tap.wav');
  assert.deepEqual(context.calls, [['play'], ['stop'], ['play']]);
  audio.destroy();
});

test('requesting the active background loop again changes volume without restarting playback', () => {
  const { audio } = fixture();
  const context = audio.play('bgm', 'assets/audio/bgm.wav', { loop: true, volume: 0.2 });
  audio.play('bgm', 'assets/audio/bgm.wav', { loop: true, volume: 0.35 });
  assert.deepEqual(context.calls, [['play']]);
  assert.equal(context.volume, 0.35);
  audio.pauseAll();
  audio.play('bgm', 'assets/audio/bgm.wav', { loop: true });
  assert.deepEqual(context.calls, [['play'], ['pause']]);
  audio.resumeAll();
  audio.play('bgm', 'assets/audio/bgm.wav', { loop: true });
  assert.deepEqual(context.calls, [['play'], ['pause'], ['play']]);
  audio.destroy();
});

test('a failed background play can be retried on the next user gesture', async () => {
  const { audio, errors } = fixture();
  const context = audio.play('bgm', 'assets/audio/bgm.wav', { loop: true });
  const blocked = new Error('user gesture required');
  context.error(blocked);
  audio.play('bgm', 'assets/audio/bgm.wav', { loop: true });
  assert.equal(context.calls.filter(([method]) => method === 'play').length, 2);
  assert.deepEqual(errors, [blocked]);

  audio.pauseAll();
  context.play = () => Promise.reject(blocked);
  audio.resumeAll();
  await new Promise((resolve) => setImmediate(resolve));
  context.play = () => context.calls.push(['play']);
  audio.play('bgm', 'assets/audio/bgm.wav', { loop: true });
  assert.equal(context.calls.filter(([method]) => method === 'play').length, 3);
  audio.destroy();
});

test('mute and app pause remain independent when a background loop is requested repeatedly', () => {
  const { audio } = fixture();
  const context = audio.play('bgm', 'assets/audio/bgm.wav', { loop: true });
  audio.setMuted(true);
  audio.pauseAll();
  audio.setMuted(false);
  audio.play('bgm', 'assets/audio/bgm.wav', { loop: true });
  assert.equal(context.calls.filter(([method]) => method === 'play').length, 1);
  audio.resumeAll();
  audio.play('bgm', 'assets/audio/bgm.wav', { loop: true });
  assert.equal(context.calls.filter(([method]) => method === 'play').length, 2);
  audio.destroy();
});
