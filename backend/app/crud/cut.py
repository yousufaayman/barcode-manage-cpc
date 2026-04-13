from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy import text
import json
from .. import models
from .. import schemas

VALID_PRINT_STATUSES = {'pending', 'in_progress', 'completed'}


def resolve_material_id_for_cut(db: Session, job_order_id: int, color_id: int) -> Optional[int]:
    """
    Pick a material for this cut from job order material requests: prefer the row scoped to
    this color, otherwise any request for the job order with NULL color.
    """
    row = db.execute(
        text("""
            SELECT cfc.material_id
            FROM core.job_order_material_requests jomr
            JOIN core.client_fabric_codes cfc ON cfc.id = jomr.fabric_code_id
            WHERE jomr.job_order_id = :job_order_id
              AND cfc.color_id = :color_id
            ORDER BY jomr.id
            LIMIT 1
        """),
        {"job_order_id": job_order_id, "color_id": color_id},
    ).fetchone()
    if not row or row[0] is None:
        return None
    return int(row[0])


def resolve_print_status(has_prints: bool, requested_status: Optional[str], fallback_status: Optional[str] = None) -> Optional[str]:
    """
    Determine the print status to persist based on whether the job order requires printing.
    Returns None if printing is not required. Otherwise validates and normalizes the value.
    """
    if not has_prints:
        return None

    status = requested_status if requested_status is not None else fallback_status
    if status is None:
        status = 'pending'

    normalized = status.lower()
    if normalized not in VALID_PRINT_STATUSES:
        raise ValueError("Invalid print_status value. Must be one of: pending, in_progress, completed")
    return normalized

def get_cuts_by_job_order_id(db: Session, job_order_id: int) -> List[Dict[str, Any]]:
    """Get all cuts for a specific job order, returning cut_number, color, and color_id for frontend display"""
    result = db.execute(
        text("""
            SELECT DISTINCT
                cut_id,
                color_id,
                color_name
            FROM ops.cut_details_view
            WHERE job_order_id = :job_order_id
            ORDER BY cut_id DESC
        """),
        {"job_order_id": job_order_id}
    )
    
    cuts = []
    for row in result.fetchall():
        cuts.append({
            "cut_number": f"CUT-{row.cut_id}",
            "cut_id": row.cut_id,
            "color": row.color_name,
            "color_id": row.color_id
        })
    
    return cuts


