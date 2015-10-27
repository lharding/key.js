var logger = require('winston');
var express = require('express');

// This way of handling version prefixes may be controversial. I've chosen this
// method to future-proof against the all-too-common case of having to mix
// endpoints for multiple API versions within the same middleware. There is
// an argument to be made for enforcing that different versions exist in
// different middleware and mounting them under the approriate prefix in the
// server, but in my experience various real-world factors often prevent that.
var VERSION_PREFIX='/v1';

module.exports = function(config) {
    var router = express.Router();

    // now that we have our config object, we can actually load and
    // initialize our backing store.
    var store = require(config.dataStore)(config.dataStoreConfig);

    router.use(require('body-parser').json());

    router.get(VERSION_PREFIX+'/all', function(req, res, next) {
        store.getAll().then(function(all) {
            res.send(all);
        });
    });

    router.post(VERSION_PREFIX+'/nuke', function(req, res, next) {
        if(config.allowNuke && req.body && req.body.nuke) {
            logger.warn("DELETING ALL BACKING STORE CONTENT");

            // Directly passing the `next` callback as the Promise's
            // `onRejected` callback works because it gets called with
            // the error that caused the rejection, breaking us out of
            // the routing stack and into express' default error-handling
            // middleware (or any other error handler that's been set),
            // without our having to write (or maintain) any explicit
            // error-handling code.
            // This idiom is repeated for the other endpoints as well.
            store.nuke().then(function() {
                res.send("Deleted all keys.");
            }, next);
        }
        else {
            res.status(400).send("Nuking this store is not allowed or you didn't say the magic word (see README).");
        }
    });

    router.get(VERSION_PREFIX+'/key/:id', function(req, res, next) {
        var key = req.params.id;
        store.get(key).then(function(result) {
            if(result !== undefined) {
                logger.debug('Get of key `%s` successful, returning value:', key, result);
                res.send(result);
            }
            else {
                logger.debug('Key `%s` not found.', key);
                res.status(404).send('No value for key ' + key);
            } 
        }, next);
    });

    router.put(VERSION_PREFIX+'/key/:id', function(req, res, next) {
        // body-parser just leaves us with an empty JSON object if the body
        // isn't JSON, so doublecheck what the client said before doing anything.
        if(!req.is('json')) {
            res.status(400).send('Request type must be `application/json`.');
            return;
        }

        var key = req.params.id;
        var body = req.body;        
        
        logger.debug('Got upsert request: `'+key+'` ->', JSON.stringify(body));

        store.upsert(req.params.id, body).then(function() {
            logger.debug('Upsert of key `'+key+'` successful');
            res.status(201).send('Stored `'+key+'`.');
        }, next);
    });

    router.delete(VERSION_PREFIX+'/key/:id', function(req, res, next) {
        var key = req.params.id;
        store.delete(key).then(function(count) {
            if(count) {
                logger.debug('Delete of key `%s` successful.', key);
                res.send('Deleted ' + key);
            }
            else {
                logger.debug('Key `%s` not found.', key);
                res.status(404).send('Key `'+key+'` was not in the store!');
            }
        }, next);
    });

    return router;
};
    
// expose our version prefix for tests
module.exports.PREFIX = VERSION_PREFIX;
