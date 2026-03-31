import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDateDisplay } from './rfiLogic';
import { sanitizeColumnWidth, widthPxToExcelChars } from './tableLayout';

const PDF_PX_TO_PT = 0.6;
const PX_TO_MM = 0.264583;
const PDF_SAFE_MARGIN = 10;
const PDF_COMPACT_FACTOR = 1;
// Columns to exclude from PDF (shown only on screen)
const PDF_EXCLUDED_COLUMNS = new Set(['attachments']);
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
        bodyFontSize: 11,
        headFontSize: 10,
        bodyFontFamily: 'helvetica',
        headFontFamily: 'helvetica',
        headRowHeight: 32,
        bodyRowHeight: 28,
        compactMode: false,
        headerLayerHeight: 110,
        columnLabels: {},
        columnWidths: {},
        hiddenColumnKeys: [],
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
        layout: projectTemplate?.layout || null,
        studioDesigner: projectTemplate?.studioDesigner || null,
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
    // Position scale: maps canvas px → PDF mm proportionally
    const scale = Math.min(availW / canvasW, availH / canvasH);
    const originX = margin + (availW - canvasW * scale) / 2;
    const originY = margin;
    const elements = template?.layout?.elements || {};
    // Font scale: canvas uses CSS px at 96 DPI; 1 CSS px = 0.75 pt
    const fontScale = 0.75;

    function mapRect(key, fallback) {
        const src = elements[key] || fallback;
        return {
            x: originX + (src.x || 0) * scale,
            y: originY + (src.y || 0) * scale,
            w: (src.w || 0) * scale,
            h: (src.h || 0) * scale,
            fontSize: Math.max(8, (src.fontSize || 12) * fontScale),
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
        title: mapRect('title', { x: 420, y: 18, w: 360, h: 36, fontSize: 28 }),
        subtitle: mapRect('subtitle', { x: 420, y: 56, w: 360, h: 24, fontSize: 14 }),
        projectLine: mapRect('projectLine', { x: 380, y: 82, w: 440, h: 22, fontSize: 12 }),
        submissionDate: mapRect('submissionDate', { x: 960, y: 86, w: 220, h: 20, fontSize: 11 }),
        table: mapRect('table', { x: 20, y: 142, w: 1160, h: 150 }),
        additionalLogos,
        margin,
        scale,
        originX,
        originY,
        canvasW,
        canvasH,
    };
}

function mapStudioRectToPdf(layout, element) {
    return {
        x: layout.originX + (element.x || 0) * layout.scale,
        y: layout.originY + (element.y || 0) * layout.scale,
        w: (element.w || 0) * layout.scale,
        h: (element.h || 0) * layout.scale,
        fontSize: Math.max(8, ((element.styles?.fontSize || 12) * 0.75)),
    };
}

function resolveStudioTextContent(element, context = {}) {
    const now = new Date();
    let text = typeof element?.content === 'string' ? element.content : '';

    if (element?.id === 'default_submission_date' || element?.id === 'submission_date') {
        text = `Submission Date: ${now.toLocaleDateString()}`;
    }

    return text
        .replaceAll('{{submission_date}}', now.toLocaleDateString())
        .replaceAll('{{generated_at}}', now.toLocaleString())
        .replaceAll('{{project_name}}', context.projectName || '')
        .replaceAll('{{report_date}}', context.reportDate || '');
}

function getPdfFontStyle(weight) {
    return Number(weight || 400) >= 700 ? 'bold' : 'normal';
}

function resolvePdfFontFamily(fontFamily) {
    return ['helvetica', 'times', 'courier'].includes(fontFamily) ? fontFamily : 'helvetica';
}