def get_all_cut_details(
    db: Session, 
    skip: int = 0, 
    limit: int = 10,
    job_order_id: Optional[int] = None,
    model_id: Optional[int] = None,
    color_id: Optional[int] = None,
    print_status: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], int]:
    """Get all cut details from the cut_details_view with pagination and filtering.
    
    Returns:
        Tuple of (list of cut details, total count)
    """
    where_conditions = []
    params = {}
    
    if job_order_id is not None:
        where_conditions.append("job_order_id = :job_order_id")
        params["job_order_id"] = job_order_id
    
    if model_id is not None:
        where_conditions.append("model_id = :model_id")
        params["model_id"] = model_id
    
    if color_id is not None:
        where_conditions.append("color_id = :color_id")
        params["color_id"] = color_id
    
    if print_status is not None:
        if print_status == "no_printing":
            where_conditions.append("(requires_printing = false OR requires_printing IS NULL)")
        else:
            where_conditions.append("print_status = :print_status")
            params["print_status"] = print_status
    
    where_clause = ""
    if where_conditions:
        where_clause = "WHERE " + " AND ".join(where_conditions)
    
    count_query = f"""
        SELECT COUNT(DISTINCT cut_id) as total
        FROM ops.cut_details_view
        {where_clause}
    """
    count_result = db.execute(text(count_query), params)
    total_count = count_result.scalar()
    
    cut_ids_query = f"""
        SELECT DISTINCT cdv.cut_id, MAX(cdv.created_at) as created_at
        FROM ops.cut_details_view cdv
        {where_clause}
        GROUP BY cdv.cut_id
        ORDER BY MAX(cdv.created_at) DESC NULLS LAST, cdv.cut_id DESC
        LIMIT :limit OFFSET :skip
    """
    params_with_pagination = {**params, "limit": limit, "skip": skip}
    cut_ids_result = db.execute(text(cut_ids_query), params_with_pagination)
    cut_ids = [row[0] for row in cut_ids_result.fetchall()]
    
    if not cut_ids:
        return [], total_count
    
    placeholders = ','.join([':cut_id_' + str(i) for i in range(len(cut_ids))])
    cut_ids_params = {f'cut_id_{i}': cut_id for i, cut_id in enumerate(cut_ids)}
    
    result = db.execute(
        text(f"""
            SELECT 
                cut_id,
                job_order_id,
                job_order_number,
                model_id,
                model_name,
                color_id,
                color_name,
                size_id,
                size_value,
                item_id,
                total_pieces,
                waste_fabric_weight,
                created_at,
                cut_weight,
                num_of_rolls_used,
                total_layers,
                created_by_user_id,
                notes,
                print_status,
                requires_printing
            FROM ops.cut_details_view
            WHERE cut_id IN ({placeholders})
            ORDER BY created_at DESC NULLS LAST, cut_id DESC, item_id
        """),
        cut_ids_params
    )
    
    rows = result.fetchall()
    
    cuts_dict = {}
    for row in rows:
        cut_id = row.cut_id
        if cut_id not in cuts_dict:
            cuts_dict[cut_id] = {
                "cut_id": cut_id,
                "job_order_id": row.job_order_id,
                "job_order_number": row.job_order_number,
                "model_id": row.model_id,
                "model_name": row.model_name,
                "color_id": row.color_id,
                "color_name": row.color_name,
                "waste_fabric_weight": float(row.waste_fabric_weight) if row.waste_fabric_weight else None,
                "marker_length": None,  # Fetched from ops.cut_details below
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "cut_weight": float(row.cut_weight) if row.cut_weight else 0,
                "num_of_rolls_used": row.num_of_rolls_used,
                "total_layers": row.total_layers,
                "created_by_user_id": row.created_by_user_id,
                "notes": row.notes,
                "print_status": row.print_status,
                "requires_printing": bool(row.requires_printing),
                "material_id": None,
                "material_name": None,
                "sizes": []
            }
        
        cuts_dict[cut_id]["sizes"].append({
            "size_id": row.size_id,
            "size_value": row.size_value,
            "item_id": row.item_id,
            "total_pieces": row.total_pieces
        })
    
    # marker_length, material_id, material_name from ops.cut_details (view may omit some columns)
    if cut_ids:
        placeholders = ','.join([':cut_id_' + str(i) for i in range(len(cut_ids))])
        marker_params = {f'cut_id_{i}': cid for i, cid in enumerate(cut_ids)}
        extra_result = db.execute(
            text(f"""
                SELECT cd.cut_id, cd.marker_length, cd.material_id, m.material_name
                FROM ops.cut_details cd
                LEFT JOIN core.materials m ON m.material_id = cd.material_id
                WHERE cd.cut_id IN ({placeholders})
            """),
            marker_params
        )
        for mrow in extra_result.fetchall():
            if mrow[0] in cuts_dict:
                cuts_dict[mrow[0]]["marker_length"] = float(mrow[1]) if mrow[1] is not None else None
                cuts_dict[mrow[0]]["material_id"] = int(mrow[2]) if mrow[2] is not None else None
                cuts_dict[mrow[0]]["material_name"] = mrow[3]
    
    cuts_list = []
    for cut_id in cut_ids:
        if cut_id in cuts_dict:
            cuts_list.append(cuts_dict[cut_id])
    
    cuts_list.sort(
        key=lambda x: (
            x.get("created_at") if x.get("created_at") else "",
            -(x.get("cut_id") or 0)
        ),
        reverse=True
    )
    
    return cuts_list, total_count


def get_cut_sequence_per_job_order(db: Session, job_order_id: int, cut_id: int) -> int:
    """
    1-based index of this cut among all cuts for the job order (ORDER BY cut_id ASC).
    Used with roll_number to pack ops.batches.layers as: cut_seq * LAYERS_ROLL_MOD + roll (decimal, no hex).
    """
    result = db.execute(
        text("""
            SELECT cut_id FROM ops.cut_details
            WHERE job_order_id = :job_order_id
            ORDER BY cut_id ASC
        """),
        {"job_order_id": job_order_id},
    )
    cut_ids = [row[0] for row in result.fetchall()]
    try:
        idx = cut_ids.index(cut_id)
    except ValueError as exc:
        raise ValueError(
            f"cut_id {cut_id} is not among cuts for job_order_id {job_order_id}"
        ) from exc
    return idx + 1


