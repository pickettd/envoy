'use strict';

// helper function to find credentials from environment variables
function getCredentials(startOpts) {
  if (!startOpts) {
    startOpts = {};
  }
  var production = (process.env.PRODUCTION === 'true')?true:false;
  var opts = {
    couchHost: process.env.COUCH_HOST || startOpts.couchHost || null,
    databaseName: process.env.ENVOY_DATABASE_NAME || startOpts.databaseName || 'envoy',
    usersDatabaseName: process.env.ENVOY_USERS_DATABASE_NAME || startOpts.usersDatabaseName || 'envoyusers',
    logFormat: process.env.LOG_FORMAT || startOpts.logFormat || 'off',
    port: process.env.PORT || startOpts.port || 8000,
    url: null,
    production: production || startOpts.production || false,
    static: process.env.ENVOY_STATIC || startOpts.static || null,
    router: startOpts.router || null,
    middleware: startOpts.middleware || [],
    backupHost: process.env.BACKUP_HOST || startOpts.couchHost || null
  };

  if (process.env.VCAP_SERVICES) {

    // this will throw an exception if VCAP_SERVICES is not valid JSON
    var services = JSON.parse(process.env.VCAP_SERVICES);

    // extract Cloudant credentials from VCAP_SERVICES
    if (!opts.couchHost  &&
        Array.isArray(services.cloudantNoSQLDB) &&
        services.cloudantNoSQLDB.length >0 &&
        typeof services.cloudantNoSQLDB[0].credentials === 'object') {
      var bluemixOpts = services.cloudantNoSQLDB[0].credentials;
      opts.couchHost = 'https://' +
        encodeURIComponent(bluemixOpts.username) + ':' +
        encodeURIComponent(bluemixOpts.password) + '@' +
        encodeURIComponent(bluemixOpts.username) + '.cloudant.com';
    }

    // bluemix/cloudfoundry config
    var cfenv = require('cfenv');
    var appEnv = cfenv.getAppEnv();
    opts.port = appEnv.port;
    opts.url = appEnv.url;

  }

  // piecemeal environment variables
  if (!opts.url) {
    opts.url = 'localhost:' + opts.port;
  }
  if (!opts.couchHost || !opts.port) {
    throw('Missing env variable - ' +
          'must supply COUCH_HOST & PORT');
  }
  if (typeof opts.port === 'string' && parseInt(opts.port,10).toString() !== opts.port) {
    throw new Error ('port ' + opts.port + ' must be an integer');
  }

  return opts;
}

module.exports = {
  getCredentials: getCredentials
};
