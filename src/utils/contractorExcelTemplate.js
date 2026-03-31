import { supabase } from './supabaseClient';

const STORAGE_BUCKET = 'rfi-images';
const TEMPLATE_CONFIG_KEY = 'contractorExcelTemplate';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const BUILTIN_FIELD_OPTIONS = [
    { key: 'rfi_no', label: 'RFI Number' },
    { key: 'serial', label: 'Serial Number' },
    { key: 'description', label: 'Description' },
    { key: 'location', label: 'Location' },
    { key: 'inspection_type', label: 'Inspection Type' },
    { key: 'status', label: 'Status' },
    { key: 'remarks', label: 'Remarks' },
    { key: 'filed_date', label: 'Filed Date' },
    { key: 'original_filed_date', label: 'Original Filed Date' },
    { key: 'reviewed_date', label: 'Reviewed Date' },
    { key: 'filer_name', label: 'Filed By Name' },
    { key: 'filer_company', label: 'Filed By Company' },
    { key: 'reviewer_name', label: 'Reviewer Name' },
];

function formatDateValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function formatTimeValue(value) {
    if (value == null || value === '') return '';
    if (value instanceof Date) {
        return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const raw = String(value).trim();
    if (!raw) return '';

    const isoDate = new Date(raw);
    if (!Number.isNaN(isoDate.getTime()) && raw.includes('T')) {
        return isoDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return raw;
}

function safeCellValue(value) {
    if (value == null) return null;
    if (Array.isArray(value)) return value.filter(Boolean).join(', ');
    if (value instanceof Date) return formatDateValue(value);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function sanitizeSheetName(value, fallback = 'RFI') {
    const cleaned = String(value || fallback)
        .replace(/[\\/*?:[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return (cleaned || fallback).slice(0, 31);
}

function getUniqueSheetName(baseName, existingNames) {
    let next = sanitizeSheetName(baseName);
    if (!existingNames.has(next)) return next;

    let counter = 2;
    while (counter < 500) {
        const suffix = ` ${counter}`;
        const trimmed = sanitizeSheetName(next.slice(0, Math.max(1, 31 - suffix.length)));
        const candidate = `${trimmed}${suffix}`.slice(0, 31);
        if (!existingNames.has(candidate)) return candidate;
        counter += 1;
    }

    return sanitizeSheetName(`${baseName}-${Date.now()}`);
}

function getMappedFieldValue(rfi, fieldKey) {
    if (!rfi || !fieldKey) return null;

    switch (fieldKey) {
        case 'rfi_no':
            return rfi.customFields?.rfi_no || rfi.rfiNo || rfi.serialNo || '';
        case 'serial':
            return rfi.serialNo || '';
        case 'description':
            return rfi.description || rfi.customFields?.description || '';
        case 'location':
            return rfi.location || rfi.customFields?.location || '';
        case 'inspection_type':
            return rfi.inspectionType || rfi.customFields?.inspection_type || rfi.customFields?.inspectionType || '';
        case 'status':
            return rfi.status || '';
        case 'remarks':
            return rfi.remarks || '';
        case 'filed_date':
            return formatDateValue(rfi.filedDate || rfi.originalFiledDate);
        case 'original_filed_date':
            return formatDateValue(rfi.originalFiledDate || rfi.filedDate);
        case 'reviewed_date':
            return rfi.reviewedAt ? formatDateValue(rfi.reviewedAt) : '';
        case 'filer_name':
            return rfi.filerName || '';
        case 'filer_company':
            return rfi.filerCompany || '';
        case 'reviewer_name':
            return rfi.reviewerName || '';
        default: {
            const customValue = rfi.customFields?.[fieldKey];
            if (customValue !== undefined) {
                if (fieldKey.toLowerCase().includes('time')) return formatTimeValue(customValue);
                if (fieldKey.toLowerCase().includes('date')) return formatDateValue(customValue);
                return safeCellValue(customValue);
            }
            return safeCellValue(rfi[fieldKey]);
        }
    }
}

async function loadExcelJsModule() {
    const mod = await import('exceljs');
    return mod.default || mod;
}

async function loadWorkbookFromSource(source) {
    const ExcelJS = await loadExcelJsModule();
    const workbook = new ExcelJS.Workbook();

    let buffer;
    if (source instanceof ArrayBuffer) {
        buffer = source;
    } else if (typeof Blob !== 'undefined' && source instanceof Blob) {
        buffer = await source.arrayBuffer();
    } else if (typeof source === 'string') {
        const response = await fetch(source);
        if (!response.ok) {
            throw new Error('Unable to fetch Excel template file.');
        }
        buffer = await response.arrayBuffer();
    } else {
        throw new Error('Unsupported workbook source.');
    }

    await workbook.xlsx.load(buffer);
    return workbook;
}

function downloadWorkbookBuffer(buffer, fileName) {
    const blob = new Blob([buffer], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

export function getContractorExcelTemplateConfig(projectTemplate = null) {
    const raw = projectTemplate?.[TEMPLATE_CONFIG_KEY];
    return {
        enabled: Boolean(raw?.enabled),
        templateFileName: raw?.templateFileName || '',
        templateStoragePath: raw?.templateStoragePath || '',
        templatePublicUrl: raw?.templatePublicUrl || '',
        templateSheetName: raw?.templateSheetName || '',
        keepOriginalSheets: Boolean(raw?.keepOriginalSheets),
        mappings: Array.isArray(raw?.mappings)
            ? raw.mappings
                .filter((item) => item && typeof item === 'object')
                .map((item) => ({
                    cell: String(item.cell || '').trim().toUpperCase(),
                    fieldKey: String(item.fieldKey || '').trim(),
                    label: String(item.label || '').trim(),
                }))
            : [],
    };
}

export function mergeContractorExcelTemplateConfig(projectTemplate = null, nextConfig = {}) {
    return {
        ...(projectTemplate || {}),
        [TEMPLATE_CONFIG_KEY]: {
            ...getContractorExcelTemplateConfig(projectTemplate),
            ...nextConfig,
        },
    };
}

export function hasContractorExcelTemplate(projectTemplate = null) {
    const config = getContractorExcelTemplateConfig(projectTemplate);
    return Boolean(config.enabled && config.templatePublicUrl);
}

export function buildTemplateFieldOptions(orderedTableColumns = [], projectFields = []) {
    const options = [];
    const seen = new Set();

    const pushOption = (key, label) => {
        if (!key || seen.has(key)) return;
        seen.add(key);
        options.push({ key, label: label || key });
    };

    BUILTIN_FIELD_OPTIONS.forEach((field) => pushOption(field.key, field.label));

    (orderedTableColumns || []).forEach((column) => {
        if (!column?.field_key || ['actions'].includes(column.field_key)) return;
        pushOption(column.field_key, column.field_name || column.field_key);
    });

    (projectFields || []).forEach((field) => {
        if (!field?.field_key) return;
        pushOption(field.field_key, field.field_name || field.field_key);
    });

    return options;
}

export async function inspectExcelTemplate(source) {
    const workbook = await loadWorkbookFromSource(source);
    return {
        sheetNames: workbook.worksheets.map((worksheet) => worksheet.name),
    };
}

export async function uploadContractorExcelTemplate(file, projectId) {
    if (!file) throw new Error('Please choose an Excel template file first.');
    if (!projectId) throw new Error('No active project selected.');

    const storagePath = `project-templates/${projectId}/contractor-rfi-template.xlsx`;
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, file, {
        upsert: true,
        contentType: file.type || XLSX_MIME,
    });

    if (error) throw error;

    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    return {
        templateFileName: file.name,
        templateStoragePath: storagePath,
        templatePublicUrl: data?.publicUrl || '',
    };
}

export async function exportMappedRfiWorkbook({
    rfis = [],
    projectTemplate = null,
    fileName = 'RFI_Custom_Report',
}) {
    if (!Array.isArray(rfis) || rfis.length === 0) {
        throw new Error('No RFIs available for export.');
    }

    const config = getContractorExcelTemplateConfig(projectTemplate);
    if (!config.templatePublicUrl) {
        throw new Error('No contractor Excel template is configured for this project.');
    }

    const workbook = await loadWorkbookFromSource(config.templatePublicUrl);
    const templateSheet = workbook.getWorksheet(config.templateSheetName || workbook.worksheets[0]?.name);
    if (!templateSheet) {
        throw new Error('The selected template sheet could not be found.');
    }

    const mappings = (config.mappings || []).filter((item) => item.cell && item.fieldKey);
    const templateModel = JSON.parse(JSON.stringify(templateSheet.model));
    let existingNames = new Set(workbook.worksheets.map((sheet) => sheet.name));

    const fillWorksheet = (worksheet, rfi) => {
        mappings.forEach((mapping) => {
            const value = getMappedFieldValue(rfi, mapping.fieldKey);
            worksheet.getCell(mapping.cell).value = value == null || value === '' ? null : value;
        });
    };

    if (!config.keepOriginalSheets) {
        [...workbook.worksheets].forEach((worksheet) => {
            if (worksheet.id !== templateSheet.id) {
                workbook.removeWorksheet(worksheet.id);
            }
        });

        const firstName = getUniqueSheetName(rfis[0]?.customFields?.rfi_no || `RFI ${rfis[0]?.serialNo || 1}`, new Set());
        templateSheet.name = firstName;
        existingNames = new Set([firstName]);
        fillWorksheet(templateSheet, rfis[0]);

        for (let index = 1; index < rfis.length; index += 1) {
            const rfi = rfis[index];
            const nextName = getUniqueSheetName(rfi?.customFields?.rfi_no || `RFI ${index + 1}`, existingNames);
            existingNames.add(nextName);

            const clone = workbook.addWorksheet(nextName);
            clone.model = {
                ...JSON.parse(JSON.stringify(templateModel)),
                name: nextName,
            };
            clone.name = nextName;
            fillWorksheet(clone, rfi);
        }
    } else {
        for (let index = 0; index < rfis.length; index += 1) {
            const rfi = rfis[index];
            const nextName = getUniqueSheetName(rfi?.customFields?.rfi_no || `RFI ${index + 1}`, existingNames);
            existingNames.add(nextName);

            const clone = workbook.addWorksheet(nextName);
            clone.model = {
                ...JSON.parse(JSON.stringify(templateModel)),
                name: nextName,
            };
            clone.name = nextName;
            fillWorksheet(clone, rfi);
        }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    downloadWorkbookBuffer(buffer, fileName);
}
