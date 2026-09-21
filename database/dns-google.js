// Only needed when your computer's own DNS can't look up the database's address
// (errors like "getaddrinfo ENOTFOUND" or "EAI_AGAIN ... proxy.rlwy.net") and you
// can't change the Windows DNS settings.
//
// It makes Node look names up through Google's public DNS (8.8.8.8 / 1.1.1.1)
// instead of the computer's default one. It changes nothing on your computer and
// only affects the command it is attached to. Names it can't find this way still
// fall back to the normal lookup, and plain IP addresses / localhost are untouched.
//
// PowerShell (this window only):
//   $env:NODE_OPTIONS = "--require ./database/dns-google.js"
//   npm run migrate
// When done, either close the window or:  Remove-Item Env:NODE_OPTIONS
//
// Or for a single command:
//   node -r ./database/dns-google.js database/migrate.js

const dns = require('dns');
const net = require('net');

const resolver = new dns.Resolver();
resolver.setServers(['8.8.8.8', '1.1.1.1']);

const originalLookup = dns.lookup;

dns.lookup = function lookupViaGoogle(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (typeof options === 'number') options = { family: options };
  options = options || {};

  // IPs, localhost and empty names: nothing to look up.
  if (!hostname || net.isIP(hostname) || hostname === 'localhost') {
    return originalLookup.call(dns, hostname, options, callback);
  }

  resolver.resolve4(hostname, (err, addresses) => {
    if (err || !addresses || addresses.length === 0) {
      // Not found through Google (or an IPv6-only name): use the normal lookup.
      return originalLookup.call(dns, hostname, options, callback);
    }
    if (options.all) {
      return callback(null, addresses.map((address) => ({ address, family: 4 })));
    }
    return callback(null, addresses[0], 4);
  });
};
