var logger = require('winston');

/**
 * Simple memory-based backing store. Just stores associations in a JS object
 * that gets thrown away when the JSVM exits.
 *
 * For simplicity and because this is mainly intended as a testing mock, we
 * just do all our operations synchronously and return resolved promises.
 *
 * Configuration: none
 */
module.exports = function(config) {
    var store = {};

    // A simple key munger to prevent keys like 'prototype' from doing untoward things.
    var KEY_PREFIX = 'key_'; 
    function prepKey(key) {
        return KEY_PREFIX+key;
    }
    
    this.nuke = function() {
        store = {};
        return Promise.resolve();
    }

    this.getAll = function() {
        logger.debug('GetAll. Store: ', JSON.stringify(store));
        var all = {};
        Object.keys(store).forEach(function(prop) {
            logger.debug('  getting %s -> ', prop, JSON.stringify(store[prop]));
            all[prop.slice(KEY_PREFIX.length)] = store[prop];
        });

        logger.silly('getAll result:', all);

        return Promise.resolve(all);
    };

    this.get = function(key) {
        key = prepKey(key);
        logger.debug('Get: Found mapping `%s` ->', key, ''+store[key]);

        // don't need to explicitly handle not-found errors because we'll just
        // be returning `undefined` anyway, fulfilling the not-found contract.
        return Promise.resolve(store[key]);
    };

    this.upsert = function(key, value) {
        key = prepKey(key);
        store[key] = value;
        logger.debug('Put: Stored `%s`:', key, ''+value);
        logger.silly('Put: Store: ', JSON.stringify(store));
        return Promise.resolve(1);
    };

    this.delete = function(key) {
        key = prepKey(key);
        if(key in store) {
            delete store[key];
            logger.debug('Delete: `%s`', key);
            return Promise.resolve(1);
        }
        else {
            logger.error('Delete: failed. Key `%s` not in store.', key);
            return Promise.resolve(0);
        }
    };

    return this;
};
