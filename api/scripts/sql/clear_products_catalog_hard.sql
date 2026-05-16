-- Hard reset before reimport from a new 1C base.
-- WARNING: this removes document_items rows for the selected branch,
-- then deletes the related products and product groups.
--
-- Set the target branch. For the current single-branch setup it is usually 1.
SET @branch_id := 1;

START TRANSACTION;

-- Remove document rows that reference products from the target branch.
DELETE di
FROM document_items di
JOIN products p ON p.id = di.product_id
WHERE p.branch_id = @branch_id;

-- Remove the catalog itself.
DELETE FROM products
WHERE branch_id = @branch_id;

DELETE FROM product_groups
WHERE branch_id = @branch_id;

COMMIT;