def get_cut_details_by_id(db: Session, cut_id: int) -> Optional[Dict[str, Any]]:
    """Get cut details by cut_id from the cut_details_view with rolls and transitions"""
    # First, get the ratios and marker_length from the cut_details table directly
    cut_details_result = db.execute(
        text("""
            SELECT 
                cd.job_order_items_ratios,
                cd.marker_length,
                cd.material_id,
                m.material_name
            FROM ops.cut_details cd
            LEFT JOIN core.materials m ON m.material_id = cd.material_id
            WHERE cd.cut_id = :cut_id
        """),
        {"cut_id": cut_id}
    )
    
    cut_details_row = cut_details_result.fetchone()
    if not cut_details_row:
        return None
    
    # Get the ratios JSONB - PostgreSQL JSONB is returned as dict by SQLAlchemy
    ratios = cut_details_row[0] if cut_details_row else {}
    marker_length_val = float(cut_details_row[1]) if cut_details_row[1] is not None else None
    material_id_val = int(cut_details_row[2]) if cut_details_row[2] is not None else None
    material_name_val = cut_details_row[3]
    # If it's a string (shouldn't happen with JSONB, but just in case), parse it
    if isinstance(ratios, str):
        import json
        try:
            ratios = json.loads(ratios)
        except:
            ratios = {}
    # Ensure it's a dict
    if not isinstance(ratios, dict):
        ratios = {}
    
    # Get cut details and sizes from view
    result = db.execute(
        text("""
            SELECT 
                cut_id,
                job_order_id,
                job_order_number,
                model_id,
                model_name,
                color_id,
                color_name,
                size_id,
                size_value,
                item_id,
                total_pieces,
                waste_fabric_weight,
                created_at,
                cut_weight,
                num_of_rolls_used,
                total_layers,
                created_by_user_id,
                notes,
                print_status,
                requires_printing
            FROM ops.cut_details_view
            WHERE cut_id = :cut_id
            ORDER BY item_id
        """),
        {"cut_id": cut_id}
    )
    
    rows = result.fetchall()
    if not rows:
        return None
    
    cut_data = None
    sizes = []
    
    for row in rows:
        if cut_data is None:
            cut_data = {
                "cut_id": row.cut_id,
                "job_order_id": row.job_order_id,
                "job_order_number": row.job_order_number,
                "model_id": row.model_id,
                "model_name": row.model_name,
                "color_id": row.color_id,
                "color_name": row.color_name,
                "waste_fabric_weight": float(row.waste_fabric_weight) if row.waste_fabric_weight else None,
                "marker_length": marker_length_val,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "cut_weight": float(row.cut_weight) if row.cut_weight else 0,
                "num_of_rolls_used": row.num_of_rolls_used,
                "total_layers": row.total_layers,
                "created_by_user_id": row.created_by_user_id,
                "notes": row.notes,
                "print_status": row.print_status,
                "requires_printing": bool(row.requires_printing),
                "job_order_items_ratios": ratios,  # Include ratios
                "material_id": material_id_val,
                "material_name": material_name_val,
            }
        
        # Get ratio for this item_id
        item_ratio = None
        if ratios and isinstance(ratios, dict):
            item_id_str = str(row.item_id)
            if item_id_str in ratios:
                item_ratio = float(ratios[item_id_str])
        
        sizes.append({
            "size_id": row.size_id,
            "size_value": row.size_value,
            "item_id": row.item_id,
            "total_pieces": row.total_pieces,
            "ratio": item_ratio,  # Include ratio for each size
        })
    
    if not cut_data:
        return None
    
    cut_data["sizes"] = sizes
    
    # Attach job order print configuration
    try:
        job_order_config_row = db.execute(
            text("""
                SELECT print_config
                FROM core.job_orders
                WHERE job_order_id = :job_order_id
            """),
            {"job_order_id": cut_data["job_order_id"]}
        ).fetchone()
        if job_order_config_row:
            cut_data["job_order_print_config"] = job_order_config_row.print_config
    except Exception:
        cut_data["job_order_print_config"] = None
    
    # Get rolls for this cut
    try:
        rolls_result = db.execute(
            text("""
                SELECT 
                    roll_id,
                    cut_id,
                    roll_number,
                    weight,
                    layer_weight,
                    num_of_layers,
                    roll_width,
                    created_at
                FROM ops.cut_rolls
                WHERE cut_id = :cut_id
                ORDER BY roll_number
            """),
            {"cut_id": cut_id}
        )
        
        rolls = []
        for roll_row in rolls_result.fetchall():
            rolls.append({
                "roll_id": roll_row.roll_id,
                "cut_id": roll_row.cut_id,
                "roll_number": roll_row.roll_number,
                "weight": float(roll_row.weight) if roll_row.weight else 0,
                "layer_weight": float(roll_row.layer_weight) if roll_row.layer_weight else 0,
                "num_of_layers": roll_row.num_of_layers,
                "roll_width": float(roll_row.roll_width) if getattr(roll_row, "roll_width", None) is not None else 0,
                "created_at": roll_row.created_at.isoformat() if roll_row.created_at else None,
            })
        
        cut_data["rolls"] = rolls
    except Exception as e:
        cut_data["rolls"] = []
    
    # Get size transitions for this cut
    try:
        transitions_result = db.execute(
            text("""
                SELECT 
                    cst.transition_id,
                    cst.cut_id,
                    cst.from_item_id,
                    cst.to_item_id,
                    cst.quantity,
                    cst.notes,
                    cst.created_at,
                    from_joi.size_id as from_size_id,
                    from_size.size_value as from_size_value,
                    to_joi.size_id as to_size_id,
                    to_size.size_value as to_size_value
                FROM ops.cut_size_transitions cst
                JOIN core.job_order_items from_joi ON from_joi.item_id = cst.from_item_id
                JOIN core.sizes from_size ON from_size.size_id = from_joi.size_id
                JOIN core.job_order_items to_joi ON to_joi.item_id = cst.to_item_id
                JOIN core.sizes to_size ON to_size.size_id = to_joi.size_id
                WHERE cst.cut_id = :cut_id
                ORDER BY cst.transition_id
            """),
            {"cut_id": cut_id}
        )
        
        transitions = []
        for trans_row in transitions_result.fetchall():
            transitions.append({
                "transition_id": trans_row.transition_id,
                "cut_id": trans_row.cut_id,
                "from_item_id": trans_row.from_item_id,
                "to_item_id": trans_row.to_item_id,
                "quantity": trans_row.quantity,
                "notes": trans_row.notes,
                "created_at": trans_row.created_at.isoformat() if trans_row.created_at else None,
                "from_size_id": trans_row.from_size_id,
                "from_size_value": trans_row.from_size_value,
                "to_size_id": trans_row.to_size_id,
                "to_size_value": trans_row.to_size_value,
            })
        
        cut_data["transitions"] = transitions
    except Exception as e:
        cut_data["transitions"] = []
    
    return cut_data


