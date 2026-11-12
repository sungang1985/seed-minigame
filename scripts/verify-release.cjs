'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAIN_PACKAGE_BUDGET = 4 * 1024 * 1024;
const GENERATED_BY = 'seed-minigame-release-v1';
const validAppId = (value) => /^wx[0-9a-fA-F]{16}$/.test(value || '') && !/^wx0{16}$/.test(value);

function listFiles(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`发布包不允许符号链接：${relative}`);
    if (entry.isDirectory()) output.push(...listFiles(absolute, relative));
    else if (entry.isFile()) output.push(relative);
    else throw new Error(`发布包包含不支持的文件类型：${relative}`);
  }
  return output;
}

function verifyRelease(directory, { strict = false } = {}) {
  const errors = [];
  const warnings = [];
  const fail = (message) => errors.push(message);
  const root = path.resolve(directory);
  let files = [];
  try { files = listFiles(root); } catch (error) { fail(error.message); }
  const readJson = (relative) => {
    try { return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')); }
    catch (error) { fail(`${relative} 读取失败：${error.message}`); return null; }
  };
  const loadConfig = (relative, optional = false) => {
    const filename = path.join(root, relative);
    if (optional && !fs.existsSync(filename)) return null;
    try {
      delete require.cache[require.resolve(filename)];
      return require(filename);
    } catch (error) { fail(`${relative} 读取失败：${error.message}`); return null; }
  };
  const requireFile = (relative) => {
    if (!files.includes(relative)) fail(`缺少必需文件：${relative}`);
  };
  for (const relative of ['minigame/game.js', 'minigame/game.json', 'minigame/src/config/game.js',
    'minigame/src/config/release.js', 'project.config.json', 'RELEASE_STATUS.json']) requireFile(relative);
  for (const relative of files) {
    if (/(?:^|\/)(?:node_modules|\.git|artifacts|preview|tests|scripts)(?:\/|$)/.test(relative) ||
        /(?:^|\/)(?:\.env(?:\..*)?|project\.private\.config\.json)$/.test(relative)) {
      fail(`发布包包含开发或私有文件：${relative}`);
    }
  }
  const project = readJson('project.config.json');
  const game = readJson('minigame/game.json');
  const status = readJson('RELEASE_STATUS.json');
  const runtime = loadConfig('minigame/src/config/release.js');
  const config = loadConfig('minigame/src/config/game.js');
  if (project) {
    if (project.compileType !== 'game') fail('project.config.json.compileType 必须为 game');
    if (project.miniprogramRoot !== 'minigame/') fail('代码根目录必须为 minigame/');
    if (project.cloudfunctionRoot !== 'cloudfunctions/') fail('云函数根目录必须为 cloudfunctions/');
    if (!project.setting || project.setting.urlCheck !== true) fail('发布配置必须保留合法域名校验');
    if (strict && !validAppId(project.appid)) fail('缺少有效的真实小游戏 AppID');
  }
  if (game && game.deviceOrientation !== 'portrait') fail('此版本需要竖屏 game.json 配置');
  if (runtime) {
    if (project && runtime.appId !== project.appid) fail('project.config.json AppID 与运行时 release.appId 不一致');
    if (strict && !runtime.cloudEnv) fail('缺少云开发环境 cloudEnv');
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(runtime.cloudFunctionName || '')) fail('无效的云函数名称');
    else {
      requireFile(`cloudfunctions/${runtime.cloudFunctionName}/index.js`);
      requireFile(`cloudfunctions/${runtime.cloudFunctionName}/package.json`);
      const pkg = readJson(`cloudfunctions/${runtime.cloudFunctionName}/package.json`);
      if (pkg && (!pkg.dependencies || typeof pkg.dependencies['wx-server-sdk'] !== 'string')) {
        fail('云函数 package.json 必须声明 wx-server-sdk 依赖');
      }
    }
  }
  if (status) {
    if (status.generatedBy !== GENERATED_BY) fail('发布状态文件缺少受支持的生成器标记');
    if (runtime && (status.version !== runtime.version || status.appId !== runtime.appId || status.cloudEnv !== runtime.cloudEnv)) {
      fail('发布状态与运行时配置不一致');
    }
    if (!Array.isArray(status.blockers)) fail('发布状态缺少 blockers 列表');
    else if (strict && status.blockers.length) fail(`发布配置尚未完成：${status.blockers.join('；')}`);
    if (!Array.isArray(status.requiredExternalSteps) || !status.requiredExternalSteps.length) fail('发布状态必须明确列出外部部署与验收步骤');
    if (status.readyForUpload !== false) fail('自动打包不能证明云部署、真机验收和平台审核已经完成');
  }

  const checkAsset = (src, source) => {
    if (typeof src !== 'string' || !src || /^(?:[A-Za-z]+:|[\/\\])/.test(src) || src.includes('\\')) {
      fail(`${source} 的资源必须是包内相对路径：${String(src)}`); return;
    }
    const absolute = path.resolve(root, 'minigame', src);
    if (!absolute.startsWith(`${path.join(root, 'minigame')}${path.sep}`)) {
      fail(`${source} 的资源路径越界：${src}`); return;
    }
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (!files.includes(relative) || fs.statSync(absolute).size === 0) fail(`${source} 引用的资源不存在或为空：${src}`);
  };
  if (config) {
    if (config.debug !== false) fail('发布包必须关闭 debug');
    if (!Array.isArray(config.assets)) fail('game.assets 必须为资源清单数组');
    else config.assets.forEach((asset) => checkAsset(asset && asset.src, 'game.assets'));
  }
  const audio = loadConfig('minigame/src/config/audio.js', true);
  if (audio) {
    for (const [key, track] of Object.entries(audio)) checkAsset(track && track.src, `audio.${key}`);
  }
  let mainPackageBytes = 0;
  for (const relative of files.filter((filename) => filename.startsWith('minigame/'))) {
    try { mainPackageBytes += fs.statSync(path.join(root, relative)).size; } catch (error) { fail(error.message); }
  }
  if (mainPackageBytes > MAIN_PACKAGE_BUDGET) fail(`小游戏主包超过项目预算 4 MiB：${mainPackageBytes} 字节`);
  warnings.push('4 MiB 为本项目保守体积预算；平台实际限制及发布条件应以微信后台当前提示为准。');
  if (!strict) warnings.push('候选包验证允许账号配置缺失；生产配置检查请使用 --strict。');

  const manifestPath = path.join(root, 'RELEASE_MANIFEST.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = readJson('RELEASE_MANIFEST.json');
    if (!manifest || !Array.isArray(manifest.files)) fail('发布清单格式无效');
    else {
      const expected = new Map(manifest.files.map((entry) => [entry.path, entry]));
      const actual = files.filter((filename) => filename !== 'RELEASE_MANIFEST.json');
      if (expected.size !== manifest.files.length || expected.size !== actual.length) fail('发布清单文件数量与包内容不一致');
      for (const relative of actual) {
        const entry = expected.get(relative);
        const content = fs.readFileSync(path.join(root, relative));
        if (!entry || entry.size !== content.length || entry.sha256 !== crypto.createHash('sha256').update(content).digest('hex')) {
          fail(`发布清单哈希不匹配：${relative}`);
        }
      }
      if (manifest.mainPackageBytes !== mainPackageBytes) fail('发布清单主包体积不一致');
    }
  }
  return { errors, warnings, mainPackageBytes, files };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const directory = args.find((arg) => !arg.startsWith('--'));
  if (!directory) {
    console.error('用法：node scripts/verify-release.cjs dist/seed-minigame-1.1.0 [--strict]');
    process.exitCode = 1;
  } else {
    const result = verifyRelease(directory, { strict });
    for (const warning of result.warnings) console.log(`提示：${warning}`);
    for (const error of result.errors) console.error(`错误：${error}`);
    if (result.errors.length) process.exitCode = 1;
    else console.log(`发布包验证通过：${result.files.length} 个文件，小游戏主包 ${result.mainPackageBytes} 字节。`);
  }
}

module.exports = { verifyRelease, listFiles, validAppId, MAIN_PACKAGE_BUDGET, GENERATED_BY };
