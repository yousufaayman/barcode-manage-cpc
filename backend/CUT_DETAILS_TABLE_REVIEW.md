# Cut Details Table Design Review

  

## Requirements Summary

  

### New Table: `ops.cut_details`

  

**Purpose**: Track cutting operations with detailed roll-by-roll information and size-based ratios.

  

### Key Requirements:

1. **Parent Relationship**: Links to `job_order` (FK to `core.job_orders.job_order_id`)

2. **Color Selection**: Inherits color from available `job_order_items` for the selected job order

3. **Size Management**: Works with all sizes from job_order_items (filtered by selected color and job_order)

4. **Roll Details**: Multiple rolls per cut, each with weight, layer_weight, and num_of_layers

5. **Size Ratios**: Key-value pairs mapping job_order_item (size) to ratio

6. **Calculations**:

   - Total layers = sum of all rolls' num_of_layers

   - Total pieces per size = ratio × total_layers
   - Total peices = sum of Total pieces per size

7. **Size Transitions**: Exception handling for converting pieces from one size to another

8. **Waste Tracking**: `waste_fabric_weight` column

9. **Summary Updates**: On cut creation, update `job_order_items_summary.cut_qty` (replacing barcode_scan_events-based calculation)
10. Dat and time of cut
11. User who created cut

  

---

  

## Understanding & Clarifications Needed

  

### 1. Color and Size Relationship

**Clarification**: A `job_order_item` has a single `color_id` and single `size_id`.

  

**Interpretation**:

- User selects a **job_order**