async function drawStudioOverlayElements(doc, template, layout, context = {}, options = {}) {
    const elements = Array.isArray(template?.studioDesigner?.elements) ? template.studioDesigner.elements : [];
    if (elements.length === 0) return false;

    const excluded = new Set(options.excludeIds || []);
    const ordered = [...elements]
        .filter((element) => element && element.visible !== false && element.type !== 'table' && !excluded.has(element.id))
        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    for (const element of ordered) {
        const rect = mapStudioRectToPdf(layout, element);
        if (element.type === 'image') {
            const dataUrl = await srcToDataUrl(element.url);
            if (dataUrl) addImageSafe(doc, dataUrl, rect.x, rect.y, rect.w, rect.h);
            continue;
        }

        if (element.type === 'shape') {
            const strokeColor = hexToRgb(element.styles?.borderColor, [15, 23, 42]);
            const fillColor = element.styles?.fill && element.styles.fill !== 'transparent'
                ? hexToRgb(element.styles.fill, [255, 255, 255])
                : null;
            const lineWidth = Math.max(0.3, Number(element.styles?.borderWidth || 1) * Math.max(0.45, layout.scale * 0.8));

            if (element.shapeType === 'line') {
                doc.setDrawColor(...strokeColor);
                doc.setLineWidth(lineWidth);
                doc.line(rect.x, rect.y + rect.h / 2, rect.x + rect.w, rect.y + rect.h / 2);
                continue;
            }

            const hasFill = Boolean(fillColor);
            const hasStroke = Number(element.styles?.borderWidth || 1) > 0;
            const radius = Number(element.styles?.borderRadius || 0) * layout.scale;
            const paintMode = hasFill && hasStroke ? 'FD' : hasFill ? 'F' : 'S';
            if (hasFill) doc.setFillColor(...fillColor);
            doc.setDrawColor(...strokeColor);
            doc.setLineWidth(lineWidth);

            if (radius > 0) {
                doc.roundedRect(rect.x, rect.y, rect.w, rect.h, radius, radius, paintMode);
            } else {
                doc.rect(rect.x, rect.y, rect.w, rect.h, paintMode);
            }
            continue;
        }

        if (element.type === 'text') {
            const backgroundColor = element.styles?.backgroundColor;
            if (backgroundColor && backgroundColor !== 'transparent') {
                doc.setFillColor(...hexToRgb(backgroundColor, [255, 255, 255]));
                doc.rect(rect.x, rect.y, rect.w, rect.h, 'F');
            }

            doc.setTextColor(...hexToRgb(element.styles?.color, [15, 23, 42]));
            doc.setFont(resolvePdfFontFamily(element.styles?.fontFamily), getPdfFontStyle(element.styles?.fontWeight));
            doc.setFontSize(rect.fontSize);

            const align = element.styles?.textAlign || 'left';
            const text = resolveStudioTextContent(element, context);
            const lines = doc.splitTextToSize(text || '', Math.max(10, rect.w));
            const lineHeight = rect.fontSize * 0.36;
            const textX = align === 'center' ? rect.x + rect.w / 2 : align === 'right' ? rect.x + rect.w : rect.x;
            const textY = rect.y + Math.max(lineHeight, rect.h > lineHeight ? lineHeight : rect.h * 0.7);
            doc.text(lines, textX, textY, { align, baseline: 'top', maxWidth: rect.w });
        }
    }

    return true;
}

function buildGroupedHeaderMeta(headerFieldKeys = [], groupedHeaders = []) {
    return (groupedHeaders || [])
        .map((group) => {
            const columnKey = group.columnKey || group.fromKey || group.toKey;
            const index = headerFieldKeys.indexOf(columnKey);
            if (index < 0) return null;
            return {
                columnKey,
                index,
                leftLabel: group.leftLabel || group.fromLabel || 'Left',
                rightLabel: group.rightLabel || group.toLabel || 'Right',
            };
        })
        .filter(Boolean)
        .filter((group, index, all) => all.findIndex((item) => item.columnKey === group.columnKey) === index)
        .sort((a, b) => a.index - b.index);
}

