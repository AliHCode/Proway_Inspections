import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDateDisplay } from './rfiLogic';
import { sanitizeColumnWidth, widthPxToExcelChars } from './tableLayout';

const PDF_PX_TO_PT = 0.6;
const PDF_SAFE_MARGIN = 14;
const PDF_COMPACT_FACTOR = 0.84;
const DEFAULT_EXPORT_TEMPLATE = {
    header: {
        title: 'RFI Summary',
        subtitle: '',
        projectLine: '',
        showSubmissionDate: true,
        leftLogoUrl: '',
        rightLogoUrl: '',
    },
    table: {
        headFillColor: '#1e293b',
        headTextColor: '#ffffff',
        bodyFontSize: 8,
        headFontSize: 8,
        compactMode: false,
        headerLayerHeight: 110,
        columnLabels: {},
        groupedHeaders: [],
    },
    footer: {
        leftLabel: 'Contractor Representative',
        rightLabel: 'Consultant Representative',
        showFooter: true,
    },
};

function normalizeExportTemplate(projectTemplate, fallbackTitle = '') {
    const merged = {
        header: { ...DEFAULT_EXPORT_TEMPLATE.header, ...(projectTemplate?.header || {}) },
        table: { ...DEFAULT_EXPORT_TEMPLATE.table, ...(projectTemplate?.table || {}) },
        footer: { ...DEFAULT_EXPORT_TEMPLATE.footer, ...(projectTemplate?.footer || {}) },
    };

    if (!merged.header.title) {
        merged.header.title = fallbackTitle || DEFAULT_EXPORT_TEMPLATE.header.title;
    }

    if (!Array.isArray(merged.header.additionalLogos)) {
        merged.header.additionalLogos = [];
    }

    return merged;
}

function hexToRgb(hex, fallback = [30, 41, 59]) {
    if (!hex || typeof hex !== 'string') return fallback;
    const normalized = hex.replace('#', '');
    if (normalized.length !== 6) return fallback;
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return fallback;
    return [r, g, b];
}

async function srcToDataUrl(src) {
    if (!src) return null;
    if (src.startsWith('data:image')) return src;

    try {
        const response = await fetch(src);
        const blob = await response.blob();
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        return typeof dataUrl === 'string' ? dataUrl : null;
    } catch {
        return null;
    }
}

function addImageSafe(doc, dataUrl, x, y, w, h) {
    if (!dataUrl) return;
    const format = dataUrl.includes('image/png') ? 'PNG' : dataUrl.includes('image/webp') ? 'WEBP' : 'JPEG';
    try {
        doc.addImage(dataUrl, format, x, y, w, h);
    } catch {
        // Ignore bad image payloads to keep export resilient.
    }
}

function getPdfLayoutMap(doc, template) {
    const canvasW = template?.layout?.canvasWidth || 1123;
    const canvasH = template?.layout?.canvasHeight || 794;
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = PDF_SAFE_MARGIN;
    const availW = Math.max(60, pageW - margin * 2);
    const availH = Math.max(60, pageH - margin * 2);
    const scale = Math.min(availW / canvasW, availH / canvasH);
    const originX = margin + (availW - canvasW * scale) / 2;
    const originY = margin;
    const elements = template?.layout?.elements || {};

    function mapRect(key, fallback) {
        const src = elements[key] || fallback;
        return {
            x: originX + (src.x || 0) * scale,
            y: originY + (src.y || 0) * scale,
            w: (src.w || 0) * scale,
            h: (src.h || 0) * scale,
            fontSize: Math.max(7, (src.fontSize || 12) * scale),
        };
    }

    const additionalLogos = (elements.additionalLogos || template?.header?.additionalLogos || [])
        .map((logo) => ({
            ...logo,
            x: originX + (logo.x || 0) * scale,
            y: originY + (logo.y || 0) * scale,
            w: (logo.w || 120) * scale,
            h: (logo.h || 40) * scale,
        }))
        .filter((logo) => logo.visible !== false && !!logo.url);

    return {
        leftLogo: mapRect('leftLogo', { x: 20, y: 20, w: 140, h: 46 }),
        rightLogo: mapRect('rightLogo', { x: 1040, y: 20, w: 140, h: 46 }),
        title: mapRect('title', { x: 420, y: 18, w: 360, h: 36, fontSize: 30 }),
        subtitle: mapRect('subtitle', { x: 420, y: 56, w: 360, h: 24, fontSize: 14 }),
        projectLine: mapRect('projectLine', { x: 380, y: 82, w: 440, h: 22, fontSize: 12 }),
        submissionDate: mapRect('submissionDate', { x: 960, y: 86, w: 220, h: 20, fontSize: 11 }),
        table: mapRect('table', { x: 20, y: 142, w: 1160, h: 150 }),
        additionalLogos,
        margin,
        scale,
    };
}

