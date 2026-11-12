'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const EventBus = require('../minigame/src/core/EventBus');
const SceneManager = require('../minigame/src/core/SceneManager');
const MenuScene = require('../minigame/src/scenes/MenuScene');
const PlayScene = require('../minigame/src/scenes/PlayScene');
const ResultScene = require('../minigame/src/scenes/ResultScene');

function makeGame({ kind = 'browser', available = false, height = 667, safeTop = 24 } = {}) {
  const values = new Map();
  const sounds = [];
  const notifications = [];
  const game = {
    width: 375, height, safeArea: { top: safeTop, bottom: 20, left: 0, right: 0 },
    config: { release: { version: '1.1.0' } },
    platform: { kind }, events: new EventBus(),
    storage: {
      get(key, fallback) { return values.has(key) ? values.get(key) : fallback; },
      set(key, value) { values.set(key, value); },
    },
    auth: {
      available, status: 'guest', user: null,
      logout() { this.user = null; this.status = 'guest'; },
    },
    sound: {
      muted: false,
      setMuted(value) { this.muted = value; values.set('audio.muted', value); },
    },
    notify(message) { notifications.push(message); },
    shareCount: 0,
    share() { this.shareCount += 1; return Promise.resolve(true); },
  };
  for (const key of ['unlock', 'tap', 'start', 'collect', 'finish']) game.sound[key] = () => sounds.push(key);
  game.scenes = new SceneManager(game);
  game.scenes.register('menu', MenuScene).register('play', PlayScene).register('result', ResultScene);
  game.scenes.change('menu');
  return { game, values, sounds, notifications };
}

function press(game, bounds, type = 'down') {
  game.scenes.onPointer({ type, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, id: 1 });
}

function captureContext() {
  const text = [];
  const arcs = [];
  const stack = [];
  let translation = { x: 0, y: 0 };
  const gradient = { addColorStop() {} };
  return {
    text,
    arcs,
    context: new Proxy({}, {
      get(target, key) {
        if (key === 'fillText') return (value, x, y) => text.push({ value: String(value), x, y });
        if (key === 'save') return () => stack.push({ ...translation });
        if (key === 'restore') return () => { translation = stack.pop(); };
        if (key === 'translate') return (x, y) => { translation.x += x; translation.y += y; };
        if (key === 'arc') return (x, y, radius) => arcs.push({ x: x + translation.x, y: y + translation.y, radius });
        if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
        return key in target ? target[key] : () => {};
      },
    }),
  };
}

test('menu permits guest play and privacy content blocks background controls until closed', () => {
  const { game, sounds } = makeGame();
  const menu = game.scenes.current;
  press(game, menu.layout().privacy);
  assert.equal(menu.privacyOpen, true);
  const canvas = captureContext();
  menu.render(canvas.context);
  assert.ok(canvas.text.some(({ value }) => value.includes('不读取头像、昵称或手机号')));
  assert.ok(canvas.text.some(({ value }) => value.includes('仅保存在本机')));
  press(game, menu.layout().start);
  assert.equal(game.scenes.name, 'menu');
  press(game, menu.layout().closePrivacy);
  assert.equal(menu.privacyOpen, false);
  press(game, menu.layout().start);
  assert.equal(game.scenes.name, 'play');
  assert.equal(game.auth.status, 'guest');
  assert.ok(sounds.includes('start'));
});

