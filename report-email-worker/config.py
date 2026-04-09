"""Environment-driven settings for the report email worker."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import List
from zoneinfo import ZoneInfo


def _parse_bool(v: str | None, default: bool = False) -> bool:
    if v is None or v == "":
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def _split_emails(raw: str | None) -> List[str]:
    if not raw:
        return []
    return [e.strip() for e in raw.split(",") if e.strip()]


@dataclass(frozen=True)
class Settings:
    api_base_url: str
    username: str
    password: str
    smtp_host: str
    smtp_port: int
    smtp_use_tls: bool
    sender_email: str
    sender_password: str
    recipient_emails: List[str]
    company_name: str
    schedule_tz: str
    schedule_cron: str
    report_date_mode: str

    def report_date(self, today: date | None = None) -> date:
        if today is not None:
            d = today
        else:
            try:
                d = datetime.now(ZoneInfo(self.schedule_tz)).date()
            except Exception:
                d = date.today()
        if self.report_date_mode == "today":
            return d
        return d - timedelta(days=1)


def load_settings() -> Settings:
    api_base = (os.environ.get("API_BASE_URL") or "").rstrip("/")
    if not api_base:
        raise ValueError("API_BASE_URL is required")

    pwd = os.environ.get("REPORT_SERVICE_PASSWORD") or ""
    if not pwd:
        raise ValueError("REPORT_SERVICE_PASSWORD is required")

    mode = (os.environ.get("REPORT_DATE_MODE") or "today").strip().lower()
    if mode not in ("yesterday", "today"):
        raise ValueError("REPORT_DATE_MODE must be 'yesterday' or 'today'")

    return Settings(
        api_base_url=api_base,
        username=(os.environ.get("REPORT_SERVICE_USERNAME") or "reporting").strip(),
        password=pwd,
        smtp_host=os.environ.get("SMTP_HOST") or "smtp.gmail.com",
        smtp_port=int(os.environ.get("SMTP_PORT") or "587"),
        smtp_use_tls=_parse_bool(os.environ.get("SMTP_USE_TLS"), True),
        sender_email=(os.environ.get("REPORT_SENDER_EMAIL") or "").strip(),
        sender_password=os.environ.get("REPORT_SENDER_PASSWORD") or "",
        recipient_emails=_split_emails(os.environ.get("REPORT_RECIPIENT_EMAILS")),
        company_name=os.environ.get("COMPANY_NAME") or "Production Management System",
        schedule_tz=os.environ.get("SCHEDULE_TZ") or "Africa/Cairo",
        schedule_cron=os.environ.get("SCHEDULE_CRON") or "0 23 * * *",
        report_date_mode=mode,
    )


def validate_timezone(tz_name: str) -> ZoneInfo:
    return ZoneInfo(tz_name)
