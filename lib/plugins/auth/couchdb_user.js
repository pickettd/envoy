'use strict';

var basicAuth = require('basic-auth'),
  USERS_DATABASE_NAME = '_users',
  app = require('../../../app'),
  express = require('express'),
  router = express.Router(),
  usersdb = null;

// create _users database if it doesn't exist already
// called at startup
var init =  function(callback) {
  usersdb = app.cloudant.db.use(USERS_DATABASE_NAME);
  app.cloudant.db.create(USERS_DATABASE_NAME, function(err, body, header) {
    // 201 response == created
    // 412 response == already exists
    if ((err && err.statusCode !== 412) || 
         (!err &&  header.statusCode !== 201)) {
      return callback(err, '[ERR] createUsersDB: please log into your CouchDB Dashboard and create a new database called _users.')
    }
    callback(null, '[OK]  Created _users database');
  });
};

// create a new user - this function is used by the 
// test suite to generate a new user
var newUser = function(username, password, meta, callback) {
  // get the seqence number of the main database. As this is a new user
  // they won't be interested in changes before this sequence number
  // so if we store the 'current' sequence number, we can intercept
  // requests for /db/changes?since=0 for /db/changes?since=x and get
  // the same answer (much more quickly)
  return new Promise(function(resolve, reject) {
    app.cloudant.db.changes(app.dbName, {limit:1, descending:true}, function(err, data) {
      var seq = null;
      if (!err) {
        seq = data.last_seq;
      }
      var user = {
        _id: 'org.couchdb.user:' + username,
        type: 'user',
        name: username,
        roles: [],
        username: username,
        password_scheme: 'simple',
        password: password,
        seq: seq,
        meta: meta
      };
      usersdb.insert(user, function(err, data) {
        if (err) {
          err = { message:err.message};
          reject(err);
        } else {
          resolve(data);
        }
        if (typeof callback === 'function') {
          callback(err, data);
        }
      });
    });
  });
};

// get an existing user by its id
var getUser = function(id, callback) {
  return new Promise(function(resolve, reject) {
    usersdb.get('org.couchdb.user:' + id, function(err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
      if (typeof callback === 'function') {
        callback(err, data);
      };
    });
  });
};

// Express middleware that is the gatekeeper for whether a request is
// allowed to proceed or not. It checks with Cloudant to see if the 
// supplied Basic Auth credentials are correct and issues a session cookie
// if they are. The next request (with a valid cookie), doesn't need to
// hit the users database
var isAuthenticated = function (req, res, next) {
  // extract basic auth
  var user = basicAuth(req);
  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  }

  // if the user has valid session then we're good to go
  // without hitting the _users database again
  if (req.session.user && (req.session.user.name === user.name)) {
    return next();
  }

  // validate user and save to session
  app.cloudant.auth(user.name, user.pass, function(err, data) {
    if (!err && data) {
      req.session.user = data;
      return next();
    } else {
      return unauthorized(res);
    }
  });
};

// the response to requests which are not authorised
var unauthorized = function(res) {
  return res.status(403).end();
};

// allow clients to see if they are logged in or not
router.get('/_auth', isAuthenticated, function(req, res) {
  res.send({ 
    loggedin: req.session.user?true:false,
    username: req.session.user?req.session.user.name:null
  });
});

// and to log out
router.get('/_logout', function(req, res) {
  delete req.session.user;
  res.send({ok: true});
});

module.exports = function() {
  return {
    init: init,
    newUser: newUser,
    getUser: getUser,
    isAuthenticated: isAuthenticated,
    unauthorized: unauthorized,
    routes: router
  };
};