test('login loading cannot be submitted twice, failure is explained and the player can retry', async () => {
  const { game, notifications } = makeGame({ kind: 'wechat', available: true });
  let rejectLogin;
  let requests = 0;
  game.auth.login = function () {
    requests += 1;
    this.status = 'loading';
    return new Promise((resolve, reject) => { rejectLogin = reject; }).catch((error) => {
      this.status = 'error';
      throw error;
    });
  };
  const menu = game.scenes.current;
  press(game, menu.layout().login);
  press(game, menu.layout().login);
  assert.equal(requests, 1);
  const canvas = captureContext();
  menu.render(canvas.context);
  assert.ok(canvas.text.some(({ value }) => value === '微信登录中…'));
  rejectLogin(new Error('deployment configuration should stay out of player messages'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(notifications, ['登录暂时不可用，请稍后重试']);

  game.auth.login = function () {
    requests += 1;
    this.status = 'authenticated';
    this.user = { id: 'trusted-player-id', displayName: '星光旅人ABCD' };
    return Promise.resolve(this.user);
  };
  press(game, menu.layout().login);
  await Promise.resolve();
  assert.equal(requests, 2);
  assert.equal(game.auth.status, 'authenticated');
  assert.equal(notifications.at(-1), '登录成功，欢迎回来');
  press(game, menu.layout().login);
  assert.equal(game.auth.status, 'guest');
  assert.equal(notifications.at(-1), '已退出本次登录');
});

test('unavailable login keeps browser and native messages useful without showing configuration', () => {
  const browser = makeGame();
  press(browser.game, browser.game.scenes.current.layout().login);
  assert.deepEqual(browser.notifications, ['请在微信中体验账号登录']);
  const native = makeGame({ kind: 'wechat' });
  press(native.game, native.game.scenes.current.layout().login);
  assert.deepEqual(native.notifications, ['登录暂时不可用，请稍后重试']);
  assert.equal(native.game.scenes.name, 'menu');
});

test('sound preference is available on the menu and pause screen without advancing the timer', () => {
  const { game, values } = makeGame();
  press(game, game.scenes.current.layout().sound);
  assert.equal(values.get('audio.muted'), true);
  press(game, game.scenes.current.layout().start);
  const play = game.scenes.current;
  play.update(1);
  press(game, play.layout().pause);
  const remaining = play.remaining;
  press(game, play.layout().sound);
  play.update(5);
  assert.equal(values.get('audio.muted'), false);
  assert.equal(play.paused, true);
  assert.equal(play.remaining, remaining);
  press(game, play.layout().resume);
  play.update(1);
  assert.equal(play.remaining, remaining - 1);
});

test('guest can collect, finish, share without a success claim and start a clean new round', async () => {
  const { game, values, sounds, notifications } = makeGame();
  press(game, game.scenes.current.layout().start);
  const play = game.scenes.current;
  const star = play.stars[0];
  play.onPointer({ type: 'down', x: star.x, y: star.y, id: 2 });
  assert.ok(play.score >= 1);
  assert.ok(sounds.includes('collect'));
  const score = play.score;
  play.update(30);
  assert.equal(game.scenes.name, 'result');
  assert.equal(values.get('bestScore'), score);
  assert.ok(sounds.includes('finish'));
  const result = game.scenes.current;
  press(game, result.layout().share);
  await Promise.resolve();
  assert.equal(game.shareCount, 1);
  assert.equal(notifications.length, 0, 'opening a share sheet does not prove delivery');
  press(game, result.layout().again);
  assert.equal(game.scenes.name, 'play');
  assert.equal(game.scenes.current.score, 0);
  assert.equal(game.scenes.current.remaining, 30);
  assert.notEqual(game.scenes.current, play);
});

test('all views render on short, tall and capsule-safe screens with controls in bounds', () => {
  for (const [height, safeTop] of [[667, 24], [667, 82], [667, 120], [812, 24], [1000, 54]]) {
    const { game } = makeGame({ height, safeTop });
    for (const [name, data] of [['menu', {}], ['play', {}], ['result', { score: 12, best: 20 }]]) {
      game.scenes.change(name, data);
      const scene = game.scenes.current;
      if (name === 'menu') scene.privacyOpen = true;
      if (name === 'play') scene.paused = true;
      const canvas = captureContext();
      scene.render(canvas.context);
      assert.ok(canvas.text.every(({ x, y }) => x >= 0 && x <= game.width && y >= 0 && y <= height),
        `${name} text should stay within ${height}px screen`);
      if (name === 'menu') {
        const intro = canvas.text.find(({ value }) => value.includes('登录用于识别玩家身份'));
        const orbit = canvas.arcs.find(({ x, radius }) => x === game.width / 2 && radius > 10);
        assert.ok(orbit.y - orbit.radius >= intro.y + 16, 'menu orbit should clear the data-use introduction');
        assert.ok(orbit.y + orbit.radius <= scene.layout().guide.y - 12, 'menu orbit should clear the guide card');
      }
      if (name === 'result') {
        const label = canvas.text.find(({ value }) => value === '本次收集 / 颗');
        const record = canvas.text.find(({ value }) => value.startsWith('最高纪录'));
        assert.ok(record.y - label.y >= 22, 'record and score caption need separate text lines');
        assert.ok(scene.layout().again.y - (record.y + 7) >= 24,
          'record glyphs should leave at least 24px before the replay button');
      }
      const controls = name === 'menu' ? ['start', 'login', 'privacy', 'sound', 'closePrivacy']
        : name === 'play' ? ['pause', 'resume', 'finish', 'sound'] : ['again', 'home', 'share'];
      for (const key of controls) {
        const bounds = scene.layout()[key];
        assert.ok(bounds.y >= safeTop && bounds.y + bounds.height <= height - game.safeArea.bottom,
          `${name} ${key} must stay in the safe area`);
      }
    }
  }
});
