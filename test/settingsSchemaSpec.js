const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const jsonminify = require('jsonminify');

describe('settings schema', () => {
  const root = path.resolve(__dirname, '..');
  const settingsFile = path.join(root, 'lib', 'settings.js');

  function loadRuntimeDefaults() {
    // Evaluate defaults without executing loadSettings(), which deliberately reads the
    // operator configuration. Schema tests must never depend on that external file.
    const source = fs.readFileSync(settingsFile, 'utf8')
      .replace(/exports\.loadSettings\(\);\s*$/, '');
    const module = { exports: {} };
    const localRequire = createRequire(settingsFile);
    vm.runInNewContext(source, {
      module,
      exports: module.exports,
      require: localRequire,
      __filename: settingsFile,
      __dirname: path.dirname(settingsFile),
      console,
      process
    }, { filename: settingsFile });
    delete module.exports.loadSettings;
    delete module.exports.reloadLocale;
    delete module.exports.localization;
    return module.exports;
  }

  function schemaPaths(value, prefix = '', result = new Set()) {
    if (Array.isArray(value)) {
      result.add(prefix);
      const representative = value.find((item) => item && typeof item === 'object');
      if (representative) schemaPaths(representative, `${prefix}[]`, result);
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, child]) => {
        const childPath = prefix ? `${prefix}.${key}` : key;
        if (child && typeof child === 'object') schemaPaths(child, childPath, result);
        else result.add(childPath);
      });
    }
    return result;
  }

  function unexpected(referencePaths, runtimePaths) {
    const extensible = [
      /^labels\.[^.]+\.(enabled|label|type|url)$/,
      /^plugins\.allowed_plugins\[\]\.(plugin_name|enabled)$/,
      /^shared_pages\.page_footer\.social_links\[\]\.(enabled|tooltip_text|url|fontawesome_class|image_path)$/
    ];
    return [...referencePaths].filter((item) =>
      !runtimePaths.has(item) && !extensible.some((pattern) => pattern.test(item))
    );
  }

  it('keeps runtime defaults, template, and strict example structurally aligned', () => {
    const runtime = loadRuntimeDefaults();
    const template = JSON.parse(jsonminify(fs.readFileSync(path.join(root, 'settings.json.template'), 'utf8')));
    const example = JSON.parse(fs.readFileSync(path.join(root, 'settings.example.json'), 'utf8'));
    const runtimePaths = schemaPaths(runtime);
    const templatePaths = schemaPaths(template);
    const examplePaths = schemaPaths(example);

    expect([...runtimePaths].filter((item) => !templatePaths.has(item))).toEqual([]);
    expect([...runtimePaths].filter((item) => !examplePaths.has(item))).toEqual([]);
    expect(unexpected(templatePaths, runtimePaths)).toEqual([]);
    expect(unexpected(examplePaths, runtimePaths)).toEqual([]);
    expect(template.coin.max_supply).toBe(21000000000);
    expect(example.coin.max_supply).toBe(21000000000);
  });

  it('does not restore inherited credential literals', () => {
    const content = ['lib/settings.js', 'settings.json.template', 'settings.example.json']
      .map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
    const inherited = [
      ['Nd', '^p2d77ceBX!L'].join(''),
      ['sSTL', 'yCkrD94Y8&9mr^m6W^Mk367Vr!!K'].join(''),
      ['SJs2=', '&r^ScLGLgTaNm7#74=s?48zf*4+vm5S'].join('')
    ];
    inherited.forEach((literal) => expect(content).not.toContain(literal));
  });
});
