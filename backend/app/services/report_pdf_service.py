from __future__ import annotations

import os
import logging
from datetime import date, datetime
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


logger = logging.getLogger(__name__)


class ReportPDFService:
    """Generate daily production report PDFs for all phases (Cutting, Sewing, etc.)."""

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
        """Generate the daily Cutting report (with Sewing section) and return the PDF file path."""
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

        # Load Sewing daily report data for the same date
        sewing_data = get_sewing_daily_report_data(db, target_date)

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
            fontName="Helvetica-Bold",
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

        # Sewing section (if there is data)
        if sewing_data:
            self._build_sewing_section(story, sewing_data)

        doc.build(story)
        logger.info("Cutting report PDF generated at %s", filepath)
        return filepath

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
                    "Filters: " + " – ".join(filters),
                    subtitle_style,
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
            header_data = [
                [
                    f"Client: {client}   –   Model: {model}",
                ]
            ]
            header_table = Table(header_data, colWidths=[content_width])
            header_table.hAlign = "LEFT"
            header_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), section_header_bg),
                        ("TEXTCOLOR", (0, 0), (-1, -1), section_header_fg),
                        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
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
                    [[f"Job Order: {jo_number}"]],
                    colWidths=[content_width],
                )
                job_header.hAlign = "LEFT"
                job_header.setStyle(
                    TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, -1), job_header_bg),
                            ("TEXTCOLOR", (0, 0), (-1, -1), job_header_fg),
                            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
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
                        [[f"Color: {color_name}"]],
                        colWidths=[content_width],
                    )
                    color_header.hAlign = "LEFT"
                    color_header.setStyle(
                        TableStyle(
                            [
                                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#4B5563")),
                                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
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
                    header_cell_style = ParagraphStyle(
                        "CutTableHeader",
                        parent=header_styles["Normal"],
                        fontSize=7,
                        leading=8,
                        alignment=TA_CENTER,
                        textColor=colors.white,
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

                    tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
                    tbl.hAlign = "LEFT"
                    header_bg = colors.HexColor("#111827")
                    header_fg = colors.white
                    tbl_style = TableStyle(
                        [
                            ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                            ("TEXTCOLOR", (0, 0), (-1, 0), header_fg),
                            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
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
                        "Helvetica-Bold",
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

                    jt = Table(jt_data, colWidths=col_widths)
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
                                    "Helvetica-Bold",
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

        # Start Sewing section on a new page
        story.append(PageBreak())

        section_header_bg = colors.HexColor("#1D4ED8")
        section_header_fg = colors.white

        phase_header_bg = colors.HexColor("#DBEAFE")
        phase_header_fg = colors.HexColor("#1F2937")

        schematic_header_bg = colors.HexColor("#EEF2FF")
        schematic_header_fg = colors.HexColor("#111827")

        schematic_total_bg = colors.HexColor("#D1FAE5")

        content_width = 7.0 * inch

        # Top-level Sewing title band
        sewing_title = Table(
            [["Sewing – Daily Production"]],
            colWidths=[content_width],
        )
        sewing_title.hAlign = "LEFT"
        sewing_title.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), section_header_bg),
                    ("TEXTCOLOR", (0, 0), (-1, -1), section_header_fg),
                    ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 12),
                    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        story.append(sewing_title)
        story.append(Spacer(1, 10))

        for phase in sewing_data:
            phase_name = str(phase.get("phase_name") or "")
            schematics = phase.get("schematics") or []

            # Phase header
            phase_header = Table(
                [[f"Phase: {phase_name}"]],
                colWidths=[content_width],
            )
            phase_header.hAlign = "LEFT"
            phase_header.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), phase_header_bg),
                        ("TEXTCOLOR", (0, 0), (-1, -1), phase_header_fg),
                        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
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
                    [["No schematics for this phase on the selected date."]],
                    colWidths=[content_width],
                )
                no_schematic_tbl.hAlign = "LEFT"
                no_schematic_tbl.setStyle(
                    TableStyle(
                        [
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
                schematic_header_style = ParagraphStyle(
                    "SchematicHeader",
                    parent=header_styles["Normal"],
                    fontSize=9,
                    leading=11,
                    textColor=schematic_header_fg,
                )

                header_html = (
                    f"<b>Schematic:</b> {schematic_name} — <b>Working hours:</b> {working_hours:g}"
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
                            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
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
                header_cell_style = ParagraphStyle(
                    "SewingTableHeader",
                    parent=styles["Normal"],
                    fontSize=7,
                    leading=8,
                    alignment=TA_CENTER,
                    textColor=colors.white,
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

                tbl = Table(table_data, colWidths=col_widths, repeatRows=1)
                tbl.hAlign = "LEFT"
                header_bg = colors.HexColor("#111827")
                header_fg = colors.white
                tbl_style = TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), header_bg),
                        ("TEXTCOLOR", (0, 0), (-1, 0), header_fg),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
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
