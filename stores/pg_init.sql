CREATE TABLE KVS ( key VARCHAR(1024) PRIMARY KEY, value JSON);
CREATE OR REPLACE FUNCTION upsert(varchar, json) RETURNS VOID AS $$
BEGIN
    -- Sneaky transactionless upsert for postgres. We don't care about the 
    -- previous value at all, so we just try the insert and update instead
    -- if that fails (presumably because the key was already there). This 
    -- can't fail to update in the case of concurrent upserts (because we
    -- attempt the insert first with update as the fallback, rather than
    -- the other way around, which may attempt an update, fail, and then
    -- also fail to insert because someone else has already inserted).
    -- There is a small race condition possible where we insert, fail, and
    -- then a concurrent delete removes the row we would have updated, but
    -- we solve this by declaring that upserts issued while a delete is in
    -- progress on that key may be 'deleted' by that delete.
    BEGIN
        INSERT INTO KVS (key, value) VALUES ($1, $2);
    EXCEPTION WHEN OTHERS THEN
        UPDATE KVS SET value = $2 WHERE key = $1;
    END;
END;
$$ LANGUAGE plpgsql; 
