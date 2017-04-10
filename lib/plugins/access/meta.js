var stream = require('stream'),
  express = require('express'),
  auth = require('../../auth'),
  app = require('../../../app'),
	router = express.Router();

// add custom route
router.get('/_auth', auth.isAuthenticated, function(req, res) {
  res.send({ 
             loggedin: true,
             username: req.session.user.name 
           });
});

// adds owner id to an a document id
// e.g. dog becomes glynn-dog
var addOwnerId = function(id, ownerid) {
  return id;
};

// removes ownerid from a document id
// e.g. glynn-dog becomes dog
var removeOwnerId = function(id) {
  return id;
};

var myId = function(id, ownerid) {
  return null;
};

// determines whether a doc object is owned by ownerd
var isMine = function(doc, ownerid) {
  return (doc && doc[app.metaKey] && doc[app.metaKey].ownerid && 
            doc[app.metaKey].ownerid === ownerid);
};

// strips a document of its ownership information
var strip = function(doc) {
  delete doc[app.metaKey];
  return doc;
};

// adds 
var addAuth = function(doc, ownerid) {
  doc[app.metaKey] = { ownerid: ownerid};
  return doc;
};

// stream transformer that removes auth details from documents
var authRemover = function(onlyuser, removeDoc) {
  var firstRecord = true;
  
  
  var stripAuth = function (obj, onlyuser, removeDoc) {
    var addComma = false;
    var chunk = obj;

    // If the line ends with a comma, this would break JSON parsing.
    if (obj.endsWith(',')) {
      chunk = obj.slice(0, -1);
      addComma = true;
    }

    try { 
      var row = JSON.parse(chunk); 
    } catch (e) {
      return obj+'\n'; // An incomplete fragment: pass along as is.
    }

    // when simulating _all_docs with a view, we need to swap out
    // the key to equal the doc._id
    if (row.key && row.id && row.key !== row.id) {
      row.key = row.id;
    }

    // Successfully parsed a doc line. Remove auth field.
    if (row.doc) {      
      if (row.doc[app.metaKey]) {
        var meta = row.doc[app.metaKey];
        if (onlyuser && meta.ownerid && meta.ownerid !== onlyuser) {
          return '';
        }
        strip(row.doc);
      } else {
        // if doc has no metaKey, then it should not be returned
        return '';
      }
    } 
  
    // if we need to remove the doc object
    if (removeDoc) {
      delete row.doc;
    }
  
    // cloudant query doesn't return a .doc
    delete row[app.metaKey];

    // Repack, and add the trailling comma if required
    var retval = JSON.stringify(row);
    if (firstRecord) {
      firstRecord = false;
      return retval+'';
    } else {
      return ',\n'+retval;
    }
  };
  
  var tr = new stream.Transform({objectMode: true});
  tr._transform = function (obj, encoding, done) {
    var data = stripAuth(obj, onlyuser, removeDoc);
    if (data) {
      this.push(data);
    }
    done();
  };
  return tr;
};

module.exports = function() {
  return {
    addOwnerId: addOwnerId,
    removeOwnerId: removeOwnerId,
    myId: myId,
    isMine: isMine,
    strip: strip,
    addAuth: addAuth,
    authRemover: authRemover,
    routes: router
  };
};
