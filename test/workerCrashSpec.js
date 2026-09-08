const fs = require('fs');
const path = require('path');

describe('BadExplorer worker crash guards', function() {
  const databaseSource = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'database.js'),
    'utf8'
  );

  const explorerSource = fs.readFileSync(
    path.join(__dirname, '..', 'lib', 'explorer.js'),
    'utf8'
  );

  it('captures the last-tx entry before asynchronous processing', function() {
    expect(databaseSource).toContain('const tx = txs[i];');
    expect(databaseSource).toContain('if (!tx)');
    expect(databaseSource).toContain('return loop();');
    expect(databaseSource).toContain(
      'get_extracted_by_addresses(show_extracted_by, internal, tx, function(extracted_by_addresses)'
    );
  });

  it('does not dereference txs[i] inside the extracted-by callback', function() {
    const start = databaseSource.indexOf(
      'get_last_txs: function(start, length, min, internal, cb)'
    );
    const end = databaseSource.indexOf(
      'get_last_txs_ajax: function(start, length, min, cb)',
      start
    );

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const section = databaseSource.slice(start, end);

    const callbackStart = section.indexOf(
      'get_extracted_by_addresses(show_extracted_by, internal, tx, function(extracted_by_addresses)'
    );

    expect(callbackStart).toBeGreaterThan(-1);

    const callbackSection = section.slice(callbackStart);

    expect(callbackSection).not.toContain('txs[i].blockindex');
    expect(callbackSection).not.toContain('txs[i].blockhash');
    expect(callbackSection).not.toContain('txs[i].txid');
    expect(callbackSection).not.toContain('txs[i].vout');
    expect(callbackSection).not.toContain('txs[i].total');
    expect(callbackSection).not.toContain('txs[i].timestamp');
    expect(callbackSection).not.toContain('txs[i].algo');
  });

  it('retains rpcCommand input guards already present in reconciled main', function() {
    expect(explorerSource).toContain('if (!Array.isArray(params))');
    expect(explorerSource).toContain('if (!params[0] || !params[0].method)');
    expect(explorerSource).toContain(
      'params = [{method: params.method, parameters: params.parameters || []}]'
    );
  });
});
