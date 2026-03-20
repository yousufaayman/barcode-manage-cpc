from datetime import datetime, timedelta
from typing import List

from app.db.session import SessionLocal
from app import models


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Daily assignment that will own the production history rows
DAILY_ASSIGNMENT_ID = 28

# Base timestamp for the first record; each subsequent record will be
# offset by +1 hour.
BASE_TIMESTAMP = datetime.now()
HOURS_BETWEEN_ENTRIES = 1

# Barcodes to seed. Replace this list with the barcodes you want to use.
# Example values based on the screenshot the user shared.
BARCODES: List[str] = [
    "1-3-1-7pt-1",
    "1-3-1-4",
    "1-3-1-7pu-1",
    "1-3-1-7pv-1",
    "1-2-1-7pt-1",
    "1-2-1-7pu-1",
    "1-2-1-7pv-1",
    "1-1-1-7pt-1",
    "1-1-1-7pu-1",
    "1-1-1-7pv-1",
]


def main() -> None:
    db = SessionLocal()
    try:
        current_ts = BASE_TIMESTAMP

        for index, barcode in enumerate(BARCODES):
            batch = (
                db.query(models.Batch)
                .filter(models.Batch.barcode == barcode)
                .first()
            )

            if not batch:
                print(f"[WARN] No batch found for barcode '{barcode}', skipping.")
                continue

            if batch.quantity is None:
                print(
                    f"[WARN] Batch {batch.batch_id} (barcode '{barcode}') has no quantity set, skipping."
                )
                continue

            # Either update existing record for (assignment, batch) or create a new one
            existing = (
                db.query(models.ProductionHistory)
                .filter(
                    models.ProductionHistory.daily_assignment_id == DAILY_ASSIGNMENT_ID,
                    models.ProductionHistory.batch_id == batch.batch_id,
                )
                .first()
            )

            if existing:
                existing.quantity_produced = batch.quantity
                existing.timestamp = current_ts
                print(
                    f"[INFO] Updated production_history id={existing.production_id} "
                    f"for batch_id={batch.batch_id}, quantity={batch.quantity}, ts={current_ts}."
                )
            else:
                row = models.ProductionHistory(
                    daily_assignment_id=DAILY_ASSIGNMENT_ID,
                    batch_id=batch.batch_id,
                    quantity_produced=batch.quantity,
                    timestamp=current_ts,
                )
                db.add(row)
                print(
                    f"[INFO] Inserted production_history for batch_id={batch.batch_id}, "
                    f"quantity={batch.quantity}, ts={current_ts}."
                )

            # Advance timestamp for next record (1 hour apart)
            current_ts = BASE_TIMESTAMP + timedelta(hours=HOURS_BETWEEN_ENTRIES * (index + 1))

        db.commit()
        print("Seeding production_history completed.")
    except Exception as exc:
        db.rollback()
        print(f"[ERROR] Failed to seed production_history: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()