- User selects a **color** (from available colors in that job_order's items)

- System shows all **sizes** that exist for that color in that job_order (i.e., all job_order_items with that color_id)

- User provides a **ratio** for each size (job_order_item)

  

**Question**: Is this correct, or should a single cut be able to handle multiple colors?
Answer : Yes, a single cut is a sungle color
  

### 2. Roll Data Structure

**Clarification**: Multiple rolls per cut need individual tracking.

  

**Suggested Design**:

- Option A: JSONB column storing array of roll objects

- Option B: Separate `ops.cut_rolls` table (normalized, recommended)

  

**Recommendation**: Use separate table for better queryability and data integrity. Yes Creeate a seperate table

  

### 3. Size Ratios

**Clarification**: "job_order_items_ratios (key-value pairs given a job_order_item (only sizes matters...)"

  

**Interpretation**:

- Store mapping: `job_order_item_id` → `ratio` (decimal representing pieces per layer)

- Since color is fixed per cut, only size matters for differentiation

- Ratio represents **pieces per layer** (not percentage), so can be > 1.0

- Ratios do NOT need to sum to 1.0 (flexible production needs)

  

**Design Decision**: JSONB column in `cut_details` table storing `{item_id: ratio}` mapping

- Format: `{"item_id_1": 2.5, "item_id_2": 1.8, ...}` (pieces per layer for each size)

- Not queried often, so JSONB is acceptable for flexibility

  

### 4. Size Transitions

**Clarification**: "taking x amount of pieces from size y and turning them into size z as an exception"

  

**Interpretation**:

- Exception/adjustment records for size conversions

- Example: 50 pieces originally cut as Size M converted to Size L

  

**Suggested Design**:

- Separate `ops.cut_size_transitions` table

- Columns: `from_item_id`, `to_item_id`, `quantity`, `cut_id`

  

### 5. Unique Cut Number

**Clarification**: "unique cut num (PK)"

  

**Decision**: Auto-incrementing integer `cut_id` as PRIMARY KEY

- No separate `cut_number` field needed
- Simple and sufficient for identification

  

### 6. Cut Quantity Calculation

**Current**: `cut_qty` calculated from `barcode_scan_events` (phase_id=1, scan_in, status='Pending')

  

**New**: `cut_qty` = sum of pieces from `cut_details` for matching job_order_item

  

**Calculation Logic**:

```

For each job_order_item (color_id, size_id):

  cut_qty = SUM(

    (cut_item_ratio.ratio × cut_details.total_layers)

    - SUM(cut_size_transitions where from_item_id = item_id)

    + SUM(cut_size_transitions where to_item_id = item_id)

  )

  WHERE cut_details.color_id = job_order_item.color_id

    AND cut_details.job_order_id = job_order_item.job_order_id

    AND cut_item_ratio.item_id = job_order_item.item_id

```

  

---

  

## Suggested Database Schema

  

### Table 1: `ops.cut_details`

```sql

CREATE TABLE ops.cut_details (

    cut_id SERIAL PRIMARY KEY,

    job_order_id INTEGER NOT NULL REFERENCES core.job_orders(job_order_id) ON DELETE CASCADE,

    color_id INTEGER NOT NULL REFERENCES core.colors(color_id) ON DELETE RESTRICT,

    num_of_rolls_used INTEGER NOT NULL DEFAULT 0,

    total_layers INTEGER NOT NULL DEFAULT 0, -- Calculated: SUM(rolls.num_of_layers)

    job_order_items_ratios JSONB NOT NULL, -- Format: {"item_id": ratio, ...} where ratio = pieces per layer

    waste_fabric_weight DECIMAL(10, 3), -- Weight in kg

    created_at TIMESTAMP DEFAULT NOW() NOT NULL,

    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

    created_by_user_id INTEGER REFERENCES core.users(id),

    notes TEXT,

    CONSTRAINT fk_cut_job_order FOREIGN KEY (job_order_id) REFERENCES core.job_orders(job_order_id),

    CONSTRAINT fk_cut_color FOREIGN KEY (color_id) REFERENCES core.colors(color_id),

    CONSTRAINT chk_rolls_positive CHECK (num_of_rolls_used >= 0),

    CONSTRAINT chk_layers_positive CHECK (total_layers >= 0),

    CONSTRAINT chk_ratios_not_empty CHECK (job_order_items_ratios IS NOT NULL AND jsonb_typeof(job_order_items_ratios) = 'object')

);

  

CREATE INDEX idx_cut_details_job_order ON ops.cut_details(job_order_id);

CREATE INDEX idx_cut_details_color ON ops.cut_details(color_id);

CREATE INDEX idx_cut_details_job_color ON ops.cut_details(job_order_id, color_id);

CREATE INDEX idx_cut_details_ratios_gin ON ops.cut_details USING GIN (job_order_items_ratios); -- For JSONB queries

```

  

### Table 2: `ops.cut_rolls`

```sql

CREATE TABLE ops.cut_rolls (

    roll_id SERIAL PRIMARY KEY,

    cut_id INTEGER NOT NULL REFERENCES ops.cut_details(cut_id) ON DELETE CASCADE,

    roll_number INTEGER NOT NULL, -- Sequential number within cut (1, 2, 3, ...)

    weight DECIMAL(10, 3) NOT NULL, -- Total roll weight in kg

    layer_weight DECIMAL(10, 3) NOT NULL, -- Weight per layer in kg

    num_of_layers INTEGER NOT NULL, -- Number of layers this roll produced

    created_at TIMESTAMP DEFAULT NOW() NOT NULL,

    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

    CONSTRAINT fk_roll_cut FOREIGN KEY (cut_id) REFERENCES ops.cut_details(cut_id),

    CONSTRAINT chk_roll_weight_positive CHECK (weight > 0),

    CONSTRAINT chk_layer_weight_positive CHECK (layer_weight > 0),

    CONSTRAINT chk_layers_positive CHECK (num_of_layers > 0),

    CONSTRAINT uq_cut_roll_number UNIQUE (cut_id, roll_number)

);

  

CREATE INDEX idx_cut_rolls_cut ON ops.cut_rolls(cut_id);

```

  

### Table 3: `ops.cut_size_transitions`

```sql

CREATE TABLE ops.cut_size_transitions (

    transition_id SERIAL PRIMARY KEY,

    cut_id INTEGER NOT NULL REFERENCES ops.cut_details(cut_id) ON DELETE CASCADE,

    from_item_id INTEGER NOT NULL REFERENCES core.job_order_items(item_id) ON DELETE RESTRICT,

    to_item_id INTEGER NOT NULL REFERENCES core.job_order_items(item_id) ON DELETE RESTRICT,

    quantity INTEGER NOT NULL, -- Number of pieces converted

    notes TEXT, -- Reason for transition

    created_at TIMESTAMP DEFAULT NOW() NOT NULL,

    updated_at TIMESTAMP DEFAULT NOW() NOT NULL,

    CONSTRAINT fk_transition_cut FOREIGN KEY (cut_id) REFERENCES ops.cut_details(cut_id),

    CONSTRAINT fk_transition_from_item FOREIGN KEY (from_item_id) REFERENCES core.job_order_items(item_id),

    CONSTRAINT fk_transition_to_item FOREIGN KEY (to_item_id) REFERENCES core.job_order_items(item_id),

    CONSTRAINT chk_transition_quantity_positive CHECK (quantity > 0),

    CONSTRAINT chk_transition_different_items CHECK (from_item_id != to_item_id)

);

  

CREATE INDEX idx_cut_transitions_cut ON ops.cut_size_transitions(cut_id);

CREATE INDEX idx_cut_transitions_from ON ops.cut_size_transitions(from_item_id);

CREATE INDEX idx_cut_transitions_to ON ops.cut_size_transitions(to_item_id);

```

  

---

  

## Data Validation & Business Rules

  

### 1. Ratio Validation

**Rule**: Ratios represent **pieces per layer** (not percentages)

- Ratios can be > 1.0 (e.g., 2.5 pieces per layer for a size)

- Ratios do NOT need to sum to 1.0 (flexible production needs)

- All ratios must be >= 0

- JSONB format: `{"item_id": ratio}` where ratio is numeric

- All `item_id` keys in JSONB must:
  - Exist in `core.job_order_items`
  - Belong to the cut's `job_order_id`
  - Belong to the cut's `color_id`

  

### 2. Color Consistency

**Rule**: All `item_id` in `job_order_items_ratios` JSONB must:

- Belong to the same `color_id` as the cut (enforce in application logic)

- Belong to the cut's `job_order_id` (enforce in application logic)

  

### 3. Size Transition Validation

**Rule**:

- `from_item_id` and `to_item_id` must belong to same `job_order_id`

- `from_item_id` should exist as a key in the cut's `job_order_items_ratios` JSONB

- Transition quantity cannot exceed available pieces from that size

- Both items must belong to the same `color_id` as the cut

  

### 4. Total Layers Calculation

**Rule**: `cut_details.total_layers` = SUM(`cut_rolls.num_of_layers`)

- Calculate automatically via trigger or application logic

- `num_of_rolls_used` should match COUNT(`cut_rolls`)

  

---

  

## Summary Update Logic

  

### Updated Function: `ops.refresh_job_order_items_summary_for_jobs`

  

**Change**: Replace `cut_qty` calculation from `barcode_scan_events` to `cut_details`

**No backward compatibility needed** - completely replace the old calculation method.

  

**New Calculation** (using JSONB for ratios):

```sql

-- Calculate cut_qty from cut_details

LEFT JOIN (

    SELECT

        joi.item_id,

        COALESCE(SUM(

            -- Extract ratio from JSONB and multiply by total_layers

            ((cd.job_order_items_ratios->>joi.item_id::text)::NUMERIC * cd.total_layers)::INTEGER

            -- Subtract outgoing transitions

            - COALESCE(SUM(CASE WHEN cst.from_item_id = joi.item_id THEN cst.quantity ELSE 0 END), 0)

            -- Add incoming transitions

            + COALESCE(SUM(CASE WHEN cst.to_item_id = joi.item_id THEN cst.quantity ELSE 0 END), 0)

        ), 0) as cut_qty

    FROM core.job_order_items joi

    LEFT JOIN ops.cut_details cd ON cd.job_order_id = joi.job_order_id

        AND cd.color_id = joi.color_id

        AND cd.job_order_items_ratios ? joi.item_id::text  -- Item must exist in ratios JSONB

    LEFT JOIN ops.cut_size_transitions cst ON cst.cut_id = cd.cut_id

    WHERE joi.job_order_id = job_order_id_var

    GROUP BY joi.item_id

) cut_stats ON joi.item_id = cut_stats.item_id

```

  

**Performance Optimization**: 

- Only refresh summary for affected `job_order_items` when a cut is created/updated/deleted

- Use targeted refresh: `refresh_job_order_items_summary_for_jobs(ARRAY[affected_job_order_id])`

- Trigger summary refresh after cut creation/update/deletion operations

  

---

  

## Triggers

  

### Trigger 1: Update Total Layers and Roll Count

```sql

CREATE OR REPLACE FUNCTION ops.update_cut_total_layers()

RETURNS TRIGGER AS $$

DECLARE

    v_cut_id INTEGER;

BEGIN

    v_cut_id = COALESCE(NEW.cut_id, OLD.cut_id);

    

    UPDATE ops.cut_details

    SET

        total_layers = (

            SELECT COALESCE(SUM(num_of_layers), 0)

            FROM ops.cut_rolls

            WHERE cut_id = v_cut_id

        ),

        num_of_rolls_used = (

            SELECT COUNT(*)

            FROM ops.cut_rolls

            WHERE cut_id = v_cut_id

        ),

        updated_at = NOW()

    WHERE cut_id = v_cut_id;

    

    RETURN COALESCE(NEW, OLD);

END;

$$ LANGUAGE plpgsql;

  

CREATE TRIGGER trigger_update_cut_total_layers

    AFTER INSERT OR UPDATE OR DELETE ON ops.cut_rolls

    FOR EACH ROW

    EXECUTE FUNCTION ops.update_cut_total_layers();

```

  

### Trigger 2: Update Timestamp on Cut Details

```sql

CREATE OR REPLACE FUNCTION ops.update_cut_details_timestamp()

RETURNS TRIGGER AS $$

BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;

$$ LANGUAGE plpgsql;

  

CREATE TRIGGER trigger_update_cut_details_timestamp

    BEFORE UPDATE ON ops.cut_details

    FOR EACH ROW

    EXECUTE FUNCTION ops.update_cut_details_timestamp();

```

  

### Trigger 3: Refresh Summary After Cut Changes

```sql

CREATE OR REPLACE FUNCTION ops.refresh_summary_on_cut_change()

RETURNS TRIGGER AS $$

DECLARE

    v_job_order_id INTEGER;

BEGIN

    v_job_order_id = COALESCE(NEW.job_order_id, OLD.job_order_id);

    

    -- Refresh summary for affected job order

    PERFORM ops.refresh_job_order_items_summary_for_jobs(ARRAY[v_job_order_id]);

    PERFORM reporting.refresh_job_order_summary_for_jobs(ARRAY[v_job_order_id]);

    

    RETURN COALESCE(NEW, OLD);

END;

$$ LANGUAGE plpgsql;

  

CREATE TRIGGER trigger_refresh_summary_on_cut_insert

    AFTER INSERT ON ops.cut_details

    FOR EACH ROW

    EXECUTE FUNCTION ops.refresh_summary_on_cut_change();

  

CREATE TRIGGER trigger_refresh_summary_on_cut_update

    AFTER UPDATE ON ops.cut_details

    FOR EACH ROW

    WHEN (OLD.job_order_items_ratios IS DISTINCT FROM NEW.job_order_items_ratios

          OR OLD.total_layers IS DISTINCT FROM NEW.total_layers)

    EXECUTE FUNCTION ops.refresh_summary_on_cut_change();

  

CREATE TRIGGER trigger_refresh_summary_on_cut_delete

    AFTER DELETE ON ops.cut_details

    FOR EACH ROW

    EXECUTE FUNCTION ops.refresh_summary_on_cut_change();
```

  

### Trigger 4: Refresh Summary After Size Transitions Change

```sql

CREATE OR REPLACE FUNCTION ops.refresh_summary_on_transition_change()

RETURNS TRIGGER AS $$

DECLARE

    v_job_order_id INTEGER;

BEGIN

    SELECT job_order_id INTO v_job_order_id

    FROM ops.cut_details

    WHERE cut_id = COALESCE(NEW.cut_id, OLD.cut_id);

    

    IF v_job_order_id IS NOT NULL THEN

        PERFORM ops.refresh_job_order_items_summary_for_jobs(ARRAY[v_job_order_id]);

        PERFORM reporting.refresh_job_order_summary_for_jobs(ARRAY[v_job_order_id]);

    END IF;

    

    RETURN COALESCE(NEW, OLD);

END;

$$ LANGUAGE plpgsql;

  

CREATE TRIGGER trigger_refresh_summary_on_transition_insert

    AFTER INSERT ON ops.cut_size_transitions

    FOR EACH ROW

    EXECUTE FUNCTION ops.refresh_summary_on_transition_change();

  

CREATE TRIGGER trigger_refresh_summary_on_transition_update

    AFTER UPDATE ON ops.cut_size_transitions

    FOR EACH ROW

    WHEN (OLD.quantity IS DISTINCT FROM NEW.quantity

          OR OLD.from_item_id IS DISTINCT FROM NEW.from_item_id

          OR OLD.to_item_id IS DISTINCT FROM NEW.to_item_id)

    EXECUTE FUNCTION ops.refresh_summary_on_transition_change();

  

CREATE TRIGGER trigger_refresh_summary_on_transition_delete

    AFTER DELETE ON ops.cut_size_transitions

    FOR EACH ROW

    EXECUTE FUNCTION ops.refresh_summary_on_transition_change();
```

  

---

  

## API Considerations

  

### 1. Cut Creation Flow

1. Validate input data:
   - All item_ids in ratios exist and belong to selected job_order + color
   - All ratios are >= 0
   - All roll data is valid (positive weights, layers)

2. Create `cut_details` record with `job_order_items_ratios` JSONB

3. Create multiple `cut_rolls` records

4. Optionally create `cut_size_transitions` records

5. Summary refresh triggered automatically via database triggers

  

### 2. Data Validation Logic

**Before Cut Creation/Update**:

- Validate all `item_id` keys in `job_order_items_ratios` JSONB:
  - Exist in `core.job_order_items`
  - Belong to the cut's `job_order_id`
  - Belong to the cut's `color_id`

- Validate all ratio values are numeric and >= 0

- Validate transition quantities (if provided):
  - `from_item_id` exists in ratios JSONB
  - Transition quantity doesn't exceed calculated pieces for that size

- Validate roll data:
  - Positive weights and layer counts
  - Consistent roll_number sequence

  

### 3. Query Endpoints

**GET** `/api/v1/cuts?job_order_id={id}` - Get all cuts for a job order

**GET** `/api/v1/cuts?job_order_id={id}&color_id={id}` - Get cuts for job order + color

**GET** `/api/v1/cuts/{cut_id}` - Get cut details with rolls and transitions

**POST** `/api/v1/cuts` - Create new cut

**PUT** `/api/v1/cuts/{cut_id}` - Update cut (ratios, waste weight, notes)

**DELETE** `/api/v1/cuts/{cut_id}` - Delete cut

**GET** `/api/v1/cuts/{cut_id}/rolls` - Get all rolls for a cut

**POST** `/api/v1/cuts/{cut_id}/rolls` - Add roll to cut

**GET** `/api/v1/cuts/{cut_id}/transitions` - Get size transitions for a cut

**POST** `/api/v1/cuts/{cut_id}/transitions` - Add size transition

  

### 4. Response Format Example

```json

{

  "cut_id": 1,

  "job_order_id": 100,

  "color_id": 5,

  "color_name": "Blue",

  "num_of_rolls_used": 3,

  "total_layers": 150,

  "job_order_items_ratios": {

    "101": 2.5,  // item_id 101: 2.5 pieces per layer

    "102": 1.8,  // item_id 102: 1.8 pieces per layer

    "103": 0.5   // item_id 103: 0.5 pieces per layer

  },

  "waste_fabric_weight": 12.5,

  "created_at": "2024-01-15T10:30:00Z",

  "updated_at": "2024-01-15T10:30:00Z",

  "created_by_user_id": 1,

  "notes": "Cut completed successfully",

  "rolls": [

    {

      "roll_id": 1,

      "roll_number": 1,

      "weight": 50.5,

      "layer_weight": 0.336,

      "num_of_layers": 50

    }

  ],

  "transitions": [

    {

      "transition_id": 1,

      "from_item_id": 101,

      "to_item_id": 102,

      "quantity": 10,

      "notes": "Size adjustment"

    }

  ],

  "calculated_pieces": {

    "101": 365,  // (2.5 * 150) - 10 = 365

    "102": 280,  // (1.8 * 150) + 10 = 280

    "103": 75    // 0.5 * 150 = 75

  }

}

```

  

---

  

## Potential Issues & Recommendations

  

### 1. **JSONB Ratio Storage**

**Decision**: Ratios stored as JSONB in `cut_details` table

- Format: `{"item_id": ratio}` where ratio = pieces per layer (can be > 1.0)

- No need for separate table since ratios aren't queried often

- Use GIN index on JSONB column for efficient lookups when needed

- Application logic validates item_ids belong to correct job_order + color

  

### 2. **No Cut Number Field**

**Decision**: Only auto-incrementing `cut_id` as primary key

- Simple and sufficient for identification

- No user-provided cut numbers needed

  

### 3. **No Backward Compatibility**

**Decision**: Completely replace `barcode_scan_events` calculation with `cut_details`

- Start fresh - no migration needed

- Summary refresh only uses `cut_details` table

- Barcode scanning still used for other phases, just not for cut_qty calculation

  

### 4. **Targeted Summary Refresh**

**Decision**: Only refresh summaries for affected job orders

- Triggers automatically refresh summary when cuts are created/updated/deleted

- Only affected `job_order_items` are recalculated (via `refresh_job_order_items_summary_for_jobs`)

- Efficient - no full table scans needed

### 5. **Audit Trail**

**Recommendation**: Add `created_at`, `updated_at`, `created_by_user_id` to all tables for audit purposes
Answer : okay
  

### 6. **Roll Numbering**

**Issue**: Sequential numbering within cut

**Recommendation**: Use `roll_number` (1, 2, 3...) with UNIQUE constraint on (cut_id, roll_number)
Answer : Yes
  

### 7. **Size Transition Logic**

**Issue**: Complex calculation with transitions

**Recommendation**:

- Create helper function: `calculate_final_pieces(item_id, cut_id)`

- Use in summary refresh and API responses

  

---

  

## Final Decisions Summary

  

1. **Single color per cut**: Confirmed - each cut handles one color only

2. **Ratios are flexible**: No strict sum to 1.0 required - ratios represent pieces per layer

3. **Ratios can exceed 1.0**: Yes - ratio = pieces per layer (e.g., 2.5 pieces per layer is valid)

4. **Start fresh**: No migration needed - new system starts clean

5. **Auto-incrementing cut_id**: No separate cut_number field needed

6. **Weight units**: Kilograms (kg) - consistent with existing system

7. **Scope**: Only affects `cut_qty` in `job_order_items_summary` table - batches system remains for other phases

8. **Barcode scanning**: Still used for other phases - only cut_qty calculation changes to use `cut_details`

  

---

  

## Implementation Plan

  

### Phase 1: Database Schema

1. **Create Tables**:
   - `ops.cut_details` (with JSONB ratios column)
   - `ops.cut_rolls`
   - `ops.cut_size_transitions`

2. **Create Indexes**:
   - Foreign key indexes
   - GIN index on JSONB ratios column
   - Composite indexes for common queries

3. **Create Triggers**:
   - Update total_layers when rolls change
   - Update timestamps
   - Refresh summary on cut/transition changes

### Phase 2: Database Functions

1. **Update Summary Refresh Function**:
   - Modify `ops.refresh_job_order_items_summary_for_jobs`
   - Replace `barcode_scan_events` calculation with `cut_details` JSONB calculation
   - Handle size transitions in calculation

2. **Create Helper Functions** (optional):
   - `ops.calculate_cut_pieces(cut_id)` - Calculate pieces per size for a cut
   - `ops.validate_cut_ratios(cut_id)` - Validate ratios JSONB structure

### Phase 3: Backend API

1. **Create Models** (SQLAlchemy):
   - `CutDetails` model
   - `CutRoll` model
   - `CutSizeTransition` model

2. **Create Schemas** (Pydantic):
   - Request/response schemas for cuts
   - Validation schemas for ratios JSONB

3. **Create CRUD Operations**:
   - Create cut with validation
   - Update cut
   - Delete cut
   - Get cuts (with filters)

4. **Create Endpoints**:
   - CRUD for cuts
   - CRUD for rolls
   - CRUD for transitions
   - Validation endpoints

### Phase 4: Frontend

1. **Create Cut Management UI**:
   - Cut creation form (job_order, color selection)
   - Roll entry form (multiple rolls)
   - Ratio input (per size)
   - Size transition management
   - Cut listing and details view

2. **Integration**:
   - Integrate with existing job order pages
   - Update summary displays to show cut_qty from new system

### Phase 5: Testing

1. **Unit Tests**:
   - Ratio validation
   - Calculation logic
   - Transition validation

2. **Integration Tests**:
   - Cut creation flow
   - Summary refresh
   - Transition handling

3. **Sample Data**:
   - Create test cuts with various scenarios
   - Verify calculations are correct
   - Verify summary updates work properly

---

## Key Implementation Notes

1. **JSONB Ratios**: Store as `{"item_id": ratio}` - validate all keys are valid item_ids for the job_order + color

2. **Calculation**: `pieces = (ratio * total_layers) - outgoing_transitions + incoming_transitions`

3. **Summary Refresh**: Triggered automatically via database triggers - no manual refresh needed

4. **No Backward Compatibility**: Clean break from old system - start fresh

5. **Targeted Refresh**: Only affected job_orders are refreshed, not entire system