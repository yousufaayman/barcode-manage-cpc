use barcode_management_v2;

-- Alter users table to add "Creator" role
ALTER TABLE `users` 
MODIFY COLUMN `role` enum('Admin','Cutting','Sewing','Packaging','Creator') NOT NULL;

-- ============================================================================
-- BRAND TABLE CLEANUP AND STANDARDIZATION
-- ============================================================================
-- 1. Create temporary mapping tables for brands and colors
DROP TEMPORARY TABLE IF EXISTS brand_map, color_map;
CREATE TEMPORARY TABLE brand_map (old_id INT, new_id INT);
CREATE TEMPORARY TABLE color_map (old_id INT, new_id INT);

-- 2. Populate mapping tables with your standardization rules
-- Example for brands (repeat for all your mappings)
-- bdtk group
INSERT INTO brand_map (old_id, new_id)
SELECT b1.brand_id, b2.brand_id
FROM barcode_management.brands b1
JOIN barcode_management_v2.brands b2 ON b2.brand_name = 'bdtk'
WHERE b1.brand_name IN ('b.t', 'bdtc', 'bdtk', 'panathikos', 'bdtrk');

-- lc wikiki group
INSERT INTO brand_map (old_id, new_id)
SELECT b1.brand_id, b2.brand_id
FROM barcode_management.brands b1
JOIN barcode_management_v2.brands b2 ON b2.brand_name = 'lc wikiki'
WHERE b1.brand_name IN ('l.c', 'lc wikiki');

-- sandy&side group
INSERT INTO brand_map (old_id, new_id)
SELECT b1.brand_id, b2.brand_id
FROM barcode_management.brands b1
JOIN barcode_management_v2.brands b2 ON b2.brand_name = 'sandy&side'
WHERE b1.brand_name IN ('sandy& side', 'sandy&side', 'w.c', 'wtc') OR b1.brand_id = 4637;

-- Repeat similar for colors (see your mapping rules above)
-- Example for black/blak
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'black'
WHERE c1.color_name IN ('black', 'blak');

-- black/blak → black
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'black'
WHERE c1.color_name IN ('black', 'blak');

-- baige, ╪ذ┘è╪ش → beige
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'beige'
WHERE c1.color_name IN ('baige', '╪ذ┘è╪ش');

-- burgandy → burgundy
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'burgundy'
WHERE c1.color_name = 'burgandy';

-- charcol → charcoal
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'charcoal'
WHERE c1.color_name = 'charcol';

-- cream-frc → cream
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'cream'
WHERE c1.color_name = 'cream-frc';

-- anthracitr melange → anthracite melange
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'anthracite melange'
WHERE c1.color_name = 'anthracitr melange';

-- grey mel → grey melange
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'grey melange'
WHERE c1.color_name = 'grey mel';

-- greymarl → grey marl
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'grey marl'
WHERE c1.color_name = 'greymarl';

-- stel → steel
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'steel'
WHERE c1.color_name = 'stel';

-- water melon, water milon, watermelon → watermelon
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'watermelon'
WHERE c1.color_name IN ('water melon', 'water milon', 'watermelon');

-- fritale, frytale → fairytale
INSERT INTO color_map (old_id, new_id)
SELECT c1.color_id, c2.color_id
FROM barcode_management.colors c1
JOIN barcode_management_v2.colors c2 ON c2.color_name = 'fairytale'
WHERE c1.color_name IN ('fritale', 'frytale');

-- 3. Insert missing brands/colors from source to target (handle conflicts)
-- Brands not in mapping
INSERT IGNORE INTO barcode_management_v2.brands (brand_id, brand_name)
SELECT b.brand_id, b.brand_name
FROM barcode_management.brands b
LEFT JOIN brand_map bm ON b.brand_id = bm.old_id
WHERE bm.old_id IS NULL
  AND b.brand_name NOT IN ('1', 'b.t', 'bdtc', 'bdtk', 'bdrtk', 'panathikos', 'l.c', 'lc wikiki', 'sandy& side', 'sandy&side', 'w.c', 'wtc')
  AND b.brand_id != 2487 AND b.brand_id != 4637;

-- Colors not in mapping
INSERT IGNORE INTO barcode_management_v2.colors (color_id, color_name)
SELECT c.color_id, c.color_name
FROM barcode_management.colors c
LEFT JOIN color_map cm ON c.color_id = cm.old_id
WHERE cm.old_id IS NULL
AND c.color_name NOT IN (
  'black', 'blak', 'baige', '╪ذ┘è╪ش', 'burgandy', 'charcol', 'cream-frc',
  'anthracitr melange', 'grey mel', 'greymarl', 'stel', 'water melon', 'water milon',
  'watermelon', 'fritale', 'frytale'
);

select * from brands;

select * from colors;

-- 4. Insert batches in the specified range, resolving brand/color IDs
INSERT INTO barcode_management_v2.batches (
    barcode, brand_id, model_id, size_id, color_id, quantity, layers, serial, current_phase, status
)
SELECT
    b.barcode,
    COALESCE(bm.new_id, b.brand_id), -- use mapped brand_id if exists
    b.model_id,
    b.size_id,
    COALESCE(cm.new_id, b.color_id), -- use mapped color_id if exists
    b.quantity,
    b.layers,
    b.serial,
    b.current_phase,
    b.status
FROM barcode_management.batches b
LEFT JOIN brand_map bm ON b.brand_id = bm.old_id
LEFT JOIN color_map cm ON b.color_id = cm.old_id
WHERE b.batch_id >= 4160 AND b.batch_id <= 999999; -- set your range

-- 5. (Optional) Check for any orphaned brands/colors in batches
SELECT b.batch_id
FROM barcode_management_v2.batches b
LEFT JOIN barcode_management_v2.brands br ON b.brand_id = br.brand_id
LEFT JOIN barcode_management_v2.colors c ON b.color_id = c.color_id
WHERE br.brand_id IS NULL OR c.color_id IS NULL;