def create_cut(db: Session, cut: schemas.CutCreate, user_id: Optional[int] = None) -> Dict[str, Any]:
    """Create a new cut with rolls and transitions"""
    # Validate job_order_id exists and capture whether printing is required
    job_order_row = db.execute(
        text("""
            SELECT 
                job_order_id,
                (print_config IS NOT NULL) AS has_prints
            FROM core.job_orders 
            WHERE job_order_id = :job_order_id
        """),
        {"job_order_id": cut.job_order_id}
    ).fetchone()
    if not job_order_row:
        raise ValueError(f"Job order with ID {cut.job_order_id} not found")
    job_order_has_prints = bool(job_order_row.has_prints)
    
    # Validate color_id exists
    color_result = db.execute(
        text("SELECT color_id FROM core.colors WHERE color_id = :color_id"),
        {"color_id": cut.color_id}
    )
    if not color_result.fetchone():
        raise ValueError(f"Color with ID {cut.color_id} not found")
    
    # Validate job_order_items exist and belong to the job_order and color
    item_ids = list(cut.job_order_items_ratios.keys())
    if not item_ids:
        raise ValueError("At least one item ratio is required")
    
    placeholders = ','.join([':item_id_' + str(i) for i in range(len(item_ids))])
    params = {f'item_id_{i}': int(item_id) for i, item_id in enumerate(item_ids)}
    params['job_order_id'] = cut.job_order_id
    params['color_id'] = cut.color_id
    
    items_result = db.execute(
        text(f"""
            SELECT item_id FROM core.job_order_items
            WHERE item_id IN ({placeholders})
                AND job_order_id = :job_order_id
                AND color_id = :color_id
        """),
        params
    )
    valid_item_ids = {str(row[0]) for row in items_result.fetchall()}
    
    if len(valid_item_ids) != len(item_ids):
        invalid_ids = set(item_ids) - valid_item_ids
        raise ValueError(f"Invalid item_ids or items don't belong to job_order {cut.job_order_id} and color {cut.color_id}: {invalid_ids}")
    
    # Convert ratios dict to JSONB format (keys as strings)
    ratios_jsonb = json.dumps({str(k): float(v) for k, v in cut.job_order_items_ratios.items()})
    
    print_status_value = resolve_print_status(job_order_has_prints, cut.print_status)
    material_exists = db.execute(
        text("SELECT material_id FROM core.materials WHERE material_id = :material_id"),
        {"material_id": cut.material_id},
    ).fetchone()
    if not material_exists:
        raise ValueError(f"Material with ID {cut.material_id} not found")
    resolved_material_id = int(cut.material_id)

    # Insert cut_details
    cut_result = db.execute(
        text("""
            INSERT INTO ops.cut_details (
                job_order_id,
                color_id,
                job_order_items_ratios,
                waste_fabric_weight,
                marker_length,
                created_by_user_id,
                notes,
                print_status,
                total_layers,
                num_of_rolls_used,
                material_id
            ) VALUES (
                :job_order_id,
                :color_id,
                (:ratios)::jsonb,
                :waste_fabric_weight,
                :marker_length,
                :user_id,
                :notes,
                :print_status,
                0,
                0,
                :material_id
            ) RETURNING cut_id
        """),
        {
            "job_order_id": cut.job_order_id,
            "color_id": cut.color_id,
            "ratios": ratios_jsonb,
            "waste_fabric_weight": cut.waste_fabric_weight,
            "marker_length": getattr(cut, "marker_length", None),
            "user_id": user_id,
            "notes": cut.notes,
            "print_status": print_status_value,
            "material_id": resolved_material_id,
        }
    )
    cut_id = cut_result.scalar()
    db.commit()
    
    # Insert rolls if provided
    if cut.rolls:
        for roll in cut.rolls:
            db.execute(
                text("""
                    INSERT INTO ops.cut_rolls (
                        cut_id,
                        roll_number,
                        weight,
                        layer_weight,
                        num_of_layers,
                        roll_width
                    ) VALUES (
                        :cut_id,
                        :roll_number,
                        :weight,
                        :layer_weight,
                        :num_of_layers,
                        :roll_width
                    )
                """),
                {
                    "cut_id": cut_id,
                    "roll_number": roll.roll_number,
                    "weight": roll.weight,
                    "layer_weight": roll.layer_weight,
                    "num_of_layers": roll.num_of_layers,
                    "roll_width": getattr(roll, "roll_width", None),
                }
            )
        db.commit()
    
    # Insert transitions if provided
    if cut.transitions:
        for transition in cut.transitions:
            # Validate from_item_id and to_item_id exist and belong to the job_order
            db.execute(
                text("""
                    INSERT INTO ops.cut_size_transitions (
                        cut_id,
                        from_item_id,
                        to_item_id,
                        quantity,
                        notes
                    ) VALUES (
                        :cut_id,
                        :from_item_id,
                        :to_item_id,
                        :quantity,
                        :notes
                    )
                """),
                {
                    "cut_id": cut_id,
                    "from_item_id": transition.from_item_id,
                    "to_item_id": transition.to_item_id,
                    "quantity": transition.quantity,
                    "notes": transition.notes
                }
            )
        db.commit()
    
    db.execute(
        text("SELECT ops.refresh_job_order_items_summary_for_jobs(ARRAY[:job_order_id])"),
        {"job_order_id": cut.job_order_id}
    )
    db.execute(
        text("SELECT reporting.refresh_job_order_summary_for_jobs(ARRAY[:job_order_id])"),
        {"job_order_id": cut.job_order_id}
    )
    db.commit()
    
    return get_cut_details_by_id(db, cut_id)


