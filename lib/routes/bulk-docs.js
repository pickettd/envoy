'use strict';

var express = require('express'),
  router = express.Router(),
  app = require('../../app'),
  access = require('../access'),
  utils = require('../utils'),
  uuid = require('uuid'),
  auth = require('../auth');

var filterReply = function(reply) {
  for (var i in reply) {
    reply[i] = access.strip(reply[i]);
  }
  return reply;
};

// _bulk_docs
router.post('/' + app.dbName + '/_bulk_docs', auth.isAuthenticated, function(req, res) {

  var newEdits = typeof req.body.new_edits === 'undefined' ? true : req.body.new_edits;

  // Iterate through docs, adding uuids when missing and adding owner ids
  var doclist = req.body.docs;
  if (req.body && req.body.docs && req.body.docs.length) {
    doclist = req.body.docs.map(function(doc) {
      if (typeof doc === 'object') {
        if (doc._id) {
          doc._id = access.addOwnerId(doc._id, req.session.user.name);
        } else {
          doc._id = access.addOwnerId(uuid.v4(), req.session.user.name);
        }
      }
      return doc;
    });
  }

  if (req.body && req.body.docs && req.body.docs.length && (req.body.docs.length > 11000)) {
    if (req.headers && req.headers['content-length']) {
      console.log('content-length is '+ req.headers['content-length']);
      console.log('docs length is '+req.body.docs.length);
    }
  }

  app.db.bulk({docs: doclist, new_edits: newEdits}, function(err, body) {
    if (err) {
      console.log('Problem writing bulk to primary db, trying backup');
      // We can't count on the backup server having this db yet, so try creating
      app.couchBackup.db.create(app.opts.databaseName,function(err2, body2, header2) {
        app.backupdb.bulk({docs: doclist, new_edits: newEdits}, function(err3, body3) {
          console.log('Backup bulk returned, trying to start replication from backup to main');
          // Then we want to try to replicate from backup to main
          var replicateTo = app.opts.couchHost+'/'+app.opts.databaseName;
          app.backupdb.replicate(replicateTo);
          if (err3) {
            return utils.sendError(err3, res);
          }
          else {
            console.log('Wrote bulk to backupHost with no error');
          }
          res.send(filterReply(body3));
        });
      });
    }
    else {
      console.log('Wrote to bulk with no error');
      res.send(filterReply(body));
    }
  });

});

module.exports = router;