function buildPdfHeadRows(headers, fieldKeys, groups) {
    if (!groups || groups.length === 0) {
        return [headers.map((header) => ({ content: header, styles: { halign: 'center', valign: 'middle' } }))];
    }

    const splitMap = new Map(groups.map((group) => [group.columnKey, group]));
    const topRow = [];
    const bottomRow = [];

    headers.forEach((header, index) => {
        const fieldKey = fieldKeys[index];
        const split = splitMap.get(fieldKey);
        if (split) {
            topRow.push({ content: header, colSpan: 2, styles: { halign: 'center', valign: 'middle' } });
            bottomRow.push(
                { content: split.leftLabel, styles: { halign: 'center', valign: 'middle' } },
                { content: split.rightLabel, styles: { halign: 'center', valign: 'middle' } }
            );
            return;
        }

        topRow.push({ content: header, rowSpan: 2, styles: { valign: 'middle', halign: 'center' } });
    });

    return [topRow, bottomRow];
}

function buildExcelGroupedHeaderRows(headers, fieldKeys, groups, startRowIndex) {
    if (!groups || groups.length === 0) {
        return {
            rows: [headers],
            merges: [],
            bodyStartRow: startRowIndex + 1,
            visualFieldKeys: fieldKeys,
        };
    }

    const splitMap = new Map(groups.map((group) => [group.columnKey, group]));
    const topRow = [];
    const bottomRow = [];
    const merges = [];
    const visualFieldKeys = [];

    headers.forEach((header, idx) => {
        const fieldKey = fieldKeys[idx];
        const split = splitMap.get(fieldKey);
        const startCol = topRow.length;

        if (split) {
            topRow.push(header, '');
            bottomRow.push(split.leftLabel, split.rightLabel);
            visualFieldKeys.push(fieldKey, fieldKey);
            merges.push({
                s: { r: startRowIndex, c: startCol },
                e: { r: startRowIndex, c: startCol + 1 },
            });
            return;
        }

        topRow.push(header);
        bottomRow.push('');
        visualFieldKeys.push(fieldKey);
        merges.push({
            s: { r: startRowIndex, c: startCol },
            e: { r: startRowIndex + 1, c: startCol },
        });
    });

    return {
        rows: [topRow, bottomRow],
        merges,
        bodyStartRow: startRowIndex + 2,
        visualFieldKeys,
    };
}

function resolveColumnWidthMap(columnWidthMap = {}, template = null) {
    return {
        ...(columnWidthMap || {}),
        ...(template?.table?.columnWidths || {}),
    };
}

function buildVisualColumnSlots(fieldKeys = [], groups = [], columnWidthMap = {}) {
    const splitMap = new Map(groups.map((group) => [group.columnKey, group]));
    return fieldKeys.flatMap((fieldKey) => {
        if (splitMap.has(fieldKey)) {
            const totalWidth = sanitizeColumnWidth(columnWidthMap[fieldKey]);
            const halfWidth = Math.max(30, Math.round(totalWidth / 2));
            return [
                { key: `${fieldKey}_left`, fieldKey, widthPx: halfWidth },
                { key: `${fieldKey}_right`, fieldKey, widthPx: halfWidth },
            ];
        }

        return [{ key: fieldKey, fieldKey, widthPx: sanitizeColumnWidth(columnWidthMap[fieldKey]) }];
    });
}

function buildVisualBodyRows(body = [], fieldKeys = [], groups = []) {
    const splitMap = new Map(groups.map((group) => [group.columnKey, group]));
    return body.map((row) => fieldKeys.flatMap((fieldKey, index) => (
        splitMap.has(fieldKey)
            ? [{ content: row[index], colSpan: 2 }]
            : [row[index]]
    )));
}

