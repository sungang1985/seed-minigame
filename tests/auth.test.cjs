const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const AuthService = require('../minigame/src/services/AuthService');
const { createIdentity } = require('../cloudfunctions/game-login/service');

const context = { APPID: 'wx1234567890abcdef', OPENID: 'trusted-wechat-player' };
const identity = () => createIdentity(context, 1234567890);

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('cloud identity is deterministic, app-scoped and never returns the raw OpenID', () => {
  const expected = createHash('sha256').update(`${context.APPID}:${context.OPENID}`).digest('hex');
  const response = createIdentity(context, 1234);
  assert.deepEqual(response, {
    user: { id: expected, displayName: `星光旅人${expected.slice(0, 4).toUpperCase()}` },
    issuedAt: 1234,
  });
  assert.equal(JSON.stringify(response).includes(context.OPENID), false);
  assert.notEqual(createIdentity({ ...context, APPID: 'wx-other-game' }, 1234).user.id, expected);
  assert.equal(createIdentity(context, 5678).user.id, expected);
});

test('cloud identity rejects missing trusted context and invalid server time', () => {
  for (const invalid of [null, {}, { OPENID: 'player' }, { APPID: 'game' }, { ...context, OPENID: '' }]) {
    assert.throws(() => createIdentity(invalid, 1), { code: 'UNAUTHENTICATED' });
  }
  assert.throws(() => createIdentity(context, NaN), /服务器时间/);
});

test('cloud entry initializes its environment and ignores client-supplied identity', async () => {
  const entry = path.join(__dirname, '../cloudfunctions/game-login/index.js');
  const sdk = {
    DYNAMIC_CURRENT_ENV: 'current-environment',
    init(options) { this.options = options; },
    getWXContext() { return context; },
  };
  const exports = {};
  vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
    exports,
    require(name) {
      if (name === 'wx-server-sdk') return sdk;
      if (name === './service') return { createIdentity };
      throw new Error('Unexpected dependency');
    },
  });
  assert.equal(sdk.options.env, sdk.DYNAMIC_CURRENT_ENV);
  const result = await exports.main({ OPENID: 'forged-player', APPID: 'forged-app', user: { id: 'forged' } });
  assert.equal(result.user.id, identity().user.id);
});

test('browser and unconfigured WeChat never produce a fake successful login', async () => {
  let called = false;
  for (const platform of [
    { kind: 'browser', authenticate() { called = true; } },
    { kind: 'wechat', authenticate() { called = true; } },
    { kind: 'wechat' },
  ]) {
    const auth = new AuthService(platform, { cloudEnv: platform.kind === 'browser' ? 'cloud-env' : '' });
    assert.equal(auth.available, false);
    await assert.rejects(auth.login(), { code: 'AUTH_UNAVAILABLE' });
    assert.equal(auth.status, 'error');
    assert.equal(auth.user, null);
    auth.destroy();
  }
  assert.equal(called, false);
});

test('concurrent login is deduplicated and a valid session remains immutable and in memory', async () => {
  const pending = deferred();
  let calls = 0;
  let requested;
  const auth = new AuthService({
    kind: 'wechat',
    authenticate(options) { calls += 1; requested = options; return pending.promise; },
  }, { cloudEnv: ' cloud-production ', functionName: 'game-login' });
  const states = [];
  const off = auth.onChange(state => states.push(state.status));
  const first = auth.login();
  const second = auth.login();
  assert.equal(first, second);
  assert.equal(auth.status, 'loading');
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.deepEqual(requested, { cloudEnv: 'cloud-production', functionName: 'game-login' });
  pending.resolve(identity());
  const user = await first;
  assert.equal(auth.status, 'authenticated');
  assert.equal(auth.user, user);
  assert.equal(Object.isFrozen(user), true);
  assert.equal(await auth.login(), user);
  assert.equal(calls, 1);
  assert.deepEqual(states, ['loading', 'authenticated']);
  off();
  off();
  auth.logout();
  assert.deepEqual(states, ['loading', 'authenticated']);
  assert.equal(auth.status, 'guest');
  assert.equal(auth.user, null);
});