def update_cut(db: Session, cut_id: int, cut_update: schemas.CutUpdate, user_id: Optional[int] = None) -> Dict[str, Any]:
    """Update an existing cut and optionally replace rolls and transitions."""
    existing_cut = db.execute(
        text("""
            SELECT 
                cut_id,
                job_order_id,
                color_id,
                job_order_items_ratios,
                waste_fabric_weight,
                marker_length,
                notes,
                print_status,
                material_id
            FROM ops.cut_details
            WHERE cut_id = :cut_id
        """),
        {"cut_id": cut_id}
    ).fetchone()

    if not existing_cut:
        raise ValueError("Cut not found")

    new_job_order_id = cut_update.job_order_id if cut_update.job_order_id is not None else existing_cut.job_order_id
    new_color_id = cut_update.color_id if cut_update.color_id is not None else existing_cut.color_id

    ratios_dict = cut_update.job_order_items_ratios if cut_update.job_order_items_ratios is not None else existing_cut.job_order_items_ratios or {}
    if not ratios_dict:
        raise ValueError("At least one item ratio is required")

    # Validate job_order_id exists
    job_order_row = db.execute(
        text("""
            SELECT 
                job_order_id,
                (print_config IS NOT NULL) AS has_prints
            FROM core.job_orders 
            WHERE job_order_id = :job_order_id
        """),
        {"job_order_id": new_job_order_id}
    ).fetchone()
    if not job_order_row:
        raise ValueError(f"Job order with ID {new_job_order_id} not found")
    job_order_has_prints = bool(job_order_row.has_prints)
    
    # Validate color_id exists
    color_result = db.execute(
        text("SELECT color_id FROM core.colors WHERE color_id = :color_id"),
        {"color_id": new_color_id}
    )
    if not color_result.fetchone():
        raise ValueError(f"Color with ID {new_color_id} not found")

    # Validate job_order_items
    item_ids = list(ratios_dict.keys())
    placeholders = ','.join([':item_id_' + str(i) for i in range(len(item_ids))])
    params = {f'item_id_{i}': int(item_id) for i, item_id in enumerate(item_ids)}
    params['job_order_id'] = new_job_order_id
    params['color_id'] = new_color_id

    items_result = db.execute(
        text(f"""
            SELECT item_id FROM core.job_order_items
            WHERE item_id IN ({placeholders})
                AND job_order_id = :job_order_id
                AND color_id = :color_id
        """),
        params
    )
    valid_item_ids = {str(row[0]) for row in items_result.fetchall()}

    if len(valid_item_ids) != len(item_ids):
        invalid_ids = set(item_ids) - valid_item_ids
        raise ValueError(f"Invalid item_ids or items don't belong to job_order {new_job_order_id} and color {new_color_id}: {invalid_ids}")

    ratios_jsonb = json.dumps({str(k): float(v) for k, v in ratios_dict.items()})

    new_print_status = resolve_print_status(job_order_has_prints, cut_update.print_status, existing_cut.print_status)

    new_marker_length = cut_update.marker_length if cut_update.marker_length is not None else existing_cut.marker_length
    if cut_update.material_id is not None:
        material_exists = db.execute(
            text("SELECT material_id FROM core.materials WHERE material_id = :material_id"),
            {"material_id": cut_update.material_id},
        ).fetchone()
        if not material_exists:
            raise ValueError(f"Material with ID {cut_update.material_id} not found")
        new_material_id = int(cut_update.material_id)
    elif cut_update.job_order_id is not None or cut_update.color_id is not None:
        new_material_id = resolve_material_id_for_cut(db, new_job_order_id, new_color_id)
    else:
        new_material_id = existing_cut.material_id

    db.execute(
        text("""
            UPDATE ops.cut_details
            SET job_order_id = :job_order_id,
                color_id = :color_id,
                job_order_items_ratios = (:ratios)::jsonb,
                waste_fabric_weight = :waste_fabric_weight,
                marker_length = :marker_length,
                notes = :notes,
                print_status = :print_status,
                material_id = :material_id
            WHERE cut_id = :cut_id
        """),
        {
            "job_order_id": new_job_order_id,
            "color_id": new_color_id,
            "ratios": ratios_jsonb,
            "waste_fabric_weight": cut_update.waste_fabric_weight,
            "marker_length": new_marker_length,
            "notes": cut_update.notes,
            "print_status": new_print_status,
            "material_id": new_material_id,
            "cut_id": cut_id
        }
    )
    db.commit()

    if cut_update.rolls is not None:
        db.execute(
            text("DELETE FROM ops.cut_rolls WHERE cut_id = :cut_id"),
            {"cut_id": cut_id}
        )
        db.commit()

        for roll in cut_update.rolls:
            db.execute(
                text("""
                    INSERT INTO ops.cut_rolls (
                        cut_id,
                        roll_number,
                        weight,
                        layer_weight,
                        num_of_layers,
                        roll_width
                    ) VALUES (
                        :cut_id,
                        :roll_number,
                        :weight,
                        :layer_weight,
                        :num_of_layers,
                        :roll_width
                    )
                """),
                {
                    "cut_id": cut_id,
                    "roll_number": roll.roll_number,
                    "weight": roll.weight,
                    "layer_weight": roll.layer_weight,
                    "num_of_layers": roll.num_of_layers,
                    "roll_width": getattr(roll, "roll_width", None),
                }
            )
        db.commit()

    if cut_update.transitions is not None:
        db.execute(
            text("DELETE FROM ops.cut_size_transitions WHERE cut_id = :cut_id"),
            {"cut_id": cut_id}
        )
        db.commit()

        for transition in cut_update.transitions:
            db.execute(
                text("""
                    INSERT INTO ops.cut_size_transitions (
                        cut_id,
                        from_item_id,
                        to_item_id,
                        quantity,
                        notes
                    ) VALUES (
                        :cut_id,
                        :from_item_id,
                        :to_item_id,
                        :quantity,
                        :notes
                    )
                """),
                {
                    "cut_id": cut_id,
                    "from_item_id": transition.from_item_id,
                    "to_item_id": transition.to_item_id,
                    "quantity": transition.quantity,
                    "notes": transition.notes
                }
            )
        db.commit()

    job_order_ids_to_refresh = set()
    job_order_ids_to_refresh.add(new_job_order_id)
    if existing_cut.job_order_id != new_job_order_id:
        job_order_ids_to_refresh.add(existing_cut.job_order_id)
    
    for job_order_id in job_order_ids_to_refresh:
        db.execute(
            text("SELECT ops.refresh_job_order_items_summary_for_jobs(ARRAY[:job_order_id])"),
            {"job_order_id": job_order_id}
        )
        db.execute(
            text("SELECT reporting.refresh_job_order_summary_for_jobs(ARRAY[:job_order_id])"),
            {"job_order_id": job_order_id}
        )
    db.commit()

    return get_cut_details_by_id(db, cut_id)


