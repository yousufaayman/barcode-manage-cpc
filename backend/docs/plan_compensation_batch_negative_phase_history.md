# Plan: Compensation Batch Rejections → Negative Phase History (Fix Revert-to-Zero)

## Problem

When a **compensation batch** is created and a piece is **rejected to a phase older than its creation**, the affected phase quantity in `ops.batch_phase_history` is currently **reverted to 0**. That is incorrect because:

- Phase quantities are **summed across all batches** (e.g. in `batch_phase_history_aggregates`) to get job-order-level totals.
- For compensation batches, rejections to an “older” phase (e.g. compensation starts at QC, rejection returns to sewing) should result in a **negative** value for that phase on that batch, so that when summed with other batches the **overall total is correct**.
- Rejections should be handled **gracefully** (no clamping to 0 for compensation batches).

**Constraint:** Negative numbers must **only** apply to **compensation batches**. All other batches must continue to have phase quantities **≥ 0** (current behavior).

Scope: **`maintain_batch_phase_history`** (trigger + related sync and rejection functions).

---

## Root Cause

1. **`ops.update_batch_phase_history_on_rejection`**  
   When applying a rejection (piece returned to an older phase), every phase quantity update uses:
   - `GREATEST(COALESCE(column, 0) - p_quantity, 0)`  
   So the result is **always clamped to 0**. For a compensation batch, if the phase was 0 and we subtract the rejected quantity, we get a negative that is incorrectly forced to 0.

2. **`ops.maintain_batch_phase_history`** (trigger on `ops.batches`)  
   For compensation batches, many branches explicitly set phase quantities to **0** (e.g. “keep cutting at 0 if compensation phase rank ≥ 1”). When the trigger runs again after a batch update, it can **overwrite** rejection-induced values. If we later allow negatives in the rejection function, we must ensure the trigger **does not overwrite** those negatives with 0.

3. **`ops.sync_batch_phase_history_for_batch`** and **`ops.sync_all_batch_phase_history`**  
   Same idea: for compensation batches they currently force 0 in several places; they must **preserve existing** phase quantities (including negatives) instead of overwriting with 0.

---

## Intended Behavior (Summary)

| Batch type           | Rejection to older phase      | Phase quantity in history | When trigger/sync runs        |
|----------------------|-------------------------------|---------------------------|-------------------------------|
| **Compensation**     | Subtract qty from phase       | **May become negative**   | **Preserve** existing value   |
| **Non-compensation** | Subtract qty, floor at 0      | **Never negative**       | Unchanged (current behavior) |

Aggregates (e.g. `SUM(bph.sewing_in_qty)` over all batches) already sum all rows; once compensation batches can hold negative values, the totals will be correct without changing those queries.

---

## Implementation Plan

### 1. `ops.update_batch_phase_history_on_rejection`

**File:** `backend/app/database.py` (function body in `create_batch_phase_history_functions()`).

**Changes:**

- At the start of the function (after phase type/rank variables), add:
  - `v_is_compensation BOOLEAN := FALSE;`
  - `SELECT EXISTS(SELECT 1 FROM ops.batch_compensations WHERE batch_id = p_batch_id) INTO v_is_compensation;`
- In the `UPDATE ops.batch_phase_history SET ...` block, for **each** phase quantity column:
  - **If compensation batch:** use `COALESCE(column, 0) - p_quantity` (allow negative).
  - **If non-compensation:** keep `GREATEST(COALESCE(column, 0) - p_quantity, 0)`.

Apply this pattern to:

- `inspection_qty`
- `sewing_in_qty`
- `sewing_out_qty`
- `qc_in_qty`
- `qc_out_qty`
- `packaging_in_qty`
- `packaging_out_qty`

Add a short comment in the function noting that compensation batches allow negative phase quantities so that sums across batches remain correct.

---

### 2. `ops.maintain_batch_phase_history` (trigger)

**File:** `backend/app/database.py` (same SQL block).

**Changes:**

- For every branch that currently does:
  - `WHEN v_is_compensation AND ... THEN 0`
- Replace the `0` with **preserving the existing value** so that rejection-induced negatives are not overwritten:
  - `THEN COALESCE(batch_phase_history.<column>, 0)`

Columns to adjust (for compensation branches only):

