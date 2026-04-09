"""Run the report job on a cron schedule (separate long-lived process)."""

from __future__ import annotations

import logging
import os
import sys

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from config import load_settings, validate_timezone
from run_once import _load_dotenv_if_present, run_job


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    _load_dotenv_if_present()

    settings = load_settings()
    tz = validate_timezone(settings.schedule_tz)

    parts = settings.schedule_cron.split()
    if len(parts) != 5:
        raise ValueError(
            "SCHEDULE_CRON must have 5 fields: minute hour day month day_of_week"
        )
    minute, hour, day, month, day_of_week = parts

    sched = BlockingScheduler(timezone=tz)

    def job() -> None:
        try:
            run_job()
        except Exception:
            logging.exception("Scheduled report job failed")

    sched.add_job(
        job,
        CronTrigger(
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
            timezone=tz,
        ),
    )

    logging.info(
        "Scheduler started: tz=%s cron=%s",
        settings.schedule_tz,
        settings.schedule_cron,
    )
    sched.start()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyboardInterrupt, SystemExit):
        raise
    except Exception as e:
        logging.exception("%s", e)
        sys.exit(1)