function buildPdfColumnStyles(doc, visualColumns = [], leftMargin = 14, rightMargin = 14) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const availableWidth = Math.max(120, pageWidth - leftMargin - rightMargin);

    // Gather proportional raw widths — no minimum floor so everything scales freely
    const rawWidths = visualColumns.map((column) => {
        const fieldKey = column.fieldKey;
        if (fieldKey === 'filed_date' || fieldKey === 'review_date') return 72;
        if (!fieldKey) return 50;
        const px = sanitizeColumnWidth(column.widthPx);
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
    const hiddenColumnKeys = new Set(template?.table?.hiddenColumnKeys || []);
    const columns = [];

    const orderedVisible = orderedTableColumns.length > 0
        ? orderedTableColumns.filter((c) => c.field_key !== 'actions' && !PDF_EXCLUDED_COLUMNS.has(c.field_key) && !hiddenColumnKeys.has(c.field_key))
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

    if (!hiddenColumnKeys.has('status') && !columns.some((c) => c.key === 'status')) {
        columns.push({ key: 'status', label: columnLabels.status || 'Status' });
    }
    if (!hiddenColumnKeys.has('remarks') && !columns.some((c) => c.key === 'remarks')) {
        columns.push({ key: 'remarks', label: columnLabels.remarks || 'Remarks' });
    }
    if (!hiddenColumnKeys.has('filed_date')) {
        columns.push({ key: 'filed_date', label: columnLabels.filed_date || 'Filed Date' });
    }
    if (!hiddenColumnKeys.has('review_date')) {
        columns.push({ key: 'review_date', label: columnLabels.review_date || 'Review Date' });
    }

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
    const resolvedColumnWidthMap = resolveColumnWidthMap(columnWidthMap, template);
    const exportData = prepareDataForExport(rfis, projectFields, template);
    const headers = exportData.headers;
    const fieldKeys = exportData.fieldKeys;
    const body = exportData.body;
    const groupedMeta = buildGroupedHeaderMeta(fieldKeys, template.table.groupedHeaders || []);
    const visualColumns = buildVisualColumnSlots(fieldKeys, groupedMeta, resolvedColumnWidthMap);
    const visualBody = buildVisualBodyRows(body, fieldKeys, groupedMeta);
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
    const groupedHeaderRows = buildExcelGroupedHeaderRows(headers, fieldKeys, groupedMeta, headerStart);
    aoa.push(...groupedHeaderRows.rows);
    aoa.push(...visualBody.map((row) => row.map((cell) => (typeof cell === 'object' ? cell.content : cell))));

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    const workbook = XLSX.utils.book_new();

    const headerLineCount = aoa.length - (1 + body.length);
    const mergeEnd = Math.max(0, groupedHeaderRows.visualFieldKeys.length - 1);
    const baseMerges = Array.from({ length: Math.max(0, headerLineCount - groupedHeaderRows.rows.length) }, (_, idx) => ({
        s: { r: idx, c: 0 },
        e: { r: idx, c: mergeEnd },
    }));
    const bodyMerges = [];
    visualBody.forEach((row, rowIndex) => {
        let colCursor = 0;
        row.forEach((cell) => {
            const span = typeof cell === 'object' && cell?.colSpan ? cell.colSpan : 1;
            if (span > 1) {
                bodyMerges.push({
                    s: { r: groupedHeaderRows.bodyStartRow + rowIndex, c: colCursor },
                    e: { r: groupedHeaderRows.bodyStartRow + rowIndex, c: colCursor + span - 1 },
                });
            }
            colCursor += span;
        });
    });
    worksheet['!merges'] = [...baseMerges, ...groupedHeaderRows.merges, ...bodyMerges];

    // Auto-size columns roughly
    const cols = visualColumns.map((column) => {
        const sourceIndex = fieldKeys.indexOf(column.fieldKey);
        const key = headers[sourceIndex] || column.fieldKey;
        const defaultWch = Math.max(
            key.length,
            ...body.map(row => (row[sourceIndex] ? row[sourceIndex].toString().length : 0))
        ) + 2;
        const mappedFieldKey = column.fieldKey;
        if (!mappedFieldKey || mappedFieldKey === 'filed_date' || mappedFieldKey === 'review_date') {
            return { wch: defaultWch };
        }
        const px = sanitizeColumnWidth(column.widthPx);
        return { wch: Math.max(defaultWch, widthPxToExcelChars(px)) };
    });
    worksheet['!cols'] = cols;

    const rowConfig = Array.from({ length: aoa.length }, () => ({}));
    groupedHeaderRows.rows.forEach((_, index) => {
        rowConfig[headerStart + index] = { hpx: template.table.headRowHeight || 32 };
    });
    body.forEach((_, index) => {
        rowConfig[groupedHeaderRows.bodyStartRow + index] = { hpx: template.table.bodyRowHeight || 28 };
    });
    worksheet['!rows'] = rowConfig;

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
    const resolvedColumnWidthMap = resolveColumnWidthMap(columnWidthMap, template);
    const pageWidth = doc.internal.pageSize.getWidth();
    const layout = getPdfLayoutMap(doc, template);
    const leftLogo = await srcToDataUrl(template.header.leftLogoUrl);
    const rightLogo = await srcToDataUrl(template.header.rightLogoUrl);
    const hasStudioOverlay = Array.isArray(template?.studioDesigner?.elements) && template.studioDesigner.elements.length > 0;

    // Header — logos
    if (hasStudioOverlay) {
        await drawStudioOverlayElements(doc, template, layout);
    } else {
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
    }
    doc.setFontSize(7);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, layout.table.x, layout.table.y - 2);

    const exportData = prepareDataForExport(rfis, projectFields, template);
    const headers = exportData.headers;
    const fieldKeys = exportData.fieldKeys;
    const body = exportData.body;
    const groupedMeta = buildGroupedHeaderMeta(fieldKeys, template.table.groupedHeaders || []);
    const pdfHeadRows = buildPdfHeadRows(headers, fieldKeys, groupedMeta);
    const visualColumns = buildVisualColumnSlots(fieldKeys, groupedMeta, resolvedColumnWidthMap);
    const visualBody = buildVisualBodyRows(body, fieldKeys, groupedMeta);
    const statusIndex = visualColumns.findIndex((column) => column.fieldKey === 'status');
    const tableLeft = Math.max(layout.margin, layout.table.x);
    const tableRight = Math.max(layout.margin, pageWidth - (layout.table.x + layout.table.w));
    const tableW = pageWidth - tableLeft - tableRight;
    const { columnStyles, fitScale } = buildPdfColumnStyles(doc, visualColumns, tableLeft, tableRight);
    // When many columns squeeze the table, reduce font sizes & padding proportionally
    const fontShrink = Math.min(1, Math.max(0.55, fitScale));
    const baseFontBody = template.table.compactMode ? (template.table.bodyFontSize - 1) : template.table.bodyFontSize;
    const baseFontHead = template.table.headFontSize;
    const bodyFontSize = Math.max(5, baseFontBody * PDF_COMPACT_FACTOR * fontShrink);
    const headFontSize = Math.max(5, baseFontHead * PDF_COMPACT_FACTOR * fontShrink);
    const cellPad = Math.max(0.6, (template.table.compactMode ? 1.25 : 1.6) * fontShrink);
    const bodyRowHeight = Math.max(4, (template.table.bodyRowHeight || 28) * PX_TO_MM * fontShrink);
    const headRowHeight = Math.max(4, (template.table.headRowHeight || 32) * PX_TO_MM * fontShrink);

    autoTable(doc, {
        head: pdfHeadRows,
        body: visualBody,
        startY: Math.max(32, layout.table.y),
        theme: 'grid',
        margin: { left: tableLeft, right: tableRight },
        tableWidth: tableW,
        columnStyles,
        styles: {
            fontSize: bodyFontSize,
            font: resolvePdfFontFamily(template.table.bodyFontFamily),
            cellPadding: cellPad,
            minCellHeight: bodyRowHeight,
            overflow: 'linebreak',
            lineWidth: 0.4,
            lineColor: [0, 0, 0],
            textColor: [0, 0, 0],
            halign: 'center',
            valign: 'middle',
        },
        headStyles: {
            fillColor: hexToRgb(template.table.headFillColor, [30, 41, 59]),
            textColor: hexToRgb(template.table.headTextColor, [255, 255, 255]),
            font: resolvePdfFontFamily(template.table.headFontFamily),
            fontSize: headFontSize,
            fontStyle: 'bold',
            minCellHeight: headRowHeight,
            lineWidth: 0.5,
            lineColor: [0, 0, 0],
            halign: 'center',
            valign: 'middle',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: function (data) {
            if (data.section === 'body' && visualColumns[data.column.index]?.fieldKey === 'description') {
                data.cell.styles.halign = 'left';
            }
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
    const resolvedColumnWidthMap = resolveColumnWidthMap(columnWidthMap, template);
    const pageWidth = doc.internal.pageSize.getWidth();
    const layout = getPdfLayoutMap(doc, template);
    const leftLogo = await srcToDataUrl(template.header.leftLogoUrl);
    const rightLogo = await srcToDataUrl(template.header.rightLogoUrl);
    const hasStudioOverlay = Array.isArray(template?.studioDesigner?.elements) && template.studioDesigner.elements.length > 0;

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
    if (hasStudioOverlay) {
        await drawStudioOverlayElements(doc, template, layout, { projectName, reportDate: formatDateDisplay(date) }, {
            excludeIds: ['footer_submitted_by', 'footer_submitted_to'],
        });
    } else {
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
    }

    if (!hasStudioOverlay) {
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
    }

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
    const pdfHeadRows = buildPdfHeadRows(headers, fieldKeys, groupedMeta);
    const visualColumns = buildVisualColumnSlots(fieldKeys, groupedMeta, resolvedColumnWidthMap);
    const visualBody = buildVisualBodyRows(body, fieldKeys, groupedMeta);
    const statusIndex = visualColumns.findIndex((column) => column.fieldKey === 'status');
    const tableLeft = Math.max(layout.margin, layout.table.x);
    const tableRight = Math.max(layout.margin, pageWidth - (layout.table.x + layout.table.w));
    const tableW = pageWidth - tableLeft - tableRight;
    const { columnStyles, fitScale: dailyFitScale } = buildPdfColumnStyles(doc, visualColumns, tableLeft, tableRight);
    const dFontShrink = Math.min(1, Math.max(0.55, dailyFitScale));
    const dBaseFontBody = template.table.compactMode ? (template.table.bodyFontSize - 1) : template.table.bodyFontSize;
    const dBodyFontSize = Math.max(5, dBaseFontBody * PDF_COMPACT_FACTOR * dFontShrink);
    const dHeadFontSize = Math.max(5, template.table.headFontSize * PDF_COMPACT_FACTOR * dFontShrink);
    const dCellPad = Math.max(0.6, (template.table.compactMode ? 1.25 : 1.6) * dFontShrink);
    const dBodyRowHeight = Math.max(4, (template.table.bodyRowHeight || 28) * PX_TO_MM * dFontShrink);
    const dHeadRowHeight = Math.max(4, (template.table.headRowHeight || 32) * PX_TO_MM * dFontShrink);

    autoTable(doc, {
        head: pdfHeadRows,
        body: visualBody,
        startY: statsY + boxH + 10,
        theme: 'grid',
        margin: { left: tableLeft, right: tableRight },
        tableWidth: tableW,
        columnStyles,
        styles: {
            fontSize: dBodyFontSize,
            cellPadding: dCellPad,
            font: resolvePdfFontFamily(template.table.bodyFontFamily),
            minCellHeight: dBodyRowHeight,
            overflow: 'linebreak',
            lineWidth: 0.4,
            lineColor: [0, 0, 0],
            textColor: [0, 0, 0],
            halign: 'center',
            valign: 'middle',
        },
        headStyles: {
            fillColor: hexToRgb(template.table.headFillColor, [30, 41, 59]),
            textColor: hexToRgb(template.table.headTextColor, [255, 255, 255]),
            font: resolvePdfFontFamily(template.table.headFontFamily),
            fontStyle: 'bold',
            fontSize: dHeadFontSize,
            minCellHeight: dHeadRowHeight,
            lineWidth: 0.5,
            lineColor: [0, 0, 0],
            halign: 'center',
            valign: 'middle',
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: function (data) {
            if (data.section === 'body' && visualColumns[data.column.index]?.fieldKey === 'description') {
                data.cell.styles.halign = 'left';
            }
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
