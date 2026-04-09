"""Login and download daily report PDFs from the backend HTTP API."""

from __future__ import annotations

import logging
from datetime import date
from typing import List, Tuple

import httpx

logger = logging.getLogger(__name__)


class ReportApiClient:
    def __init__(self, base_url: str, username: str, password: str) -> None:
        self._base = base_url.rstrip("/")
        self._username = username
        self._password = password

    def login(self) -> str:
        url = f"{self._base}/auth/login"
        with httpx.Client(timeout=120.0) as client:
            r = client.post(
                url,
                data={"username": self._username, "password": self._password},
            )
        if r.status_code != 200:
            logger.error("Login failed: %s %s", r.status_code, r.text)
            r.raise_for_status()
        data = r.json()
        token = data.get("access_token")
        if not token:
            raise RuntimeError("Login response missing access_token")
        return str(token)

    def download_daily_reports(
        self,
        token: str,
        report_date: date,
    ) -> List[Tuple[str, bytes]]:
        """
        Fetch cutting, sewing, and QC PDFs. Returns list of (filename, content).
        """
        d = report_date.isoformat()
        paths = [
            (f"daily_cutting_report_{d}.pdf", f"/reports/daily-cutting-report?date={d}"),
            (f"daily_sewing_report_{d}.pdf", f"/reports/daily-sewing-report?date={d}"),
            (f"daily_qc_report_{d}.pdf", f"/reports/daily-qc-report?date={d}"),
        ]
        out: List[Tuple[str, bytes]] = []
        headers = {"Authorization": f"Bearer {token}"}
        with httpx.Client(timeout=300.0, headers=headers) as client:
            for filename, path in paths:
                url = f"{self._base}{path}"
                r = client.get(url)
                if r.status_code != 200:
                    logger.error(
                        "Report request failed %s: %s %s",
                        path,
                        r.status_code,
                        r.text[:500],
                    )
                    r.raise_for_status()
                ctype = r.headers.get("content-type", "")
                if "pdf" not in ctype and not r.content.startswith(b"%PDF"):
                    logger.warning(
                        "Unexpected content-type for %s: %s", path, ctype
                    )
                out.append((filename, r.content))
        return out
