"""Pure math helpers for worker/stage switching time accounting."""


def _calc_elapsed_from_active(current_hours: float, total_hours: float, elapsed: float) -> float:
    """Convert an active-state stage row into elapsed-state hours."""
    remaining_now = max(0.0, float(total_hours) - float(elapsed))
    return max(0.0, float(current_hours) - remaining_now)


def _calc_active_from_elapsed(old_elapsed: float, total_hours: float, elapsed: float) -> float:
    """Convert an elapsed-state stage row into active-state hours."""
    remaining_now = max(0.0, float(total_hours) - float(elapsed))
    return max(0.0, float(old_elapsed) + remaining_now)
