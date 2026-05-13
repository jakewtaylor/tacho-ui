-- raw_json was stored gzipped against a future "re-render an imported file
-- without re-parsing" feature that never materialised. Reclaim the bytes.
ALTER TABLE imports DROP COLUMN raw_json;