function buildGroupedHeaderMeta(headerFieldKeys = [], groupedHeaders = []) {
    const normalizedGroups = (groupedHeaders || [])
        .map((group) => {
            const start = headerFieldKeys.indexOf(group.fromKey);
            const end = headerFieldKeys.indexOf(group.toKey);
            if (start < 0 || end < 0 || end <= start) return null;
            return {
                title: group.title || 'Group',
                start,
                end,
                span: end - start + 1,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);

    const nonOverlapping = [];
    let lastEnd = -1;
    normalizedGroups.forEach((g) => {
        if (g.start > lastEnd) {
            nonOverlapping.push(g);
            lastEnd = g.end;
        }
    });

    return nonOverlapping;
}

function buildPdfHeadRows(headers, groups) {
    if (!groups || groups.length === 0) return [headers];

    const topRow = [];
    const bottomRow = [];

    let idx = 0;
    while (idx < headers.length) {
        const group = groups.find((g) => g.start === idx);
        if (group) {
            topRow.push({ content: group.title, colSpan: group.span, styles: { halign: 'center' } });
            for (let j = group.start; j <= group.end; j++) {
                bottomRow.push(headers[j]);
            }
            idx += group.span;
            continue;
        }

        topRow.push({ content: headers[idx], rowSpan: 2, styles: { valign: 'middle', halign: 'center' } });
        idx += 1;
    }

    return [topRow, bottomRow];
}

function buildExcelGroupedHeaderRows(headers, groups, startRowIndex) {
    if (!groups || groups.length === 0) {
        return {
            rows: [headers],
            merges: [],
            bodyStartRow: startRowIndex + 1,
        };
    }

    const topRow = Array(headers.length).fill('');
    const bottomRow = Array(headers.length).fill('');
    const merges = [];

    headers.forEach((header, idx) => {
        const group = groups.find((g) => idx >= g.start && idx <= g.end);
        if (!group) {
            topRow[idx] = header;
            merges.push({
                s: { r: startRowIndex, c: idx },
                e: { r: startRowIndex + 1, c: idx },
            });
            return;
        }

        if (idx === group.start) {
            topRow[idx] = group.title;
            merges.push({
                s: { r: startRowIndex, c: group.start },
                e: { r: startRowIndex, c: group.end },
            });
        }
        bottomRow[idx] = header;
    });

    return {
        rows: [topRow, bottomRow],
        merges,
        bodyStartRow: startRowIndex + 2,
    };
}

function buildPdfColumnStyles(doc, fieldKeys = [], columnWidthMap = {}, leftMargin = 14, rightMargin = 14) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const availableWidth = Math.max(120, pageWidth - leftMargin - rightMargin);

    // Gather proportional raw widths — no minimum floor so everything scales freely
    const rawWidths = fieldKeys.map((fieldKey) => {
        if (fieldKey === 'filed_date' || fieldKey === 'review_date') return 72;
        if (!fieldKey) return 50;
        const px = sanitizeColumnWidth(columnWidthMap[fieldKey]);
        return px * PDF_PX_TO_PT || 50;
    });

    // ALWAYS scale columns to exactly fill the available width
    const totalRawWidth = rawWidths.reduce((sum, w) => sum + w, 0) || 1;
    const scale = availableWidth / totalRawWidth;

    const columnStyles = {};
    rawWidths.forEach((w, idx) => {
        columnStyles[idx] = {
            cellWidth: Number((w * scale).toFixed(2)),
            overflow: 'linebreak',
        };
    });

    return { columnStyles, fitScale: scale };
}

/**
 * Format RFI data for export
 */
function buildExportColumns(orderedTableColumns = [], template = null) {
    const columnLabels = template?.table?.columnLabels || {};
    const columns = [];

    const orderedVisible = orderedTableColumns.length > 0
        ? orderedTableColumns.filter((c) => c.field_key !== 'actions')
        : [
            { field_key: 'serial', field_name: 'Serial No' },
            { field_key: 'description', field_name: 'Description' },
            { field_key: 'location', field_name: 'Location' },
            { field_key: 'inspection_type', field_name: 'Type' },
        ];

    orderedVisible.forEach((c) => {
        let defaultLabel = c.field_name;
        if (c.field_key === 'serial') defaultLabel = 'Serial No';
        if (c.field_key === 'inspection_type') defaultLabel = 'Type';
        if (c.field_key === 'attachments') defaultLabel = 'Attachments';
        if (c.field_key === 'status') defaultLabel = 'Status';
        if (c.field_key === 'remarks') defaultLabel = 'Remarks';

        columns.push({
            key: c.field_key,
            label: columnLabels[c.field_key] || defaultLabel,
        });
    });

    if (!columns.some((c) => c.key === 'status')) {
        columns.push({ key: 'status', label: columnLabels.status || 'Status' });
    }
    if (!columns.some((c) => c.key === 'remarks')) {
        columns.push({ key: 'remarks', label: columnLabels.remarks || 'Remarks' });
    }

    columns.push({ key: 'filed_date', label: columnLabels.filed_date || 'Filed Date' });
    columns.push({ key: 'review_date', label: columnLabels.review_date || 'Review Date' });

    return columns;
}

function getCellValue(rfi, fieldKey) {
    if (fieldKey === 'serial') return rfi.serialNo;
    if (fieldKey === 'description') return rfi.description;
    if (fieldKey === 'location') return rfi.location;
    if (fieldKey === 'inspection_type') return rfi.inspectionType;
    if (fieldKey === 'status') return (rfi.status || 'UNKNOWN').toUpperCase();
    if (fieldKey === 'remarks') return rfi.remarks || 'None';
    if (fieldKey === 'attachments') return `${rfi.images?.length || 0} files`;
    if (fieldKey === 'filed_date') return formatDateDisplay(rfi.originalFiledDate || rfi.filedDate);
    if (fieldKey === 'review_date') return rfi.reviewedAt ? formatDateDisplay(rfi.reviewedAt.split('T')[0]) : 'Pending';
    return rfi.customFields?.[fieldKey] || '—';
}

function prepareDataForExport(rfis, orderedTableColumns = [], template = null) {
    const columns = buildExportColumns(orderedTableColumns, template);
    return {
        headers: columns.map((c) => c.label),
        fieldKeys: columns.map((c) => c.key),
        body: rfis.map((rfi) => columns.map((c) => getCellValue(rfi, c.key))),
    };
}

/**
 * Export RFIs to Excel Spreadsheet (.xlsx)
 */
export function exportToExcel(rfis, filename = 'RFI_Report', projectFields = [], columnWidthMap = {}, projectTemplate = null) {
    if (!rfis || rfis.length === 0) {
        alert("No data available to export.");
        return;
    }

    const template = normalizeExportTemplate(projectTemplate, filename);
    const exportData = prepareDataForExport(rfis, projectFields, template);
    const headers = exportData.headers;
    const fieldKeys = exportData.fieldKeys;
    const body = exportData.body;
    const groupedMeta = buildGroupedHeaderMeta(fieldKeys, template.table.groupedHeaders || []);
    const aoa = [];

    aoa.push([template.header.title || filename]);
    if (template.header.subtitle) aoa.push([template.header.subtitle]);
    if (template.header.projectLine) aoa.push([template.header.projectLine]);
    if (template.header.showSubmissionDate) aoa.push([`Submission Date: ${new Date().toLocaleDateString()}`]);
    if (template.header.leftLogoUrl || template.header.rightLogoUrl) {
        aoa.push([
            `Logos: Left=${template.header.leftLogoUrl || 'N/A'} | Right=${template.header.rightLogoUrl || 'N/A'}`,
        ]);
    }
    aoa.push([]);
    const headerStart = aoa.length;
    const groupedHeaderRows = buildExcelGroupedHeaderRows(headers, groupedMeta, headerStart);
    aoa.push(...groupedHeaderRows.rows);
    aoa.push(...body);

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    const workbook = XLSX.utils.book_new();

    const headerLineCount = aoa.length - (1 + body.length);
    const mergeEnd = Math.max(0, headers.length - 1);
    const baseMerges = Array.from({ length: Math.max(0, headerLineCount - groupedHeaderRows.rows.length) }, (_, idx) => ({
        s: { r: idx, c: 0 },
        e: { r: idx, c: mergeEnd },
    }));
    worksheet['!merges'] = [...baseMerges, ...groupedHeaderRows.merges];

    // Auto-size columns roughly
    const cols = headers.map((key, index) => {
        const defaultWch = Math.max(
            key.length,
            ...body.map(row => (row[index] ? row[index].toString().length : 0))
        ) + 2;
        const mappedFieldKey = fieldKeys[index];
        if (!mappedFieldKey || mappedFieldKey === 'filed_date' || mappedFieldKey === 'review_date') {
            return { wch: defaultWch };
        }
        const px = sanitizeColumnWidth(columnWidthMap[mappedFieldKey]);
        return { wch: Math.max(defaultWch, widthPxToExcelChars(px)) };
    });
    worksheet['!cols'] = cols;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'RFIs');
    XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Export RFIs to PDF Document (.pdf)
 */
export async function exportToPDF(rfis, title = 'ProWay Inspections - RFI Report', projectFields = [], columnWidthMap = {}, projectTemplate = null) {
    if (!rfis || rfis.length === 0) {
        alert("No data available to export.");
        return;
    }

    const doc = new jsPDF('landscape'); // Landscape for better table fit
    const template = normalizeExportTemplate(projectTemplate, title);
    const pageWidth = doc.internal.pageSize.getWidth();
    const layout = getPdfLayoutMap(doc, template);
    const leftLogo = await srcToDataUrl(template.header.leftLogoUrl);
    const rightLogo = await srcToDataUrl(template.header.rightLogoUrl);

    // Header — logos
    if (leftLogo) addImageSafe(doc, leftLogo, layout.leftLogo.x, layout.leftLogo.y, layout.leftLogo.w, layout.leftLogo.h);
    if (rightLogo) addImageSafe(doc, rightLogo, layout.rightLogo.x, layout.rightLogo.y, layout.rightLogo.w, layout.rightLogo.h);
    for (const logo of layout.additionalLogos) {
        const logoData = await srcToDataUrl(logo.url);
        if (logoData) addImageSafe(doc, logoData, logo.x, logo.y, logo.w, logo.h);
    }

    doc.setFontSize(Math.max(9, layout.title.fontSize * PDF_COMPACT_FACTOR));
    doc.text(template.header.title || title, layout.title.x + layout.title.w / 2, layout.title.y + layout.title.h * 0.7, { align: 'center' });
    doc.setFontSize(Math.max(8, layout.subtitle.fontSize * PDF_COMPACT_FACTOR));
    if (template.header.subtitle) doc.text(template.header.subtitle, layout.subtitle.x + layout.subtitle.w / 2, layout.subtitle.y + layout.subtitle.h * 0.75, { align: 'center' });
    if (template.header.projectLine) doc.text(template.header.projectLine, layout.projectLine.x + layout.projectLine.w / 2, layout.projectLine.y + layout.projectLine.h * 0.75, { align: 'center' });
    if (template.header.showSubmissionDate) {
        doc.setFontSize(Math.max(7.5, layout.submissionDate.fontSize * PDF_COMPACT_FACTOR));
        doc.text(`Submission Date: ${new Date().toLocaleDateString()}`, layout.submissionDate.x + layout.submissionDate.w, layout.submissionDate.y + layout.submissionDate.h * 0.75, { align: 'right' });
    }
    doc.setFontSize(7);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, layout.table.x, layout.table.y - 2);

    const exportData = prepareDataForExport(rfis, projectFields, template);
    const headers = exportData.headers;
    const fieldKeys = exportData.fieldKeys;
    const body = exportData.body;
    const groupedMeta = buildGroupedHeaderMeta(fieldKeys, template.table.groupedHeaders || []);
    const pdfHeadRows = buildPdfHeadRows(headers, groupedMeta);
    const statusIndex = fieldKeys.indexOf('status');
    const tableLeft = Math.max(layout.margin, layout.table.x);
    const tableRight = Math.max(layout.margin, pageWidth - (layout.table.x + layout.table.w));
    const tableW = pageWidth - tableLeft - tableRight;
    const { columnStyles, fitScale } = buildPdfColumnStyles(doc, fieldKeys, columnWidthMap, tableLeft, tableRight);
    // When many columns squeeze the table, reduce font sizes & padding proportionally
    const fontShrink = Math.min(1, Math.max(0.55, fitScale));
    const baseFontBody = template.table.compactMode ? (template.table.bodyFontSize - 1) : template.table.bodyFontSize;
    const baseFontHead = template.table.headFontSize;
    const bodyFontSize = Math.max(5, baseFontBody * PDF_COMPACT_FACTOR * fontShrink);
    const headFontSize = Math.max(5, baseFontHead * PDF_COMPACT_FACTOR * fontShrink);
    const cellPad = Math.max(0.6, (template.table.compactMode ? 1.25 : 1.6) * fontShrink);

    autoTable(doc, {
        head: pdfHeadRows,
        body: body,
        startY: Math.max(32, layout.table.y),
        theme: 'grid',
        margin: { left: tableLeft, right: tableRight },
        tableWidth: tableW,
        columnStyles,
        styles: {
            fontSize: bodyFontSize,
            cellPadding: cellPad,
            overflow: 'linebreak',
        },
        headStyles: {
            fillColor: hexToRgb(template.table.headFillColor, [30, 41, 59]),
            textColor: hexToRgb(template.table.headTextColor, [255, 255, 255]),
            fontSize: headFontSize,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: function (data) {
            if (statusIndex >= 0 && data.section === 'body' && data.column.index === statusIndex) {
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
export async function generateDailyReport(rfis, date, projectName = 'ProWay Project', projectFields = [], columnWidthMap = {}, projectTemplate = null) {
    if (!rfis || rfis.length === 0) {
        alert("No data available for this date.");
        return;
    }

    const doc = new jsPDF('landscape');
    const template = normalizeExportTemplate(projectTemplate, 'RFI Summary');
    const pageWidth = doc.internal.pageSize.getWidth();
    const layout = getPdfLayoutMap(doc, template);
    const leftLogo = await srcToDataUrl(template.header.leftLogoUrl);
    const rightLogo = await srcToDataUrl(template.header.rightLogoUrl);

    // Stats
    const approved = rfis.filter(r => r.status === 'approved').length;
    const rejected = rfis.filter(r => r.status === 'rejected').length;
    const pending = rfis.filter(r => r.status === 'pending' || r.status === 'info_requested').length;
    const total = rfis.length;

    // ========== HEADER ==========
    const tableHeaderColor = hexToRgb(template.table.headFillColor, [15, 23, 42]);
    doc.setFillColor(tableHeaderColor[0], tableHeaderColor[1], tableHeaderColor[2]);
    doc.rect(0, 0, pageWidth, Math.max(38, layout.table.y - 8), 'F');

    doc.setTextColor(255, 255, 255);
    if (leftLogo) addImageSafe(doc, leftLogo, layout.leftLogo.x, layout.leftLogo.y, layout.leftLogo.w, layout.leftLogo.h);
    if (rightLogo) addImageSafe(doc, rightLogo, layout.rightLogo.x, layout.rightLogo.y, layout.rightLogo.w, layout.rightLogo.h);
    for (const logo of layout.additionalLogos) {
        const logoData = await srcToDataUrl(logo.url);
        if (logoData) addImageSafe(doc, logoData, logo.x, logo.y, logo.w, logo.h);
    }

    doc.setFontSize(Math.max(9, layout.title.fontSize * PDF_COMPACT_FACTOR));
    doc.setFont('helvetica', 'bold');
    doc.text(template.header.title || 'RFI Summary', layout.title.x + layout.title.w / 2, layout.title.y + layout.title.h * 0.7, { align: 'center' });
    doc.setFontSize(Math.max(8, layout.subtitle.fontSize * PDF_COMPACT_FACTOR));
    doc.setFont('helvetica', 'normal');
    if (template.header.subtitle) {
        doc.text(template.header.subtitle, layout.subtitle.x + layout.subtitle.w / 2, layout.subtitle.y + layout.subtitle.h * 0.75, { align: 'center' });
    }
    if (template.header.projectLine) {
        doc.text(template.header.projectLine, layout.projectLine.x + layout.projectLine.w / 2, layout.projectLine.y + layout.projectLine.h * 0.75, { align: 'center' });
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(projectName, pageWidth - 14, Math.max(14, layout.title.y + 2), { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(Math.max(7.5, layout.submissionDate.fontSize * PDF_COMPACT_FACTOR));
    doc.text(`Date: ${formatDateDisplay(date)}`, pageWidth - 14, Math.max(22, layout.subtitle.y + 4), { align: 'right' });
    if (template.header.showSubmissionDate) {
        doc.text(`Submission Date: ${new Date().toLocaleDateString()}`, pageWidth - 14, Math.max(28, layout.projectLine.y + 2), { align: 'right' });
    }
    doc.text(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, pageWidth - 14, Math.max(32, layout.projectLine.y + 6), { align: 'right' });

    // ========== SUMMARY STATS ==========
    doc.setTextColor(0, 0, 0);
    const statsY = Math.max(48, layout.table.y + 4);
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
    const exportData = prepareDataForExport(rfis, projectFields, template);
    const headers = exportData.headers;
    const fieldKeys = exportData.fieldKeys;
    const body = exportData.body;
    const groupedMeta = buildGroupedHeaderMeta(fieldKeys, template.table.groupedHeaders || []);
    const pdfHeadRows = buildPdfHeadRows(headers, groupedMeta);
    const statusIndex = fieldKeys.indexOf('status');
    const tableLeft = Math.max(layout.margin, layout.table.x);
    const tableRight = Math.max(layout.margin, pageWidth - (layout.table.x + layout.table.w));
    const tableW = pageWidth - tableLeft - tableRight;
    const { columnStyles, fitScale: dailyFitScale } = buildPdfColumnStyles(doc, fieldKeys, columnWidthMap, tableLeft, tableRight);
    const dFontShrink = Math.min(1, Math.max(0.55, dailyFitScale));
    const dBaseFontBody = template.table.compactMode ? (template.table.bodyFontSize - 1) : template.table.bodyFontSize;
    const dBodyFontSize = Math.max(5, dBaseFontBody * PDF_COMPACT_FACTOR * dFontShrink);
    const dHeadFontSize = Math.max(5, template.table.headFontSize * PDF_COMPACT_FACTOR * dFontShrink);
    const dCellPad = Math.max(0.6, (template.table.compactMode ? 1.25 : 1.6) * dFontShrink);

    autoTable(doc, {
        head: pdfHeadRows,
        body: body,
        startY: statsY + boxH + 10,
        theme: 'grid',
        margin: { left: tableLeft, right: tableRight },
        tableWidth: tableW,
        columnStyles,
        styles: {
            fontSize: dBodyFontSize,
            cellPadding: dCellPad,
            font: 'helvetica',
            overflow: 'linebreak',
        },
        headStyles: {
            fillColor: hexToRgb(template.table.headFillColor, [30, 41, 59]),
            textColor: hexToRgb(template.table.headTextColor, [255, 255, 255]),
            fontStyle: 'bold',
            fontSize: dHeadFontSize,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: function (data) {
            if (statusIndex >= 0 && data.section === 'body' && data.column.index === statusIndex) {
                const status = data.cell.raw;
                if (status === 'APPROVED') data.cell.styles.textColor = [16, 185, 129];
                if (status === 'REJECTED') data.cell.styles.textColor = [239, 68, 68];
                if (status === 'PENDING') data.cell.styles.textColor = [245, 158, 11];
                if (status === 'INFO_REQUESTED') data.cell.styles.textColor = [99, 102, 241];
            }
        }
    });

    // ========== SIGNATURES ==========
    if (template.footer.showFooter) {
        const sigY = doc.lastAutoTable.finalY + 20;
        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);

        doc.text(`${template.footer.leftLabel}:`, 14, sigY);
        doc.line(14, sigY + 15, 120, sigY + 15);
        doc.setFontSize(8);
        doc.text('Name / Signature / Date', 14, sigY + 20);

        doc.setFontSize(10);
        doc.text(`${template.footer.rightLabel}:`, pageWidth / 2 + 14, sigY);
        doc.line(pageWidth / 2 + 14, sigY + 15, pageWidth - 14, sigY + 15);
        doc.setFontSize(8);
        doc.text('Name / Signature / Date', pageWidth / 2 + 14, sigY + 20);
    }

    // Footer
    const footerY = doc.internal.pageSize.getHeight() - 10;
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`ProWay Inspections — Daily Report — ${formatDateDisplay(date)} — Confidential`, pageWidth / 2, footerY, { align: 'center' });
    doc.save(`ProWay_Daily_Report_${date}.pdf`);
}
