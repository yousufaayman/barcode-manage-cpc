import asyncio
import logging
from sqlalchemy import text
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

class SummaryRefreshService:
    def __init__(self, debounce_seconds=30):
        self.is_running = False
        self.debounce_seconds = debounce_seconds
        self.poll_interval = 1
        self._background_task = None
    
    async def refresh_loop(self):
        while self.is_running:
            try:
                # Run job-order summary refresh and worker/stage reporting refresh independently so a
                # failure in one cannot block the other (both commit their own transaction).
                # Both functions only process queue rows with
                # queued_at <= now() - interval_seconds (debounce batching).
                for label, sql, interval_seconds in (
                    (
                        "job order summaries",
                        "SELECT reporting.refresh_stale_summaries(:interval)",
                        self.debounce_seconds,
                    ),
                    (
                        "worker daily stage production",
                        "SELECT reporting.refresh_worker_daily_stage_production(:interval)",
                        self.debounce_seconds,
                    ),
                ):
                    db = SessionLocal()
                    try:
                        result = db.execute(text(sql), {"interval": interval_seconds})
                        count = result.scalar() or 0
                        if count > 0:
                            db.commit()
                            logger.info(f"Refreshed {count} {label}")
                        else:
                            db.rollback()
                    except Exception as e:
                        logger.error(f"{label} refresh error: {e}")
                        db.rollback()
                    finally:
                        db.close()
            except Exception as e:
                logger.error(f"Summary refresh loop error: {e}")
            finally:
                await asyncio.sleep(self.poll_interval)
    
    def start(self):
        if not self.is_running:
            self.is_running = True
            logger.info(f"Starting summary refresh service (debounce: {self.debounce_seconds}s, poll: {self.poll_interval}s)")
            
            if self._background_task is None or self._background_task.done():
                self._background_task = asyncio.create_task(self.refresh_loop())
    
    def stop(self):
        self.is_running = False
        logger.info("Stopping summary refresh service")
        
        if self._background_task and not self._background_task.done():
            self._background_task.cancel()
    
    async def wait_for_completion(self):
        if self._background_task and not self._background_task.done():
            try:
                await self._background_task
            except asyncio.CancelledError:
                pass

summary_refresh_service = SummaryRefreshService(debounce_seconds=30)

