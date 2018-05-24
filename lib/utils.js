'use strict';

var stream = require('stream');

var sendError = function (err, res) {
  console.error(err);
  res.status(err.statusCode).send({
    error: err.error,
    reason: err.reason
  });
};


// stream transformer that breaks incoming chunks into lines
var liner = function() {

  var liner = new stream.Transform({objectMode: true});
   
  liner._transform = function (chunk, encoding, done) {
    var data = chunk.toString('utf8');
    if (this._lastLineData) {
      data = this._lastLineData + data;
      this._lastLineData = null;
    }
     
    var lines = data.split(/\s*\n/);
    this._lastLineData = lines.splice(lines.length-1,1)[0];
    lines.forEach(this.push.bind(this));
    done();
  };
   
  liner._flush = function (done) {
    this.push(this._lastLineData);
    this._lastLineData = null;
    done();
  };

  return liner;
};

module.exports = {
  sendError: sendError,
  liner: liner
};