def archive_cut_details_by_job_order_id(db: Session, job_order_id: int):
    """Archive all cut_details for a given job_order_id"""
    from sqlalchemy import text
    
    result = db.execute(
        text("""
            SELECT cut_id
            FROM ops.cut_details
            WHERE job_order_id = :job_order_id
              AND cut_id NOT IN (SELECT cut_id FROM archive.cut_details)
        """),
        {"job_order_id": job_order_id}
    )
    
    cut_ids = [row[0] for row in result.fetchall()]
    
    archived_cuts = []
    for cut_id in cut_ids:
        archived_cut = archive_cut_detail(db, cut_id)
        if archived_cut:
            archived_cuts.append(archived_cut)
    
    return archived_cuts


def archive_cut_details_by_item_id(db: Session, item_id: int):
    """Archive all cut_details that reference the given item_id in their job_order_items_ratios JSONB field"""
    from sqlalchemy import text
    
    result = db.execute(
        text("""
            SELECT cut_id
            FROM ops.cut_details
            WHERE job_order_items_ratios ? :item_id_str
              AND cut_id NOT IN (SELECT cut_id FROM archive.cut_details)
        """),
        {"item_id_str": str(item_id)}
    )
    
    cut_ids = [row[0] for row in result.fetchall()]
    
    archived_cuts = []
    for cut_id in cut_ids:
        archived_cut = archive_cut_detail(db, cut_id)
        if archived_cut:
            archived_cuts.append(archived_cut)
    
    return archived_cuts


