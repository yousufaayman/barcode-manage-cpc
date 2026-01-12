from typing import Dict, Any, Optional
from datetime import datetime
import os
import logging
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import io
from app.core.config import settings

logger = logging.getLogger(__name__)


def get_phase_color(phase_name: str) -> tuple:
    """Get color for each phase"""
    phase_colors = {
        "Cutting": colors.HexColor('#3B82F6'),        # Blue
        "Sewing - 1": colors.HexColor('#F59E0B'),     # Amber
        "Sewing - 2": colors.HexColor('#EF4444'),     # Red
        "Sewing - 3": colors.HexColor('#8B5CF6'),     # Purple
        "Sewing - 4": colors.HexColor('#10B981'),     # Emerald
        "Packaging": colors.HexColor('#F97316'),      # Orange
        "QC": colors.HexColor('#06B6D4'),             # Cyan
    }
    return phase_colors.get(phase_name, colors.HexColor('#6B7280'))  # Default gray


class PDFGenerationService:
    def __init__(self, reports_dir: str = None):
        self.reports_dir = reports_dir or settings.REPORTS_DIR or "backend/reports"
        self.ensure_reports_directory()
        
    def ensure_reports_directory(self):
        """Ensure the reports directory exists"""
        if not os.path.exists(self.reports_dir):
            os.makedirs(self.reports_dir, exist_ok=True)
    
    def generate_daily_report_pdf(self, report_data: Dict[str, Any]) -> str:
        """Generate PDF report from daily production data"""
        try:
            # Generate filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"daily_production_report_{timestamp}.pdf"
            filepath = os.path.join(self.reports_dir, filename)
            
            # Create PDF document
            doc = SimpleDocTemplate(
                filepath,
                pagesize=A4,
                rightMargin=72,
                leftMargin=72,
                topMargin=72,
                bottomMargin=18
            )
            
            # Get styles
            styles = getSampleStyleSheet()
            
            # Create custom styles
            title_style = ParagraphStyle(
                'CustomTitle',
                parent=styles['Heading1'],
                fontSize=24,
                spaceAfter=30,
                alignment=TA_CENTER,
                textColor=colors.darkblue
            )
            
            heading_style = ParagraphStyle(
                'CustomHeading',
                parent=styles['Heading2'],
                fontSize=16,
                spaceAfter=12,
                textColor=colors.darkblue
            )
            
            subheading_style = ParagraphStyle(
                'CustomSubHeading',
                parent=styles['Heading3'],
                fontSize=14,
                spaceAfter=8,
                textColor=colors.darkgreen
            )
            
            # Build PDF content
            story = []
            
            # Add company logo and title
            story.extend(self._create_header(report_data, title_style))
            
            # Add summary metrics
            story.extend(self._create_summary_section(report_data, heading_style, subheading_style))
            
            # Add phase details
            story.extend(self._create_phase_details_section(report_data, heading_style, subheading_style))
            
            # Build PDF
            doc.build(story)
            
            logger.info(f"PDF report generated successfully: {filepath}")
            return filepath
            
        except Exception as e:
            logger.error(f"Error generating PDF report: {str(e)}")
            raise
    
    def _create_header(self, report_data: Dict[str, Any], title_style) -> list:
        """Create PDF header with company logo and title"""
        elements = []
        
        # Try to add company logo
        logo_path = "frontend/public/company-logo.png"
        if os.path.exists(logo_path):
            try:
                logo = Image(logo_path, width=2*inch, height=1*inch)
                logo.hAlign = 'CENTER'
                elements.append(logo)
                elements.append(Spacer(1, 20))
            except Exception as e:
                logger.warning(f"Could not add logo to PDF: {str(e)}")
        
        # Add title
        title = Paragraph("Daily Production Report", title_style)
        elements.append(title)
        
        # Add report date
        report_date = report_data.get("report_date", "N/A")
        date_style = ParagraphStyle(
            'ReportDate',
            parent=title_style,
            fontSize=14,
            textColor=colors.grey
        )
        date_para = Paragraph(f"Report Date: {report_date}", date_style)
        elements.append(date_para)
        
        elements.append(Spacer(1, 30))
        return elements
    
    def _create_summary_section(self, report_data: Dict[str, Any], heading_style, subheading_style) -> list:
        """Create summary metrics section"""
        elements = []
        
        # Summary heading
        elements.append(Paragraph("Executive Summary", heading_style))
        
        summary_metrics = report_data.get("summary_metrics", {})
        
        # Create summary table
        summary_data = [
            ["Metric", "Value"],
            ["Total Phases", str(summary_metrics.get("total_phases", 0))],
            ["Total Quantity Received", str(summary_metrics.get("total_quantity_received", 0))],
            ["Total Quantity Completed", str(summary_metrics.get("total_quantity_completed", 0))],
            ["Overall Efficiency", f"{summary_metrics.get('overall_efficiency', 0.0):.1f}%"],
            ["Total Pieces", str(summary_metrics.get("total_pieces", 0))],
            ["Longest Time in Phase", summary_metrics.get("longest_overall_time", "0 days")]
        ]
        
        summary_table = Table(summary_data, colWidths=[3*inch, 2*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.darkblue),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black)
        ]))
        
        elements.append(summary_table)
        elements.append(Spacer(1, 20))
        
        # Add bottlenecks if any
        bottlenecks = summary_metrics.get("bottlenecks", [])
        if bottlenecks:
            elements.append(Paragraph("Bottlenecks Identified", subheading_style))
            bottleneck_data = [["Phase", "Pending Quantity"]]
            for bottleneck in bottlenecks:
                bottleneck_data.append([
                    bottleneck.get("phase", "N/A"),
                    str(bottleneck.get("pending_quantity", 0))
                ])
            
            bottleneck_table = Table(bottleneck_data, colWidths=[2.5*inch, 2.5*inch])
            bottleneck_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.red),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BACKGROUND', (0, 1), (-1, -1), colors.lightgrey),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            
            elements.append(bottleneck_table)
            elements.append(Spacer(1, 20))
        
        return elements
    
    def _create_phase_details_section(self, report_data: Dict[str, Any], heading_style, subheading_style) -> list:
        """Create detailed phase information section"""
        elements = []
        
        phases_data = report_data.get("phases", {})
        
        # Removed global Completed Today rendering; will render per-phase after In Progress
        
        for phase_name, phase_data in phases_data.items():
            # Phase heading with color
            phase_color = get_phase_color(phase_name)
            colored_heading_style = ParagraphStyle(
                'ColoredHeading',
                parent=heading_style,
                textColor=phase_color,
                fontSize=14,
                fontName='Helvetica-Bold'
            )
            elements.append(Paragraph(f"Phase: {phase_name}", colored_heading_style))
            
            # Phase summary
            phase_summary = phase_data.get("phase_summary", {})
            # Format longest time with model-color group
            longest_time = phase_summary.get("longest_time_in_phase", "0 days")
            longest_model_color = phase_summary.get("longest_time_model_color", "")
            longest_time_display = f"{longest_time}"
            if longest_model_color:
                longest_time_display += f" ({longest_model_color})"
            
            phase_summary_data = [
                ["Metric", "Value"],
                ["Total Received", str(phase_summary.get("total_received", 0))],
                ["Total Completed", str(phase_summary.get("total_completed", 0))],
                ["Throughput Efficiency", f"{phase_summary.get('throughput_efficiency', 0.0):.1f}%"],
                ["Total Pieces", str(phase_summary.get("total_pieces", 0))],
                ["Longest Time in Phase", longest_time_display]
            ]
            
            phase_summary_table = Table(phase_summary_data, colWidths=[2.0*inch, 3.0*inch])
            phase_summary_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), phase_color),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BACKGROUND', (0, 1), (-1, -1), colors.lightgrey),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            
            elements.append(phase_summary_table)
            elements.append(Spacer(1, 15))
            
            # Status details
            statuses = phase_data.get("statuses", {})
            inserted_completed_today = False
            for status, status_data in statuses.items():
                # Add a full-width colored status banner
                status_color_map = {
                    'Pending': colors.HexColor('#FFC107'),      # saturated amber
                    'In Progress': colors.HexColor('#28A745'),   # saturated green
                    'Completed': colors.HexColor('#0D6EFD')      # saturated blue
                }
                status_text_color_map = {
                    'Pending': colors.HexColor('#3A2E00'),
                    'In Progress': colors.HexColor('#FFFFFF'),
                    'Completed': colors.HexColor('#FFFFFF')
                }
                banner_bg = status_color_map.get(status, colors.HexColor('#ADB5BD'))
                banner_fg = status_text_color_map.get(status, colors.HexColor('#212529'))
                status_banner = Table(
                    [[f"Status: {status}"]],
                    colWidths=[6.8*inch]
                )
                status_banner.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), banner_bg),
                    ('TEXTCOLOR', (0, 0), (-1, -1), banner_fg),
                    ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
                    ('FONTSIZE', (0, 0), (-1, -1), 11),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 6),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                    ('TOPPADDING', (0, 0), (-1, -1), 4),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                    ('LINEBELOW', (0, 0), (-1, -1), 1, colors.HexColor('#ADB5BD')),
                ]))
                elements.append(status_banner)
                elements.append(Spacer(1, 8))
                
                # Model-Color groups with enhanced grouping
                model_color_groups = status_data.get("model_color_groups", {})
                if model_color_groups:
                    # Group by model first, then color
                    models_dict = {}
                    for group_key, group_data in model_color_groups.items():
                        model_name = group_data.get("model_name", "N/A")
                        color_name = group_data.get("color_name", "N/A")
                        
                        if model_name not in models_dict:
                            models_dict[model_name] = {}
                        if color_name not in models_dict[model_name]:
                            models_dict[model_name][color_name] = group_data
                    
                    # Create modern, clean table structure with totals first
                    table_data = [["Model", "Color", "In Phase Qty", "Working Qty", "% in Phase"]]
                    
                    for model_name, colors_dict in models_dict.items():
                        # Calculate model totals first
                        model_total_working = 0
                        model_total_in_phase = 0
                        
                        # Calculate totals for this model (EXCLUDING second degree batches)
                        for color_name, group_data in colors_dict.items():
                            color_total_working = 0
                            color_total_in_phase = 0
                            
                            # Use the expected_quantity from the model-color group (total across all phases)
                            color_total_working = group_data.get("expected_quantity", 0)
                            
                            # Sum ONLY regular sizes for in-phase quantity (exclude second degree)
                            sizes = group_data.get("sizes", [])
                            for size_data in sizes:
                                color_total_in_phase += size_data.get("quantity", 0)
                            
                            model_total_working += color_total_working
                            model_total_in_phase += color_total_in_phase
                        
                        # Add model total row first (bold, highlighted)
                        model_phase_pct = (model_total_in_phase / model_total_working * 100) if model_total_working > 0 else 0
                        table_data.append([
                            f"📊 {model_name}",
                            "TOTAL",
                            str(model_total_in_phase),
                            str(model_total_working),
                            f"{model_phase_pct:.1f}%",
                        ])
                        
                        # Add color groups under the model (no size rows)
                        for color_name, group_data in colors_dict.items():
                            # Calculate color totals (EXCLUDING second degree batches)
                            color_total_working = 0
                            color_total_in_phase = 0
                            
                            # Use the expected_quantity from the model-color group (total across all phases)
                            color_total_working = group_data.get("expected_quantity", 0)
                            
                            # Sum ONLY regular sizes for in-phase quantity (exclude second degree)
                            sizes = group_data.get("sizes", [])
                            for size_data in sizes:
                                color_total_in_phase += size_data.get("quantity", 0)
                            
                            # Add color subtotal row (for regular items only)
                            color_phase_pct = (color_total_in_phase / color_total_working * 100) if color_total_working > 0 else 0
                            table_data.append([
                                "",
                                f"• {color_name}",
                                str(color_total_in_phase),
                                str(color_total_working),
                                f"{color_phase_pct:.1f}%",
                            ])
                    
                    # Create single table to avoid any breaks in grouped data
                    # For better readability, we'll use a single table regardless of size
                    table_chunks = [table_data]
                    
                    for table_chunk in table_chunks:
                        
                        group_table = Table(table_chunk, colWidths=[2.2*inch, 1.6*inch, 1.0*inch, 1.0*inch, 1.0*inch])
                        # Create lighter version of phase color for status table header
                        phase_color_lighter = colors.HexColor(
                            f"#{hex(int(phase_color.red * 255))[2:].zfill(2)}"
                            f"{hex(int(phase_color.green * 255))[2:].zfill(2)}"
                            f"{hex(int(phase_color.blue * 255))[2:].zfill(2)}"
                        )
                        
                        # Create modern table style with hierarchical formatting
                        table_style = TableStyle([
                            # Header styling
                            ('BACKGROUND', (0, 0), (-1, 0), phase_color_lighter),
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                            ('FONTSIZE', (0, 0), (-1, 0), 9),
                            
                            # General styling
                            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                            ('ALIGN', (0, 1), (1, -1), 'LEFT'),  # Left align text columns
                            ('FONTSIZE', (0, 1), (-1, -1), 7),
                            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                            
                            # Alternating row colors
                            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8F9FA')])
                        ])
                        
                        # Add special styling for hierarchical rows with more apparent colors
                        for row_idx, row in enumerate(table_chunk):
                            if row_idx > 0:  # Skip header
                                # Model total rows (with emoji) - Deeper blue
                                if "📊" in str(row[0]):
                                    table_style.add('BACKGROUND', (0, row_idx), (-1, row_idx), colors.HexColor('#BBDEFB'))
                                    table_style.add('FONTNAME', (0, row_idx), (-1, row_idx), 'Helvetica-Bold')
                                    table_style.add('FONTSIZE', (0, row_idx), (-1, row_idx), 9)
                                    table_style.add('TEXTCOLOR', (0, row_idx), (-1, row_idx), colors.HexColor('#0D47A1'))
                                
                                # Color total rows (with bullet) - Deeper purple
                                elif "•" in str(row[1]):
                                    table_style.add('BACKGROUND', (0, row_idx), (-1, row_idx), colors.HexColor('#E1BEE7'))
                                    table_style.add('FONTNAME', (0, row_idx), (-1, row_idx), 'Helvetica-Bold')
                                    table_style.add('FONTSIZE', (0, row_idx), (-1, row_idx), 8)
                                    table_style.add('TEXTCOLOR', (0, row_idx), (-1, row_idx), colors.HexColor('#4A148C'))
                        
                        group_table.setStyle(table_style)
                        
                        elements.append(group_table)
                
                # Insert Completed Today section after In Progress status for Cutting/Sewing
                if status == 'In Progress' and not inserted_completed_today:
                    completed_today = report_data.get('completed_today', {})
                    groups = completed_today.get(phase_name, [])
                    if groups:
                        elements.append(Spacer(1, 8))
                        elements.append(Paragraph("Completed Today (Model-Color)", ParagraphStyle('phaseSmall', parent=subheading_style, fontSize=11)))
                        data = [["Model", "Color", "Quantity"]]
                        for g in groups:
                            data.append([g.get("model_name", "N/A"), g.get("color_name", "N/A"), str(g.get("quantity", 0))])
                        t = Table(data, colWidths=[2.5*inch, 2.0*inch, 1.0*inch])
                        t.setStyle(TableStyle([
                            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#198754')),
                            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                            ('FONTSIZE', (0, 0), (-1, 0), 9),
                            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                        ]))
                        elements.append(t)
                        elements.append(Spacer(1, 8))
                        inserted_completed_today = True
            
            # Fallback: if no In Progress status was present, still show Completed Today for this phase if any
            if not inserted_completed_today:
                completed_today = report_data.get('completed_today', {})
                groups = completed_today.get(phase_name, [])
                if groups:
                    elements.append(Spacer(1, 8))
                    elements.append(Paragraph("Completed Today (Model-Color)", ParagraphStyle('phaseSmall', parent=subheading_style, fontSize=11)))
                    data = [["Model", "Color", "Quantity"]]
                    for g in groups:
                        data.append([g.get("model_name", "N/A"), g.get("color_name", "N/A"), str(g.get("quantity", 0))])
                    t = Table(data, colWidths=[2.5*inch, 2.0*inch, 1.0*inch])
                    t.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#198754')),
                        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                        ('FONTSIZE', (0, 0), (-1, 0), 9),
                        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                        ('BACKGROUND', (0, 1), (-1, -1), colors.white),
                    ]))
                    elements.append(t)
                    elements.append(Spacer(1, 8))
            
            elements.append(Spacer(1, 15))
            
            # Add page break between phases
            elements.append(PageBreak())
        
        return elements
    
