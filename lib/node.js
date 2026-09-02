var rpc = require('./jsonrpc');

function Client(opts) {
  this.rpc = new rpc.Client(opts);
};

Client.prototype.cmd = function() {
  var args = [].slice.call(arguments);
  var cmd = args.shift();

  callRpc(cmd, args, this.rpc);
};

function callRpc (cmd, args, rpc) {
  var fn = args[args.length - 1];
  var called = false;

  // if the last argument is a callback, pop it from the args list
  if (typeof fn === 'function')
    args.pop();
  else
    fn = function () {};

  function done() {
    if (called)
      return;
    called = true;
    fn.apply(this, arguments);
  }

  rpc.call(cmd, args, function () {
    var cb_args = [].slice.call(arguments);
    cb_args.unshift(null);
    done.apply(this, cb_args);
  }, function(err) {
    done(err);
  });
};

module.exports.Client = Client;