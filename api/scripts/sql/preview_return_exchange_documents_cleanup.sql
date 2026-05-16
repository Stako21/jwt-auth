-- Preview documents and dependent rows before deleting test RETURN/EXCHANGE documents.
-- Fill cleanup_document_numbers with the exact document numbers you want to remove.
-- This script does not delete anything.

SET @branch_id := 1;

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
  d.city,
  d.status,
  d.created_at,
  d.updated_at,
  d.branch_id
FROM documents d
JOIN cleanup_document_numbers cdn
  ON cdn.document_number = d.document_number
WHERE d.branch_id = @branch_id
  AND d.document_type IN ('RETURN', 'EXCHANGE');

SELECT
  id,
  document_number,
  document_type,
  document_sequence,
  city,
  status,
  created_at,
  updated_at,
  branch_id
FROM cleanup_target_documents
ORDER BY created_at, id;

SELECT 'documents' AS table_name, COUNT(*) AS rows_to_delete
FROM cleanup_target_documents
UNION ALL
SELECT 'document_items', COUNT(*)
FROM document_items di
JOIN cleanup_target_documents td ON td.id = di.document_id
UNION ALL
SELECT 'document_history', COUNT(*)
FROM document_history dh
JOIN cleanup_target_documents td ON td.id = dh.document_id
UNION ALL
SELECT 'notification_log', COUNT(*)
FROM notification_log nl
JOIN cleanup_target_documents td ON td.id = nl.document_id;

SELECT
  td.city,
  MIN(td.document_sequence) AS min_deleted_sequence,
  MAX(td.document_sequence) AS max_deleted_sequence,
  ds.last_number AS current_last_number,
  (
    SELECT COALESCE(MAX(d2.document_sequence), 0)
    FROM documents d2
    WHERE d2.branch_id = @branch_id
      AND d2.city = td.city
      AND d2.id NOT IN (SELECT id FROM cleanup_target_documents)
  ) AS last_number_after_cleanup
FROM cleanup_target_documents td
LEFT JOIN document_sequences ds
  ON ds.city = td.city
 AND ds.branch_id = @branch_id
GROUP BY td.city, ds.last_number
ORDER BY td.city;
