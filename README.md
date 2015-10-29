# Key Value Store Code Sample

I've been asked in a few job interviews over the years to implement something like this as a demonstration of my programming skills, so I'm posting this example to GitHub in hopes of giving potential employers a bit more to go on when evaluating me.

## Code Sample!

This is a toy project and not intended for production use and so I've made many decisions differently than I would in the real world (see the [end](#Reality-vs.-code-samples) of this file for more information). It's purpose is to demonstrate my knowledge of Javascript, nodejs, testing (in this case using mocha), asynchronous programming using promises, proper API documentation, SQL, and basic service design.

This is a RESTful JSON key-value store. It saves JSON values under arbitrary string keys using a pluggable backing store mechanism. It is not intended to be a world-facing service and therefore includes no permission or authentication mechanism, and reports implementation details in its over-the-wire error messages.

## Keys

- A key is an arbitrary ASCII string. 
- Keys may contain any combination of punctuation and whitespace (if properly URL-encoded when used in URI components), but may not contain UTF-8 characters.
- The behavior of keys longer than 1024 characters is undefined.
- The empty string is not a valid key.

## Values

A value is any valid JSON array or object, including the empty array (`[]`) and empty object (`{}`). Bare `null` is not a valid value.


## REST API

All request and response bodies are assumed to have UTF-8 character encoding.

Keys in URL paths are interpreted as being URI-component encoded (that is, with `%xx` escapes, but `+` is not converted to space).

The service exposes the following endpoints:

### Upsert key

`PUT /v1/key/:key`

Accepted body types: `application/json`

Interpret the request body as a JSON object or array and store it under the specified `:key`, overwriting any current value. The request body must not be empty.

New values are not guaranteed to be available until the PUT requested has completed.

Response codes:

- `201 CREATED` if the upsert succeeded.
- `400 BAD REQUEST` if an invalid request body is supplied.

Example `curl` request:

    curl -X PUT  -H "Content-Type: application/json" -d '["one", "two", "three"]' http://server/v1/key/my_key

### Get key

`GET /v1/key/:key`

Response type: `application/json`

Respond with the value currently associated with the specified `:key`.

Response codes:

- `200 OK` if the value was found.
- `404 NOT FOUND` if there is no value associated with this key.

### Get all keys

`GET /v1/all`

Response type: `application/json`

Respond with a JSON object containing all key/value pairs currently in the store.

Response codes:

- `200 OK`

### Delete key

`DELETE /v1/key/:key`

Remove the value currently associated with the specified `:key` from the store. Upserts to a key received while a `DELETE` operation is in progress on that key may superseded by the delete operation (that is, the will be immediately deleted). Read operations on a key while a `DELETE` operation is in progress on that key may respond as if the key is deleted before the `DELETE` operation completes.

Response codes:

- `200 OK` if the value was found and removed successfully.
- `404 NOT FOUND` if there is no value associated with this key.

### Nuke (clear datastore)

`POST /v1/nuke`

Accepted body types: `application/json`

Delete all key/value associations from the store. This method is intended as a test helper only and is disabled unless `allowNuke: true` is set in the `key.js` config object. For safety, the request will only succeed if the request body is the JSON object `{ nuke: true }`.

Response codes:

- `200 OK` if all data has been successfully destroyed.
- `400 BAD REQUEST` if any safety check fails.

## Configuring and running

A simple test server is included. To start, just `npm install` and then run `node app.js` from the app directory. The test server reads its configuration from the `config.json` file in the same directory.

It should also be possible to require this repository as a package.json dependency and use it as an express middleware, but this is untested.

### Tests

A Mocha test suite is provided in `test/test.js`. To run it, just `npm install -h mocha` and then run `mocha` from the app directory. More tests are provided than run by default - see `test.js` for more information.

## Design and Internals

The actual key-value store REST API is implemented as an Express middleware. To use it, require the `./key` module, pass it a config object, and use the returned initialized KVS instance as a middleware:

    var config = require('config');
    var express = require('express');
    var kvs = require('../key');
    app = express();
    app.use('/', kvs(config));

The config object has the following structure:

- `dataStore`: the name or path of a module to be loaded as the backing store implementation (see below), e.g. `"./stores/memory"`.
- `dataStoreConfig`: a configuration object to be passed to the backing store implementation.
- `allowNuke`: If set to true, the `/nuke` route will be enabled on this KVS instance.

### Backing Stores

A backing store is a module that exports a single function, which, when called with a configuration object, returns an object implementing the interface defined below. Backing store instances are persistent across the lifecycle of a KVS middleware instance, that is, each `kvs(config)` call creates a middleware instance with its own backing store instance that lives as long as that middleware is in use.

#### Backing store API

Backing stores must implement the following methods:

##### Get all keys

Signature: `this.getAll = function() { ... }`

Parameters: none

Return value: a Promise-like object that resolves to an Object containing all key/value mappings in this backing store. Errors may be reported by rejecting the Promise.

##### Get one key

Signature: `this.get = function(key) { ... }`

Parameters: `key` (`string`) - the key to fetch

Return value: a Promise-like object that resolves to the value associated with key `key`, or `undefined` if the key is not present in the store. Errors may be reported by rejecting the Promise.

##### Upsert key

Signature: `this.upsert = function(key, value) { ... }`

Parameters:

- `key` (`string`) - the key to upsert
- `value` (`Object`|`Array`) - the value to upsert to the key

Stores the value `value` at key `key`.

Return value: a Promise-like object that resolves if the upsert succeeeds, or is rejected if the upsert fails for any reason.

##### Delete key

Signature: `this.delete = function(key) { ... }`

Parameters: `key` (`string`) - the key to delete

Remove key and its associated value from the store.

Return value: a Promise-like object that resolves to the number of keys actually deleted (that is, 1 if the key was found in the store, 0 if not). Errors may be reported by rejecting the Promise.

##### Nuke

Signature: `this.nuke = function() { ... }`

Parameters: none

Destroy all data in this backing store.

Return value: a Promise-like object that resolves if the destruction succeeeds, or is rejected if the destruction fails for any reason or is not supported.

#### Included backing stores

Two example backing store implementations are included, a simple memory-based mock store (`./stores/memory.js`), and a Postgres data store (`./stores/postgres.js`) showing a (slightly) more realistic use case. See their respective source files for configuration and usage instructions.

### Reality vs. code samples

Since this is a code sample and the task is to demonstrate various knowledge in a relatively concise way, I've made a few decisions differently than I would have for an actual production system, including:

- Much more agressive-than-normal use of inline configuration and fixture objects in the interest of readability. This is particularly evident in the `test.js` file.
- Selection of backing stores. I've chosen Postgres because it makes an interesting example case with the need for a custom upsert solution and some minor format massaging necessary to use its native JSON column format, but in a real-world system I would perform some investigation into what backing stores would perform best for the service's use case(s) - and, indeed, if there's a use case that can't be served by simply deploying something like Redis.
- In the Postgres backing store, I didn't implement a configurable table name or separate read and write users/connections (as would be necessary for a multiple-read-replica environment).
- Running express in dev mode.
- The test server is really simple. Depending on deployment scenario, I might implement support for clustering using node's built-in Cluster/fork support, sharding based on some hash of the key, and a dynamic configuration parameter passed to each `key.js` instance to tell it what shard number it's serving.
- In a real-world system, each module would have its own logger individually-configurable levels rather than using the default logger as I've done for simplicity's sake here.
