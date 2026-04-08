from __future__ import annotations

import os
import logging
from collections import defaultdict
from datetime import date, datetime
from xml.sax.saxutils import escape as xml_escape
from typing import Any, Dict, List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image,
    PageBreak,
)
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.config import settings
from app.utils.size_sort import get_size_sort_key
from app.crud.tracking import get_sewing_daily_report_data
from app.crud.qc_summary import (
    build_job_order_qc_summary,
    get_job_order_ids_with_qc_rejections_on_date,
)
from app import models
from app.utils import pdf_fonts
from app.utils.pdf_text import apply_pdf_unicode_to_table_rows, prepare_pdf_text


logger = logging.getLogger(__name__)


def _qc_sewing_top_workers_with_top_reason(
    rejection_reason_counts: List[Dict[str, Any]],
    limit: int = 5,
) -> List[Tuple[str, int, str, int]]:
    """
    Worst workers by rejected pcs within one sewing phase; each row includes that worker's
    single highest-volume reason (tie-break: reason name).
    """
    worker_total: Dict[str, int] = defaultdict(int)
    worker_reasons: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for st in rejection_reason_counts or []:
        for worker in st.get("workers") or []:
            wname = str(worker.get("worker_name") or "Unassigned Worker")
            for rr in worker.get("reasons") or []:
                cnt = int(rr.get("count") or 0)
                if cnt <= 0:
                    continue
                r = str(rr.get("reason") or "—")
                worker_total[wname] += cnt
                worker_reasons[wname][r] += cnt
    ranked = sorted(worker_total.items(), key=lambda x: (-x[1], x[0].lower()))[:limit]
    out: List[Tuple[str, int, str, int]] = []
    for wname, total in ranked:
        rmap = worker_reasons[wname]
        if not rmap:
            out.append((wname, total, "—", 0))
            continue
        top_reason, top_cnt = max(rmap.items(), key=lambda x: (-x[1], x[0]))
        out.append((wname, total, top_reason, top_cnt))
    return out


def _qc_sewing_top_stages_with_top_reasons(
    rejection_reason_counts: List[Dict[str, Any]],
    stage_limit: int = 5,
    reason_limit: int = 3,
) -> List[Tuple[str, int, List[Tuple[str, int]]]]:
    """Worst problem stages by volume; each with up to ``reason_limit`` reasons by count."""
    stage_entries: List[Tuple[str, int, Dict[str, int]]] = []
    for st in rejection_reason_counts or []:
        sname = str(st.get("problem_stage_name") or "—")
        reason_counts: Dict[str, int] = defaultdict(int)
        for worker in st.get("workers") or []:
            for rr in worker.get("reasons") or []:
                cnt = int(rr.get("count") or 0)
                if cnt <= 0:
                    continue
                r = str(rr.get("reason") or "—")
                reason_counts[r] += cnt
        stage_total = int(st.get("total_count") or 0)
        if stage_total <= 0 and reason_counts:
            stage_total = sum(reason_counts.values())
        stage_entries.append((sname, stage_total, dict(reason_counts)))
    stage_entries.sort(key=lambda x: (-x[1], x[0].lower()))
    result: List[Tuple[str, int, List[Tuple[str, int]]]] = []
    for sname, total, rmap in stage_entries[:stage_limit]:
        top_reasons = sorted(rmap.items(), key=lambda x: (-x[1], x[0].lower()))[
            :reason_limit
        ]
        result.append((sname, total, top_reasons))
    return result


def _qc_sorted_reason_rows_by_qty(
    rejection_reason_totals: List[Dict[str, Any]],
) -> List[Tuple[str, int]]:
    """All reasons for cutting/QC phases, sorted by quantity descending."""
    rows: List[Tuple[str, int]] = []
    for r in rejection_reason_totals or []:
        rows.append(
            (str(r.get("reason") or "—"), int(r.get("count") or 0)),
        )
    rows.sort(key=lambda x: (-x[1], x[0].lower()))
    return rows


