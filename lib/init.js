'use strict';

// This file contains functions that checks the database exists and set
// up the views that need to be in place on the Cloudant side.
//
// Exported functions should take a callback as their sole
// parameter, which will be passed an error (which can be
// null) and an optional result:
//
// callback(err, result)
//
// Calling the callback with a non-null 'err' will terminate
// the startup process.

var url = require('url'),
  app = require('../app'),
  fs = require('fs');

// Read the 'views/' dir, and look for files named 'type-ddoc-view.js' which
// is assumed to be the 'type' function for the view 'view' in the design
// document '_design/ddoc' and try to install this on the remote DB.
// 'type' is either 'map' or 'filters'
function installSystemViews(callback/*(err, result)*/) {
  var ddocs = [];
  try {
    var files = fs.readdirSync('views');
    files.forEach(function (filename) {
      var data = /^([^-]+)-([^-]+)-([^.]+)\.js$/.exec(filename);
      if (!data) {
        callback(true, '[ERR] installSystemViews: unknown '+
          'file "views/'+filename+'". Files should be named '+
          'following the format "ddocname-viewname.js"');
        return;
      }
      var funcType = data[1],
        ddocName = data[2],
        funcName = data[3];

      var func = fs.readFileSync('views/'+filename, 'utf8');
      var ddoc = { _id: '_design/'+ddocName };

      if (funcType === 'map') {
        ddoc.views = { };
        ddoc.views[funcName] = {map: func};
      } else {
        ddoc.filters = { };
        ddoc.filters[funcName] = func;
      }
      ddocs.push(ddoc);
    });
    installView(ddocs, callback);
  } catch(e) {
    callback(null, null);
  }

}
exports.installSystemViews = installSystemViews;

function installView(docs, callback/*(err, result)*/) {
  app.db.bulk({docs: docs}, function (error) {
    if (error) {
      if (error.error === 'conflict') {
        callback(null, '[OK]  installSystemViews: system ' +
          'view already present');
      } else if (error.error === 'invalid_design_doc') {
        callback(true, '[ERR] installSystemViews: map function invalid');
      } else {
        callback(error, '[ERR] installSystemViews: an error occurred');
      }
    } else {
      callback(null, '[OK]  installSystemViews: good');
    }
  });
}

function createDB(callback/*(err, result)*/) {
  var e = app.opts;

  app.cloudant.db.create(e.databaseName, function(err, body, header) {
    // 201 response == created
    // 412 response == already exists
    if(err || (header.statusCode !== 201 && header.statusCode !== 412)) {
      callback(err || body);
      return;
    }

    callback(null, '[OK]  Created database ' + e.databaseName);
  });
}
exports.createDB = createDB;

function verifyDB(callback/*(err, result)*/) {
  var dburl = url.parse(app.db.config.url);
  dburl.pathname = '/' + app.dbName;
  dburl.auth = '';

  // Note that we will always try to create the backup DB (but it might already exist)
  app.couchBackup.db.create(app.opts.databaseName,function(createErr, body, header) {
    // If there was an error, assume the db exists and try to replicate from the backup
    if (createErr) {
      var replicateTo = app.opts.couchHost+'/'+app.opts.databaseName;
      console.log('In init - attempting replication from backup');
      app.backupdb.replicate(replicateTo, function() {
        console.log('Ran replication of backup');
      });
    }
  });

  app.db.get('', function(err) {
    if (err) {
      var errorMsg = '[ERR] verifyDB: ' +
        'please create the database on: ' + dburl.format() +
        '\n\n\t curl -XPUT ' + dburl.format() + ' -u KEY:PASS';

      if (err.statusCode === 404) {
        createDB(function(err) {
          if(err) {
            callback(err.statusCode, errorMsg);
          }
          else {
            callback(null, '[OK]  verifyDB: database found "'+app.dbName + '"');
          }
        });
      }
      else {
        callback(err.statusCode, errorMsg);
      }
    }
    else {
      callback(null, '[OK]  verifyDB: database found "' +
          app.dbName + '"');
    }
  });
}
exports.verifyDB = verifyDB;

function verifySecurityDoc(callback/*(err, result)*/) {
  // NOTE the cloudant library has a get_security() function
  // but due to a bug in wilson it doesn't work when accessed
  // with an API key:
  // https://cloudant.fogbugz.com/f/cases/59877/Wilson-returns-500-when-using-API-key

  app.cloudant.request({
    db: app.dbName,
    path: '_security'
  },
  function (error, body) {
    if (error) {
      var dburl = url.parse(app.db.config.url);
      dburl.pathname = '/' + app.dbName;
      dburl.auth = '';
      callback(error.statusCode, '[ERR] verifySecurityDoc: ' +
        'Couldn’t confirm security permissions in \n\n\t' +
        dburl.format() + '\n\n' +
        JSON.stringify(error) + '\n\n' +
        body + '\n\n\t' +
        'Please check permissions for the ' +
        'specified key. Admin rights required.');
    } else {
      callback(null, '[OK]  verifySecurityDoc: permissions good');
    }
  });
}

exports.verifySecurityDoc = verifySecurityDoc;

// ensure we are using a Cloudant instance that has POST /db/_bulk_get 
exports.verifyBulkGet = function(callback) {
  app.cloudant.request({
    method: 'get',
    db: app.dbName,
    path: '_bulk_get'
  }, function(err, body) {
    // if the cluster supports POST /db/_bulk_get then it will reply with
    // a 405 (Method not supported) when pinged with GET /db/_bulk_get.
    // Clusters without POST /db/_bulk_get will respond with 404
    if (err && err.statusCode === 405) {
      return callback(null, '[OK]  verifyBulkGet: _bulk_get present');
    }
    return callback(true, '[OK]  verifyBulkGet: If you\'re using Cloudant, contact support@cloudant.com and ask for your Cloudant account to migrated to the Porter or Sling clusters. Apache CouchDB users should ensure they\'re using the very latest CouchDB code > 2.0');
  });
};