const fs = require('fs');
const path = require('path');

describe('settings loader diagnostics', () => {
  const settingsFile = path.resolve(__dirname, '..', 'lib', 'settings.js');
  const configuredPath = '/etc/badexplorer/settings.json';
  const exampleSettings = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'settings.example.json'), 'utf8'));

  function loadWith(options = {}) {
    const originalExistsSync = fs.existsSync;
    const originalReadFileSync = fs.readFileSync;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalExit = process.exit;
    const warnings = [];
    const errors = [];
    let loaded;
    let thrown;

    fs.existsSync = function(filename) {
      if (filename === configuredPath)
        return options.exists !== false;
      return originalExistsSync.apply(fs, arguments);
    };

    fs.readFileSync = function(filename) {
      if (filename === configuredPath) {
        if (options.readError)
          throw options.readError;
        return options.contents == null ? '{}' : options.contents;
      }
      return originalReadFileSync.apply(fs, arguments);
    };

    console.warn = (message) => warnings.push(String(message));
    console.error = (message) => errors.push(String(message));
    process.exit = (code) => {
      const error = new Error('process.exit(' + code + ')');
      error.exitCode = code;
      throw error;
    };

    try {
      delete require.cache[require.resolve(settingsFile)];
      loaded = require(settingsFile);
    } catch (error) {
      thrown = error;
    } finally {
      fs.existsSync = originalExistsSync;
      fs.readFileSync = originalReadFileSync;
      console.warn = originalWarn;
      console.error = originalError;
      process.exit = originalExit;
      delete require.cache[require.resolve(settingsFile)];
    }

    return { loaded, thrown, warnings, errors };
  }

  it('reports the configured path when the settings file is missing', () => {
    const result = loadWith({ exists: false });
    expect(result.thrown).toBeUndefined();
    expect(result.warnings).toContain(
      'The /etc/badexplorer/settings.json file is missing. Continuing using defaults'
    );
  });

  it('distinguishes a read failure without leaking exception text', () => {
    const readError = new Error('SECRET_CONTENT_SHOULD_NOT_LEAK');
    readError.code = 'EACCES';
    const result = loadWith({ readError });
    const output = result.warnings.join('\n');
    expect(result.thrown).toBeUndefined();
    expect(output).toContain(
      'Unable to read settings file /etc/badexplorer/settings.json (EACCES). Continuing using defaults'
    );
    expect(output).not.toContain('SECRET_CONTENT_SHOULD_NOT_LEAK');
  });

  it('distinguishes processing failure and preserves fatal behavior without leaking contents', () => {
    const result = loadWith({ contents: '{"coin":"SECRET_CONTENT_SHOULD_NOT_LEAK"' });
    const output = result.errors.join('\n');
    expect(result.thrown).toBeDefined();
    expect(result.thrown.exitCode).toBe(1);
    expect(output).toContain(
      'There was an error processing the /etc/badexplorer/settings.json file: SyntaxError'
    );
    expect(output).not.toContain('SECRET_CONTENT_SHOULD_NOT_LEAK');
  });

  it('does not treat a modern object-valued coin section as deprecated', () => {
    const result = loadWith({
      contents: JSON.stringify({ ...exampleSettings, coin: { ...exampleSettings.coin } })
    });
    expect(result.thrown).toBeUndefined();
    expect(result.loaded.coin.name).toBe('Badcoin');
    expect(result.loaded.coin.symbol).toBe('BAD');
    expect(result.loaded.coin.max_supply).toBe(21000000000);
    expect(result.warnings.some((message) =>
      message.includes("Deprecated setting 'coin'")
    )).toBeFalse();
  });

  it('maps a legacy scalar coin value to coin.name', () => {
    const result = loadWith({ contents: JSON.stringify({ ...exampleSettings, coin: 'LegacyCoin' }) });
    expect(result.thrown).toBeUndefined();
    expect(result.loaded.coin.name).toBe('LegacyCoin');
    expect(result.loaded.coin.symbol).toBe('BAD');
    expect(result.loaded.coin.max_supply).toBe(21000000000);
    expect(result.warnings.some((message) =>
      message.includes("Deprecated setting 'coin'") && message.includes("'coin.name'")
    )).toBeTrue();
  });

  it('keeps Badcoin-safe runtime defaults explicit', () => {
    const result = loadWith({ exists: false });
    expect(result.thrown).toBeUndefined();
    expect(result.loaded.coin.name).toBe('Badcoin');
    expect(result.loaded.coin.symbol).toBe('BAD');
    expect(result.loaded.coin.max_supply).toBe(21000000000);
    expect(result.loaded.shared_pages.difficulty).toBe('POW');
  });
});
