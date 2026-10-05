const net = require('net');

function classifyAddress(address) {
  const original = typeof address === 'string' ? address.trim() : '';
  const normalized = original.includes('%') ? original.split('%')[0] : original;
  const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);

  if (mapped) {
    const ipv4 = classifyAddress(mapped[1]);
    return {
      address: original,
      normalized,
      ipVersion: 6,
      scope: ipv4.scope,
      publiclyRoutable: ipv4.publiclyRoutable
    };
  }

  const ipVersion = net.isIP(normalized);

  if (ipVersion === 4) {
    const octets = normalized.split('.').map(Number);
    const [a, b, c, d] = octets;
    let scope = 'public';
    let publiclyRoutable = true;

    if (a === 127) {
      scope = 'loopback';
      publiclyRoutable = false;
    } else if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      scope = 'private';
      publiclyRoutable = false;
    } else if (a === 169 && b === 254) {
      scope = 'link-local';
      publiclyRoutable = false;
    } else if (a === 0 || (a === 255 && b === 255 && c === 255 && d === 255)) {
      scope = 'unspecified';
      publiclyRoutable = false;
    } else if (a >= 224) {
      scope = a <= 239 ? 'multicast' : 'reserved';
      publiclyRoutable = false;
    } else if (a === 100 && b >= 64 && b <= 127) {
      scope = 'shared';
      publiclyRoutable = false;
    } else if (
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      (a === 198 && (b === 18 || b === 19))
    ) {
      scope = 'reserved';
      publiclyRoutable = false;
    }

    return { address: original, normalized, ipVersion, scope, publiclyRoutable };
  }

  if (ipVersion === 6) {
    const lower = normalized.toLowerCase();
    let scope = 'public';
    let publiclyRoutable = true;

    if (lower === '::1') {
      scope = 'loopback';
      publiclyRoutable = false;
    } else if (lower === '::') {
      scope = 'unspecified';
      publiclyRoutable = false;
    } else if (/^fe[89ab]/.test(lower)) {
      scope = 'link-local';
      publiclyRoutable = false;
    } else if (/^f[cd]/.test(lower)) {
      scope = 'unique-local';
      publiclyRoutable = false;
    } else if (/^ff/.test(lower)) {
      scope = 'multicast';
      publiclyRoutable = false;
    } else if (/^2001:db8:/i.test(lower)) {
      scope = 'reserved';
      publiclyRoutable = false;
    }

    return { address: original, normalized, ipVersion, scope, publiclyRoutable };
  }

  return {
    address: original,
    normalized,
    ipVersion: 0,
    scope: original === '' ? 'unspecified' : 'non-ip',
    publiclyRoutable: false
  };
}

function blankCountry(peer) {
  peer.country = '';
  peer.country_code = '';
  return peer;
}

function enrichPeerRecords(address, peers, getGeoLocation, cb) {
  const records = Array.isArray(peers) ? peers : [];
  const classification = classifyAddress(address);

  records.forEach(blankCountry);

  if (!classification.publiclyRoutable)
    return cb(null, records, classification);

  getGeoLocation(address, function(error, geo) {
    if (error)
      return cb(error, records, classification);

    if (
      geo == null ||
      typeof geo !== 'object' ||
      typeof geo.country_name !== 'string' ||
      geo.country_name.trim() === '' ||
      typeof geo.country_code !== 'string' ||
      geo.country_code.trim() === ''
    ) {
      return cb(new Error('geolocation api returned incomplete results'), records, classification);
    }

    records.forEach(function(peer) {
      peer.country = geo.country_name;
      peer.country_code = geo.country_code;
    });

    return cb(null, records, classification);
  });
}

function bulkUpsertPeers(Peers, peerList, syncSettings, cb) {
  const batchSize = syncSettings.batch_size;
  let index = 0;

  if (!Array.isArray(peerList) || peerList.length === 0)
    return cb(null);

  function processNextBatch() {
    if (index >= peerList.length)
      return cb(null);

    const batch = peerList.slice(index, index + batchSize);
    const operations = batch.map(doc => ({
      updateOne: {
        filter: {
          address: doc.address,
          port: doc.port,
          protocol: doc.protocol,
          table_type: doc.table_type,
          ipv6: doc.ipv6
        },
        update: {
          $set: doc,
          $currentDate: { createdAt: true }
        },
        upsert: true
      }
    }));

    index += batchSize;

    let write;
    try {
      write = Peers.bulkWrite(operations, {
        ordered: false,
        writeConcern: {
          w: syncSettings.wait_for_bulk_database_save ? 1 : 0
        }
      });
    } catch (err) {
      return cb(err);
    }

    Promise.resolve(write).then(processNextBatch).catch(cb);
  }

  processNextBatch();
}

function removeDuplicatePeersByType(Peers, tableType, enabled, portFilter, cb) {
  const normalizedPortFilter = (parseInt(portFilter) || -1);

  if (!enabled || normalizedPortFilter !== -1)
    return cb(null);

  Peers.aggregate([
    { $match: { table_type: tableType } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: {
          address: '$address',
          protocol: '$protocol',
          table_type: '$table_type'
        },
        ids: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  ]).then((groups) => {
    if (!groups || !groups.length)
      return cb(null);

    const operations = [];
    groups.forEach((group) => {
      const ids = group.ids || [];
      ids.slice(1).forEach(id => operations.push({ deleteOne: { filter: { _id: id } } }));
    });

    if (!operations.length)
      return cb(null);

    let write;
    try {
      write = Peers.bulkWrite(operations, { ordered: false });
    } catch (err) {
      return cb(err);
    }

    Promise.resolve(write).then(() => cb(null)).catch(cb);
  }).catch(cb);
}

function removeDuplicatePeers(Peers, networkPageSettings, cb) {
  const steps = [
    ['C', networkPageSettings.connections_table],
    ['A', networkPageSettings.addnodes_table],
    ['O', networkPageSettings.onetry_table]
  ];
  let index = 0;

  function next(err) {
    if (err)
      return cb(err);

    if (index >= steps.length)
      return cb(null);

    const [type, table] = steps[index++];
    removeDuplicatePeersByType(Peers, type, table.enabled, table.port_filter, next);
  }

  next(null);
}

module.exports = {
  classifyAddress,
  enrichPeerRecords,
  bulkUpsertPeers,
  removeDuplicatePeers,
  removeDuplicatePeersByType
};
