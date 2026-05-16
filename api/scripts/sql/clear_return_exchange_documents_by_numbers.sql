-- Delete selected RETURN/EXCHANGE documents together with all dependent rows.
-- Safe for production use only after you replace the example document numbers below.
--
-- The script deletes rows from:
--   notification_log
--   document_history
--   document_items
--   documents
-- It also recalculates document_sequences.last_number for affected cities.

SET @branch_id := 1;

START TRANSACTION;

DROP TEMPORARY TABLE IF EXISTS cleanup_document_numbers;
CREATE TEMPORARY TABLE cleanup_document_numbers (
  document_number VARCHAR(20) NOT NULL PRIMARY KEY
);

-- Replace the example values below with real document numbers.
INSERT INTO cleanup_document_numbers (document_number) VALUES
  ('ML000001'),
  ('ML000002');

DROP TEMPORARY TABLE IF EXISTS cleanup_target_documents;
CREATE TEMPORARY TABLE cleanup_target_documents AS
SELECT
  d.id,
  d.document_number,
  d.document_type,
  d.document_sequence,
  d.city
FROM documents d
JOIN cleanup_document_numbers cdn
  ON cdn.document_number = d.document_number
WHERE d.branch_id = @branch_id
  AND d.document_type IN ('RETURN', 'EXCHANGE');

DELETE nl
FROM notification_log nl
JOIN cleanup_target_documents td ON td.id = nl.document_id;

DELETE dh
FROM document_history dh
JOIN cleanup_target_documents td ON td.id = dh.document_id;

DELETE di
FROM document_items di
JOIN cleanup_target_documents td ON td.id = di.document_id;

DELETE d
FROM documents d
JOIN cleanup_target_documents td ON td.id = d.id;

UPDATE document_sequences ds
JOIN (
  SELECT
    td.city,
    COALESCE(MAX(d.document_sequence), 0) AS remaining_last_number
  FROM cleanup_target_documents td
  LEFT JOIN documents d
    ON d.city = td.city
   AND d.branch_id = @branch_id
  GROUP BY td.city
) seq
  ON seq.city = ds.city
SET ds.last_number = seq.remaining_last_number
WHERE ds.branch_id = @branch_id;

DELETE ds
FROM document_sequences ds
LEFT JOIN documents d
  ON d.city = ds.city
 AND d.branch_id = ds.branch_id
WHERE ds.branch_id = @branch_id
  AND ds.city IN (SELECT DISTINCT city FROM cleanup_target_documents)
  AND d.id IS NULL;

COMMIT;