class ReportPDFService:
    """Generate daily production report PDFs (Cutting, Sewing, and QC as separate documents)."""

    def __init__(self, reports_dir: Optional[str] = None) -> None:
        self.reports_dir = reports_dir or settings.REPORTS_DIR or "backend/reports"
        if not os.path.exists(self.reports_dir):
            os.makedirs(self.reports_dir, exist_ok=True)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def generate_daily_cutting_report(
        self,
        db: Session,
        target_date: date,
        client_name: Optional[str] = None,
        model_name: Optional[str] = None,
        job_order_number: Optional[str] = None,
    ) -> str:
        """Generate the daily Cutting report PDF and return its file path."""
        pdf_fonts.ensure_pdf_fonts_registered()
        # Load base data from ops.cut_details_view joined with job_orders for client_name
        cuts = self._load_cuts_for_date(
            db=db,
            target_date=target_date,
            client_name=client_name,
            model_name=model_name,
            job_order_number=job_order_number,
        )

        if not cuts:
            logger.info("No cutting data found for daily report on %s", target_date)

        # Group cuts into client/model -> job order -> color hierarchy
        grouped = self._group_cuts(cuts)

        # Calculate total pieces cut for the day across all cuts
        total_cut_pieces = 0
        for cut in cuts:
            sizes = cut.get("sizes") or []
            total_cut_pieces += sum(int(s.get("total_pieces") or 0) for s in sizes)

        # Build PDF
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"daily_cutting_report_{target_date.isoformat()}_{timestamp}.pdf"
        filepath = os.path.join(self.reports_dir, filename)

        doc = SimpleDocTemplate(
            filepath,
            pagesize=A4,
            rightMargin=36,
            leftMargin=36,
            topMargin=48,
            bottomMargin=36,
        )

        styles = getSampleStyleSheet()
        pdf_fonts.patch_reportlab_sample_styles(styles)
        title_style = ParagraphStyle(
            "CuttingTitle",
            parent=styles["Heading1"],
            alignment=TA_CENTER,
            fontSize=20,
            spaceAfter=18,
            textColor=colors.HexColor("#1F2937"),
        )
        subtitle_style = ParagraphStyle(
            "CuttingSubtitle",
            parent=styles["Normal"],
            alignment=TA_CENTER,
            fontSize=11,
            textColor=colors.HexColor("#4B5563"),
            spaceAfter=12,
        )
        total_cutting_style = ParagraphStyle(
            "TotalCutting",
            parent=styles["Normal"],
            alignment=TA_CENTER,
            fontSize=13,
            textColor=colors.HexColor("#1D4ED8"),  # blue accent
            spaceAfter=16,
            leading=15,
            fontName=pdf_fonts.PDF_FONT_BOLD,
        )
        small_label = ParagraphStyle(
            "SmallLabel",
            parent=styles["Normal"],
            fontSize=9,
            textColor=colors.HexColor("#374151"),
        )

        story: List[Any] = []

        # Header with logo and titles
        self._build_header(
            story,
            title_style,
            subtitle_style,
            target_date,
            client_name,
            model_name,
            job_order_number,
            total_cut_pieces,
            total_cutting_style,
        )

        # Main Cutting section
        if grouped:
            self._build_cutting_section(story, grouped, small_label)
        else:
            story.append(Spacer(1, 24))
            story.append(
                Paragraph(
                    "No cuts have been completed today.",
                    styles["Italic"],
                )
            )

        doc.build(story)
        logger.info("Cutting report PDF generated at %s", filepath)
        return filepath

    def generate_daily_sewing_report(
        self,
        db: Session,
        target_date: date,
    ) -> str:
        """Generate the daily Sewing production report PDF and return its file path."""
        pdf_fonts.ensure_pdf_fonts_registered()
        sewing_data = get_sewing_daily_report_data(db, target_date)

        total_true_pieces = 0
        for phase in sewing_data or []:
            for schematic in phase.get("schematics") or []:
                total_true_pieces += int(schematic.get("line_true_total") or 0)

        if not sewing_data:
            logger.info("No sewing daily report structure for %s", target_date)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"daily_sewing_report_{target_date.isoformat()}_{timestamp}.pdf"
        filepath = os.path.join(self.reports_dir, filename)

        doc = SimpleDocTemplate(
            filepath,
            pagesize=A4,
            rightMargin=36,
            leftMargin=36,
            topMargin=48,
            bottomMargin=36,
        )

        styles = getSampleStyleSheet()
        pdf_fonts.patch_reportlab_sample_styles(styles)
        title_style = ParagraphStyle(
            "SewingTitle",
            parent=styles["Heading1"],
            alignment=TA_CENTER,
            fontSize=20,
            spaceAfter=18,
            textColor=colors.HexColor("#1F2937"),
        )
        subtitle_style = ParagraphStyle(
            "SewingSubtitle",
            parent=styles["Normal"],
            alignment=TA_CENTER,
            fontSize=11,
            textColor=colors.HexColor("#4B5563"),
            spaceAfter=12,
        )
        total_sewing_style = ParagraphStyle(
            "TotalSewing",
            parent=styles["Normal"],
            alignment=TA_CENTER,
            fontSize=13,
            textColor=colors.HexColor("#1D4ED8"),
            spaceAfter=16,
            leading=15,
            fontName=pdf_fonts.PDF_FONT_BOLD,
        )

        story: List[Any] = []
        self._build_sewing_document_header(
            story,
            title_style,
            subtitle_style,
            target_date,
            total_true_pieces,
            total_sewing_style,
        )

        if sewing_data:
            self._build_sewing_section(story, sewing_data)
        else:
            story.append(Spacer(1, 24))
            story.append(
                Paragraph(
                    "No sewing production data is available for this date.",
                    styles["Italic"],
                )
            )

        doc.build(story)
        logger.info("Sewing report PDF generated at %s", filepath)
        return filepath

    def generate_daily_qc_report(
        self,
        db: Session,
        target_date: date,
        client_name: Optional[str] = None,
        model_name: Optional[str] = None,
        job_order_number: Optional[str] = None,
    ) -> str:
        """
        Daily QC rejections PDF using the same aggregation as the job-order QC \"Today\" tab
        for the given report date (rejections on that date, same-day sewing production for ratios).
        """
        pdf_fonts.ensure_pdf_fonts_registered()
        jo_ids = get_job_order_ids_with_qc_rejections_on_date(
            db,
            target_date,
            client_name=client_name,
            model_name=model_name,
            job_order_number=job_order_number,
        )

        job_sections: List[Dict[str, Any]] = []
        grand_total_rejected = 0
        for jid in jo_ids:
            summary = build_job_order_qc_summary(
                db, jid, today_reference_date=target_date
            )
            rejected = int(summary.get("today_rejected_pieces") or 0)
            grand_total_rejected += rejected
            jo = (
                db.query(models.JobOrder)
                .filter(models.JobOrder.job_order_id == jid)
                .first()
            )
            model_n = ""
            client_n = ""
            jo_num = ""
            if jo:
                jo_num = jo.job_order_number or ""
                if jo.model_id:
                    m = (
                        db.query(models.Model)
                        .filter(models.Model.model_id == jo.model_id)
                        .first()
                    )
                    model_n = m.model_name if m else ""
                if jo.client_id:
                    c = (
                        db.query(models.Client)
                        .filter(models.Client.client_id == jo.client_id)
                        .first()
                    )
                    client_n = c.client_name if c else ""
            job_sections.append(
                {
                    "job_order_id": jid,
                    "job_order_number": jo_num,
                    "client_name": client_n,
                    "model_name": model_n,
                    "today_rejected_pieces": rejected,
                    "today_phases": summary.get("today_phases") or [],
                }
            )

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"daily_qc_report_{target_date.isoformat()}_{timestamp}.pdf"
        filepath = os.path.join(self.reports_dir, filename)

        doc = SimpleDocTemplate(
            filepath,
            pagesize=A4,
            rightMargin=36,
            leftMargin=36,
            topMargin=48,
            bottomMargin=36,
        )

        styles = getSampleStyleSheet()
        pdf_fonts.patch_reportlab_sample_styles(styles)
        title_style = ParagraphStyle(
            "QcTitle",
            parent=styles["Heading1"],
            alignment=TA_CENTER,
            fontSize=20,
            spaceAfter=18,
            textColor=colors.HexColor("#1F2937"),
        )
        subtitle_style = ParagraphStyle(
            "QcSubtitle",
            parent=styles["Normal"],
            alignment=TA_CENTER,
            fontSize=11,
            textColor=colors.HexColor("#4B5563"),
            spaceAfter=12,
        )
        total_qc_style = ParagraphStyle(
            "TotalQc",
            parent=styles["Normal"],
            alignment=TA_CENTER,
            fontSize=13,
            textColor=colors.HexColor("#1D4ED8"),
            spaceAfter=16,
            leading=15,
            fontName=pdf_fonts.PDF_FONT_BOLD,
        )

        story: List[Any] = []
        self._build_qc_document_header(
            story,
            title_style,
            subtitle_style,
            target_date,
            grand_total_rejected,
            total_qc_style,
            client_name,
            model_name,
            job_order_number,
        )

        date_label = target_date.strftime("%Y-%m-%d")
        content_width = 7.0 * inch
        if not job_sections:
            story.append(Spacer(1, 24))
            story.append(
                Paragraph(
                    f"No QC rejections are recorded for {date_label} (with the selected filters).",
                    styles["Italic"],
                )
            )
        else:
            # Page 1: header (already appended) + cross–job-order summary only
            self._append_qc_first_page_all_orders_summary(
                story, job_sections, content_width, date_label
            )

            section_header_bg = colors.HexColor("#DBEAFE")
            section_header_fg = colors.HexColor("#1F2937")

            # Each job order with rejections starts on a new page
            for block in job_sections:
                story.append(PageBreak())

                band_text = (
                    f"Job order: {block['job_order_number'] or block['job_order_id']}  –  "
                    f"Client: {block['client_name'] or '—'}  –  Model: {block['model_name'] or '—'}"
                )
                band = Table(
                    apply_pdf_unicode_to_table_rows([[band_text]]),
                    colWidths=[content_width],
                )
                band.hAlign = "LEFT"
                band.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), section_header_bg),
                            ("TEXTCOLOR", (0, 0), (-1, -1), section_header_fg),
                            ("FONTNAME", (0, 0), (-1, -1), pdf_fonts.PDF_FONT_BOLD),
                            ("FONTSIZE", (0, 0), (-1, -1), 10),
                            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 6),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )
                story.append(band)
                story.append(Spacer(1, 8))

                detail_head = ParagraphStyle(
                    "QcJoDetailHead",
                    parent=subtitle_style,
                    alignment=TA_LEFT,
                    fontSize=11,
                    fontName=pdf_fonts.PDF_FONT_BOLD,
                    spaceAfter=6,
                )
                story.append(
                    Paragraph(
                        f"Detail — rejected pieces ({date_label}): {block['today_rejected_pieces']:,}",
                        detail_head,
                    )
                )
                story.append(Spacer(1, 6))

                self._append_qc_today_phases_table(
                    story, block["today_phases"], content_width, target_date
                )

        doc.build(story)
        logger.info("QC report PDF generated at %s", filepath)
        return filepath

    def _append_qc_first_page_all_orders_summary(
        self,
        story: List[Any],
        job_sections: List[Dict[str, Any]],
        content_width: float,
        date_label: str,
    ) -> None:
        """First page only: totals combined across all job orders that had rejections."""
        pdf_fonts.ensure_pdf_fonts_registered()
        styles = getSampleStyleSheet()
        pdf_fonts.patch_reportlab_sample_styles(styles)
        h2 = ParagraphStyle(
            "QcAllOrdersSummaryH2",
            parent=styles["Normal"],
            fontSize=13,
            leading=16,
            fontName=pdf_fonts.PDF_FONT_BOLD,
            textColor=colors.HexColor("#111827"),
            spaceBefore=4,
            spaceAfter=8,
        )
        hdr_para = ParagraphStyle(
            "QcSummaryTblHdr",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
            alignment=TA_CENTER,
            textColor=colors.white,
            fontName=pdf_fonts.PDF_FONT_BOLD,
        )
        header_bg = colors.HexColor("#1F2937")
        grid_color = colors.HexColor("#E5E7EB")

        story.append(
            Paragraph(
                f"Summary — all job orders ({date_label})",
                h2,
            )
        )

        sorted_blocks = sorted(
            job_sections,
            key=lambda b: (
                (b.get("client_name") or "").lower(),
                (b.get("job_order_number") or "").lower(),
            ),
        )

        jo_hdr = [
            Paragraph(lbl, hdr_para)
            for lbl in ["Job order", "Client", "Model", "Rejected pcs"]
        ]
        jo_rows: List[List[Any]] = [jo_hdr]
        for b in sorted_blocks:
            jo_rows.append(
                [
                    str(b.get("job_order_number") or b.get("job_order_id") or "—"),
                    str(b.get("client_name") or "—"),
                    str(b.get("model_name") or "—"),
                    str(int(b.get("today_rejected_pieces") or 0)),
                ]
            )

        w0 = 1.25 * inch
        w1 = 1.85 * inch
        w2 = content_width - w0 - w1 - 0.9 * inch
        w3 = 0.9 * inch
        jo_tbl = Table(
            apply_pdf_unicode_to_table_rows(jo_rows),
            colWidths=[w0, w1, max(w2, 2.0 * inch), w3],
            repeatRows=1,
        )
        jo_tbl.hAlign = "LEFT"
        jo_tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                    ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("FONTSIZE", (0, 1), (-1, -1), 9),
                    ("ALIGN", (0, 1), (0, -1), "LEFT"),
                    ("ALIGN", (1, 1), (1, -1), "LEFT"),
                    ("ALIGN", (2, 1), (2, -1), "LEFT"),
                    ("ALIGN", (3, 1), (3, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("GRID", (0, 0), (-1, -1), 0.25, grid_color),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(jo_tbl)
        story.append(Spacer(1, 16))

        phase_key_agg: Dict[int, Dict[str, Any]] = {}
        for block in job_sections:
            for ph in block.get("today_phases") or []:
                pid = int(ph.get("phase_id") or 0)
                reject = int(ph.get("reject") or 0)
                if reject <= 0:
                    continue
                if pid not in phase_key_agg:
                    phase_key_agg[pid] = {
                        "phase_name": str(ph.get("phase_name") or "—"),
                        "reject": 0,
                    }
                phase_key_agg[pid]["reject"] += reject

        story.append(
            Paragraph(
                "Totals by return phase (combined)",
                h2,
            )
        )
        ph_hdr = [
            Paragraph(lbl, hdr_para)
            for lbl in ["Return phase", "Rejected pcs"]
        ]
        ph_rows: List[List[Any]] = [ph_hdr]
        for _pid, info in sorted(
            phase_key_agg.items(),
            key=lambda x: (x[1]["phase_name"].lower(), x[0]),
        ):
            ph_rows.append(
                [
                    str(info["phase_name"]),
                    str(int(info["reject"])),
                ]
            )
        if len(ph_rows) == 1:
            ph_rows.append(["—", "0"])

        pw0 = content_width - 1.0 * inch
        pw1 = 1.0 * inch
        ph_tbl = Table(
            apply_pdf_unicode_to_table_rows(ph_rows),
            colWidths=[max(pw0, 4.0 * inch), pw1],
            repeatRows=1,
        )
        ph_tbl.hAlign = "LEFT"
        ph_tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                    ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("FONTSIZE", (0, 1), (-1, -1), 9),
                    ("ALIGN", (0, 1), (0, -1), "LEFT"),
                    ("ALIGN", (1, 1), (1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("GRID", (0, 0), (-1, -1), 0.25, grid_color),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(ph_tbl)
        story.append(Spacer(1, 16))

        # Worst workers across all phases (combined)
        worker_totals: Dict[str, int] = defaultdict(int)
        for block in job_sections:
            for ph in block.get("today_phases") or []:
                ptype = str(ph.get("phase_type") or "").strip().lower()
                if ptype == "sewing":
                    for st in ph.get("rejection_reason_counts") or []:
                        for worker in st.get("workers") or []:
                            wname = str(worker.get("worker_name") or "Unassigned Worker")
                            worker_totals[wname] += int(worker.get("total_count") or 0)

        story.append(Paragraph("Worst workers across all phases", h2))
        ww_hdr = [Paragraph(lbl, hdr_para) for lbl in ["Worker", "Rejected pcs"]]
        ww_rows: List[List[Any]] = [ww_hdr]
        for wname, qty in sorted(
            worker_totals.items(), key=lambda x: (-x[1], x[0].lower())
        ):
            if qty <= 0:
                continue
            ww_rows.append([wname, str(int(qty))])
        if len(ww_rows) == 1:
            ww_rows.append(["—", "0"])

        ww_col0 = content_width - 1.0 * inch
        ww_tbl = Table(
            apply_pdf_unicode_to_table_rows(ww_rows),
            colWidths=[max(ww_col0, 4.0 * inch), 1.0 * inch],
            repeatRows=1,
        )
        ww_tbl.hAlign = "LEFT"
        ww_tbl.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                    ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                    ("FONTSIZE", (0, 0), (-1, 0), 9),
                    ("FONTSIZE", (0, 1), (-1, -1), 9),
                    ("ALIGN", (0, 1), (0, -1), "LEFT"),
                    ("ALIGN", (1, 1), (1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("GRID", (0, 0), (-1, -1), 0.25, grid_color),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story.append(ww_tbl)
        story.append(Spacer(1, 16))

        # Top 3 reasons (QC + Cutting) across all job orders
        qc_reason_totals: Dict[str, int] = defaultdict(int)
        cutting_reason_totals: Dict[str, int] = defaultdict(int)
        for block in job_sections:
            for ph in block.get("today_phases") or []:
                ptype = str(ph.get("phase_type") or "").strip().lower()
                if ptype not in ("qc", "cutting"):
                    continue
                for rr in ph.get("rejection_reason_totals") or []:
                    rsn = str(rr.get("reason") or "—")
                    cnt = int(rr.get("count") or 0)
                    if cnt <= 0:
                        continue
                    if ptype == "qc":
                        qc_reason_totals[rsn] += cnt
                    else:
                        cutting_reason_totals[rsn] += cnt

        for label, totals in (
            ("Top 3 reasons — QC (all job orders)", qc_reason_totals),
            ("Top 3 reasons — Cutting (all job orders)", cutting_reason_totals),
        ):
            story.append(Paragraph(label, h2))
            rr_hdr = [Paragraph(lbl, hdr_para) for lbl in ["Reason", "Qty"]]
            rr_rows: List[List[Any]] = [rr_hdr]
            for rsn, qty in sorted(
                totals.items(), key=lambda x: (-x[1], x[0].lower())
            )[:3]:
                rr_rows.append([rsn, str(int(qty))])
            if len(rr_rows) == 1:
                rr_rows.append(["—", "0"])

            rr_col0 = content_width - 1.0 * inch
            rr_tbl = Table(
                apply_pdf_unicode_to_table_rows(rr_rows),
                colWidths=[max(rr_col0, 4.0 * inch), 1.0 * inch],
                repeatRows=1,
            )
            rr_tbl.hAlign = "LEFT"
            rr_tbl.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                        ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                        ("FONTSIZE", (0, 0), (-1, 0), 9),
                        ("FONTSIZE", (0, 1), (-1, -1), 9),
                        ("ALIGN", (0, 1), (0, -1), "LEFT"),
                        ("ALIGN", (1, 1), (1, -1), "CENTER"),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("GRID", (0, 0), (-1, -1), 0.25, grid_color),
                        ("LEFTPADDING", (0, 0), (-1, -1), 5),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            story.append(rr_tbl)
            story.append(Spacer(1, 12))

    def _build_qc_document_header(
        self,
        story: List[Any],
        title_style: ParagraphStyle,
        subtitle_style: ParagraphStyle,
        target_date: date,
        grand_total_rejected: int,
        total_qc_style: ParagraphStyle,
        client_name: Optional[str],
        model_name: Optional[str],
        job_order_number: Optional[str],
    ) -> None:
        logo_path = "frontend/public/company-logo.png"
        if os.path.exists(logo_path):
            try:
                logo = Image(logo_path, width=2.0 * inch, height=1.0 * inch)
                logo.hAlign = "CENTER"
                story.append(logo)
                story.append(Spacer(1, 12))
            except Exception as exc:
                logger.warning("Could not add logo to report: %s", exc)

        story.append(Paragraph("Daily Production Report – QC Rejections", title_style))
        story.append(
            Paragraph(
                f"Report Date: {target_date.strftime('%Y-%m-%d')}",
                subtitle_style,
            )
        )
        story.append(
            Paragraph(
                f"Total rejected pieces (summary): {grand_total_rejected:,}",
                total_qc_style,
            )
        )

        filters: List[str] = []
        if client_name:
            filters.append(f"Client: {client_name}")
        if model_name:
            filters.append(f"Model: {model_name}")
        if job_order_number:
            filters.append(f"Job Order: {job_order_number}")
        if filters:
            story.append(
                Paragraph(
                    prepare_pdf_text("Filters: " + " – ".join(filters)),
                    subtitle_style,
                )
            )

        story.append(Spacer(1, 18))

    def _append_qc_today_phases_table(
        self,
        story: List[Any],
        today_phases: List[Dict[str, Any]],
        content_width: float,
        target_date: date,
    ) -> None:
        """Main table aligned with QC Today tab: phase, rejects, reject ratio %, active rework."""
        pdf_fonts.ensure_pdf_fonts_registered()
        date_label = target_date.strftime("%Y-%m-%d")
        styles = getSampleStyleSheet()
        pdf_fonts.patch_reportlab_sample_styles(styles)
        if not today_phases:
            story.append(
                Paragraph(
                    f"No phase-level rejections for this job order on {date_label}.",
                    styles["Italic"],
                )
            )
            return

        header_cell_style = ParagraphStyle(
            "QcTableHeader",
            parent=styles["Normal"],
            fontSize=9,
            leading=10,
            alignment=TA_CENTER,
            textColor=colors.white,
            fontName=pdf_fonts.PDF_FONT_BOLD,
        )
        header_labels = [
            "Return phase",
            "Rejected pcs",
            "Reject ratio %",
            "Active rework",
        ]
        header_row: List[Any] = [
            Paragraph(str(lbl), header_cell_style) for lbl in header_labels
        ]
        table_data: List[List[Any]] = [header_row]

        for phase in today_phases:
            ptype = (phase.get("phase_type") or "") or ""
            ratio = phase.get("reject_ratio_pct_today")
            ratio_str = (
                f"{float(ratio):.2f}%"
                if ratio is not None and ptype in ("sewing", "cutting", "qc")
                else "—"
            )
            rework = (
                str(int(phase.get("active_rework_batches") or 0))
                if ptype == "sewing"
                else "-"
            )
            table_data.append(
                [
                    str(phase.get("phase_name") or ""),
                    str(int(phase.get("reject") or 0)),
                    ratio_str,
                    rework,
                ]
            )

        phase_col = 2.4 * inch
        rej_col = 1.1 * inch
        ratio_col = 1.2 * inch
        rw_col = content_width - phase_col - rej_col - ratio_col
        col_widths = [phase_col, rej_col, ratio_col, max(rw_col, 0.8 * inch)]

        tbl = Table(apply_pdf_unicode_to_table_rows(table_data), colWidths=col_widths, repeatRows=1)
        tbl.hAlign = "LEFT"
        header_bg = colors.HexColor("#111827")
        tbl_style = TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
                ("FONTSIZE", (0, 1), (-1, -1), 9),
                ("ALIGN", (0, 1), (0, -1), "LEFT"),
                ("ALIGN", (1, 1), (-1, -1), "CENTER"),
            ]
        )
        tbl.setStyle(tbl_style)
        story.append(tbl)
        story.append(Spacer(1, 14))

        self._append_qc_reason_summary_by_phase(
            story, today_phases, content_width, date_label, styles
        )

    def _append_qc_reason_summary_by_phase(
        self,
        story: List[Any],
        today_phases: List[Dict[str, Any]],
        content_width: float,
        date_label: str,
        styles: Any,
    ) -> None:
        """Per-phase-type headings with reason tables (sewing: stage/worker/reason; else reason/qty)."""
        reason_section_title_style = ParagraphStyle(
            "QcReasonSummaryTitle",
            parent=styles["Normal"],
            fontSize=13,
            leading=16,
            fontName=pdf_fonts.PDF_FONT_BOLD,
            textColor=colors.HexColor("#111827"),
            spaceAfter=10,
        )
        story.append(
            Paragraph(f"Reason summary ({date_label})", reason_section_title_style)
        )

        phase_heading_style = ParagraphStyle(
            "QcReasonPhaseHeading",
            parent=styles["Normal"],
            fontSize=11,
            leading=14,
            fontName=pdf_fonts.PDF_FONT_BOLD,
            textColor=colors.HexColor("#1F2937"),
            spaceBefore=12,
            spaceAfter=6,
        )

        tbl_header_para_style = ParagraphStyle(
            "QcReasonTableHdrPara",
            parent=styles["Normal"],
            fontSize=9,
            leading=11,
            alignment=TA_CENTER,
            textColor=colors.white,
            fontName=pdf_fonts.PDF_FONT_BOLD,
        )

        type_labels = {"sewing": "Sewing", "cutting": "Cutting", "qc": "QC"}

        header_bg = colors.HexColor("#374151")
        grid_color = colors.HexColor("#E5E7EB")

        sub_block_style = ParagraphStyle(
            "QcReasonSubBlock",
            parent=styles["Normal"],
            fontSize=10,
            leading=12,
            fontName=pdf_fonts.PDF_FONT_BOLD,
            textColor=colors.HexColor("#374151"),
            spaceBefore=8,
            spaceAfter=4,
        )
        reasons_cell_style = ParagraphStyle(
            "QcReasonsCell",
            parent=styles["Normal"],
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#111827"),
            fontName=pdf_fonts.PDF_FONT_REGULAR,
        )

        for phase in today_phases:
            ptype = (phase.get("phase_type") or "").strip().lower()
            pname = str(phase.get("phase_name") or "").strip() or "—"
            type_lbl = type_labels.get(ptype, ptype.title() if ptype else "Phase")
            if type_lbl.lower() == pname.lower():
                phase_heading_text = type_lbl
            else:
                phase_heading_text = f"{type_lbl} — {pname}"
            story.append(
                Paragraph(
                    prepare_pdf_text(phase_heading_text),
                    phase_heading_style,
                )
            )

            if ptype == "sewing":
                src = phase.get("rejection_reason_counts") or []
                top_workers = _qc_sewing_top_workers_with_top_reason(src, limit=5)
                top_stages = _qc_sewing_top_stages_with_top_reasons(
                    src, stage_limit=5, reason_limit=3
                )

                story.append(
                    Paragraph(
                        "Worst workers (top 5 by rejected pcs)",
                        sub_block_style,
                    )
                )
                w_hdr = [
                    Paragraph(lbl, tbl_header_para_style)
                    for lbl in ["Worker", "Rejected pcs", "Top reason", "Qty"]
                ]
                w_rows: List[List[Any]] = [w_hdr]
                if not top_workers:
                    w_rows.append(["—", "—", "No data", "—"])
                else:
                    for wname, total, rsn, rqty in top_workers:
                        w_rows.append(
                            [
                                wname,
                                str(total),
                                rsn,
                                str(rqty) if rqty else "—",
                            ]
                        )
                ww0 = 1.5 * inch
                ww1 = 0.95 * inch
                ww2 = content_width - ww0 - ww1 - 0.75 * inch
                ww3 = 0.75 * inch
                w_tbl = Table(
                    apply_pdf_unicode_to_table_rows(w_rows),
                    colWidths=[ww0, ww1, max(ww2, 1.8 * inch), ww3],
                    repeatRows=1,
                )
                w_tbl.hAlign = "LEFT"
                w_tbl.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                            ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                            ("FONTSIZE", (0, 0), (-1, 0), 9),
                            ("FONTSIZE", (0, 1), (-1, -1), 9),
                            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                            ("ALIGN", (1, 1), (1, -1), "CENTER"),
                            ("ALIGN", (3, 1), (3, -1), "CENTER"),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("GRID", (0, 0), (-1, -1), 0.25, grid_color),
                            ("LEFTPADDING", (0, 0), (-1, -1), 5),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )
                story.append(w_tbl)
                story.append(Spacer(1, 10))

                story.append(
                    Paragraph(
                        "Worst problem stages (top 5 by rejected pcs)",
                        sub_block_style,
                    )
                )
                s_hdr = [
                    Paragraph(lbl, tbl_header_para_style)
                    for lbl in ["Problem stage", "Rejected pcs", "Top 3 reasons"]
                ]
                s_rows: List[List[Any]] = [s_hdr]
                if not top_stages:
                    s_rows.append(
                        [
                            "—",
                            "—",
                            Paragraph("No data", reasons_cell_style),
                        ]
                    )
                else:
                    for sname, stotal, top_rs in top_stages:
                        if top_rs:
                            reason_lines = "<br/>".join(
                                f"{xml_escape(prepare_pdf_text(r))} ({c})"
                                for r, c in top_rs
                            )
                        else:
                            reason_lines = "—"
                        s_rows.append(
                            [
                                sname,
                                str(stotal),
                                Paragraph(reason_lines, reasons_cell_style),
                            ]
                        )
                sw0 = 1.55 * inch
                sw1 = 0.85 * inch
                sw2 = content_width - sw0 - sw1
                s_tbl = Table(
                    apply_pdf_unicode_to_table_rows(s_rows),
                    colWidths=[sw0, sw1, max(sw2, 2.5 * inch)],
                    repeatRows=1,
                )
                s_tbl.hAlign = "LEFT"
                s_tbl.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                            ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                            ("FONTSIZE", (0, 0), (-1, 0), 9),
                            ("FONTSIZE", (0, 1), (-1, -1), 9),
                            ("ALIGN", (0, 1), (0, -1), "LEFT"),
                            ("ALIGN", (1, 1), (1, -1), "CENTER"),
                            ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("GRID", (0, 0), (-1, -1), 0.25, grid_color),
                            ("LEFTPADDING", (0, 0), (-1, -1), 5),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )
                story.append(s_tbl)
                story.append(Spacer(1, 10))

                story.append(
                    Paragraph(
                        "All stages — workers and reasons (detail)",
                        sub_block_style,
                    )
                )
                detail_hdr = [
                    Paragraph(lbl, tbl_header_para_style)
                    for lbl in ["Problem stage", "Worker", "Reason", "Qty"]
                ]
                detail_rows: List[List[Any]] = [detail_hdr]
                for st in src:
                    st_name = str(st.get("problem_stage_name") or "—")
                    for worker in st.get("workers") or []:
                        wname = str(worker.get("worker_name") or "—")
                        for rr in worker.get("reasons") or []:
                            detail_rows.append(
                                [
                                    st_name,
                                    wname,
                                    str(rr.get("reason") or "—"),
                                    str(int(rr.get("count") or 0)),
                                ]
                            )
                if len(detail_rows) == 1:
                    detail_rows.append(["—", "—", "No reasons recorded", "—"])

                d0 = 1.55 * inch
                d1 = 1.35 * inch
                d2 = content_width - d0 - d1 - 0.85 * inch
                d3 = 0.85 * inch
                detail_tbl = Table(
                    apply_pdf_unicode_to_table_rows(detail_rows),
                    colWidths=[d0, d1, max(d2, 1.2 * inch), d3],
                    repeatRows=1,
                )
                detail_tbl.hAlign = "LEFT"
                detail_tbl.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                            ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                            ("FONTSIZE", (0, 0), (-1, 0), 9),
                            ("FONTSIZE", (0, 1), (-1, -1), 9),
                            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                            ("ALIGN", (3, 1), (3, -1), "CENTER"),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("GRID", (0, 0), (-1, -1), 0.25, grid_color),
                            ("LEFTPADDING", (0, 0), (-1, -1), 5),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )
                story.append(detail_tbl)
            else:
                hdr_labels2 = ["Reason", "Qty"]
                hdr_row2: List[Any] = [
                    Paragraph(lbl, tbl_header_para_style) for lbl in hdr_labels2
                ]
                rows2: List[List[Any]] = [hdr_row2]
                sorted_reasons = _qc_sorted_reason_rows_by_qty(
                    phase.get("rejection_reason_totals") or []
                )
                if not sorted_reasons:
                    rows2.append(["No reasons recorded", "—"])
                else:
                    for rsn, cnt in sorted_reasons:
                        rows2.append([rsn, str(cnt)])

                rcol = content_width - 1.0 * inch
                rtbl2 = Table(
                    apply_pdf_unicode_to_table_rows(rows2),
                    colWidths=[max(rcol, 3.0 * inch), 1.0 * inch],
                    repeatRows=1,
                )
                rtbl2.hAlign = "LEFT"
                rtbl2.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                            ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                            ("FONTSIZE", (0, 0), (-1, 0), 9),
                            ("FONTSIZE", (0, 1), (-1, -1), 9),
                            ("ALIGN", (0, 1), (0, -1), "LEFT"),
                            ("ALIGN", (1, 1), (1, -1), "CENTER"),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("GRID", (0, 0), (-1, -1), 0.25, grid_color),
                            ("LEFTPADDING", (0, 0), (-1, -1), 5),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                            ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                        ]
                    )
                )
                story.append(rtbl2)
            story.append(Spacer(1, 6))

    # ------------------------------------------------------------------
    # Data loading and grouping
    # ------------------------------------------------------------------
    def _load_cuts_for_date(
        self,
        db: Session,
        target_date: date,
        client_name: Optional[str],
        model_name: Optional[str],
        job_order_number: Optional[str],
    ) -> List[Dict[str, Any]]:
        """Load all cuts for the given date and optional filters."""
        where_clauses = ["DATE(cdv.created_at) = :target_date"]
        params: Dict[str, Any] = {"target_date": target_date}

        if client_name:
            where_clauses.append("cl.client_name = :client_name")
            params["client_name"] = client_name
        if model_name:
            where_clauses.append("cdv.model_name = :model_name")
            params["model_name"] = model_name
        if job_order_number:
            where_clauses.append("cdv.job_order_number = :job_order_number")
            params["job_order_number"] = job_order_number

        where_sql = " AND ".join(where_clauses)

        # We fetch marker_length separately from ops.cut_details, similar to cut_crud
        sql = f"""
            SELECT
                cdv.cut_id,
                cdv.job_order_id,
                cdv.job_order_number,
                cdv.model_id,
                cdv.model_name,
                cdv.color_id,
                cdv.color_name,
                cdv.size_value,
                cdv.total_pieces,
                cdv.total_layers,
                cdv.cut_weight,
                cdv.created_at,
                cdv.print_status,
                cl.client_name AS client_name
            FROM ops.cut_details_view cdv
            JOIN core.job_orders jo ON jo.job_order_id = cdv.job_order_id
            LEFT JOIN core.clients cl ON jo.client_id = cl.client_id
            WHERE {where_sql}
            ORDER BY cl.client_name, cdv.model_name, cdv.job_order_number, cdv.color_name, cdv.cut_id, cdv.size_value
        """

        result = db.execute(text(sql), params)
        rows = result.fetchall()

        if not rows:
            return []

        # Build base cuts dict keyed by cut_id
        cuts: Dict[int, Dict[str, Any]] = {}
        for row in rows:
            cut_id = row.cut_id
            cut = cuts.get(cut_id)
            if not cut:
                cut = {
                    "cut_id": cut_id,
                    "job_order_id": row.job_order_id,
                    "job_order_number": row.job_order_number,
                    "client_name": getattr(row, "client_name", None) or "Unknown client",
                    "model_id": row.model_id,
                    "model_name": row.model_name or "Unknown model",
                    "color_id": row.color_id,
                    "color_name": row.color_name or "Unknown color",
                    "total_layers": row.total_layers or 0,
                    "cut_weight": float(row.cut_weight) if row.cut_weight is not None else 0.0,
                    "created_at": row.created_at,
                    "print_status": row.print_status or "",
                    "sizes": [],
                    "marker_length": None,  # filled later
                }
                cuts[cut_id] = cut

            cut["sizes"].append(
                {
                    "size_value": row.size_value,
                    "total_pieces": row.total_pieces or 0,
                }
            )

        # Fetch marker_length for all cuts at once
        cut_ids = list(cuts.keys())
        placeholders = ",".join([f":c{i}" for i in range(len(cut_ids))])
        marker_params = {f"c{i}": cid for i, cid in enumerate(cut_ids)}
        marker_sql = f"""
            SELECT cut_id, marker_length
            FROM ops.cut_details
            WHERE cut_id IN ({placeholders})
        """
        marker_rows = db.execute(text(marker_sql), marker_params).fetchall()
        for m in marker_rows:
            cid = m.cut_id
            if cid in cuts:
                cuts[cid]["marker_length"] = float(m.marker_length) if m.marker_length is not None else None

        # Sort sizes using shared size order
        for cut in cuts.values():
            cut["sizes"].sort(key=lambda s: get_size_sort_key(str(s.get("size_value") or "")))

        return list(cuts.values())

    def _group_cuts(
        self, cuts: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Group cuts into client/model -> job order -> color hierarchy."""
        containers: Dict[Tuple[str, str], Dict[str, Any]] = {}

        for cut in cuts:
            client = cut.get("client_name") or "Unknown client"
            model = cut.get("model_name") or "Unknown model"
            container_key = (client, model)
            job_order_number = cut.get("job_order_number") or "Unknown job order"
            color_name = cut.get("color_name") or "Unknown color"

            container = containers.get(container_key)
            if not container:
                container = {
                    "client_name": client,
                    "model_name": model,
                    "job_orders": {},
                }
                containers[container_key] = container

            job_orders = container["job_orders"]
            job = job_orders.get(job_order_number)
            if not job:
                job = {
                    "job_order_number": job_order_number,
                    "colors": {},
                }
                job_orders[job_order_number] = job

            colors_dict = job["colors"]
            color = colors_dict.get(color_name)
            if not color:
                color = {
                    "color_name": color_name,
                    "cuts": [],
                }
                colors_dict[color_name] = color

            color["cuts"].append(cut)

        # Convert mapping to sorted list
        containers_list: List[Dict[str, Any]] = []
        for (client, model), container in containers.items():
            job_orders_list = []
            for jo_num, jo in container["job_orders"].items():
                colors_list = []
                for col_name, col in jo["colors"].items():
                    # Sort cuts by created_at then cut_id
                    col["cuts"].sort(
                        key=lambda c: (
                            c.get("created_at") or datetime.min,
                            c.get("cut_id") or 0,
                        )
                    )
                    colors_list.append(col)
                colors_list.sort(key=lambda c: c["color_name"])
                jo["colors"] = colors_list
                job_orders_list.append(jo)
            job_orders_list.sort(key=lambda j: j["job_order_number"])
            container["job_orders"] = job_orders_list
            containers_list.append(container)

        containers_list.sort(
            key=lambda c: (c["client_name"], c["model_name"])
        )
        return containers_list

    # ------------------------------------------------------------------
    # PDF building
    # ------------------------------------------------------------------
    def _build_header(
        self,
        story: List[Any],
        title_style: ParagraphStyle,
        subtitle_style: ParagraphStyle,
        target_date: date,
        client_name: Optional[str],
        model_name: Optional[str],
        job_order_number: Optional[str],
        total_cut_pieces: int,
        total_cutting_style: ParagraphStyle,
    ) -> None:
        # Logo if available
        logo_path = "frontend/public/company-logo.png"
        if os.path.exists(logo_path):
            try:
                logo = Image(logo_path, width=2.0 * inch, height=1.0 * inch)
                logo.hAlign = "CENTER"
                story.append(logo)
                story.append(Spacer(1, 12))
            except Exception as exc:
                logger.warning("Could not add logo to report: %s", exc)

        story.append(Paragraph("Daily Production Report – Cutting", title_style))
        story.append(
            Paragraph(
                f"Report Date: {target_date.strftime('%Y-%m-%d')}",
                subtitle_style,
            )
        )

        # Total Cutting Production summary line (larger, bold, colored)
        story.append(
            Paragraph(
                f"Total Cutting Production: {total_cut_pieces:,} pcs",
                total_cutting_style,
            )
        )

        # Filters summary line
        filters: List[str] = []
        if client_name:
            filters.append(f"Client: {client_name}")
        if model_name:
            filters.append(f"Model: {model_name}")
        if job_order_number:
            filters.append(f"Job Order: {job_order_number}")

        if filters:
            story.append(
                Paragraph(
                    prepare_pdf_text("Filters: " + " – ".join(filters)),
                    subtitle_style,
                )
            )

        story.append(Spacer(1, 18))

    def _build_sewing_document_header(
        self,
        story: List[Any],
        title_style: ParagraphStyle,
        subtitle_style: ParagraphStyle,
        target_date: date,
        total_true_pieces: int,
        total_sewing_style: ParagraphStyle,
    ) -> None:
        logo_path = "frontend/public/company-logo.png"
        if os.path.exists(logo_path):
            try:
                logo = Image(logo_path, width=2.0 * inch, height=1.0 * inch)
                logo.hAlign = "CENTER"
                story.append(logo)
                story.append(Spacer(1, 12))
            except Exception as exc:
                logger.warning("Could not add logo to report: %s", exc)

        story.append(Paragraph("Daily Production Report – Sewing", title_style))
        story.append(
            Paragraph(
                f"Report Date: {target_date.strftime('%Y-%m-%d')}",
                subtitle_style,
            )
        )
        story.append(
            Paragraph(
                f"Total true output (all lines): {total_true_pieces:,} pcs",
                total_sewing_style,
            )
        )
        story.append(Spacer(1, 18))

    def _build_cutting_section(
        self,
        story: List[Any],
        grouped: List[Dict[str, Any]],
        small_label: ParagraphStyle,
    ) -> None:
        # Styles for headers and totals
        section_header_bg = colors.HexColor("#1D4ED8")  # deep blue
        section_header_fg = colors.white

        job_header_bg = colors.HexColor("#DBEAFE")  # light blue
        job_header_fg = colors.HexColor("#1F2937")

        color_total_bg = colors.HexColor("#DBEAFE")
        job_total_bg = colors.HexColor("#D1FAE5")  # emerald-ish

        # Total usable width inside page margins
        content_width = 7.0 * inch

        for idx, container in enumerate(grouped):
            client = container["client_name"]
            model = container["model_name"]

            # Container header band
            header_data = apply_pdf_unicode_to_table_rows(
                [[f"Client: {client}   –   Model: {model}"]]
            )
            header_table = Table(header_data, colWidths=[content_width])
            header_table.hAlign = "LEFT"
            header_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), section_header_bg),
                        ("TEXTCOLOR", (0, 0), (-1, -1), section_header_fg),
                        ("FONTNAME", (0, 0), (-1, -1), pdf_fonts.PDF_FONT_BOLD),
                        ("FONTSIZE", (0, 0), (-1, -1), 11),
                        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 6),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            if idx > 0:
                story.append(PageBreak())
            story.append(header_table)
            story.append(Spacer(1, 8))

            # Each job order under this container
            job_orders: List[Dict[str, Any]] = container["job_orders"]
            for jo in job_orders:
                jo_number = jo["job_order_number"]

                # Job order header band
                job_header = Table(
                    apply_pdf_unicode_to_table_rows([[f"Job Order: {jo_number}"]]),
                    colWidths=[content_width],
                )
                job_header.hAlign = "LEFT"
                job_header.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), job_header_bg),
                            ("TEXTCOLOR", (0, 0), (-1, -1), job_header_fg),
                            ("FONTNAME", (0, 0), (-1, -1), pdf_fonts.PDF_FONT_BOLD),
                            ("FONTSIZE", (0, 0), (-1, -1), 9),
                            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 6),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                            ("TOPPADDING", (0, 0), (-1, -1), 3),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                        ]
                    )
                )
                story.append(job_header)
                story.append(Spacer(1, 4))

                # Collect all size labels for this job order
                size_labels_set = set()
                for color in jo["colors"]:
                    for cut in color["cuts"]:
                        for s in cut["sizes"]:
                            if s.get("size_value"):
                                size_labels_set.add(str(s["size_value"]))
                size_labels = sorted(
                    list(size_labels_set),
                    key=lambda v: get_size_sort_key(str(v)),
                )

                # Pre-initialize job-level totals
                job_order_totals = [0 for _ in size_labels]
                job_order_grand_total = 0
                job_order_consumption_m_num = 0.0
                job_order_consumption_m_den = 0.0
                job_order_consumption_kg_num = 0.0
                job_order_consumption_kg_den = 0.0

                # For each color block under job order
                for color in jo["colors"]:
                    color_name = color["color_name"]
                    cuts_list = color["cuts"]

                    # Color band
                    color_header = Table(
                        apply_pdf_unicode_to_table_rows([[f"Color: {color_name}"]]),
                        colWidths=[content_width],
                    )
                    color_header.hAlign = "LEFT"
                    color_header.setStyle(
                        TableStyle(
                            [
                                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#4B5563")),
                                ("FONTNAME", (0, 0), (-1, -1), pdf_fonts.PDF_FONT_BOLD),
                                ("FONTSIZE", (0, 0), (-1, -1), 9),
                                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                                ("TOPPADDING", (0, 0), (-1, -1), 2),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                            ]
                        )
                    )
                    story.append(color_header)

                    # Build table header: Cut #, dynamic size columns, Total, Printing, Consumption (m/kg)
                    header_labels: List[str] = ["Cut #"] + list(size_labels) + [
                        "Total",
                        "Printing",
                        "Consumption (m)",
                        "Consumption (kg)",
                    ]

                    # Use Paragraphs with smaller font so headers can wrap
                    header_styles = getSampleStyleSheet()
                    pdf_fonts.patch_reportlab_sample_styles(header_styles)
                    header_cell_style = ParagraphStyle(
                        "CutTableHeader",
                        parent=header_styles["Normal"],
                        fontSize=7,
                        leading=8,
                        alignment=TA_CENTER,
                        textColor=colors.white,
                        fontName=pdf_fonts.PDF_FONT_BOLD,
                    )

                    header_row: List[Any] = [
                        Paragraph(str(lbl), header_cell_style) for lbl in header_labels
                    ]

                    table_data: List[List[Any]] = [header_row]

                    # Color-level totals
                    color_totals = [0 for _ in size_labels]
                    color_grand_total = 0
                    color_m_num = 0.0
                    color_m_den = 0.0
                    color_kg_num = 0.0
                    color_kg_den = 0.0

                    # Rows for each cut
                    for cut in cuts_list:
                        sizes = cut.get("sizes", [])
                        total_layers = cut.get("total_layers") or 0
                        marker_length = cut.get("marker_length")
                        cut_weight = cut.get("cut_weight") or 0.0

                        size_values_map: Dict[str, int] = {}
                        for s in sizes:
                            v = str(s.get("size_value") or "")
                            size_values_map[v] = size_values_map.get(v, 0) + int(
                                s.get("total_pieces") or 0
                            )

                        row_pieces = [size_values_map.get(str(lbl), 0) for lbl in size_labels]
                        row_total = sum(row_pieces)

                        # Update color and job totals
                        for i, val in enumerate(row_pieces):
                            color_totals[i] += val
                            job_order_totals[i] += val
                        color_grand_total += row_total
                        job_order_grand_total += row_total

                        # Consumption metrics – use same weighting approach as UI
                        total_pieces = sum(size_values_map.values())

                        cons_m_str = "-"
                        cons_kg_str = "-"

                        if (
                            total_pieces > 0
                            and marker_length is not None
                            and total_layers > 0
                        ):
                            num_m = float(marker_length) * float(total_layers)
                            cons_m = num_m / float(total_pieces)
                            cons_m_str = f"{cons_m:.3f}"
                            color_m_num += num_m
                            color_m_den += float(total_pieces)
                            job_order_consumption_m_num += num_m
                            job_order_consumption_m_den += float(total_pieces)

                        if total_pieces > 0 and cut_weight:
                            num_kg = float(cut_weight)
                            cons_kg = num_kg / float(total_pieces)
                            cons_kg_str = f"{cons_kg:.3f}"
                            color_kg_num += num_kg
                            color_kg_den += float(total_pieces)
                            job_order_consumption_kg_num += num_kg
                            job_order_consumption_kg_den += float(total_pieces)

                        row = [str(cut.get("cut_id") or "")]
                        row.extend(val if val != 0 else "" for val in row_pieces)
                        row.append(row_total if row_total != 0 else "")

                        # Printing status: show "N/A" when there is no printing status
                        raw_status = cut.get("print_status")
                        printing_status = (raw_status or "N/A").upper()
                        row.append(printing_status)
                        row.append(cons_m_str)
                        row.append(cons_kg_str)
                        table_data.append(row)

                    # Color total row
                    avg_m_color = (
                        color_m_num / color_m_den if color_m_den > 0 else None
                    )
                    avg_kg_color = (
                        color_kg_num / color_kg_den if color_kg_den > 0 else None
                    )
                    # First cell shows only the color name (no extra label)
                    color_total_row: List[Any] = [str(color_name)]
                    color_total_row.extend(
                        val if val != 0 else "" for val in color_totals
                    )
                    color_total_row.append(color_grand_total if color_grand_total != 0 else "")
                    color_total_row.append("")  # printing
                    color_total_row.append(
                        f"{avg_m_color:.3f}" if avg_m_color is not None else ""
                    )
                    color_total_row.append(
                        f"{avg_kg_color:.3f}" if avg_kg_color is not None else ""
                    )
                    table_data.append(color_total_row)

                    # Table column widths – dynamically distribute size columns
                    num_size_cols = len(size_labels)
                    # Fixed widths for non-size columns (Cut #, Total, Printing, Cons m, Cons kg)
                    base_widths = [0.8 * inch]  # Cut #
                    tail_widths = [0.7 * inch, 0.9 * inch, 0.9 * inch, 0.9 * inch]
                    fixed_total = sum(base_widths) + sum(tail_widths)
                    remaining = max(content_width - fixed_total, 1.0 * inch)
                    size_width = remaining / max(num_size_cols, 1)
                    size_widths = [size_width for _ in size_labels]
                    col_widths = base_widths + size_widths + tail_widths

                    tbl = Table(
                        apply_pdf_unicode_to_table_rows(table_data),
                        colWidths=col_widths,
                        repeatRows=1,
                    )
                    tbl.hAlign = "LEFT"
                    header_bg = colors.HexColor("#111827")
                    header_fg = colors.white
                    tbl_style = TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                            ("TEXTCOLOR", (0, 0), (-1, 0), header_fg),
                            ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                            ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                            ("FONTSIZE", (0, 0), (-1, 0), 8),
                            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
                            # Body cells: smaller font and centered to help fit many columns
                            ("FONTSIZE", (0, 1), (-1, -1), 6),
                            ("ALIGN", (0, 1), (-1, -1), "CENTER"),
                        ]
                    )

                    # Shade color total row
                    color_total_row_index = len(table_data) - 1
                    tbl_style.add(
                        "BACKGROUND",
                        (0, color_total_row_index),
                        (-1, color_total_row_index),
                        color_total_bg,
                    )
                    tbl_style.add(
                        "FONTNAME",
                        (0, color_total_row_index),
                        (-1, color_total_row_index),
                        pdf_fonts.PDF_FONT_BOLD,
                    )

                    tbl.setStyle(tbl_style)
                    story.append(tbl)
                    story.append(Spacer(1, 10))

                # Job order total row across all colors
                if size_labels:
                    job_total_row: List[Any] = ["Total"]
                    job_total_row.extend(
                        val if val != 0 else "" for val in job_order_totals
                    )
                    job_total_row.append(job_order_grand_total if job_order_grand_total != 0 else "")

                    avg_m = (
                        job_order_consumption_m_num / job_order_consumption_m_den
                        if job_order_consumption_m_den > 0
                        else None
                    )
                    avg_kg = (
                        job_order_consumption_kg_num / job_order_consumption_kg_den
                        if job_order_consumption_kg_den > 0
                        else None
                    )
                    job_total_row.append("")  # printing
                    job_total_row.append(f"{avg_m:.3f}" if avg_m is not None else "")
                    job_total_row.append(f"{avg_kg:.3f}" if avg_kg is not None else "")

                    jt_data = [job_total_row]
                    num_size_cols = len(size_labels)
                    base_widths = [0.8 * inch]  # Cut # / label
                    tail_widths = [0.7 * inch, 0.9 * inch, 0.9 * inch, 0.9 * inch]
                    fixed_total = sum(base_widths) + sum(tail_widths)
                    remaining = max(content_width - fixed_total, 1.0 * inch)
                    size_width = remaining / max(num_size_cols, 1)
                    size_widths = [size_width for _ in size_labels]
                    col_widths = base_widths + size_widths + tail_widths

                    jt = Table(apply_pdf_unicode_to_table_rows(jt_data), colWidths=col_widths)
                    jt.hAlign = "LEFT"
                    jt.setStyle(
                        TableStyle(
                            [
                                (
                                    "BACKGROUND",
                                    (0, 0),
                                    (-1, -1),
                                    job_total_bg,
                                ),
                                (
                                    "FONTNAME",
                                    (0, 0),
                                    (-1, -1),
                                    pdf_fonts.PDF_FONT_BOLD,
                                ),
                                (
                                    "FONTSIZE",
                                    (0, 0),
                                    (-1, -1),
                                    7,
                                ),
                                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                                (
                                    "GRID",
                                    (0, 0),
                                    (-1, -1),
                                    0.25,
                                    colors.HexColor("#D1D5DB"),
                                ),
                            ]
                        )
                    )
                    story.append(jt)
                    story.append(Spacer(1, 14))

    def _build_sewing_section(
        self,
        story: List[Any],
        sewing_data: List[Dict[str, Any]],
    ) -> None:
        """Append Sewing section (phases → schematics → stages) to the report."""
        if not sewing_data:
            return

        phase_header_bg = colors.HexColor("#DBEAFE")
        phase_header_fg = colors.HexColor("#1F2937")

        schematic_header_bg = colors.HexColor("#EEF2FF")
        schematic_header_fg = colors.HexColor("#111827")

        content_width = 7.0 * inch

        for phase in sewing_data:
            phase_name = str(phase.get("phase_name") or "")
            schematics = phase.get("schematics") or []

            # Phase header
            phase_header = Table(
                apply_pdf_unicode_to_table_rows([[f"Phase: {phase_name}"]]),
                colWidths=[content_width],
            )
            phase_header.hAlign = "LEFT"
            phase_header.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), phase_header_bg),
                        ("TEXTCOLOR", (0, 0), (-1, -1), phase_header_fg),
                        ("FONTNAME", (0, 0), (-1, -1), pdf_fonts.PDF_FONT_BOLD),
                        ("FONTSIZE", (0, 0), (-1, -1), 10),
                        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 6),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            story.append(phase_header)
            story.append(Spacer(1, 6))

            if not schematics:
                no_schematic_tbl = Table(
                    apply_pdf_unicode_to_table_rows(
                        [["No schematics for this phase on the selected date."]]
                    ),
                    colWidths=[content_width],
                )
                no_schematic_tbl.hAlign = "LEFT"
                no_schematic_tbl.setStyle(
                    TableStyle(
                        [
                            ("FONTNAME", (0, 0), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                            ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#4B5563")),
                            ("FONTSIZE", (0, 0), (-1, -1), 8),
                            ("LEFTPADDING", (0, 0), (-1, -1), 6),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                            ("TOPPADDING", (0, 0), (-1, -1), 3),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                        ]
                    )
                )
                story.append(no_schematic_tbl)
                story.append(Spacer(1, 8))
                continue

            for schematic in schematics:
                schematic_name = str(schematic.get("schematic_name") or "")
                working_hours = float(schematic.get("working_hours") or 0.0)
                stages = schematic.get("stages") or []

                # Line totals analytics (based on last stage(s) only)
                line_expected_total = int(schematic.get("line_expected_total") or 0)
                line_true_total = int(schematic.get("line_true_total") or 0)
                line_efficiency_pct = schematic.get("line_efficiency_pct")
                line_shortage = int(schematic.get("line_shortage") or 0)

                shortage_color = (
                    colors.HexColor("#DC2626") if line_shortage > 0 else colors.HexColor("#059669")
                )
                shortage_text = (
                    f"<font color='{shortage_color.hexval()}'>Shortage: {line_shortage:,}</font>"
                    if line_shortage > 0
                    else f"<font color='{shortage_color.hexval()}'>Shortage: 0</font>"
                )

                eff_text = (
                    f"{float(line_efficiency_pct):.1f}%" if line_efficiency_pct is not None else "—"
                )

                header_styles = getSampleStyleSheet()
                pdf_fonts.patch_reportlab_sample_styles(header_styles)
                schematic_header_style = ParagraphStyle(
                    "SchematicHeader",
                    parent=header_styles["Normal"],
                    fontSize=9,
                    leading=11,
                    textColor=schematic_header_fg,
                    fontName=pdf_fonts.PDF_FONT_REGULAR,
                )

                schematic_safe = xml_escape(prepare_pdf_text(schematic_name))
                header_html = (
                    f"<b>Schematic:</b> {schematic_safe} — <b>Working hours:</b> {working_hours:g}"
                    f"&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;<b>Expected:</b> {line_expected_total:,}"
                    f"&nbsp;&nbsp;&nbsp;<b>True:</b> {line_true_total:,}"
                    f"&nbsp;&nbsp;&nbsp;<b>Eff:</b> {eff_text}"
                    f"&nbsp;&nbsp;&nbsp;{shortage_text}"
                )

                # Schematic header
                schematic_header = Table(
                    [
                        [
                            Paragraph(header_html, schematic_header_style),
                        ]
                    ],
                    colWidths=[content_width],
                )
                schematic_header.hAlign = "LEFT"
                schematic_header.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), schematic_header_bg),
                            ("TEXTCOLOR", (0, 0), (-1, -1), schematic_header_fg),
                            ("FONTNAME", (0, 0), (-1, -1), pdf_fonts.PDF_FONT_BOLD),
                            ("FONTSIZE", (0, 0), (-1, -1), 9),
                            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 6),
                            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                            ("TOPPADDING", (0, 0), (-1, -1), 3),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                        ]
                    )
                )
                story.append(schematic_header)

                # Table header
                header_labels = [
                    "Stage",
                    "Expected",
                    "Workers (true qty)",
                    "Total True",
                    "Efficiency (%)",
                ]
                styles = getSampleStyleSheet()
                pdf_fonts.patch_reportlab_sample_styles(styles)
                header_cell_style = ParagraphStyle(
                    "SewingTableHeader",
                    parent=styles["Normal"],
                    fontSize=7,
                    leading=8,
                    alignment=TA_CENTER,
                    textColor=colors.white,
                    fontName=pdf_fonts.PDF_FONT_BOLD,
                )
                header_row: List[Any] = [
                    Paragraph(str(lbl), header_cell_style) for lbl in header_labels
                ]

                table_data: List[List[Any]] = [header_row]

                # Rows per stage
                for stage in stages:
                    stage_name = str(stage.get("stage_name") or "")
                    expected = int(stage.get("expected") or 0)
                    total_true = int(stage.get("total_true") or 0)
                    eff = stage.get("efficiency_pct")
                    workers = stage.get("workers") or []

                    workers_display = ", ".join(
                        f"{w.get('worker_name') or ''} ({int(w.get('true_output') or 0)})"
                        for w in workers
                    )
                    if not workers_display:
                        workers_display = "—"

                    row = [
                        stage_name,
                        expected,
                        workers_display,
                        total_true,
                        f"{float(eff):.1f}" if eff is not None else "—",
                    ]
                    table_data.append(row)

                # Column widths
                stage_col = 2.4 * inch
                expected_col = 1.0 * inch
                workers_col = 2.5 * inch
                true_col = 0.8 * inch
                eff_col = 0.7 * inch
                col_widths = [
                    stage_col,
                    expected_col,
                    workers_col,
                    true_col,
                    eff_col,
                ]

                tbl = Table(
                    apply_pdf_unicode_to_table_rows(table_data),
                    colWidths=col_widths,
                    repeatRows=1,
                )
                tbl.hAlign = "LEFT"
                header_bg = colors.HexColor("#111827")
                header_fg = colors.white
                tbl_style = TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                        ("TEXTCOLOR", (0, 0), (-1, 0), header_fg),
                        ("FONTNAME", (0, 0), (-1, 0), pdf_fonts.PDF_FONT_BOLD),
                        ("FONTNAME", (0, 1), (-1, -1), pdf_fonts.PDF_FONT_REGULAR),
                        ("FONTSIZE", (0, 0), (-1, 0), 8),
                        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
                        ("FONTSIZE", (0, 1), (-1, -1), 7),
                        ("ALIGN", (0, 1), (0, -1), "LEFT"),
                        ("ALIGN", (1, 1), (-1, -1), "CENTER"),
                    ]
                )

                tbl.setStyle(tbl_style)
                story.append(tbl)
                story.append(Spacer(1, 12))
