const fs = require('fs');
const path = require('path');
const peerSync = require('../lib/peer_sync');

describe('peer sync resilience', function() {
  function enrich(address, peers, lookup) {
    return new Promise((resolve) => {
      peerSync.enrichPeerRecords(address, peers, lookup, function(warning, records, classification) {
        resolve({warning, records, classification});
      });
    });
  }

  it('enriches a public IPv4 peer when geolocation succeeds', async function() {
    const result = await enrich('8.8.8.8', [{}], (address, cb) => cb(null, {
      country_name: 'United States',
      country_code: 'US'
    }));

    expect(result.warning).toBeNull();
    expect(result.classification.publiclyRoutable).toBeTrue();
    expect(result.records[0].country).toBe('United States');
    expect(result.records[0].country_code).toBe('US');
  });

  it('keeps a public IPv4 peer when geolocation has a network failure', async function() {
    const result = await enrich('1.1.1.1', [{}], (address, cb) => cb(new Error('network down')));

    expect(result.warning).toEqual(jasmine.any(Error));
    expect(result.records[0].country).toBe('');
    expect(result.records[0].country_code).toBe('');
  });

  it('keeps a public IPv4 peer when geolocation returns malformed data', async function() {
    const result = await enrich('9.9.9.9', [{}], (address, cb) => cb(null, {unexpected: true}));

    expect(result.warning).toEqual(jasmine.any(Error));
    expect(result.records[0].country).toBe('');
    expect(result.records[0].country_code).toBe('');
  });

  it('classifies IPv4 loopback without calling geolocation', async function() {
    let called = false;
    const result = await enrich('127.0.0.1', [{}], (address, cb) => {
      called = true;
      cb(null, {});
    });

    expect(called).toBeFalse();
    expect(result.classification.scope).toBe('loopback');
    expect(result.classification.publiclyRoutable).toBeFalse();
  });

  it('classifies private IPv4 without calling geolocation', function() {
    ['10.1.2.3', '172.16.1.2', '172.31.255.254', '192.168.10.20'].forEach((address) => {
      const classification = peerSync.classifyAddress(address);
      expect(classification.scope).toBe('private');
      expect(classification.publiclyRoutable).toBeFalse();
    });
  });

  it('classifies IPv6 loopback without geolocation', function() {
    const classification = peerSync.classifyAddress('::1');
    expect(classification.ipVersion).toBe(6);
    expect(classification.scope).toBe('loopback');
    expect(classification.publiclyRoutable).toBeFalse();
  });

  it('classifies IPv6 link-local and unique-local addresses without geolocation', function() {
    const linkLocal = peerSync.classifyAddress('fe80::1234');
    const uniqueLocal = peerSync.classifyAddress('fd12:3456::1');

    expect(linkLocal.scope).toBe('link-local');
    expect(linkLocal.publiclyRoutable).toBeFalse();
    expect(uniqueLocal.scope).toBe('unique-local');
    expect(uniqueLocal.publiclyRoutable).toBeFalse();
  });

  it('keeps multiple peers when one geolocation lookup fails', async function() {
    const first = await enrich('8.8.4.4', [{address: '8.8.4.4'}], (address, cb) => cb(new Error('timeout')));
    const second = await enrich('1.0.0.1', [{address: '1.0.0.1'}], (address, cb) => cb(null, {
      country_name: 'Australia',
      country_code: 'AU'
    }));

    expect(first.records.length).toBe(1);
    expect(first.records[0].country_code).toBe('');
    expect(second.records.length).toBe(1);
    expect(second.records[0].country_code).toBe('AU');
  });

  it('allows a later peer to enrich after an earlier enrichment failure', async function() {
    const addresses = ['8.8.8.8', '9.9.9.9'];
    const results = [];

    for (const address of addresses) {
      results.push(await enrich(address, [{address}], (current, cb) => {
        if (current === '8.8.8.8')
          cb(new Error('rate limited'));
        else
          cb(null, {country_name: 'Switzerland', country_code: 'CH'});
      }));
    }

    expect(results[0].warning).toEqual(jasmine.any(Error));
    expect(results[1].warning).toBeNull();
    expect(results[1].records[0].country_code).toBe('CH');
  });

  it('serializes blank country metadata safely for the API', async function() {
    const result = await enrich('127.0.0.1', [{address: '127.0.0.1'}], () => {
      throw new Error('geo must not be called');
    });
    const serialized = JSON.parse(JSON.stringify(result.records[0]));

    expect(serialized.country).toBe('');
    expect(serialized.country_code).toBe('');
  });

  it('keeps Network page country handling null-safe', function() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'views', 'network.pug'), 'utf8');

    expect(source).toContain("typeof data['country_code'] === 'string'");
    expect(source).toContain("typeof data['country'] === 'string'");
    expect(source).toContain('countryCode.length > 1');
  });

  it('keeps unusable getpeerinfo results on the failure path', function() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'sync.js'), 'utf8');

    expect(source).toContain('if (Array.isArray(body))');
    expect(source).toContain("console.log('No peers found')");
    expect(source).toContain('exit(2)');
  });

  it('surfaces peer bulk-write failures instead of reporting success', function(done) {
    const Peers = {
      bulkWrite: function() {
        return Promise.reject(new Error('mongo unavailable'));
      }
    };

    peerSync.bulkUpsertPeers(Peers, [{
      address: '8.8.8.8',
      port: '8333',
      protocol: 70015,
      table_type: 'C',
      ipv6: false
    }], {
      batch_size: 100,
      wait_for_bulk_database_save: true
    }, function(err) {
      expect(err).toEqual(jasmine.any(Error));
      expect(err.message).toContain('mongo unavailable');
      done();
    });
  });

  it('surfaces duplicate-cleanup persistence failures', function(done) {
    const Peers = {
      aggregate: function() {
        return Promise.resolve([{ids: ['keep', 'remove']}]);
      },
      bulkWrite: function() {
        return Promise.reject(new Error('cleanup failed'));
      }
    };

    peerSync.removeDuplicatePeersByType(Peers, 'C', true, -1, function(err) {
      expect(err).toEqual(jasmine.any(Error));
      expect(err.message).toContain('cleanup failed');
      done();
    });
  });

  it('recognizes additional non-routable local and reserved ranges', function() {
    [
      ['169.254.1.1', 'link-local'],
      ['0.0.0.0', 'unspecified'],
      ['100.64.0.1', 'shared'],
      ['192.0.2.1', 'reserved'],
      ['2001:db8::1', 'reserved']
    ].forEach(([address, scope]) => {
      const classification = peerSync.classifyAddress(address);
      expect(classification.scope).toBe(scope);
      expect(classification.publiclyRoutable).toBeFalse();
    });
  });
});
