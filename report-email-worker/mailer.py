"""Send one email with multiple PDF attachments via SMTP."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Tuple

logger = logging.getLogger(__name__)


def send_report_bundle(
    *,
    smtp_host: str,
    smtp_port: int,
    smtp_use_tls: bool,
    sender_email: str,
    sender_password: str,
    recipient_emails: List[str],
    subject: str,
    html_body: str,
    attachments: List[Tuple[str, bytes]],
) -> None:
    if not sender_email or not sender_password:
        raise ValueError("Sender email and password are required for SMTP")
    if not recipient_emails:
        raise ValueError("At least one recipient email is required")

    msg = MIMEMultipart()
    msg["From"] = sender_email
    msg["To"] = ", ".join(recipient_emails)
    msg["Subject"] = subject
    msg.attach(MIMEText(html_body, "html"))

    for filename, content in attachments:
        part = MIMEBase("application", "pdf")
        part.set_payload(content)
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition",
            f'attachment; filename="{filename}"',
        )
        msg.attach(part)

    context = ssl.create_default_context()
    with smtplib.SMTP(smtp_host, smtp_port) as server:
        if smtp_use_tls:
            server.starttls(context=context)
        server.login(sender_email, sender_password)
        server.send_message(msg)

    logger.info(
        "Sent report email to %d recipient(s), %d attachment(s)",
        len(recipient_emails),
        len(attachments),
    )
