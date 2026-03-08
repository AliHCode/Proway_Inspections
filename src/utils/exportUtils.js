import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDateDisplay } from './rfiLogic';

/**
 * Format RFI data for export
 */
function prepareDataForExport(rfis) {
    return rfis.map((rfi) => ({
        'Serial No': rfi.serialNo,
        'Description': rfi.description,
        'Location': rfi.location,
        'Type': rfi.inspectionType,
        'Filed Date': formatDateDisplay(rfi.originalFiledDate || rfi.filedDate),
        'Status': rfi.status.toUpperCase(),
        'Remarks': rfi.remarks || 'None',
        'Review Date': rfi.reviewedAt ? formatDateDisplay(rfi.reviewedAt.split('T')[0]) : 'Pending'
    }));
}

/**
 * Export RFIs to Excel Spreadsheet (.xlsx)
 */
export function exportToExcel(rfis, filename = 'RFI_Report') {
    if (!rfis || rfis.length === 0) {
        alert("No data available to export.");
        return;
    }

    const data = prepareDataForExport(rfis);
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();

    // Auto-size columns roughly
    const cols = Object.keys(data[0]).map(key => ({
        wch: Math.max(
            key.length,
            ...data.map(row => (row[key] ? row[key].toString().length : 0))
        ) + 2
    }));
    worksheet['!cols'] = cols;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'RFIs');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Export RFIs to PDF Document (.pdf)
 */
export function exportToPDF(rfis, title = 'ClearLine Inspections - RFI Report') {
    if (!rfis || rfis.length === 0) {
        alert("No data available to export.");
        return;
    }

    const doc = new jsPDF('landscape'); // Landscape for better table fit

    // Header
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

    const data = prepareDataForExport(rfis);
    const headers = Object.keys(data[0]);
    const body = data.map(obj => Object.values(obj));

    doc.autoTable({
        head: [headers],
        body: body,
        startY: 35,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 5) {
                const status = data.cell.raw;
                if (status === 'APPROVED') data.cell.styles.textColor = [16, 185, 129];
                if (status === 'REJECTED') data.cell.styles.textColor = [239, 68, 68];
                if (status === 'PENDING') data.cell.styles.textColor = [245, 158, 11];
            }
        }
    });

    doc.save(`${title.replace(/ /g, '_')}.pdf`);
}

/**
 * Generate a branded Daily Inspection Report PDF
 */
export function generateDailyReport(rfis, date, projectName = 'ClearLine Project') {
    if (!rfis || rfis.length === 0) {
        alert("No data available for this date.");
        return;
    }

    const doc = new jsPDF('landscape');
    const pageWidth = doc.internal.pageSize.getWidth();

    // Stats
    const approved = rfis.filter(r => r.status === 'approved').length;
    const rejected = rfis.filter(r => r.status === 'rejected').length;
    const pending = rfis.filter(r => r.status === 'pending' || r.status === 'info_requested').length;
    const total = rfis.length;

    // ========== HEADER ==========
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 38, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('ClearLine', 14, 16);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Daily Inspection Report', 14, 24);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(projectName, pageWidth - 14, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Date: ${formatDateDisplay(date)}`, pageWidth - 14, 22, { align: 'right' });
    doc.text(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, pageWidth - 14, 30, { align: 'right' });

    // ========== SUMMARY STATS ==========
    doc.setTextColor(0, 0, 0);
    const statsY = 48;
    const boxW = 55;
    const boxH = 18;
    const startX = 14;
    const gap = 8;

    // Total
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(startX, statsY, boxW, boxH, 3, 3, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(total.toString(), startX + boxW / 2, statsY + 10, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('TOTAL', startX + boxW / 2, statsY + 15, { align: 'center' });

    // Approved
    doc.setFillColor(209, 250, 229);
    doc.roundedRect(startX + (boxW + gap), statsY, boxW, boxH, 3, 3, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(6, 95, 70);
    doc.text(approved.toString(), startX + (boxW + gap) + boxW / 2, statsY + 10, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('APPROVED', startX + (boxW + gap) + boxW / 2, statsY + 15, { align: 'center' });

    // Rejected
    doc.setFillColor(254, 226, 226);
    doc.roundedRect(startX + 2 * (boxW + gap), statsY, boxW, boxH, 3, 3, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(153, 27, 27);
    doc.text(rejected.toString(), startX + 2 * (boxW + gap) + boxW / 2, statsY + 10, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('REJECTED', startX + 2 * (boxW + gap) + boxW / 2, statsY + 15, { align: 'center' });

    // Pending
    doc.setFillColor(254, 243, 199);
    doc.roundedRect(startX + 3 * (boxW + gap), statsY, boxW, boxH, 3, 3, 'F');
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text(pending.toString(), startX + 3 * (boxW + gap) + boxW / 2, statsY + 10, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('PENDING', startX + 3 * (boxW + gap) + boxW / 2, statsY + 15, { align: 'center' });

    // ========== DATA TABLE ==========
    doc.setTextColor(0, 0, 0);
    const data = prepareDataForExport(rfis);
    const headers = Object.keys(data[0]);
    const body = data.map(obj => Object.values(obj));

    doc.autoTable({
        head: [headers],
        body: body,
        startY: statsY + boxH + 10,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3, font: 'helvetica' },
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: function (data) {
            if (data.section === 'body' && data.column.index === 5) {
                const status = data.cell.raw;
                if (status === 'APPROVED') data.cell.styles.textColor = [16, 185, 129];
                if (status === 'REJECTED') data.cell.styles.textColor = [239, 68, 68];
                if (status === 'PENDING') data.cell.styles.textColor = [245, 158, 11];
                if (status === 'INFO_REQUESTED') data.cell.styles.textColor = [99, 102, 241];
            }
        }
    });

    // ========== SIGNATURES ==========
    const sigY = doc.lastAutoTable.finalY + 20;
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);

    doc.text('Contractor Representative:', 14, sigY);
    doc.line(14, sigY + 15, 120, sigY + 15);
    doc.setFontSize(8);
    doc.text('Name / Signature / Date', 14, sigY + 20);

    doc.setFontSize(10);
    doc.text('Consultant Representative:', pageWidth / 2 + 14, sigY);
    doc.line(pageWidth / 2 + 14, sigY + 15, pageWidth - 14, sigY + 15);
    doc.setFontSize(8);
    doc.text('Name / Signature / Date', pageWidth / 2 + 14, sigY + 20);

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`ClearLine Inspections — Daily Report — ${formatDateDisplay(date)} — Confidential`, pageWidth / 2, footerY, { align: 'center' });

    doc.save(`ClearLine_Daily_Report_${date}.pdf`);
}
