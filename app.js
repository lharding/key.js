/**
 * key.js keys/value store demo server. Run using `node app.js`.
 * See README.md for more information.
 */

var config = require('./config');
var app = require('express')();
var kvs = require('./key');
var winston = require('winston');
var morgan = require('morgan');

winston.cli();
winston.level = config.logLevel;

app.use(morgan('common'));

// actually mount and use the key store middleware
app.use('/', kvs(config.keyStoreConfig));

var server = app.listen(config.listenPort, function () {
  var host = server.address().address;
  var port = server.address().port;

  winston.info('key.js KVS server listening at http://%s:%s', host, port);
});