- `inspection_qty` (e.g. when `v_is_compensation AND compensation_phase_rank >= 1`)
- `sewing_in_qty` (compensation rank >= 2)
- `sewing_out_qty` (compensation rank > 2)
- `qc_in_qty` (compensation rank >= 3)
- `qc_out_qty` (compensation rank > 3)
- `packaging_in_qty` (compensation rank >= 4)
- `packaging_out_qty` (compensation rank > 4)

Do **not** change behavior for non-compensation batches or for backward-movement logic that clears quantities (those remain 0 or current-quantity rules as today). Only the compensation-specific “keep at 0” branches become “keep existing value (may be negative).”

---

### 3. `ops.sync_batch_phase_history_for_batch`

**File:** `backend/app/database.py` (same SQL block).

**Changes:**

- In the `ON CONFLICT (batch_id) DO UPDATE SET` section, for every branch that does:
  - `WHEN v_is_compensation AND ... THEN 0`
- Replace with preserving existing value:
  - `THEN COALESCE(batch_phase_history.<column>, 0)` (or equivalent using `batch_phase_history.<column>` so negatives are preserved).

Apply to the same set of columns as in the trigger (inspection, sewing_in/out, qc_in/out, packaging_in/out).

---

### 4. `ops.sync_all_batch_phase_history`

**File:** `backend/app/database.py` (same SQL block).

**Changes:**

- In the `ON CONFLICT (batch_id) DO UPDATE SET` section, for compensation batches the logic currently uses `EXISTS (SELECT 1 FROM ops.batch_compensations ...)` and then sets the column to `0`.
- For those branches, set the column to **existing value** instead of 0 so that negatives are preserved:
  - e.g. `THEN batch_phase_history.inspection_qty` (or `COALESCE(batch_phase_history.inspection_qty, 0)` if you prefer consistency).
- Apply to all phase quantity columns that are forced to 0 for compensation in this function.

---

### 5. Non-compensation batches

- **No** change to the logic that keeps non-compensation phase quantities ≥ 0:
  - Keep all `GREATEST(..., 0)` usages in `update_batch_phase_history_on_rejection` when `v_is_compensation` is false.
- No new logic to allow negatives for non-compensation batches anywhere.

---

### 6. Schema / constraints

- `ops.batch_phase_history` phase quantity columns are `INTEGER` with default 0; there are no `CHECK` constraints preventing negatives. **No schema migration required** to allow negative values for compensation batches.
- If the project later adds CHECK constraints on these columns, they must **exclude** compensation batches (e.g. allow negative only when `compensation = TRUE`) or apply only to non-compensation rows.

---

### 7. Testing (recommended)

- **Compensation batch:** Create a compensation batch at a given phase (e.g. QC). Record a rejection that returns quantity to an older phase (e.g. sewing). Assert that the corresponding phase quantity in `batch_phase_history` is **negative** and that the job-order-level aggregate (sum over all batches) matches the expected total.
- **Non-compensation batch:** Same rejection scenario; assert phase quantities remain **≥ 0** (e.g. floor at 0).
- **Trigger/sync:** After applying a rejection (so a compensation batch has a negative phase qty), update the batch (e.g. status or phase) and run the trigger (or sync). Assert the negative value is **preserved** and not overwritten to 0.

---

### 8. Optional: Migration script

If there are existing compensation batches that already have “reverted to 0” after rejections to an older phase, you could add a one-off SQL script that:

- Finds compensation batches with rejections to an older phase.
- Recomputes the correct (possibly negative) phase quantities and updates `batch_phase_history`.

This is optional and can be done in a follow-up; the main fix is the four functions above so that **new** rejections behave correctly and trigger/sync no longer overwrite negatives.

---

## Summary Checklist

- [ ] **update_batch_phase_history_on_rejection:** Add `v_is_compensation`; for compensation batches do not use `GREATEST(..., 0)` when subtracting rejection quantity.
- [ ] **maintain_batch_phase_history:** For compensation branches, preserve existing phase quantities (e.g. `COALESCE(batch_phase_history.<col>, 0)`) instead of setting 0.
- [ ] **sync_batch_phase_history_for_batch:** Same preservation for compensation branches.
- [ ] **sync_all_batch_phase_history:** Same preservation for compensation branches in ON CONFLICT.
- [ ] Confirm no CHECK constraints block negative values; add tests for compensation (negative allowed) and non-compensation (≥ 0).

This keeps negative phase quantities **only** for compensation batches and ensures rejections are handled gracefully while aggregates remain correct when summed through all batches.
