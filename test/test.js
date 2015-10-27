var request = require('supertest');
var express = require('express');
var kvs = require('../key');
var V = kvs.PREFIX; // easy access to the API version prefix, we'll use it a lot
var logger = require('winston');
var rand = require('random-seed');

logger.cli();
logger.level = 'error';

describe('Key-Value Store REST API', function() {
    /**
     * Generate a suite of API tests for a given combinaion of datastore, key and values
     * @param {object} config key.js configuration object to use for this run
     * @param {string} key The key to test storing things under
     * @param {Object|Array} val A value to test storing
     * @param {Object|Array} val2 A second value with which to test overwriting the first
     */
    function testSuite(config, key, val, val2) {
        describe('With key='+key+' and value=\n'+JSON.stringify(val, null, 2), function() {
            var app;

            before(function() {
                app = express();
                app.use('/', kvs(config));
                logger.info("Setup of fresh test instance done");
            });

            it('should respond to a valid /nuke request with 200 OK', function(done) {
                request(app)
                    .post(V+'/nuke')
                    .send({'nuke': true})
                    .expect(200, done);
            });

            it('should contain no data after a /nuke request', function(done) {
                request(app)
                    .get(V+'/all')
                    .expect(200, {}, done);
            });

            it('should respond to a valid PUT request with 201 CREATED', function(done) {
                request(app)
                    .put(V+'/key/'+key)
                    .send(val)
                    .expect(201, done);
            });
            
            it('should respond to a valid GET request with the value stored before', function(done) {
                request(app).get(V+'/key/'+key).expect(200, val, done);
            });
            
            it('should respond to a GET request for an unknown key with 404 NOT FOUND', function(done) {
                request(app).get(V+'/key/'+key+'this_suffix_makes_the_key_invalid').expect(404, done);
            });
            
            it('should respond to a valid PUT request for an already-existing key with 201 CREATED', function(done) {
                request(app).put(V+'/key/'+key).send(val2).expect(201, done);
            });
            
            it('should respond to a valid GET request with the updated value', function(done) {
                request(app).get(V+'/key/'+key).expect(200, val2, done);
            });

            it('should respond to a valid DELETE request with 200 OK', function(done) {
                request(app).delete(V+'/key/'+key).expect(200, done);
            });
            
            it('should now respond to a GET request for the deleted key with 404 NOT FOUND', function(done) {
                request(app).get(V+'/key/'+key).expect(404, done);
            });
        });
    }
    
    // Because of their relatively small size, test fixtures are included inline here.
    // Normally these would be in their own module or use some other loading mechanism.
    var keys = ["TEST_KEY", "Key 'with'...{punctuation}; (and spaces).", "';-- DROP TABLE STORE"];
    var vals = [
                ['omg', 1, true, 2e9, 'wtf', false, 3, 4],
                [],
                {},
                {
                    "a": "value-a",
                    "number": 31338,
                    "array": ["things", "in", "an", "array", true],
                    "boolean and key with spaces just for good measure": true
                },
                [null, "that was null"],
                {
                    "null-key": null
                },
                ['✓✓✓ HEY LOOKIT UNICODE ✓✓✓']
            ];
    var val1 = vals[0];
    var val2 = vals[3];

    // KVS configurations to test.
    var configs = [
        { 
          allowNuke: true,
          dataStore: './stores/memory', 
          dataStoreConfig: {} 
        }
        /*,
            // Testing Postgres is disabled by default to allow a quick test run
            // by just executing 'mocha'. If you'd like to test the Postgres,
            // datastore, you'll need to follow the setup instructions in
            // stores/postgres.js and change dbUrl below to reflect your
            // local instance.
        {
            allowNuke: true,
            dataStore: './stores/postgres',
            dataStoreConfig: {
                dbUrl: 'postgres://postgres@localhost/kvs'
            }
        }*/
    ];

    configs.forEach(function(config) {
        describe('With backing store: ' + config.dataStore, function() {
            // In general with key-value stores, key lookup and value put/get are 
            // orthogonal systems that can be tested separately, so that's the 
            // form our tests take. However, it would be easy to test a KVS where
            // the two systems were not orthogonal just by nesting the key and
            // value test forEach statements, rather than having separate ones 
            // for each array of fixtures.            
            keys.forEach(function(key) { testSuite(config, key, val1, val2); });
            vals.forEach(function(val) { testSuite(config, keys[0], val, val2); });

            // Next perform some rudimentary concurrency and load testing. This
            // suite also effects a test of the get-all-keys route.
            describe('Concurrency and load tests (these are long-running, be patient...)', function() {
                this.timeout(60*60*1000);

                var LOAD_TEST_BLOCKS = 10;
                var FIXTURE_SIZE = 100;

                // Utility function to map from supertest's done-with-optional-
                // error callback style to Promise resolve/reject callbacks.                
                function reqHandler(resolve, reject) {
                    return function(err) {
                        if(err) {
                            reject(err);
                        }
                        resolve();
                   };
                }

                var random;
                var randElem;
                var app;
                var fixture = {};

                before('Preparing concurrency tests', function() {
                    app = express();
                    app.use('/', kvs(config));
                    logger.info("Setup of fresh test instance done");
                    
                    // We use a PRNG library because JS' native Math.random 
                    // doesn't allow seeding. This makes it possible to 
                    // reproduce the order of operations of a specific test
                    // run, should that run produce an error not seen otherwise.
                    // Remember that running a different subset of tests with
                    // the same seed will produce different actions!
                    var seed = Math.random(); // or the seed from a failed run
                    console.log('        Random seed for this run: ', seed);
                    random = rand.create(seed);

                    randElem = function(array) {
                        return array[random(array.length)];
                    };

                    // Prepare a pseudeorandom test fixture:
                    for(var i=0; i<FIXTURE_SIZE; i++) {
                        fixture[randElem(keys)+'_'+i] = randElem(vals) || ['array_thing_'+i];
                    }
                });

                it('should correctly load test data via many concurrent requests', function(done) {
                    // Load the fixture into the store, one key at a time, all requests at once:
                    Promise.all(Object.keys(fixture).map(function(key) {
                        logger.debug("Adding %s -> ", key, fixture[key]);
                        return new Promise(function(resolve, reject) {
                            request(app)
                                .put(V+'/key/'+key)
                                .send(fixture[key])
                                .expect(201, reqHandler(resolve, reject));
                        });
                    }))
                    // Check that all keys loaded right:
                    .then(function() {
                        request(app)
                            .get(V+'/all')
                            .expect(200, fixture, done);
                    });
                });

                it('should produce zero errors during a rudimentary load test', function(done) {
                    // Duplicate fixture we will use to track what we think should be happening
                    // in the backing store without disturbing our source of values for upserts.
                    var tracking = {}
                    Object.keys(fixture).forEach(function(key) { tracking[key] = fixture[key] });

                    // Do a block of concurrent read and write requests. Because this is a 
                    // *rudimentary* load test, just read or write each key in our fixture
                    // once per block. A more rigorous test would mix operations and timing
                    // much more aggressively.
                    function doBlock() {
                        return Promise.all(Object.keys(fixture).map(function(key) {
                            // Randomly decide to read or write this key on this go-round.
                            if(random(2)) {
                                return new Promise(function(resolve, reject) {
                                    request(app)
                                        .get(V+'/key/'+key)
                                        .expect(200, tracking[key], reqHandler(resolve, reject));
                                });
                            }
                            else {
                                var expected = fixture[randElem(Object.keys(fixture))];
                                return new Promise(function(resolve, reject) {
                                    request(app)
                                        .put(V+'/key/'+key)
                                        .send(expected)
                                        .expect(201, reqHandler(resolve, reject));
                                }).then(function() {
                                    return new Promise(function(resolve, reject) {
                                        request(app)
                                            .get(V+'/key/'+key)
                                            .expect(200, expected, reqHandler(resolve, reject));
                                    });
                                }).then(function() {
                                    // Success? Update tracking fixture to reflect the change
                                    tracking[key] = expected;
                                }, done);
                            }
                        }));
                    }

                    // Simple asynchronous loop
                    function loop(count) {
                        if(count > 0) {
                            doBlock().then(function() {
                                loop(--count);
                            }, done);
                        }
                        else {
                            done();
                        }
                    }
    
                    loop(LOAD_TEST_BLOCKS);
                });
            });
        });
    });
});
