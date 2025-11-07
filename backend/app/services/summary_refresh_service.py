import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy import text
from app.database import get_db

logger = logging.getLogger(__name__)

class SummaryRefreshService:
    def __init__(self, debounce_seconds=5):
        self.is_running = False
        self.debounce_seconds = debounce_seconds
        self.poll_interval = 1
        self._background_task = None
    
    async def refresh_loop(self):
        while self.is_running:
            try:
                db = next(get_db())
                
                result = db.execute(
                    text("SELECT reporting.refresh_stale_summaries(:interval)"),
                    {"interval": self.debounce_seconds}
                )
                
                count = result.scalar()
                if count > 0:
                    db.commit()
                    logger.info(f"Refreshed {count} job order summaries")
                else:
                    db.rollback()
                    
            except Exception as e:
                logger.error(f"Summary refresh error: {e}")
                if 'db' in locals():
                    db.rollback()
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

summary_refresh_service = SummaryRefreshService(debounce_seconds=5)