def delete_cut(db: Session, cut_id: int, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Delete a cut and all its associated rolls and transitions.
    
    This permanently deletes the cut without archiving it.
    Also triggers summary refresh for the associated job order.
    """
    from sqlalchemy import text
    
    # First, get the cut details to retrieve job_order_id for summary refresh
    cut_result = db.execute(
        text("""
            SELECT cut_id, job_order_id
            FROM ops.cut_details
            WHERE cut_id = :cut_id
        """),
        {"cut_id": cut_id}
    )
    
    cut_row = cut_result.fetchone()
    if not cut_row:
        return None
    
    job_order_id = cut_row[1]
    
    # Delete size transitions first (child records)
    db.execute(
        text("DELETE FROM ops.cut_size_transitions WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    )
    
    # Delete rolls (child records)
    db.execute(
        text("DELETE FROM ops.cut_rolls WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    )
    
    # Delete the cut detail (parent record)
    db.execute(
        text("DELETE FROM ops.cut_details WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    )
    
    db.commit()
    
    # Trigger summary refresh for the job order
    if job_order_id:
        try:
            db.execute(
                text("""
                    INSERT INTO ops.summary_refresh_queue (job_order_id, queued_at)
                    VALUES (:job_order_id, NOW())
                    ON CONFLICT (job_order_id) DO UPDATE SET queued_at = NOW()
                """),
                {"job_order_id": job_order_id}
            )
            db.commit()
        except Exception:
            # If summary refresh fails, don't fail the deletion
            db.rollback()
    
    return {"cut_id": cut_id, "deleted": True}


def archive_cut_detail(db: Session, cut_id: int):
    """Archive a single cut_detail and its associated rolls and transitions"""
    from sqlalchemy import text
    from .. import models
    from sqlalchemy.sql import func
    import json
    
    cut_result = db.execute(
        text("""
            SELECT 
                cut_id,
                job_order_id,
                color_id,
                num_of_rolls_used,
                total_layers,
                job_order_items_ratios,
                waste_fabric_weight,
                marker_length,
                created_at,
                created_by_user_id,
                notes,
                print_status,
                material_id
            FROM ops.cut_details
            WHERE cut_id = :cut_id
        """),
        {"cut_id": cut_id}
    )
    
    cut_row = cut_result.fetchone()
    if not cut_row:
        return None
    
    job_order_id = cut_row[1]
    
    existing_archived = db.execute(
        text("SELECT cut_id FROM archive.cut_details WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    ).fetchone()
    
    if existing_archived:
        return None
    
    archived_cut = models.ArchivedCutDetail(
        cut_id=cut_row[0],
        job_order_id=cut_row[1],
        color_id=cut_row[2],
        num_of_rolls_used=cut_row[3],
        total_layers=cut_row[4],
        job_order_items_ratios=cut_row[5],
        waste_fabric_weight=cut_row[6],
        marker_length=cut_row[7],
        created_at=cut_row[8],
        updated_at=None,
        created_by_user_id=cut_row[9],
        notes=cut_row[10],
        print_status=cut_row[11],
        material_id=cut_row[12],
        archived_at=func.now()
    )
    db.add(archived_cut)
    
    rolls_result = db.execute(
        text("""
            SELECT 
                roll_id,
                cut_id,
                roll_number,
                weight,
                layer_weight,
                num_of_layers,
                roll_width
            FROM ops.cut_rolls
            WHERE cut_id = :cut_id
        """),
        {"cut_id": cut_id}
    )
    
    for roll_row in rolls_result.fetchall():
        archived_roll = models.ArchivedCutRoll(
            roll_id=roll_row[0],
            cut_id=roll_row[1],
            roll_number=roll_row[2],
            weight=roll_row[3],
            layer_weight=roll_row[4],
            num_of_layers=roll_row[5],
            roll_width=roll_row[6],
            archived_at=func.now()
        )
        db.add(archived_roll)
    
    transitions_result = db.execute(
        text("""
            SELECT 
                transition_id,
                cut_id,
                from_item_id,
                to_item_id,
                quantity,
                notes,
                created_at
            FROM ops.cut_size_transitions
            WHERE cut_id = :cut_id
        """),
        {"cut_id": cut_id}
    )
    
    for trans_row in transitions_result.fetchall():
        archived_transition = models.ArchivedCutSizeTransition(
            transition_id=trans_row[0],
            cut_id=trans_row[1],
            from_item_id=trans_row[2],
            to_item_id=trans_row[3],
            quantity=trans_row[4],
            notes=trans_row[5],
            created_at=trans_row[6],
            archived_at=func.now()
        )
        db.add(archived_transition)
    
    db.execute(
        text("DELETE FROM ops.cut_size_transitions WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    )
    
    db.execute(
        text("DELETE FROM ops.cut_rolls WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    )
    
    db.execute(
        text("DELETE FROM ops.cut_details WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    )
    db.commit()
    
    if job_order_id:
        db.execute(
            text("SELECT ops.refresh_job_order_items_summary_for_jobs(ARRAY[:job_order_id])"),
            {"job_order_id": job_order_id}
        )
        db.execute(
            text("SELECT reporting.refresh_job_order_summary_for_jobs(ARRAY[:job_order_id])"),
            {"job_order_id": job_order_id}
        )
        db.commit()
    
    return archived_cut


def restore_cut_details_by_job_order_id(db: Session, job_order_id: int):
    """Restore all archived cut_details for a given job_order_id"""
    from sqlalchemy import text
    
    result = db.execute(
        text("""
            SELECT cut_id
            FROM archive.cut_details
            WHERE job_order_id = :job_order_id
              AND cut_id NOT IN (SELECT cut_id FROM ops.cut_details)
        """),
        {"job_order_id": job_order_id}
    )
    
    cut_ids = [row[0] for row in result.fetchall()]
    
    restored_cuts = []
    for cut_id in cut_ids:
        restored_cut = restore_cut_detail(db, cut_id)
        if restored_cut:
            restored_cuts.append(restored_cut)
    
    return restored_cuts


def restore_cut_detail(db: Session, cut_id: int):
    """Restore a single archived cut_detail and its associated rolls and transitions"""
    from sqlalchemy import text
    
    cut_result = db.execute(
        text("""
            SELECT 
                cut_id,
                job_order_id,
                color_id,
                num_of_rolls_used,
                total_layers,
                job_order_items_ratios,
                waste_fabric_weight,
                marker_length,
                created_at,
                updated_at,
                created_by_user_id,
                notes,
                print_status,
                material_id
            FROM archive.cut_details
            WHERE cut_id = :cut_id
        """),
        {"cut_id": cut_id}
    )
    
    cut_row = cut_result.fetchone()
    if not cut_row:
        return None
    
    existing_cut = db.execute(
        text("SELECT cut_id FROM ops.cut_details WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    ).fetchone()
    
    if existing_cut:
        return None
    
    db.execute(
        text("""
            INSERT INTO ops.cut_details (
                cut_id,
                job_order_id,
                color_id,
                num_of_rolls_used,
                total_layers,
                job_order_items_ratios,
                waste_fabric_weight,
                marker_length,
                created_at,
                created_by_user_id,
                notes,
                print_status,
                material_id
            ) VALUES (
                :cut_id,
                :job_order_id,
                :color_id,
                :num_of_rolls_used,
                :total_layers,
                (:job_order_items_ratios)::jsonb,
                :waste_fabric_weight,
                :marker_length,
                :created_at,
                :created_by_user_id,
                :notes,
                :print_status,
                :material_id
            )
        """),
        {
            "cut_id": cut_row[0],
            "job_order_id": cut_row[1],
            "color_id": cut_row[2],
            "num_of_rolls_used": cut_row[3],
            "total_layers": cut_row[4],
            "job_order_items_ratios": json.dumps(cut_row[5]) if cut_row[5] else '{}',
            "waste_fabric_weight": cut_row[6],
            "marker_length": cut_row[7],
            "created_at": cut_row[8],
            "created_by_user_id": cut_row[10],
            "notes": cut_row[11],
            "print_status": cut_row[12],
            "material_id": cut_row[13],
        }
    )
    
    rolls_result = db.execute(
        text("""
            SELECT 
                roll_id,
                cut_id,
                roll_number,
                weight,
                layer_weight,
                num_of_layers,
                roll_width
            FROM archive.cut_rolls
            WHERE cut_id = :cut_id
        """),
        {"cut_id": cut_id}
    )
    
    for roll_row in rolls_result.fetchall():
        db.execute(
            text("""
                INSERT INTO ops.cut_rolls (
                    roll_id,
                    cut_id,
                    roll_number,
                    weight,
                    layer_weight,
                    num_of_layers,
                    roll_width
                ) VALUES (
                    :roll_id,
                    :cut_id,
                    :roll_number,
                    :weight,
                    :layer_weight,
                    :num_of_layers,
                    :roll_width
                )
            """),
            {
                "roll_id": roll_row[0],
                "cut_id": roll_row[1],
                "roll_number": roll_row[2],
                "weight": roll_row[3],
                "layer_weight": roll_row[4],
                "num_of_layers": roll_row[5],
                "roll_width": roll_row[6],
            }
        )
    
    transitions_result = db.execute(
        text("""
            SELECT 
                transition_id,
                cut_id,
                from_item_id,
                to_item_id,
                quantity,
                notes,
                created_at
            FROM archive.cut_size_transitions
            WHERE cut_id = :cut_id
        """),
        {"cut_id": cut_id}
    )
    
    for trans_row in transitions_result.fetchall():
        db.execute(
            text("""
                INSERT INTO ops.cut_size_transitions (
                    transition_id,
                    cut_id,
                    from_item_id,
                    to_item_id,
                    quantity,
                    notes,
                    created_at
                ) VALUES (
                    :transition_id,
                    :cut_id,
                    :from_item_id,
                    :to_item_id,
                    :quantity,
                    :notes,
                    :created_at
                )
            """),
            {
                "transition_id": trans_row[0],
                "cut_id": trans_row[1],
                "from_item_id": trans_row[2],
                "to_item_id": trans_row[3],
                "quantity": trans_row[4],
                "notes": trans_row[5],
                "created_at": trans_row[6]
            }
        )
    
    db.execute(
        text("DELETE FROM archive.cut_size_transitions WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    )
    
    db.execute(
        text("DELETE FROM archive.cut_rolls WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    )
    
    db.execute(
        text("DELETE FROM archive.cut_details WHERE cut_id = :cut_id"),
        {"cut_id": cut_id}
    )
    
    return cut_id

