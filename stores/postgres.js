var pg = require('pg');
var logger = require('winston');

/**
 * Postgresql backing store. Uses a single table with a varchar primary key and
 * a native JSON data column.
 *
 * Setup: to use this backing store, obtain a running Postgres instance 
 * (procedure beyond the scope of this comment), optionally create a new
 * user and database, and then execute the pg_init.sql file found beside this
 * module:
 * $ psql -U myuser -f pg_init.sql
 *
 * Then set the dbUrl member of the configuration object you pass to this
 * backing store appropriately.
 */
module.exports = function(config) {
    /**
     * Utility function to wrap a pg query call into a Promise.
     * @param {string} sql The SQL query to run.
     * @param {Array} params Array of parameters for the query, if any
     * @returns {Promise} A Promise that resolves with the pg client
     * result object when the query finishes.
     */
    function query(sql, params) {
        return new Promise(function(resolve, reject) {
            // Don't be fooled or frightened: by default the pg client
            // does connection pooling internally, so this construct
            // is simply pulling an open connection from the pool, *not*
            // opening and closing a connection for every request.
            pg.connect(config.dbUrl, function(err, client, done) {
                if(err) {
                    logger.error('error fetching client from pool', err);
                    reject(err);
                }

                logger.debug('Executing query: %s', sql, params);
        
                client.query(sql, params, function(err, result) {            
                    // call `done()` to release the client back to the pool 
                    done();
                    
                    logger.silly('  query result:', JSON.stringify(result));
                    
                    if(err) {
                        logger.error('error running query', err);
                        reject(err);  
                    }
            
                    resolve(result);
                });
            });
        });
    }

    this.nuke = function() {
        return query('DELETE FROM KVS');
    };

    this.getAll = function() {
        logger.debug('GetAll');
        return query('SELECT * FROM KVS').then(function(result) {
            var all = {};
            result.rows.forEach(function(row) {
                // value.value because we're unwrapping a wrapped JSON object
                all[row.key] = row.value.value;
            });
    
            logger.debug('getAll result:', all);

            return all;
        });
    };

    this.get = function(key) {
        return query('SELECT VALUE FROM KVS WHERE key = $1', [key]).then(function(result) {
            if(result.rows.length === 0) {
                return undefined;
            }
        
            // value.value because we're unwrapping a wrapped JSON object
            return result.rows[0].value.value;
        });
    };

    this.upsert = function(key, value) {
        logger.debug("Upserting %s=", key, value);

        // The `upsert` plpgsql function is defined in pg_init.sql and is
        // necessary because Postgres (pre-9.5) lacks a native ON CONFLICT
        // consutrct.
        // We wrap the JSON value like this because Postgres can only store
        // JSON *objects* at the top level, not arrays.
        return query('SELECT upsert($1, $2)', [key, {"value": value}]);
    };

    this.delete = function(key) {
        return query('DELETE FROM KVS WHERE key = $1', [key])
            .then(function(result) {
                return result.rowCount;
            });
    };

    return this;
};
