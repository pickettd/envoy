'use strict';

var chance = require('chance')(),
  url = require('url'),
  PouchDB = require('pouchdb'),
  env = require('../lib/env.js'),
  auth = require('../lib/auth'),
  app = require('../app');
  

var testUtils = {};
var userCount = 0;

// Delete specified databases
testUtils.cleanup = function (dbs, done) {
  env.getCredentials();

  var num = dbs.length;

  var finished = function() {
    if (--num === 0) {
      done();
    }
  };

  dbs.forEach(function(db) {
    new PouchDB(db).destroy(finished, finished);
  });
};

testUtils.url = function(user, password) {
  
  var e = env.getCredentials();
  return url.format({
    protocol: 'http',
    auth: user + ':' + password,
    host: e.url,
    pathname: 'mbaas'
  });
};

testUtils.uniqueUsername = function() {
  return process.env.MBAAS_DATABASE_NAME + 'user' + userCount++;
};

testUtils.uniqueUserUrl = function() {
  var username = testUtils.uniqueUsername();
  return testUtils.url(username, auth.sha1(username));
};

var makeUser = function() {
  var p = new Promise(function(resolve, reject) {
    var username = testUtils.uniqueUsername();
    var password = 'thepassword';
    var url = testUtils.url(username, password);
    var x = auth.newUser(username, password, function(err, data) {
      if (err) {
        return reject(err);
      }
      resolve(url);
    });
  });
  return p;
}

testUtils.createUser = function(numUsers) {
  numUsers = numUsers || 1;
  return new Promise(function(resolve, reject) {
    if (numUsers === 1) {
      makeUser().then(function(url) {
        resolve(url);
      });
    } else {
      var arr = [];
      for(var i=0; i < numUsers; i++) {
        arr.push(makeUser());
      }
      Promise.all(arr).then(function(results) {
        resolve(results);
      })
    }
  });
};

testUtils.makeDocs = function(count) {
  var docs = [];
  for (var i=0; i<count; i++) {
    docs.push({
      jobid: chance.guid(),
      description: chance.paragraph({sentences: 2}),
      client: {
        firstname: chance.first(),
        lastname: chance.last(),
        address: chance.address(),
        city: chance.city(),
        state: chance.state({full: true}),
        phone: chance.phone(),
        zip: chance.zip(),
        email: chance.email()
      },
      i: i
    });
  }

  return docs;
};

testUtils.makeDocName = function() {
  return 'test_doc_' + new Date().getTime();
};

testUtils.d = function (msg, obj) {
  console.log(msg, JSON.stringify(obj, null, 2));
};

module.exports = testUtils;
