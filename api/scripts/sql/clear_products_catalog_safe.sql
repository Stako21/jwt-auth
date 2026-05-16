-- Safe cleanup before reimport from a new 1C base.
-- Keeps document history intact and removes only products/groups
-- that are not referenced by document_items.
--
-- Set the target branch. For the current single-branch setup it is usually 1.
SET @branch_id := 1;

START TRANSACTION;

-- Optional: mark the current catalog inactive before the next import.
UPDATE products
SET is_active = 0
WHERE branch_id = @branch_id;

UPDATE product_groups
SET is_active = 0
WHERE branch_id = @branch_id;

-- Remove products that are not used in any saved document.
DELETE p
FROM products p
LEFT JOIN document_items di ON di.product_id = p.id
WHERE p.branch_id = @branch_id
  AND di.id IS NULL;

-- Remove groups that no longer have products and are not used in documents.
DELETE pg
FROM product_groups pg
LEFT JOIN products p ON p.group_id = pg.id
LEFT JOIN document_items di ON di.product_group_id = pg.id
WHERE pg.branch_id = @branch_id
  AND p.id IS NULL
  AND di.id IS NULL;

COMMIT;
