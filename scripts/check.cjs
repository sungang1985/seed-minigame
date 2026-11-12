const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildBundle } = require('./bundle.cjs');

const root = path.resolve(__dirname, '..');
function filesIn(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(filename) : /\.(c?js)$/.test(filename) ? [filename] : [];
  });
}

try {
  const files = ['minigame', 'scripts', 'tests'].flatMap((name) => filesIn(path.join(root, name)));
  for (const filename of files) {
    const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || `语法检查失败：${filename}`);
  }
  for (const name of ['minigame/game.json', 'project.config.json']) {
    JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  }
  buildBundle(path.join(root, 'minigame', 'game.js'));
  console.log(`检查通过：${files.length} 个 JavaScript 文件、项目 JSON 配置和预览模块依赖。`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
