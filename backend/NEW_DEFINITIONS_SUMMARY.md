# New Summary Column Definitions

Based on the HTML definitions provided, here are the key changes:

## Changes from Current Implementation:

### 1. REMOVE: `produced_quantity`
- **Status**: Remove completely
- **Reason**: "Remove as it is Redundant"

### 2. `cut_qty` - Modified
- **Current**: WHERE phase_id=1, action=scan_in, status IN ('In Progress', 'Completed')
- **New**: WHERE phase_type=cutting, action=scan_in, status IN ('Pending')
- **Note**: This is opposite of your previous requirement that said "Pending isn't scan_in"

### 3. `second_degree_cut_qty` - Same
- WHERE phase_id=1, action=scan_in, status IN ('In Progress', 'Completed'), is_second_degree=TRUE

### 4. `sewing_in_qty` - Same
- WHERE phase_id IN (2,3,4,7), action=scan_in, status IN ('In Progress', 'Completed')
- Note: HTML says "(phase type = sewing and unique barcode)" but doesn't explain what this means

### 5. `sewing_out_qty` - Same
- WHERE phase_id IN (2,3,4,7), action=scan_out

### 6. `packaging_in_qty` - CONFLICTING
- **HTML Definition**: "WHERE (phase type = sewing and unique barcode), action=scan_in, status IN ('In Progress', 'Completed')"
- **This is clearly wrong** - packaging should be phase_id = 8
- **Assumed Correction**: WHERE phase_id=8, action=scan_in, status IN ('In Progress', 'Completed')

### 7. `packaging_out_qty` - CONFLICTING
- **HTML Definition**: Same issue as packaging_in_qty
- **Assumed Correction**: WHERE phase_id=8, action=scan_out

### 8. `working_qty` - CHANGED
- **Current**: SUM(batch.quantity WHERE status='In Progress')
- **New**: SUM(batch.quantity) - second_degree_cut_qty
- This would be ALL batches minus second degree cut quantity

### 9. `lost_qty` - CHANGED
- **Current**: cut_qty - packaging_out_qty
- **New**: cut qty + second_degree_cut_qty - working_qty

### 10. `completed_qty` - CHANGED
- **Current**: SUM(batch.quantity WHERE status='Completed')
- **New**: SUM(batch.quantity WHERE phase_type=packaging, status='Completed')
- Only completed batches in packaging phase

### 11. `has_issues` - EXPANDED
**New**: Multiple conditions (ANY one triggers it):
1. Production Issues: has Notes
2. Stalled Batches: job order item level batches split across different phases (excluding second degree batches)
3. Lost Quantity: lost_qty > 0
4. Second Degree: >3% threshold ((second_degree_cut_qty + second_degree_qty) / total)
5. Overproduction: cut_qty > expected by over 1%

### 12. `completion_percentage` - CHANGED
- **Current**: (produced_quantity / expected_quantity) * 100
- **New**: Still says "(produced_quantity / expected_quantity) * 100" but produced_quantity is removed?
- **Assumed**: (cut_qty / expected_quantity) * 100

### 13. `overproduction_quantity` - CHANGED
- **Current**: MAX(0, produced_quantity - expected_quantity)
- **New**: MAX(0, cut_qty - expected_quantity)

### 14. `production_status` - CHANGED
- **Current**: Based on produced_quantity
- **New**: Not Started if cut_qty=0, Completed if completed_qty>=expected, In Progress otherwise

## CONFUSION POINTS:

1. **cut_qty** - HTML says status='Pending' but you said earlier "Pending isn't scan_in"
2. **packaging_in_qty/out_qty** - HTML incorrectly defines as "phase type = sewing"
3. **completed_qty** - HTML says "phase type packaging" but we need to confirm how to identify packaging batches (by current_phase=8?)
4. **working_qty** - New formula is confusing
5. **lost_qty** - New formula uses working_qty which depends on cut_qty
6. **has_issues** - Complex stalled batches check needs clarification on how to detect split across phases

## RECOMMENDATION:

Please clarify:
1. What does "phase type = sewing and unique barcode" mean?
2. Should cut_qty include Pending status?
3. How should completed_qty identify packaging batches?
4. Confirm the working_qty and lost_qty formulas are correct
5. How to detect "stalled batches" (batches split across different phases)?