test('logout cancels a pending login and a late response cannot overwrite a new session', async () => {
  const old = deferred();
  const fresh = deferred();
  const requests = [old, fresh];
  const auth = new AuthService({ kind: 'wechat', authenticate: () => requests.shift().promise }, { cloudEnv: 'cloud-env' });
  const first = auth.login();
  await Promise.resolve();
  auth.logout();
  assert.equal(auth.status, 'guest');
  const rejected = assert.rejects(first, { code: 'AUTH_CANCELLED' });
  const second = auth.login();
  await Promise.resolve();
  const newer = createIdentity({ ...context, OPENID: 'second-user' }, 2222);
  fresh.resolve(newer);
  await second;
  old.resolve(identity());
  await rejected;
  await Promise.resolve();
  assert.equal(auth.status, 'authenticated');
  assert.equal(auth.user.id, newer.user.id);
  auth.destroy();
});

test('network errors reject, notify the view and allow an explicit retry', async () => {
  const failure = new Error('cloud function is unavailable');
  let fail = true;
  const auth = new AuthService({
    kind: 'wechat',
    authenticate() { return fail ? Promise.reject(failure) : Promise.resolve(identity()); },
  }, { cloudEnv: 'cloud-env' });
  await assert.rejects(auth.login(), failure);
  assert.equal(auth.status, 'error');
  assert.equal(auth.error, failure);
  assert.equal(auth.user, null);
  fail = false;
  await auth.login();
  assert.equal(auth.status, 'authenticated');
  assert.equal(auth.error, null);
  auth.destroy();
});

test('invalid cloud responses never become authenticated sessions', async () => {
  const invalid = [
    null,
    { user: { id: 'openid-from-client', displayName: 'Player' }, issuedAt: 1 },
    { user: { id: identity().user.id, displayName: '' }, issuedAt: 1 },
    { user: identity().user, issuedAt: '1234' },
  ];
  for (const response of invalid) {
    const auth = new AuthService({ kind: 'wechat', authenticate: () => response }, { cloudEnv: 'cloud-env' });
    await assert.rejects(auth.login(), { code: 'AUTH_INVALID_RESPONSE' });
    assert.equal(auth.user, null);
    assert.equal(auth.status, 'error');
    auth.destroy();
  }
});

test('a stalled login times out and its late result cannot restore identity', async () => {
  const pending = deferred();
  const auth = new AuthService({ kind: 'wechat', authenticate: () => pending.promise }, { cloudEnv: 'cloud-env', timeout: 10 });
  await assert.rejects(auth.login(), { code: 'AUTH_TIMEOUT' });
  pending.resolve(identity());
  await Promise.resolve();
  assert.equal(auth.status, 'error');
  assert.equal(auth.user, null);
  auth.destroy();
});

test('destroy cancels requests and detaches observers, while observer failures do not block login', async () => {
  const pending = deferred();
  const errors = [];
  const auth = new AuthService({
    kind: 'wechat', authenticate: () => pending.promise, logError: error => errors.push(error),
  }, { cloudEnv: 'cloud-env' });
  let changes = 0;
  auth.onChange(() => { throw new Error('broken view'); });
  auth.onChange(() => { changes += 1; });
  const login = auth.login();
  const cancelled = assert.rejects(login, { code: 'AUTH_CANCELLED' });
  auth.destroy();
  await cancelled;
  pending.resolve(identity());
  await Promise.resolve();
  assert.equal(auth.status, 'guest');
  assert.equal(auth.available, false);
  assert.equal(auth.user, null);
  assert.equal(changes, 2);
  assert.equal(errors.length, 2);
  await assert.rejects(auth.login(), { code: 'AUTH_DESTROYED' });
  auth.logout();
  assert.equal(changes, 2);
});
