'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildRelease, resolveConfig } = require('../scripts/release.cjs');
const { verifyRelease } = require('../scripts/verify-release.cjs');

const APP_ID = 'wx1234567890abcdef';
const CLOUD_ENV = 'game-production-123';

function put(root, filename, content) {
  const destination = path.join(root, filename);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

function fixture(t, config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minigame-release-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  put(root, 'release.config.json', JSON.stringify({
    name: '星星收集', version: '1.1.0', appId: '', cloudEnv: '',
    cloudFunctionName: 'game-login', ...config,
  }));
  put(root, 'project.config.json', JSON.stringify({
    appid: 'touristappid', compileType: 'game', miniprogramRoot: 'minigame/',
    setting: { es6: true, minified: true, urlCheck: true },
  }));
  put(root, 'README.md', '# 星星收集\n');
  put(root, 'docs/release.md', '使用微信开发者工具导入项目，云函数需部署。\n');
  put(root, 'minigame/game.js', "require('./src/config/game');\n");
  put(root, 'minigame/game.json', JSON.stringify({ deviceOrientation: 'portrait' }));
  put(root, 'minigame/src/config/game.js', 'module.exports = { debug: false, assets: [] };\n');
  put(root, 'minigame/src/config/release.js', 'module.exports = {};\n');
  put(root, 'cloudfunctions/game-login/index.js', 'exports.main = async () => ({});\n');
  put(root, 'cloudfunctions/game-login/package.json', JSON.stringify({
    name: 'game-login', version: '1.0.0', main: 'index.js',
    dependencies: { 'wx-server-sdk': '3.0.1' },
  }));
  return root;
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function zipNames(filename) {
  const buffer = fs.readFileSync(filename);
  let end = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { end = offset; break; }
  }
  assert.notEqual(end, -1, 'archive has a ZIP end-of-central-directory record');
  const count = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const names = [];
  for (let index = 0; index < count; index += 1) {
    assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'valid ZIP central-directory entry');
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names.map((name) => name.replace(/^seed-minigame-1\.1\.0\//, ''));
}

test('strict release refuses missing account configuration before creating a release artifact', (t) => {
  const root = fixture(t);
  assert.throws(() => buildRelease({ root, env: {} }), /AppID|appid|appId|cloudEnv|云环境|云开发/i);
  assert.equal(fs.existsSync(path.join(root, 'dist', 'seed-minigame-1.1.0')), false);
});

test('candidate builds an importable package while explicitly reporting missing AppID and cloud environment', (t) => {
  const root = fixture(t);
  const before = fs.readFileSync(path.join(root, 'project.config.json'), 'utf8');
  const result = buildRelease({ root, candidate: true, env: {} });
  assert.equal(result.status.candidate, true);
  assert.equal(result.status.version, '1.1.0');
  assert.equal(result.status.readyForUpload, false);
  assert.ok(result.status.blockers.length >= 2);
  assert.match(JSON.stringify(result.status.blockers), /appid|AppID|appId/);
  assert.match(JSON.stringify(result.status.blockers), /cloudEnv|云环境|云开发/i);
  assert.ok(fs.existsSync(result.zipPath));
  assert.equal(readJson(path.join(result.directory, 'project.config.json')).appid, 'touristappid');
  assert.equal(readJson(path.join(result.directory, 'project.config.json')).cloudfunctionRoot, 'cloudfunctions/');
  assert.equal(readJson(path.join(result.directory, 'RELEASE_STATUS.json')).readyForUpload, false);
  assert.equal(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'), before,
    'packaging must not alter the source project configuration');
  const verification = verifyRelease(result.directory);
  assert.deepEqual(verification.errors, []);
});

test('explicit account options override environment, which overrides the release configuration file', (t) => {
  const root = fixture(t, { appId: 'wxaaaaaaaaaaaaaaaa', cloudEnv: 'file-env' });
  const fromFile = resolveConfig(root, {}, {});
  assert.equal(fromFile.appId, 'wxaaaaaaaaaaaaaaaa');
  assert.equal(fromFile.cloudEnv, 'file-env');
  const fromEnvironment = resolveConfig(root, {}, { WECHAT_APP_ID: APP_ID, WECHAT_CLOUD_ENV: 'environment-env' });
  assert.equal(fromEnvironment.appId, APP_ID);
  assert.equal(fromEnvironment.cloudEnv, 'environment-env');
  const fromOptions = resolveConfig(root, { appId: 'wxbbbbbbbbbbbbbbbb', cloudEnv: 'option-env' },
    { WECHAT_APP_ID: APP_ID, WECHAT_CLOUD_ENV: 'environment-env' });
  assert.equal(fromOptions.appId, 'wxbbbbbbbbbbbbbbbb');
  assert.equal(fromOptions.cloudEnv, 'option-env');
});

test('strict release rejects malformed and all-zero AppIDs instead of falling back to tourist mode', (t) => {
  for (const appId of ['touristappid', 'wx0000000000000000', 'wx1234', 'wx1234567890abcdeg']) {
    const root = fixture(t, { appId, cloudEnv: CLOUD_ENV });
    assert.throws(() => buildRelease({ root, env: {} }), /AppID|appid|appId/i);
  }
});

test('archive contains native source and deployable cloud-function metadata without development or private files', (t) => {
  const root = fixture(t);
  for (const filename of [
    '.env', 'project.private.config.json', 'preview/index.html', 'tests/private.test.cjs',
    'scripts/private.cjs', 'node_modules/private/index.js', 'minigame/.env',
    'minigame/project.private.config.json', 'minigame/.git/config',
    'cloudfunctions/game-login/node_modules/private/index.js', 'artifacts/screenshot.png',
  ]) put(root, filename, 'should never be shipped');
  const result = buildRelease({ root, candidate: true, env: {} });
  const names = zipNames(result.zipPath);
  assert.ok(names.includes('minigame/game.js'));
  assert.ok(names.includes('cloudfunctions/game-login/package.json'));
  assert.ok(names.includes('project.config.json'));
  assert.ok(names.includes('RELEASE_STATUS.json'));
  assert.ok(names.includes('RELEASE_MANIFEST.json'));
  for (const name of names) {
    assert.doesNotMatch(name, /(?:^|\/)(?:node_modules|\.git|artifacts|preview|tests|scripts)(?:\/|$)/);
    assert.doesNotMatch(name, /(?:^|\/)(?:\.env(?:\..*)?|project\.private\.config\.json)$/);
  }
  for (const entry of result.manifest.files) {
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    assert.equal(fs.statSync(path.join(result.directory, entry.path)).size, entry.size);
  }
});

test('invalid version and name values cannot escape the release destination', (t) => {
  for (const config of [{ version: '../escape' }, { version: '1.1.0/escape' }, { name: '../escape' }]) {
    const root = fixture(t, config);
    assert.throws(() => buildRelease({ root, candidate: true, env: {} }));
    assert.equal(fs.existsSync(path.join(root, 'escape')), false);
  }
});

test('release never replaces an existing unrelated directory', (t) => {
  const root = fixture(t);
  const output = path.join(root, 'dist', 'seed-minigame-1.1.0');
  put(root, 'dist/seed-minigame-1.1.0/personal-notes.txt', 'keep me');
  assert.throws(() => buildRelease({ root, candidate: true, env: {} }));
  assert.equal(fs.readFileSync(path.join(output, 'personal-notes.txt'), 'utf8'), 'keep me');
});

test('rebuilding a tool-owned release updates that release while preserving other output folders', (t) => {
  const root = fixture(t);
  const first = buildRelease({ root, candidate: true, env: {} });
  put(root, 'dist/other-project/notes.txt', 'unrelated output');
  put(root, 'minigame/game.js', "require('./src/config/game');\n// next build\n");
  const second = buildRelease({ root, candidate: true, env: {} });
  assert.equal(first.directory, second.directory);
  assert.match(fs.readFileSync(path.join(second.directory, 'minigame/game.js'), 'utf8'), /next build/);
  assert.equal(fs.readFileSync(path.join(root, 'dist/other-project/notes.txt'), 'utf8'), 'unrelated output');
});

test('packaging refuses a referenced missing asset and independent verification detects removed assets', (t) => {
  const root = fixture(t);
  put(root, 'minigame/src/config/game.js', "module.exports = { debug: false, assets: [{key:'hero', type:'image', src:'assets/hero.png'}] };\n");
  assert.throws(() => buildRelease({ root, candidate: true, env: {} }), /hero|资源|asset/i);
  put(root, 'minigame/assets/hero.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const result = buildRelease({ root, candidate: true, env: {} });
  fs.unlinkSync(path.join(result.directory, 'minigame/assets/hero.png'));
  const verification = verifyRelease(result.directory);
  assert.ok(verification.errors.some((error) => /hero|资源|asset/i.test(String(error))));
});

test('configured release uses the supplied real account settings without claiming deployment or review is complete', (t) => {
  const root = fixture(t, { appId: APP_ID, cloudEnv: CLOUD_ENV });
  const result = buildRelease({ root, env: {} });
  const project = readJson(path.join(result.directory, 'project.config.json'));
  assert.equal(project.appid, APP_ID);
  assert.equal(project.compileType, 'game');
  assert.equal(project.miniprogramRoot, 'minigame/');
  assert.equal(project.cloudfunctionRoot, 'cloudfunctions/');
  assert.equal(result.status.candidate, false);
  assert.equal(result.status.readyForUpload, false);
  assert.equal(result.status.configurationValid, true);
  assert.deepEqual(result.status.blockers, []);
  assert.ok(result.status.requiredExternalSteps.length > 0,
    'deployment and device verification remain explicit external steps');
  assert.ok(result.manifest.mainPackageBytes > 0);
  assert.deepEqual(verifyRelease(result.directory, { strict: true }).errors, []);
});

test('a configured cloud-function name is reflected in the deployable function directory', (t) => {
  const root = fixture(t, { appId: APP_ID, cloudEnv: CLOUD_ENV, cloudFunctionName: 'star-login' });
  const result = buildRelease({ root, env: {} });
  assert.ok(fs.existsSync(path.join(result.directory, 'cloudfunctions/star-login/index.js')));
  assert.equal(fs.existsSync(path.join(result.directory, 'cloudfunctions/game-login')), false);
  assert.deepEqual(verifyRelease(result.directory, { strict: true }).errors, []);
});
