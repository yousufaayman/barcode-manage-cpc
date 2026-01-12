from sqlalchemy.orm import Session
from typing import Optional, Tuple, List
from .. import models


def get_phase_type(db: Session, phase_id: int) -> Optional[str]:
    """Get the phase type (cutting, sewing, qc, packaging) for a given phase_id"""
    phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.phase_id == phase_id
    ).first()
    
    if not phase:
        return None
    
    if phase.type:
        return phase.type.lower()
    
    if phase.phase_name and phase.phase_name.lower() == 'cutting':
        return 'cutting'
    
    return None


def get_phase_sequence_order(db: Session, phase_id: int) -> Optional[int]:
    """Get the sequence_order for a given phase_id"""
    phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.phase_id == phase_id
    ).first()
    
    return phase.sequence_order if phase else None


def calculate_quantity_delta(
    action_type: str,
    old_quantity: Optional[int],
    new_quantity: Optional[int],
    old_phase: Optional[int],
    new_phase: Optional[int],
    batch_quantity: Optional[int]
) -> Optional[int]:
    """
    Calculate quantity delta for a scan event.
    
    Returns:
        - Positive integer for IN events (quantity entering phase)
        - Negative integer for OUT events (quantity leaving phase)
        - Zero for status-only changes
        - None if delta cannot be calculated
    """
    if action_type == 'scan_in':
        if new_quantity is not None:
            return new_quantity
        elif batch_quantity is not None:
            return batch_quantity
        return None
    
    elif action_type == 'scan_out':
        if old_quantity is not None:
            return -old_quantity
        elif batch_quantity is not None:
            return -batch_quantity
        return None
    
    elif action_type == 'quantity_update':
        if old_quantity is not None and new_quantity is not None:
            return new_quantity - old_quantity
        return None
    
    elif action_type in ('status_change', 'phase_change'):
        return 0
    
    return None


def crosses_phase_type_boundary(
    db: Session,
    old_phase_id: Optional[int],
    new_phase_id: Optional[int]
) -> bool:
    """
    Check if a phase transition crosses a phase type boundary.
    
    Returns True if:
    - old_phase and new_phase have different phase types
    - OR transitioning from None to a phase (initial entry)
    - OR transitioning from a phase to None (completion)
    
    Returns False if:
    - Both phases have the same phase type (e.g., sewing-1 → sewing-2)
    """
    if not old_phase_id and not new_phase_id:
        return False
    
    if not old_phase_id or not new_phase_id:
        return True
    
    old_type = get_phase_type(db, old_phase_id)
    new_type = get_phase_type(db, new_phase_id)
    
    if not old_type or not new_type:
        return True
    
    return old_type != new_type


def determine_affects_phase_type(
    db: Session,
    action_type: str,
    phase_id: int,
    old_phase: Optional[int],
    new_phase: Optional[int]
) -> Optional[str]:
    """
    Determine which phase_type is affected by this event.
    
    CRITICAL: Only returns phase_type for phase-type boundary crossings.
    
    Rules:
    - scan_in: Only if crossing INTO a new phase type (e.g., cutting → sewing-*)
    - scan_out: Only if crossing OUT OF a phase type to a different one (e.g., sewing-* → qc)
    - quantity_update: Affects current phase type
    - phase_change: Only if crossing a boundary
    """
    if action_type == 'scan_in':
        if old_phase and new_phase:
            if crosses_phase_type_boundary(db, old_phase, new_phase):
                return get_phase_type(db, new_phase)
        elif new_phase:
            return get_phase_type(db, new_phase)
        return None
    
    elif action_type == 'scan_out':
        # OUT is written for the phase being completed (old_phase)
        # BUT only if we're moving to a different phase type
        if old_phase and new_phase:
            if crosses_phase_type_boundary(db, old_phase, new_phase):
                return get_phase_type(db, old_phase)
        elif old_phase:
            # If completing without a new_phase, write OUT (final completion)
            return get_phase_type(db, old_phase)
        return None
    
    elif action_type == 'quantity_update':
        return get_phase_type(db, phase_id)
    
    elif action_type == 'phase_change':
        if old_phase and new_phase:
            if crosses_phase_type_boundary(db, old_phase, new_phase):
                return get_phase_type(db, new_phase)
        elif new_phase:
            return get_phase_type(db, new_phase)
        return None
    
    elif action_type == 'status_change':
        return None
    
    return None


def is_backward_movement(
    db: Session,
    old_phase: Optional[int],
    new_phase: Optional[int]
) -> bool:
    """
    Determine if a phase change represents backward movement.
    
    Backward movement occurs when:
    - new_phase has a lower sequence_order than old_phase
    - OR new_phase is None and old_phase exists
    """
    if not old_phase or not new_phase:
        return False
    
    old_seq = get_phase_sequence_order(db, old_phase)
    new_seq = get_phase_sequence_order(db, new_phase)
    
    if old_seq is None or new_seq is None:
        return False
    
    return new_seq < old_seq


def get_events_to_reverse(
    db: Session,
    batch_id: int,
    from_phase_id: int,
    to_phase_id: int
) -> List[models.BarcodeScanEvent]:
    """
    Get all scan events that need to be reversed when moving backward.
    
    Returns events that:
    1. Are for the same batch
    2. Have affects_phase_type matching phases between to_phase and from_phase
    3. Are not already reversals
    4. Have quantity_delta != 0 (affect quantities)
    """
    from_phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.phase_id == from_phase_id
    ).first()
    
    to_phase = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.phase_id == to_phase_id
    ).first()
    
    if not from_phase or not to_phase:
        return []
    
    from_seq = from_phase.sequence_order or 0
    to_seq = to_phase.sequence_order or 0
    
    if from_seq <= to_seq:
        return []
    
    phase_types_to_reverse = []
    
    if from_phase.type:
        phase_types_to_reverse.append(from_phase.type.lower())
    
    phases_between = db.query(models.ProductionPhase).filter(
        models.ProductionPhase.sequence_order > to_seq,
        models.ProductionPhase.sequence_order <= from_seq
    ).all()
    
    for phase in phases_between:
        if phase.type and phase.type.lower() not in phase_types_to_reverse:
            phase_types_to_reverse.append(phase.type.lower())
    
    if not phase_types_to_reverse:
        return []
    
    events = db.query(models.BarcodeScanEvent).filter(
        models.BarcodeScanEvent.batch_id == batch_id,
        models.BarcodeScanEvent.affects_phase_type.in_(phase_types_to_reverse),
        models.BarcodeScanEvent.is_reversal == False,
        models.BarcodeScanEvent.quantity_delta.isnot(None),
        models.BarcodeScanEvent.quantity_delta != 0
    ).order_by(models.BarcodeScanEvent.scanned_at.desc()).all()
    
    return events


def create_ledger_entry(
    db: Session,
    scan_event_id: int,
    batch_id: int,
    affects_phase_type: str,
    quantity_delta: int
) -> models.PhaseQuantityLedger:
    """Create a ledger entry for a scan event"""
    ledger_entry = models.PhaseQuantityLedger(
        batch_id=batch_id,
        scan_event_id=scan_event_id,
        affects_phase_type=affects_phase_type,
        quantity_delta=quantity_delta
    )
    db.add(ledger_entry)
    return ledger_entry

