const fs = require('node:fs');
const path = require('node:path');

function resolveModule(fromFile, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    throw new Error(`浏览器预览仅支持相对路径 require：${specifier} (${fromFile})`);
  }
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`找不到模块 ${specifier}，引用自 ${fromFile}`);
}

function buildBundle(entry) {
  const modules = [];
  const ids = new Map();

  function visit(filename) {
    filename = fs.realpathSync(filename);
    if (ids.has(filename)) return ids.get(filename);
    const id = modules.length;
    ids.set(filename, id);
    const record = { source: '', dependencies: Object.create(null) };
    modules.push(record);
    record.source = fs.readFileSync(filename, 'utf8').replace(/^#![^\n]*\n/, '');
    const requirePattern = /\brequire\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)/g;
    for (const match of record.source.matchAll(requirePattern)) {
      const specifier = match[2];
      record.dependencies[specifier] = visit(resolveModule(filename, specifier));
    }
    return id;
  }

  const entryId = visit(path.resolve(entry));
  const definitions = modules.map(({ source, dependencies }) =>
    `[function(module, exports, require) {\n${source}\n}, ${JSON.stringify(dependencies)}]`
  ).join(',\n');
  return `/* Generated in memory for local preview. */\n(function () {\n'use strict';\nconst modules = [\n${definitions}\n];\nconst cache = Object.create(null);\nfunction load(id) {\n  if (cache[id]) return cache[id].exports;\n  const module = { exports: {} };\n  cache[id] = module;\n  const definition = modules[id];\n  function require(specifier) {\n    if (!Object.prototype.hasOwnProperty.call(definition[1], specifier)) {\n      throw new Error('Unsupported module: ' + specifier);\n    }\n    return load(definition[1][specifier]);\n  }\n  definition[0](module, module.exports, require);\n  return module.exports;\n}\nload(${entryId});\n})();\n`;
}

module.exports = { buildBundle };
