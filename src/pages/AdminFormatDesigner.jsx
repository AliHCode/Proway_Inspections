import { useEffect, useMemo, useState } from 'react';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Columns,
    Copy,
    Eye,
    EyeOff,
    FileText,
    Grid2x2,
    Image,
    Layers,
    LayoutTemplate,
    Minus,
    Move,
    RotateCcw,
    Save,
    Settings,
    SlidersHorizontal,
    Square,
    Trash2,
    Type,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../components/Header';
import { useProject } from '../context/ProjectContext';

const A4_LANDSCAPE_WIDTH = 1123;
const A4_LANDSCAPE_HEIGHT = 794;
const GRID_SIZE = 8;

const DEFAULT_ZONES = {
    header: { x: 30, y: 24, w: 1063, h: 132 },
    table: { x: 30, y: 170, w: 1063, h: 510 },
    footer: { x: 30, y: 694, w: 1063, h: 74 },
};

const DEFAULT_TEMPLATE = {
    elements: [
        { id: 'master_table', type: 'table', x: 30, y: 170, w: 1063, h: 510, zIndex: 10, visible: true, rotation: 0 },
        { id: 'default_title', type: 'text', content: 'RFI Summary', x: 330, y: 40, w: 470, h: 38, visible: true, rotation: 0, styles: { fontSize: 30, fontWeight: 800, textAlign: 'center', color: '#0f172a' }, zIndex: 20 },
        { id: 'default_subtitle', type: 'text', content: 'Construction Report', x: 336, y: 80, w: 458, h: 24, visible: true, rotation: 0, styles: { fontSize: 13, fontWeight: 600, textAlign: 'center', color: '#334155' }, zIndex: 21 },
        { id: 'default_project_line', type: 'text', content: 'Project Name', x: 300, y: 108, w: 520, h: 20, visible: true, rotation: 0, styles: { fontSize: 11, fontWeight: 500, textAlign: 'center', color: '#475569' }, zIndex: 22 },
        { id: 'default_submission_date', type: 'text', content: 'Submission Date: DD.MM.YYYY', x: 872, y: 30, w: 210, h: 18, visible: true, rotation: 0, styles: { fontSize: 10, fontWeight: 700, textAlign: 'right', color: '#0f172a' }, zIndex: 23 },
        { id: 'footer_submitted_by', type: 'text', content: 'Submitted by', x: 36, y: 730, w: 250, h: 20, visible: true, rotation: 0, styles: { fontSize: 11, fontWeight: 700, textAlign: 'left', color: '#0f172a' }, zIndex: 23 },
        { id: 'footer_submitted_to', type: 'text', content: 'Submitted to', x: 837, y: 730, w: 250, h: 20, visible: true, rotation: 0, styles: { fontSize: 11, fontWeight: 700, textAlign: 'right', color: '#0f172a' }, zIndex: 23 },
    ],
    tableConfig: {
        headFillColor: '#1e293b',
        headTextColor: '#ffffff',
        columnLabels: {},
        groupedHeaders: [
            { title: 'Chainage', fromKey: 'chainage_from', toKey: 'chainage_to' },
        ],
    },
    canvas: {
        width: A4_LANDSCAPE_WIDTH,
        height: A4_LANDSCAPE_HEIGHT,
        showGrid: true,
        snapToGrid: true,
        zones: DEFAULT_ZONES,
    },
};

const TOOL_TABS = [
    { id: 'branding', label: 'Text', icon: Type },
    { id: 'shapes', label: 'Shapes', icon: Square },
    { id: 'images', label: 'Images', icon: Image },
    { id: 'columns', label: 'Table', icon: Columns },
    { id: 'page', label: 'Page', icon: Settings },
];

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeElement(element = {}, index = 0) {
    const mergedStyles = { ...(element.styles || {}) };
    return {
        rotation: 0,
        visible: true,
        zIndex: index + 1,
        ...element,
        styles: mergedStyles,
    };
}

function normalizeStudioTemplate(rawTemplate) {
    const base = deepClone(DEFAULT_TEMPLATE);
    if (!rawTemplate || typeof rawTemplate !== 'object') return base;

    if (rawTemplate.studioDesigner && typeof rawTemplate.studioDesigner === 'object') {
        const studio = rawTemplate.studioDesigner;
        return ensureRequiredElements({
            ...base,
            elements: Array.isArray(studio.elements) ? studio.elements.map(normalizeElement) : base.elements,
            tableConfig: {
                ...base.tableConfig,
                ...(studio.tableConfig || {}),
                headFillColor: rawTemplate?.table?.headFillColor || studio?.tableConfig?.headFillColor || base.tableConfig.headFillColor,
                headTextColor: rawTemplate?.table?.headTextColor || studio?.tableConfig?.headTextColor || base.tableConfig.headTextColor,
                columnLabels: {
                    ...base.tableConfig.columnLabels,
                    ...(studio?.tableConfig?.columnLabels || {}),
                },
                groupedHeaders: studio?.tableConfig?.groupedHeaders || rawTemplate?.table?.groupedHeaders || base.tableConfig.groupedHeaders,
            },
            canvas: {
                ...base.canvas,
                ...(studio.canvas || {}),
                zones: {
                    ...DEFAULT_ZONES,
                    ...(studio?.canvas?.zones || {}),
                },
                width: A4_LANDSCAPE_WIDTH,
                height: A4_LANDSCAPE_HEIGHT,
            },
        });
    }

    if (Array.isArray(rawTemplate.elements) && rawTemplate.tableConfig && rawTemplate.canvas) {
        return ensureRequiredElements({
            ...base,
            ...rawTemplate,
            elements: Array.isArray(rawTemplate.elements) ? rawTemplate.elements.map(normalizeElement) : base.elements,
            tableConfig: {
                ...base.tableConfig,
                ...(rawTemplate.tableConfig || {}),
                columnLabels: {
                    ...base.tableConfig.columnLabels,
                    ...(rawTemplate.tableConfig?.columnLabels || {}),
                },
                groupedHeaders: rawTemplate.tableConfig?.groupedHeaders || base.tableConfig.groupedHeaders,
            },
            canvas: {
                ...base.canvas,
                ...(rawTemplate.canvas || {}),
                zones: {
                    ...DEFAULT_ZONES,
                    ...(rawTemplate.canvas?.zones || {}),
                },
            },
        });
    }

    const legacy = rawTemplate;
    const converted = deepClone(base);
    const titleEl = converted.elements.find((e) => e.id === 'default_title');
    if (titleEl) titleEl.content = legacy?.header?.title || 'RFI SUMMARY';

    if (legacy?.header?.subtitle) {
        converted.elements.push(normalizeElement({
            id: 'legacy_subtitle',
            type: 'text',
            content: legacy.header.subtitle,
            x: 350,
            y: 90,
            w: 500,
            h: 28,
            styles: { fontSize: 18, fontWeight: 500, textAlign: 'center', color: '#334155' },
            zIndex: 21,
        }));
    }

    if (legacy?.header?.projectLine) {
        converted.elements.push(normalizeElement({
            id: 'legacy_project_line',
            type: 'text',
            content: legacy.header.projectLine,
            x: 300,
            y: 120,
            w: 600,
            h: 24,
            styles: { fontSize: 13, fontWeight: 400, textAlign: 'center', color: '#475569' },
            zIndex: 22,
        }));
    }

    if (legacy?.header?.leftLogoUrl) {
        converted.elements.push(normalizeElement({
            id: 'legacy_left_logo',
            type: 'image',
            url: legacy.header.leftLogoUrl,
            x: 40,
            y: 30,
            w: 160,
            h: 64,
            zIndex: 15,
        }));
    }

    if (legacy?.header?.rightLogoUrl) {
        converted.elements.push(normalizeElement({
            id: 'legacy_right_logo',
            type: 'image',
            url: legacy.header.rightLogoUrl,
            x: 930,
            y: 30,
            w: 160,
            h: 64,
            zIndex: 15,
        }));
    }

    converted.tableConfig = {
        ...converted.tableConfig,
        headFillColor: legacy?.table?.headFillColor || converted.tableConfig.headFillColor,
        headTextColor: legacy?.table?.headTextColor || converted.tableConfig.headTextColor,
        columnLabels: legacy?.table?.columnLabels || {},
        groupedHeaders: legacy?.table?.groupedHeaders || [],
    };

    converted.canvas = {
        ...converted.canvas,
        width: legacy?.layout?.canvasWidth || A4_LANDSCAPE_WIDTH,
        height: legacy?.layout?.canvasHeight || A4_LANDSCAPE_HEIGHT,
        zones: DEFAULT_ZONES,
    };

    return ensureRequiredElements(converted);
}

function ensureRequiredElements(template) {
    const next = deepClone(template);
    const existingIds = new Set((next.elements || []).map((element) => element.id));
    const required = deepClone(DEFAULT_TEMPLATE.elements)
        .filter((element) => element.id === 'master_table')
        .filter((element) => !existingIds.has(element.id))
        .map(normalizeElement);

    next.elements = [...(next.elements || []).map(normalizeElement), ...required];
    return next;
}

function buildExportTemplateFromStudio(studioTemplate) {
    const elements = Array.isArray(studioTemplate?.elements) ? studioTemplate.elements : [];
    const byId = Object.fromEntries(elements.map((element) => [element.id, element]));

    const titleEl = byId.default_title || elements.find((element) => element.type === 'text');
    const subtitleEl = byId.default_subtitle || byId.legacy_subtitle || elements.find((element) => element.id === 'subtitle');
    const projectLineEl = byId.default_project_line || byId.legacy_project_line || elements.find((element) => element.id === 'project_line');
    const submissionDateEl = byId.default_submission_date || elements.find((element) => element.id === 'submission_date');
    const leftLogoEl = byId.legacy_left_logo || elements.find((element) => element.id === 'left_logo' || (element.type === 'image' && element.x < 300));
    const rightLogoEl = byId.legacy_right_logo || elements.find((element) => element.id === 'right_logo' || (element.type === 'image' && element.x > 800));
    const tableEl = byId.master_table || elements.find((element) => element.type === 'table');
    const submittedByEl = byId.footer_submitted_by;
    const submittedToEl = byId.footer_submitted_to;

    const additionalLogos = elements
        .filter((element) => element.type === 'image' && element.id !== leftLogoEl?.id && element.id !== rightLogoEl?.id)
        .map((element) => ({
            id: element.id,
            url: element.url || '',
            x: Number(element.x || 0),
            y: Number(element.y || 0),
            w: Number(element.w || 120),
            h: Number(element.h || 40),
            visible: element.visible !== false,
        }))
        .filter((element) => !!element.url);

    const zones = {
        ...DEFAULT_ZONES,
        ...(studioTemplate?.canvas?.zones || {}),
    };

    const defaultLayout = {
        leftLogo: { x: 20, y: 20, w: 140, h: 46 },
        rightLogo: { x: 960, y: 20, w: 140, h: 46 },
        title: { x: 300, y: 40, w: 520, h: 36, fontSize: 30 },
        subtitle: { x: 300, y: 80, w: 520, h: 24, fontSize: 12 },
        projectLine: { x: 260, y: 104, w: 600, h: 20, fontSize: 11 },
        submissionDate: { x: 880, y: 26, w: 210, h: 18, fontSize: 10 },
        table: { x: zones.table.x, y: zones.table.y, w: zones.table.w, h: zones.table.h },
    };

    function mapElement(element, fallback, textDefault = '') {
        return {
            x: Number(element?.x ?? fallback.x),
            y: Number(element?.y ?? fallback.y),
            w: Number(element?.w ?? fallback.w),
            h: Number(element?.h ?? fallback.h),
            fontSize: Number(element?.styles?.fontSize ?? fallback.fontSize ?? 12),
            visible: element?.visible !== false,
            text: typeof element?.content === 'string' ? element.content : textDefault,
        };
    }

    const mappedTitle = mapElement(titleEl, defaultLayout.title, 'RFI Summary');
    const mappedSubtitle = mapElement(subtitleEl, defaultLayout.subtitle, '');
    const mappedProject = mapElement(projectLineEl, defaultLayout.projectLine, '');
    const mappedSubmission = mapElement(submissionDateEl, defaultLayout.submissionDate, '');
    const mappedLeftLogo = mapElement(leftLogoEl, defaultLayout.leftLogo, '');
    const mappedRightLogo = mapElement(rightLogoEl, defaultLayout.rightLogo, '');
    const mappedTable = mapElement(tableEl, defaultLayout.table, '');

    return {
        header: {
            title: mappedTitle.text || 'RFI Summary',
            subtitle: mappedSubtitle.text || '',
            projectLine: mappedProject.text || '',
            showSubmissionDate: Boolean(submissionDateEl && submissionDateEl.visible !== false && (mappedSubmission.text || '').trim()),
            leftLogoUrl: leftLogoEl?.url || '',
            rightLogoUrl: rightLogoEl?.url || '',
            additionalLogos,
        },
        table: {
            headFillColor: studioTemplate?.tableConfig?.headFillColor || '#1e293b',
            headTextColor: studioTemplate?.tableConfig?.headTextColor || '#ffffff',
            bodyFontSize: 11,
            headFontSize: 10,
            compactMode: false,
            headerLayerHeight: 110,
            columnLabels: studioTemplate?.tableConfig?.columnLabels || {},
            groupedHeaders: studioTemplate?.tableConfig?.groupedHeaders || [],
        },
        footer: {
            leftLabel: submittedByEl?.content || 'Submitted by',
            rightLabel: submittedToEl?.content || 'Submitted to',
            showFooter: true,
        },
        layout: {
            canvasWidth: studioTemplate?.canvas?.width || A4_LANDSCAPE_WIDTH,
            canvasHeight: studioTemplate?.canvas?.height || A4_LANDSCAPE_HEIGHT,
            gridSize: GRID_SIZE,
            snapToGrid: !!studioTemplate?.canvas?.snapToGrid,
            elements: {
                leftLogo: mappedLeftLogo,
                rightLogo: mappedRightLogo,
                title: mappedTitle,
                subtitle: mappedSubtitle,
                projectLine: mappedProject,
                submissionDate: mappedSubmission,
                table: {
                    x: mappedTable.x,
                    y: mappedTable.y,
                    w: mappedTable.w,
                    h: mappedTable.h,
                },
                additionalLogos,
            },
        },
        studioDesigner: {
            elements: studioTemplate?.elements || [],
            tableConfig: studioTemplate?.tableConfig || {},
            canvas: studioTemplate?.canvas || {},
        },
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function snap(value, grid, enabled) {
    if (!enabled) return value;
    return Math.round(value / grid) * grid;
}

function getElementLabel(element) {
    if (!element) return 'Element';
    if (element.id === 'master_table') return 'Summary Table';
    if (element.type === 'text') return element.content?.slice(0, 32) || 'Text Block';
    if (element.type === 'image') return element.url ? 'Placed Image' : 'Image Slot';
    if (element.type === 'shape') {
        if (element.shapeType === 'line') return 'Divider Line';
        return 'Rectangle Shape';
    }
    return element.type;
}

function getAlignmentButtonClass(isActive) {
    return `studio-align-btn ${isActive ? 'active' : ''}`;
}

function getShapeStyle(styles = {}) {
    const borderMatch = typeof styles.border === 'string'
        ? styles.border.match(/(\d+)px\s+\w+\s+(.+)/)
        : null;

    const borderWidth = Number(styles.borderWidth ?? borderMatch?.[1] ?? 1);
    const borderColor = styles.borderColor || borderMatch?.[2] || '#0f172a';
    const fill = styles.fill || styles.background || 'transparent';
    const borderRadius = Number(styles.borderRadius ?? 0);

    return {
        borderWidth,
        borderColor,
        fill,
        borderRadius,
    };
}

function getResizeHandleStyle(position) {
    return `handle handle-${position}`;
}

export default function AdminFormatDesigner() {
    const { activeProject, orderedTableColumns, saveProjectExportTemplate } = useProject();
    const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
    const [saving, setSaving] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [activeRailTab, setActiveRailTab] = useState('branding');
    const [interaction, setInteraction] = useState(null);
    const [zoom, setZoom] = useState(0.82);
    const [hasDraft, setHasDraft] = useState(false);
    const [showToolsPanel, setShowToolsPanel] = useState(true);
    const [showInspectorPanel, setShowInspectorPanel] = useState(true);
    const [inspectorTab, setInspectorTab] = useState('inspector');
    const [showTopHeader, setShowTopHeader] = useState(true);
    const [selectedZoneName, setSelectedZoneName] = useState(null);

    const draftStorageKey = useMemo(() => {
        if (!activeProject?.id) return '';
        return `format_studio_draft_${activeProject.id}`;
    }, [activeProject?.id]);

    function getElementZone(id) {
        if (id === 'master_table') return 'table';
        if (id === 'footer_submitted_by' || id === 'footer_submitted_to') return 'footer';
        return 'free';
    }

    function clampRectToZone(rect, zoneName, canvas) {
        if (zoneName === 'free') {
            return {
                ...rect,
                x: clamp(rect.x, 0, canvas.width - Math.min(rect.w, canvas.width)),
                y: clamp(rect.y, 0, canvas.height - Math.min(rect.h, canvas.height)),
                w: clamp(rect.w, 24, canvas.width),
                h: clamp(rect.h, 12, canvas.height),
            };
        }

        const zones = canvas?.zones || DEFAULT_ZONES;
        const zone = zones[zoneName] || { x: 0, y: 0, w: canvas.width, h: canvas.height };
        const w = clamp(rect.w, 40, zone.w);
        const h = clamp(rect.h, 16, zone.h);
        const x = clamp(rect.x, zone.x, zone.x + zone.w - w);
        const y = clamp(rect.y, zone.y, zone.y + zone.h - h);
        return { ...rect, x, y, w, h };
    }

    useEffect(() => {
        if (!activeProject?.id) return;
        try {
            const rawDraft = draftStorageKey ? localStorage.getItem(draftStorageKey) : null;
            if (rawDraft) {
                setTemplate(normalizeStudioTemplate(JSON.parse(rawDraft)));
                setHasDraft(true);
                return;
            }
        } catch {
            // Ignore broken drafts and fallback to project template.
        }

        setTemplate(normalizeStudioTemplate(activeProject?.export_template || null));
        setHasDraft(false);
    }, [activeProject?.id, activeProject?.export_template, draftStorageKey]);

    useEffect(() => {
        if (!draftStorageKey || !activeProject?.id) return;
        try {
            localStorage.setItem(draftStorageKey, JSON.stringify(template));
        } catch {
            // Ignore storage quota errors.
        }
    }, [template, draftStorageKey, activeProject?.id]);

    const previewColumns = useMemo(() => {
        return (orderedTableColumns || []).filter((column) => column.field_key !== 'actions');
    }, [orderedTableColumns]);

    const previewHeaderKeys = useMemo(() => previewColumns.map((column) => column.field_key), [previewColumns]);

    const previewGroupedHeaders = useMemo(() => {
        return (template?.tableConfig?.groupedHeaders || [])
            .map((group) => {
                const start = previewHeaderKeys.indexOf(group.fromKey);
                const end = previewHeaderKeys.indexOf(group.toKey);
                if (start < 0 || end < 0 || end <= start) return null;
                return { ...group, start, end, span: end - start + 1 };
            })
            .filter(Boolean)
            .sort((a, b) => a.start - b.start);
    }, [template?.tableConfig?.groupedHeaders, previewHeaderKeys]);

    const groupedHeaderPreview = useMemo(() => {
        if (previewGroupedHeaders.length === 0) {
            return {
                hasGroups: false,
                topCells: previewColumns.map((column) => ({
                    key: column.field_key,
                    label: template.tableConfig.columnLabels?.[column.field_key] || column.field_name,
                    rowSpan: 1,
                    colSpan: 1,
                })),
                secondRow: [],
            };
        }

        const topCells = [];
        const secondRow = [];
        let index = 0;

        while (index < previewColumns.length) {
            const group = previewGroupedHeaders.find((item) => item.start === index);
            if (group) {
                topCells.push({
                    key: `group_${group.title}_${index}`,
                    label: group.title,
                    colSpan: group.span,
                    rowSpan: 1,
                });
                for (let inner = group.start; inner <= group.end; inner += 1) {
                    const column = previewColumns[inner];
                    secondRow.push({
                        key: column.field_key,
                        label: template.tableConfig.columnLabels?.[column.field_key] || column.field_name,
                    });
                }
                index += group.span;
                continue;
            }

            const column = previewColumns[index];
            topCells.push({
                key: column.field_key,
                label: template.tableConfig.columnLabels?.[column.field_key] || column.field_name,
                rowSpan: 2,
                colSpan: 1,
            });
            index += 1;
        }

        return { hasGroups: true, topCells, secondRow };
    }, [previewColumns, previewGroupedHeaders, template.tableConfig.columnLabels]);

    const sortedElements = useMemo(() => {
        return [...template.elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    }, [template.elements]);

    const selectedElement = useMemo(() => {
        return template.elements.find((element) => element.id === selectedId) || null;
    }, [template.elements, selectedId]);

    const visibleElementCount = useMemo(() => {
        return template.elements.filter((element) => element.visible !== false).length;
    }, [template.elements]);

    const updateCanvas = (patch) => {
        setTemplate((previous) => ({
            ...previous,
            canvas: {
                ...previous.canvas,
                ...patch,
            },
        }));
    };

    const updateZone = (zoneName, patch) => {
        setTemplate((previous) => {
            const currentZone = previous.canvas?.zones?.[zoneName] || DEFAULT_ZONES[zoneName] || { x: 0, y: 0, w: 100, h: 100 };
            const canvas = previous.canvas || DEFAULT_TEMPLATE.canvas;
            const nextZone = {
                ...currentZone,
                ...patch,
            };

            const clampedZone = {
                x: clamp(nextZone.x, 0, canvas.width - Math.min(nextZone.w, canvas.width)),
                y: clamp(nextZone.y, 0, canvas.height - Math.min(nextZone.h, canvas.height)),
                w: clamp(nextZone.w, 80, canvas.width),
                h: clamp(nextZone.h, 40, canvas.height),
            };

            const nextZones = {
                ...(previous.canvas?.zones || DEFAULT_ZONES),
                [zoneName]: clampedZone,
            };

            return {
                ...previous,
                canvas: {
                    ...previous.canvas,
                    zones: nextZones,
                },
                elements: previous.elements.map((element) => (
                    zoneName === 'table' && element.id === 'master_table'
                        ? { ...element, x: clampedZone.x, y: clampedZone.y, w: clampedZone.w, h: clampedZone.h }
                        : element
                )),
            };
        });
    };

    const addElement = (type, defaults = {}) => {
        const id = `el_${Date.now()}`;
        const imageCount = template.elements.filter((element) => element.type === 'image').length;
        const offset = imageCount * 26;
        const baseElement = normalizeElement({
            id,
            type,
            x: type === 'image' ? 72 + offset : 96,
            y: type === 'image' ? 36 + offset : 90,
            w: type === 'image' ? 140 : 220,
            h: type === 'image' ? 58 : 52,
            zIndex: template.elements.length + 5,
            rotation: 0,
            visible: true,
            content: type === 'text' ? 'New text block' : '',
            styles: type === 'text'
                ? {
                    fontSize: 14,
                    fontWeight: 600,
                    textAlign: 'left',
                    color: '#0f172a',
                }
                : {},
            ...defaults,
        });

        setTemplate((previous) => ({
            ...previous,
            elements: [...previous.elements, baseElement],
        }));
        setSelectedId(id);
    };

    const addLayoutPreset = (preset) => {
        const headerZone = template.canvas.zones.header || DEFAULT_ZONES.header;
        const footerZone = template.canvas.zones.footer || DEFAULT_ZONES.footer;
        const tableZone = template.canvas.zones.table || DEFAULT_ZONES.table;

        if (preset === 'header_frame') {
            addElement('shape', {
                shapeType: 'rectangle',
                x: headerZone.x,
                y: headerZone.y,
                w: headerZone.w,
                h: headerZone.h,
                styles: { borderWidth: 2, borderColor: '#0f172a', fill: 'transparent', borderRadius: 0 },
            });
            return;
        }

        if (preset === 'header_divider') {
            addElement('shape', {
                shapeType: 'line',
                x: headerZone.x,
                y: headerZone.y + headerZone.h - 8,
                w: headerZone.w,
                h: 4,
                styles: { borderWidth: 2, borderColor: '#0f172a', fill: '#0f172a' },
            });
            return;
        }

        if (preset === 'header_table_bridge') {
            addElement('shape', {
                shapeType: 'line',
                x: tableZone.x,
                y: tableZone.y,
                w: tableZone.w,
                h: 2,
                styles: { borderWidth: 2, borderColor: '#0f172a', fill: '#0f172a' },
            });
            return;
        }

        if (preset === 'submission_block') {
            addElement('text', {
                content: 'Report No: ________\nSubmission Date: ________\nContractor: ________',
                x: headerZone.x + headerZone.w - 240,
                y: headerZone.y + 18,
                w: 220,
                h: 74,
                styles: { fontSize: 10, fontWeight: 700, textAlign: 'right', color: '#0f172a' },
            });
            return;
        }

        if (preset === 'notes_box') {
            addElement('shape', {
                shapeType: 'rectangle',
                x: tableZone.x,
                y: footerZone.y - 44,
                w: 300,
                h: 34,
                styles: { borderWidth: 1, borderColor: '#334155', fill: 'transparent', borderRadius: 0 },
            });
            return;
        }

        if (preset === 'signature_lines') {
            addElement('shape', {
                shapeType: 'line',
                x: footerZone.x,
                y: footerZone.y + 38,
                w: 240,
                h: 2,
                styles: { borderWidth: 1, borderColor: '#0f172a', fill: '#0f172a' },
            });
            addElement('shape', {
                shapeType: 'line',
                x: footerZone.x + footerZone.w - 240,
                y: footerZone.y + 38,
                w: 240,
                h: 2,
                styles: { borderWidth: 1, borderColor: '#0f172a', fill: '#0f172a' },
            });
        }
    };

    const updateElement = (id, patch) => {
        setTemplate((previous) => ({
            ...previous,
            elements: previous.elements.map((element) => {
                if (element.id !== id) return element;

                const merged = {
                    ...element,
                    ...patch,
                    styles: patch.styles ? { ...element.styles, ...patch.styles } : element.styles,
                };

                const geometryKeys = ['x', 'y', 'w', 'h'];
                if (geometryKeys.some((key) => Object.prototype.hasOwnProperty.call(patch, key))) {
                    return clampRectToZone(merged, getElementZone(id), previous.canvas);
                }

                return merged;
            }),
        }));
    };

    const updateElementStyle = (id, patch) => {
        setTemplate((previous) => ({
            ...previous,
            elements: previous.elements.map((element) => (
                element.id === id
                    ? { ...element, styles: { ...element.styles, ...patch } }
                    : element
            )),
        }));
    };

    const deleteElement = (id) => {
        if (id === 'master_table') return;
        setTemplate((previous) => ({
            ...previous,
            elements: previous.elements.filter((element) => element.id !== id),
        }));
        if (selectedId === id) setSelectedId(null);
    };

    const duplicateElement = (id) => {
        const element = template.elements.find((item) => item.id === id);
        if (!element || id === 'master_table') return;
        const newId = `el_${Date.now()}`;

        setTemplate((previous) => ({
            ...previous,
            elements: [
                ...previous.elements,
                normalizeElement({
                    ...element,
                    id: newId,
                    x: element.x + 18,
                    y: element.y + 18,
                    zIndex: Math.max(...previous.elements.map((item) => item.zIndex || 0)) + 1,
                }),
            ],
        }));
        setSelectedId(newId);
    };

    const setElementVisibility = (id, visible) => {
        updateElement(id, { visible });
    };

    const bringToFront = (id) => {
        const maxZ = Math.max(...template.elements.map((element) => element.zIndex || 0));
        updateElement(id, { zIndex: maxZ + 1 });
    };

    const sendToBack = (id) => {
        const minZ = Math.min(...template.elements.map((element) => element.zIndex || 0));
        updateElement(id, { zIndex: minZ - 1 });
    };

    const addGroupedHeader = () => {
        if (previewColumns.length < 2) return;
        const fromKey = previewColumns[0]?.field_key || '';
        const toKey = previewColumns[1]?.field_key || fromKey;
        setTemplate((previous) => ({
            ...previous,
            tableConfig: {
                ...previous.tableConfig,
                groupedHeaders: [
                    ...(previous.tableConfig.groupedHeaders || []),
                    { title: 'New Group', fromKey, toKey },
                ],
            },
        }));
    };

    const addGroupedHeaderPreset = (title, fromCandidates = [], toCandidates = []) => {
        const fromKey = fromCandidates.find((key) => previewColumns.some((column) => column.field_key === key));
        const toKey = toCandidates.find((key) => previewColumns.some((column) => column.field_key === key));

        if (!fromKey || !toKey) {
            toast.error(`Couldn't find matching columns for ${title}`);
            return;
        }

        setTemplate((previous) => {
            const groupedHeaders = previous.tableConfig.groupedHeaders || [];
            const existingIndex = groupedHeaders.findIndex((group) => group.fromKey === fromKey && group.toKey === toKey);
            const nextGroups = existingIndex >= 0
                ? groupedHeaders.map((group, index) => (index === existingIndex ? { ...group, title } : group))
                : [...groupedHeaders, { title, fromKey, toKey }];

            return {
                ...previous,
                tableConfig: {
                    ...previous.tableConfig,
                    groupedHeaders: nextGroups,
                },
            };
        });
        toast.success(`${title} split header ready`);
    };

    const updateGroupedHeader = (index, patch) => {
        setTemplate((previous) => ({
            ...previous,
            tableConfig: {
                ...previous.tableConfig,
                groupedHeaders: (previous.tableConfig.groupedHeaders || []).map((group, groupIndex) => (
                    groupIndex === index ? { ...group, ...patch } : group
                )),
            },
        }));
    };

    const removeGroupedHeader = (index) => {
        setTemplate((previous) => ({
            ...previous,
            tableConfig: {
                ...previous.tableConfig,
                groupedHeaders: (previous.tableConfig.groupedHeaders || []).filter((_, groupIndex) => groupIndex !== index),
            },
        }));
    };

    function startInteraction(event, id, mode, handle = null) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedId(id);
        setSelectedZoneName(null);
        const element = template.elements.find((item) => item.id === id);
        if (!element) return;
        setInteraction({
            targetType: 'element',
            id,
            mode,
            handle,
            startX: event.clientX,
            startY: event.clientY,
            startRect: { ...element },
        });
    }

    function startZoneInteraction(event, zoneName, mode, handle = null) {
        event.preventDefault();
        event.stopPropagation();
        setSelectedId(null);
        setSelectedZoneName(zoneName);
        const zone = template.canvas?.zones?.[zoneName] || DEFAULT_ZONES[zoneName];
        if (!zone) return;
        setInteraction({
            targetType: 'zone',
            zoneName,
            mode,
            handle,
            startX: event.clientX,
            startY: event.clientY,
            startRect: { ...zone },
        });
    }

    useEffect(() => {
        if (!interaction) return;

        function onMouseMove(event) {
            const dx = (event.clientX - interaction.startX) / zoom;
            const dy = (event.clientY - interaction.startY) / zoom;
            const grid = template?.canvas?.snapToGrid ? GRID_SIZE : 1;
            const startRect = interaction.startRect;

            if (interaction.targetType === 'zone') {
                if (interaction.mode === 'move') {
                    updateZone(interaction.zoneName, {
                        x: snap(startRect.x + dx, grid, template.canvas.snapToGrid),
                        y: snap(startRect.y + dy, grid, template.canvas.snapToGrid),
                    });
                    return;
                }

                if (interaction.mode === 'resize') {
                    const handle = interaction.handle;
                    let { x, y, w, h } = startRect;
                    if (handle.includes('e')) w = snap(startRect.w + dx, grid, template.canvas.snapToGrid);
                    if (handle.includes('s')) h = snap(startRect.h + dy, grid, template.canvas.snapToGrid);
                    if (handle.includes('w')) {
                        const nextWidth = snap(startRect.w - dx, grid, template.canvas.snapToGrid);
                        if (nextWidth > 10) {
                            x = snap(startRect.x + (startRect.w - nextWidth), grid, template.canvas.snapToGrid);
                            w = nextWidth;
                        }
                    }
                    if (handle.includes('n')) {
                        const nextHeight = snap(startRect.h - dy, grid, template.canvas.snapToGrid);
                        if (nextHeight > 10) {
                            y = snap(startRect.y + (startRect.h - nextHeight), grid, template.canvas.snapToGrid);
                            h = nextHeight;
                        }
                    }

                    updateZone(interaction.zoneName, { x, y, w, h });
                    return;
                }
            }

            if (interaction.mode === 'move') {
                const nextRect = {
                    ...startRect,
                    x: snap(startRect.x + dx, grid, template.canvas.snapToGrid),
                    y: snap(startRect.y + dy, grid, template.canvas.snapToGrid),
                };
                const safeRect = clampRectToZone(nextRect, getElementZone(interaction.id), template.canvas);
                updateElement(interaction.id, { x: safeRect.x, y: safeRect.y });
                return;
            }

            if (interaction.mode === 'resize') {
                const handle = interaction.handle;
                let { x, y, w, h } = startRect;
                if (handle.includes('e')) w = snap(startRect.w + dx, grid, template.canvas.snapToGrid);
                if (handle.includes('s')) h = snap(startRect.h + dy, grid, template.canvas.snapToGrid);
                if (handle.includes('w')) {
                    const nextWidth = snap(startRect.w - dx, grid, template.canvas.snapToGrid);
                    if (nextWidth > 10) {
                        x = snap(startRect.x + (startRect.w - nextWidth), grid, template.canvas.snapToGrid);
                        w = nextWidth;
                    }
                }
                if (handle.includes('n')) {
                    const nextHeight = snap(startRect.h - dy, grid, template.canvas.snapToGrid);
                    if (nextHeight > 10) {
                        y = snap(startRect.y + (startRect.h - nextHeight), grid, template.canvas.snapToGrid);
                        h = nextHeight;
                    }
                }
                const safeRect = clampRectToZone({ ...startRect, x, y, w, h }, getElementZone(interaction.id), template.canvas);
                updateElement(interaction.id, { x: safeRect.x, y: safeRect.y, w: safeRect.w, h: safeRect.h });
                return;
            }

            if (interaction.mode === 'rotate') {
                const rect = document.getElementById(`el_${interaction.id}`)?.getBoundingClientRect();
                if (!rect) return;
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI) + 90;
                updateElement(interaction.id, { rotation: Math.round(angle / 5) * 5 });
            }
        }

        function onMouseUp() {
            setInteraction(null);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [interaction, template.canvas, zoom]);

    const handleSave = async () => {
        const exportTemplate = {
            ...(activeProject?.export_template || {}),
            ...buildExportTemplateFromStudio(template),
        };

        setSaving(true);
        const result = await saveProjectExportTemplate(exportTemplate);
        setSaving(false);

        if (result?.success) {
            if (draftStorageKey) localStorage.removeItem(draftStorageKey);
            setHasDraft(false);
            toast.success('Daily summary format saved');
        } else {
            toast.error(result?.error || 'Save failed');
        }
    };

    const handleResetToDefault = () => {
        setTemplate(deepClone(DEFAULT_TEMPLATE));
        setSelectedId('default_title');
    };

    const handleRestoreProjectVersion = () => {
        setTemplate(normalizeStudioTemplate(activeProject?.export_template || null));
        setHasDraft(false);
        if (draftStorageKey) {
            localStorage.removeItem(draftStorageKey);
        }
        toast.success('Saved project format reloaded');
    };

    const renderLibraryContent = () => {
        if (activeRailTab === 'branding') {
            return (
                <>
                    <div className="studio-tool-grid">
                        <button className="studio-tool-card" onClick={() => addElement('text', { content: 'Main Report Title', x: 300, y: 48, w: 520, h: 34, styles: { fontSize: 28, fontWeight: 800, textAlign: 'center', color: '#0f172a' } })}>
                            <Type size={18} />
                            <span>Report title</span>
                        </button>
                        <button className="studio-tool-card" onClick={() => addElement('text', { content: 'Project / Package / Section', x: 320, y: 100, w: 480, h: 20, styles: { fontSize: 11, fontWeight: 600, textAlign: 'center', color: '#475569' } })}>
                            <FileText size={18} />
                            <span>Project line</span>
                        </button>
                        <button className="studio-tool-card" onClick={() => addElement('text', { content: 'Notes / remarks / distribution', x: 66, y: 640, w: 300, h: 40, styles: { fontSize: 10, fontWeight: 500, textAlign: 'left', color: '#334155' } })}>
                            <SlidersHorizontal size={18} />
                            <span>Notes block</span>
                        </button>
                        <button className="studio-tool-card" onClick={() => addElement('text', { content: 'Prepared by', x: 40, y: 730, w: 180, h: 20, styles: { fontSize: 11, fontWeight: 700, textAlign: 'left', color: '#0f172a' } })}>
                            <Move size={18} />
                            <span>Signature label</span>
                        </button>
                    </div>
                    <div className="studio-tip-card">
                        <strong>Best use for your case</strong>
                        <p>Use text blocks for report labels, revision numbers, contractor names, distribution notes, and the small information rows that usually sit outside the main summary table.</p>
                    </div>
                </>
            );
        }

        if (activeRailTab === 'shapes') {
            return (
                <>
                    <div className="studio-tool-grid">
                        <button className="studio-tool-card" onClick={() => addElement('shape', { shapeType: 'rectangle', w: 260, h: 90, styles: { borderWidth: 1, borderColor: '#0f172a', fill: 'transparent', borderRadius: 0 } })}>
                            <Square size={18} />
                            <span>Rectangle</span>
                        </button>
                        <button className="studio-tool-card" onClick={() => addElement('shape', { shapeType: 'line', w: 240, h: 4, styles: { borderWidth: 2, borderColor: '#0f172a', fill: '#0f172a' } })}>
                            <Minus size={18} />
                            <span>Divider line</span>
                        </button>
                    </div>

                    <div className="studio-preset-stack">
                        <button className="studio-preset-card" onClick={() => addLayoutPreset('header_frame')}>
                            <LayoutTemplate size={18} />
                            <div>
                                <strong>Header frame</strong>
                                <span>Full-width outline around the header area.</span>
                            </div>
                        </button>
                        <button className="studio-preset-card" onClick={() => addLayoutPreset('header_divider')}>
                            <Grid2x2 size={18} />
                            <div>
                                <strong>Header divider</strong>
                                <span>Strong line under the top header block.</span>
                            </div>
                        </button>
                        <button className="studio-preset-card" onClick={() => addLayoutPreset('header_table_bridge')}>
                            <Minus size={18} />
                            <div>
                                <strong>Header-table bridge</strong>
                                <span>Locks a clean line exactly on the table top so the header flows into the grid.</span>
                            </div>
                        </button>
                        <button className="studio-preset-card" onClick={() => addLayoutPreset('notes_box')}>
                            <Square size={18} />
                            <div>
                                <strong>Notes box</strong>
                                <span>Structured area for remarks or issue notes.</span>
                            </div>
                        </button>
                        <button className="studio-preset-card" onClick={() => addLayoutPreset('signature_lines')}>
                            <Minus size={18} />
                            <div>
                                <strong>Signature lines</strong>
                                <span>Left and right sign-off lines in the footer band.</span>
                            </div>
                        </button>
                    </div>
                </>
            );
        }

        if (activeRailTab === 'images') {
            return (
                <>
                    <div className="studio-tool-grid">
                        <button className="studio-tool-card" onClick={() => addElement('image', { x: 40, y: 34, w: 150, h: 56 })}>
                            <Image size={18} />
                            <span>Left logo</span>
                        </button>
                        <button className="studio-tool-card" onClick={() => addElement('image', { x: 930, y: 34, w: 150, h: 56 })}>
                            <Image size={18} />
                            <span>Right logo</span>
                        </button>
                        <button className="studio-tool-card" onClick={() => addElement('image')}>
                            <Image size={18} />
                            <span>Free image slot</span>
                        </button>
                    </div>
                    <button className="studio-preset-card" onClick={() => addLayoutPreset('submission_block')}>
                        <FileText size={18} />
                        <div>
                            <strong>Submission block</strong>
                            <span>Quick right-side stack for report number, date, and contractor details.</span>
                        </div>
                    </button>
                </>
            );
        }

        if (activeRailTab === 'columns') {
            return (
                <>
                    <div className="studio-color-row">
                        <div className="studio-input-group">
                            <label>Head fill</label>
                            <input
                                type="color"
                                value={template.tableConfig.headFillColor}
                                onChange={(event) => setTemplate((previous) => ({
                                    ...previous,
                                    tableConfig: { ...previous.tableConfig, headFillColor: event.target.value },
                                }))}
                            />
                        </div>
                        <div className="studio-input-group">
                            <label>Head text</label>
                            <input
                                type="color"
                                value={template.tableConfig.headTextColor}
                                onChange={(event) => setTemplate((previous) => ({
                                    ...previous,
                                    tableConfig: { ...previous.tableConfig, headTextColor: event.target.value },
                                }))}
                            />
                        </div>
                    </div>

                    <div className="studio-section-list">
                        {previewColumns.map((column) => (
                            <div key={column.field_key} className="studio-input-group">
                                <label>{column.field_key}</label>
                                <input
                                    type="text"
                                    value={template.tableConfig.columnLabels?.[column.field_key] ?? column.field_name}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        setTemplate((previous) => ({
                                            ...previous,
                                            tableConfig: {
                                                ...previous.tableConfig,
                                                columnLabels: {
                                                    ...previous.tableConfig.columnLabels,
                                                    [column.field_key]: value,
                                                },
                                            },
                                        }));
                                    }}
                                />
                            </div>
                        ))}
                    </div>

                    <div className="studio-grouped-header-block">
                        <div className="studio-section-heading">
                            <div>
                                <h4>Grouped headers</h4>
                                <p>Use this for spans like chainage or package grouping.</p>
                            </div>
                            <button className="terminal-btn" onClick={addGroupedHeader}>Add group</button>
                        </div>

                        <div className="studio-tip-card compact">
                            <strong>Split one header into two cells</strong>
                            <p>For layouts like `Chainage` with `From` and `To` below it, use a grouped header. The top cell becomes the group title and the two lower columns stay as separate fields.</p>
                            <div className="studio-inline-actions">
                                <button
                                    className="terminal-btn"
                                    onClick={() => addGroupedHeaderPreset('Chainage', ['chainage_from', 'from_chainage'], ['chainage_to', 'to_chainage'])}
                                >
                                    Add Chainage split
                                </button>
                            </div>
                        </div>

                        {(template.tableConfig.groupedHeaders || []).length === 0 && (
                            <div className="studio-tip-card">
                                <strong>No grouped headers yet</strong>
                                <p>Add one if your contractor summary has multi-column headers.</p>
                            </div>
                        )}

                        {(template.tableConfig.groupedHeaders || []).map((group, index) => (
                            <div key={`${group.title}_${index}`} className="studio-group-card">
                                <div className="studio-input-group">
                                    <label>Group title</label>
                                    <input type="text" value={group.title} onChange={(event) => updateGroupedHeader(index, { title: event.target.value })} />
                                </div>
                                <div className="studio-prop-grid">
                                    <div className="studio-input-group">
                                        <label>From</label>
                                        <select value={group.fromKey} onChange={(event) => updateGroupedHeader(index, { fromKey: event.target.value })}>
                                            {previewColumns.map((column) => (
                                                <option key={column.field_key} value={column.field_key}>{column.field_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="studio-input-group">
                                        <label>To</label>
                                        <select value={group.toKey} onChange={(event) => updateGroupedHeader(index, { toKey: event.target.value })}>
                                            {previewColumns.map((column) => (
                                                <option key={column.field_key} value={column.field_key}>{column.field_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <button className="terminal-btn studio-danger-btn" onClick={() => removeGroupedHeader(index)}>
                                    <Trash2 size={14} /> Remove
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            );
        }

        return (
            <>
                <div className="studio-page-grid">
                    <button className={`studio-toggle-card ${template.canvas.showGrid ? 'active' : ''}`} onClick={() => updateCanvas({ showGrid: !template.canvas.showGrid })}>
                        <Grid2x2 size={18} />
                        <div>
                            <strong>Grid</strong>
                            <span>Toggle layout dots on the canvas.</span>
                        </div>
                    </button>
                    <button className={`studio-toggle-card ${template.canvas.snapToGrid ? 'active' : ''}`} onClick={() => updateCanvas({ snapToGrid: !template.canvas.snapToGrid })}>
                        <Move size={18} />
                        <div>
                            <strong>Snap</strong>
                            <span>Keep blocks aligned to the print grid.</span>
                        </div>
                    </button>
                </div>

                <div className="studio-zone-list">
                    <div className="studio-tip-card compact">
                        <strong>Resize header and table bands on canvas</strong>
                        <p>Click the `header zone` or `table zone` chip above the paper, then drag the blue handles to change width or height. Moving the table zone also keeps the summary table block aligned with it.</p>
                    </div>
                    {Object.entries(template.canvas.zones || DEFAULT_ZONES).map(([zoneName, zone]) => (
                        <div key={zoneName} className="studio-zone-card">
                            <strong>{zoneName}</strong>
                            <span>{`${Math.round(zone.w)} × ${Math.round(zone.h)} px`}</span>
                            <small>{`x:${Math.round(zone.x)} y:${Math.round(zone.y)}`}</small>
                        </div>
                    ))}
                </div>
            </>
        );
    };

    return (
        <div className="format-studio-page studio-pro-page">
            <Header />
            <div className={`studio-pro-shell ${showTopHeader ? '' : 'header-collapsed'}`}>
                <header className={`studio-pro-topbar ${showTopHeader ? '' : 'is-collapsed'}`}>
                    <div className="studio-pro-title">
                        <div className="studio-pro-kicker">Admin Export Studio</div>
                        <h1>Daily Summary Designer</h1>
                        {showTopHeader && (
                            <p>Build the contractor summary layout with table styling, freeform header content, logos, notes blocks, and signature areas in one place.</p>
                        )}
                    </div>

                    <div className="studio-pro-actions">
                        <div className="studio-topbar-metrics">
                            <span className="studio-badge">{activeProject?.name || 'No active project'}</span>
                            <span className="studio-badge subtle">{visibleElementCount}/{template.elements.length} visible</span>
                            <span className="studio-badge subtle">A4 landscape</span>
                            {hasDraft && <span className="studio-badge warning">Draft autosaved</span>}
                        </div>
                        <div className="studio-topbar-buttons">
                            <button className="terminal-btn" onClick={() => setShowTopHeader((value) => !value)}>
                                {showTopHeader ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {showTopHeader ? 'Collapse header' : 'Expand header'}
                            </button>
                            <button className="terminal-btn" onClick={handleRestoreProjectVersion}>Reload saved</button>
                            <button className="terminal-btn" onClick={handleResetToDefault}><RotateCcw size={14} /> Reset page</button>
                            <button className="terminal-btn primary" onClick={handleSave} disabled={saving}>
                                <Save size={14} />
                                {saving ? 'Saving...' : 'Save format'}
                            </button>
                        </div>
                    </div>
                </header>

                <div className={`studio-pro-body ${showToolsPanel ? '' : 'tools-collapsed'} ${showInspectorPanel ? '' : 'inspector-collapsed'}`}>
                    <aside className={`studio-panel studio-tools-panel ${showToolsPanel ? '' : 'is-collapsed'}`}>
                        <section className="studio-panel-section">
                            <div className="studio-section-heading">
                                <div>
                                    <h3>Build Tools</h3>
                                    <p>Insert and configure report pieces quickly.</p>
                                </div>
                                <button
                                    className="studio-panel-toggle"
                                    onClick={() => setShowToolsPanel((value) => !value)}
                                    title={showToolsPanel ? 'Collapse tools panel' : 'Expand tools panel'}
                                >
                                    {showToolsPanel ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                                </button>
                            </div>

                            {showToolsPanel ? (
                                <>
                                    <div className="studio-tab-row">
                                        {TOOL_TABS.map((tab) => {
                                            const Icon = tab.icon;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    className={`studio-tab-btn ${activeRailTab === tab.id ? 'active' : ''}`}
                                                    onClick={() => setActiveRailTab(tab.id)}
                                                >
                                                    <Icon size={16} />
                                                    <span>{tab.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="studio-panel-scroll">
                                        {renderLibraryContent()}
                                    </div>
                                </>
                            ) : (
                                <div className="studio-collapsed-panel">
                                    <LayoutTemplate size={18} />
                                    <span>Tools</span>
                                </div>
                            )}
                        </section>
                    </aside>

                    <section className="studio-workspace">
                        <div className="studio-workspace-toolbar">
                            <div className="studio-toolbar-group">
                                <span className="studio-chip">Canvas {template.canvas.width} × {template.canvas.height}</span>
                                <span className="studio-chip subtle">Grid {template.canvas.showGrid ? 'On' : 'Off'}</span>
                                <span className="studio-chip subtle">Snap {template.canvas.snapToGrid ? 'On' : 'Off'}</span>
                            </div>

                            <div className="studio-toolbar-group">
                                <button className="terminal-btn" onClick={() => updateCanvas({ showGrid: !template.canvas.showGrid })}>
                                    <Grid2x2 size={14} /> {template.canvas.showGrid ? 'Hide Grid' : 'Show Grid'}
                                </button>
                                <button className="terminal-btn" onClick={() => updateCanvas({ snapToGrid: !template.canvas.snapToGrid })}>
                                    <Move size={14} /> {template.canvas.snapToGrid ? 'Snap On' : 'Snap Off'}
                                </button>
                                <button className="terminal-btn" onClick={() => setZoom((value) => Math.max(0.35, value - 0.1))}>-</button>
                                <span className="studio-zoom-indicator">{Math.round(zoom * 100)}%</span>
                                <button className="terminal-btn" onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))}>+</button>
                            </div>
                        </div>

                        <div
                            className={`studio-stage-viewport studio-stage-viewport--pro ${template.canvas.showGrid ? 'show-grid' : 'hide-grid'}`}
                            onClick={() => {
                                setSelectedId(null);
                                setSelectedZoneName(null);
                            }}
                        >
                            <div className="studio-paper-stage">
                                <div
                                    className="studio-terminal-canvas"
                                    style={{
                                        width: `${template.canvas.width}px`,
                                        height: `${template.canvas.height}px`,
                                        transform: `scale(${zoom})`,
                                        transformOrigin: 'top center',
                                    }}
                                    onClick={(event) => event.stopPropagation()}
                                >
                                    <div className="studio-paper-label">Daily Summary Print Area</div>

                                    {Object.entries(template.canvas.zones || DEFAULT_ZONES).map(([zoneName, zone]) => {
                                        const isEditableZone = zoneName === 'header' || zoneName === 'table';
                                        const isSelectedZone = selectedZoneName === zoneName;

                                        return (
                                            <div
                                                key={zoneName}
                                                className={`studio-zone-overlay zone-${zoneName} ${isEditableZone ? 'is-editable' : ''} ${isSelectedZone ? 'is-selected' : ''}`}
                                                style={{
                                                    left: zone.x,
                                                    top: zone.y,
                                                    width: zone.w,
                                                    height: zone.h,
                                                }}
                                            >
                                                <span
                                                    className={`studio-zone-chip ${isEditableZone ? 'is-editable' : ''}`}
                                                    onMouseDown={isEditableZone ? (event) => startZoneInteraction(event, zoneName, 'move') : undefined}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        setSelectedZoneName(zoneName);
                                                        setSelectedId(null);
                                                    }}
                                                >
                                                    {zoneName} zone
                                                </span>

                                                {isEditableZone && isSelectedZone && (
                                                    <>
                                                        <button
                                                            className="studio-zone-handle edge-east"
                                                            onMouseDown={(event) => startZoneInteraction(event, zoneName, 'resize', 'e')}
                                                            title={`Resize ${zoneName} width`}
                                                        />
                                                        <button
                                                            className="studio-zone-handle edge-south"
                                                            onMouseDown={(event) => startZoneInteraction(event, zoneName, 'resize', 's')}
                                                            title={`Resize ${zoneName} height`}
                                                        />
                                                        <button
                                                            className="studio-zone-handle corner-se"
                                                            onMouseDown={(event) => startZoneInteraction(event, zoneName, 'resize', 'se')}
                                                            title={`Resize ${zoneName} zone`}
                                                        />
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {template.elements
                                        .slice()
                                        .sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
                                        .map((element) => {
                                            const shapeStyle = getShapeStyle(element.styles || {});
                                            const isHidden = element.visible === false;
                                            return (
                                                <div
                                                    key={element.id}
                                                    id={`el_${element.id}`}
                                                    className={`studio-v2-element ${selectedId === element.id ? 'selected' : ''} ${isHidden ? 'is-hidden' : ''}`}
                                                    onMouseDown={(event) => startInteraction(event, element.id, 'move')}
                                                    style={{
                                                        left: `${element.x}px`,
                                                        top: `${element.y}px`,
                                                        width: `${element.w}px`,
                                                        height: `${element.h}px`,
                                                        transform: `rotate(${element.rotation || 0}deg)`,
                                                        zIndex: element.zIndex || 1,
                                                        cursor: 'move',
                                                    }}
                                                >
                                                    <div className="studio-element-shell">
                                                        {element.type === 'text' && (
                                                            <div
                                                                className="studio-text-preview"
                                                                style={{
                                                                    color: element.styles?.color || '#0f172a',
                                                                    fontSize: `${element.styles?.fontSize || 14}px`,
                                                                    fontWeight: element.styles?.fontWeight || 600,
                                                                    textAlign: element.styles?.textAlign || 'left',
                                                                    background: element.styles?.backgroundColor || 'transparent',
                                                                }}
                                                            >
                                                                {element.content}
                                                            </div>
                                                        )}

                                                        {element.type === 'image' && (
                                                            <div className="studio-image-preview">
                                                                <input
                                                                    type="file"
                                                                    className="studio-image-input"
                                                                    onChange={(event) => {
                                                                        const file = event.target.files?.[0];
                                                                        if (!file) return;
                                                                        const reader = new FileReader();
                                                                        reader.onload = () => updateElement(element.id, { url: reader.result });
                                                                        reader.readAsDataURL(file);
                                                                    }}
                                                                />
                                                                {element.url ? (
                                                                    <img src={element.url} alt="" className="studio-image-preview-img" />
                                                                ) : (
                                                                    <div className="studio-image-placeholder">
                                                                        <Image size={22} />
                                                                        <span>Upload image</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {element.type === 'shape' && (
                                                            <div
                                                                className={`studio-shape-preview ${element.shapeType === 'line' ? 'line' : ''}`}
                                                                style={{
                                                                    background: element.shapeType === 'line' ? (shapeStyle.fill || shapeStyle.borderColor) : shapeStyle.fill,
                                                                    border: element.shapeType === 'line' ? 'none' : `${shapeStyle.borderWidth}px solid ${shapeStyle.borderColor}`,
                                                                    borderRadius: `${shapeStyle.borderRadius}px`,
                                                                }}
                                                            />
                                                        )}

                                                        {element.type === 'table' && (
                                                            <div className="studio-table-preview">
                                                                <div className="studio-table-preview-badge">Summary table preview</div>
                                                                <table>
                                                                    <thead style={{ background: template.tableConfig.headFillColor, color: template.tableConfig.headTextColor }}>
                                                                        <tr>
                                                                            {groupedHeaderPreview.topCells.map((cell) => (
                                                                                <th key={cell.key} colSpan={cell.colSpan} rowSpan={cell.rowSpan}>{cell.label}</th>
                                                                            ))}
                                                                        </tr>
                                                                        {groupedHeaderPreview.hasGroups && (
                                                                            <tr>
                                                                                {groupedHeaderPreview.secondRow.map((cell) => (
                                                                                    <th key={cell.key}>{cell.label}</th>
                                                                                ))}
                                                                            </tr>
                                                                        )}
                                                                    </thead>
                                                                    <tbody>
                                                                        {[1, 2, 3, 4, 5].map((row) => (
                                                                            <tr key={row}>
                                                                                {previewColumns.map((column) => (
                                                                                    <td key={`${column.field_key}_${row}`}>
                                                                                        {row === 1 ? `Sample ${template.tableConfig.columnLabels?.[column.field_key] || column.field_name}` : ''}
                                                                                    </td>
                                                                                ))}
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {selectedId === element.id && (
                                                        <>
                                                            <div className={getResizeHandleStyle('nw')} onMouseDown={(event) => startInteraction(event, element.id, 'resize', 'nw')} />
                                                            <div className={getResizeHandleStyle('ne')} onMouseDown={(event) => startInteraction(event, element.id, 'resize', 'ne')} />
                                                            <div className={getResizeHandleStyle('sw')} onMouseDown={(event) => startInteraction(event, element.id, 'resize', 'sw')} />
                                                            <div className={getResizeHandleStyle('se')} onMouseDown={(event) => startInteraction(event, element.id, 'resize', 'se')} />
                                                            <div className="handle-rotate" onMouseDown={(event) => startInteraction(event, element.id, 'rotate')}>
                                                                <RotateCcw size={10} />
                                                            </div>
                                                            <div className="studio-selected-tag">{getElementLabel(element)}</div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        </div>
                    </section>

                    <aside className={`studio-panel studio-inspector-panel ${showInspectorPanel ? '' : 'is-collapsed'}`}>
                        <section className="studio-panel-section">
                            <div className="studio-section-heading">
                                <div>
                                    <h3>Right Panel</h3>
                                    <p>{showInspectorPanel ? 'Switch between inspector controls and layer management.' : 'Expand the panel when you need controls.'}</p>
                                </div>
                                <button
                                    className="studio-panel-toggle"
                                    onClick={() => setShowInspectorPanel((value) => !value)}
                                    title={showInspectorPanel ? 'Collapse inspector panel' : 'Expand inspector panel'}
                                >
                                    {showInspectorPanel ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                                </button>
                            </div>

                            {showInspectorPanel ? (
                                <>
                                    <div className="studio-mini-tab-row">
                                        <button className={`studio-mini-tab ${inspectorTab === 'inspector' ? 'active' : ''}`} onClick={() => setInspectorTab('inspector')}>
                                            Inspector
                                        </button>
                                        <button className={`studio-mini-tab ${inspectorTab === 'layers' ? 'active' : ''}`} onClick={() => setInspectorTab('layers')}>
                                            Layers
                                            <span className="studio-mini-tab-badge">{template.elements.length}</span>
                                        </button>
                                    </div>

                                    <div className={`studio-panel-scroll ${inspectorTab !== 'inspector' ? 'is-hidden-panel' : ''}`}>
                            {!selectedElement && (
                                <div className="studio-empty-state">
                                    <Layers size={18} />
                                    <strong>No element selected</strong>
                                    <p>Click a title, note, logo, line, or table area to edit its properties.</p>
                                </div>
                            )}

                            {selectedElement && (
                                <>
                                    <div className="studio-selection-header">
                                        <div>
                                            <div className="studio-selection-type">{selectedElement.type}</div>
                                            <strong>{getElementLabel(selectedElement)}</strong>
                                        </div>
                                        <button
                                            className="terminal-btn"
                                            onClick={() => setElementVisibility(selectedElement.id, selectedElement.visible === false)}
                                        >
                                            {selectedElement.visible === false ? <Eye size={14} /> : <EyeOff size={14} />}
                                            {selectedElement.visible === false ? 'Show' : 'Hide'}
                                        </button>
                                    </div>

                                    <div className="studio-prop-grid">
                                        <div className="studio-input-group">
                                            <label>X</label>
                                            <input type="number" value={Math.round(selectedElement.x)} onChange={(event) => updateElement(selectedElement.id, { x: Number(event.target.value) })} />
                                        </div>
                                        <div className="studio-input-group">
                                            <label>Y</label>
                                            <input type="number" value={Math.round(selectedElement.y)} onChange={(event) => updateElement(selectedElement.id, { y: Number(event.target.value) })} />
                                        </div>
                                        <div className="studio-input-group">
                                            <label>W</label>
                                            <input type="number" value={Math.round(selectedElement.w)} onChange={(event) => updateElement(selectedElement.id, { w: Number(event.target.value) })} />
                                        </div>
                                        <div className="studio-input-group">
                                            <label>H</label>
                                            <input type="number" value={Math.round(selectedElement.h)} onChange={(event) => updateElement(selectedElement.id, { h: Number(event.target.value) })} />
                                        </div>
                                    </div>

                                    <div className="studio-input-group">
                                        <label>Rotation</label>
                                        <input type="number" value={selectedElement.rotation || 0} onChange={(event) => updateElement(selectedElement.id, { rotation: Number(event.target.value) })} />
                                    </div>

                                    {selectedElement.type === 'text' && (
                                        <>
                                            <div className="studio-input-group">
                                                <label>Content</label>
                                                <textarea
                                                    rows={4}
                                                    value={selectedElement.content || ''}
                                                    onChange={(event) => updateElement(selectedElement.id, { content: event.target.value })}
                                                />
                                            </div>

                                            <div className="studio-prop-grid">
                                                <div className="studio-input-group">
                                                    <label>Font size</label>
                                                    <input type="number" value={selectedElement.styles?.fontSize || 14} onChange={(event) => updateElementStyle(selectedElement.id, { fontSize: Number(event.target.value) })} />
                                                </div>
                                                <div className="studio-input-group">
                                                    <label>Weight</label>
                                                    <input type="number" min="100" max="900" step="100" value={selectedElement.styles?.fontWeight || 600} onChange={(event) => updateElementStyle(selectedElement.id, { fontWeight: Number(event.target.value) })} />
                                                </div>
                                                <div className="studio-input-group">
                                                    <label>Text color</label>
                                                    <input type="color" value={selectedElement.styles?.color || '#0f172a'} onChange={(event) => updateElementStyle(selectedElement.id, { color: event.target.value })} />
                                                </div>
                                                <div className="studio-input-group">
                                                    <label>Fill</label>
                                                    <input type="color" value={selectedElement.styles?.backgroundColor || '#ffffff'} onChange={(event) => updateElementStyle(selectedElement.id, { backgroundColor: event.target.value })} />
                                                </div>
                                            </div>

                                            <div className="studio-align-row">
                                                <button className={getAlignmentButtonClass((selectedElement.styles?.textAlign || 'left') === 'left')} onClick={() => updateElementStyle(selectedElement.id, { textAlign: 'left' })}>Left</button>
                                                <button className={getAlignmentButtonClass(selectedElement.styles?.textAlign === 'center')} onClick={() => updateElementStyle(selectedElement.id, { textAlign: 'center' })}>Center</button>
                                                <button className={getAlignmentButtonClass(selectedElement.styles?.textAlign === 'right')} onClick={() => updateElementStyle(selectedElement.id, { textAlign: 'right' })}>Right</button>
                                            </div>
                                        </>
                                    )}

                                    {selectedElement.type === 'shape' && (
                                        <>
                                            <div className="studio-input-group">
                                                <label>Shape type</label>
                                                <select value={selectedElement.shapeType || 'rectangle'} onChange={(event) => updateElement(selectedElement.id, { shapeType: event.target.value })}>
                                                    <option value="rectangle">Rectangle</option>
                                                    <option value="line">Line</option>
                                                </select>
                                            </div>

                                            <div className="studio-prop-grid">
                                                <div className="studio-input-group">
                                                    <label>Stroke width</label>
                                                    <input type="number" value={getShapeStyle(selectedElement.styles).borderWidth} onChange={(event) => updateElementStyle(selectedElement.id, { borderWidth: Number(event.target.value) })} />
                                                </div>
                                                <div className="studio-input-group">
                                                    <label>Stroke color</label>
                                                    <input type="color" value={getShapeStyle(selectedElement.styles).borderColor} onChange={(event) => updateElementStyle(selectedElement.id, { borderColor: event.target.value })} />
                                                </div>
                                                <div className="studio-input-group">
                                                    <label>Fill</label>
                                                    <input type="color" value={getShapeStyle(selectedElement.styles).fill === 'transparent' ? '#ffffff' : getShapeStyle(selectedElement.styles).fill} onChange={(event) => updateElementStyle(selectedElement.id, { fill: event.target.value })} />
                                                </div>
                                                <div className="studio-input-group">
                                                    <label>Radius</label>
                                                    <input type="number" value={getShapeStyle(selectedElement.styles).borderRadius} onChange={(event) => updateElementStyle(selectedElement.id, { borderRadius: Number(event.target.value) })} />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {selectedElement.type === 'image' && (
                                        <>
                                            <div className="studio-input-group">
                                                <label>Image source</label>
                                                <input type="text" value={selectedElement.url || ''} onChange={(event) => updateElement(selectedElement.id, { url: event.target.value })} placeholder="Paste image URL or upload on canvas" />
                                            </div>
                                            <div className="studio-tip-card compact">
                                                <strong>Tip</strong>
                                                <p>Use high-resolution PNG logos for the cleanest PDF export.</p>
                                            </div>
                                        </>
                                    )}

                                    {selectedElement.type === 'table' && (
                                        <div className="studio-tip-card compact">
                                            <strong>Table block</strong>
                                            <p>The table stays locked inside the table zone so the exported summary remains stable. Use the left panel to change colors, labels, and grouped headers.</p>
                                        </div>
                                    )}

                                    <div className="studio-inspector-actions">
                                        <button className="terminal-btn" onClick={() => duplicateElement(selectedElement.id)}>
                                            <Copy size={14} /> Clone
                                        </button>
                                        <button className="terminal-btn" onClick={() => bringToFront(selectedElement.id)}>Bring front</button>
                                        <button className="terminal-btn" onClick={() => sendToBack(selectedElement.id)}>Send back</button>
                                        {selectedElement.id !== 'master_table' && (
                                            <button className="terminal-btn studio-danger-btn" onClick={() => deleteElement(selectedElement.id)}>
                                                <Trash2 size={14} /> Delete
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                                    </div>
                                </>
                            ) : (
                                <div className="studio-collapsed-panel">
                                    <Layers size={18} />
                                    <span>Inspect</span>
                                </div>
                            )}
                        </section>

                        {showInspectorPanel && (
                        <section className={`studio-panel-section studio-layers-panel ${inspectorTab !== 'layers' ? 'is-hidden-panel' : ''}`}>
                            <div className="studio-section-heading">
                                <div>
                                    <h3>Layers</h3>
                                    <p>Top-most blocks are listed first.</p>
                                </div>
                                <span className="studio-badge subtle">{template.elements.length}</span>
                            </div>

                            <div className="studio-layer-list">
                                {sortedElements.map((element) => (
                                    <button
                                        key={element.id}
                                        className={`studio-layer-item ${selectedId === element.id ? 'active' : ''}`}
                                        onClick={() => setSelectedId(element.id)}
                                    >
                                        <div className="studio-layer-copy">
                                            <span className="studio-layer-type">{element.type}</span>
                                            <strong>{getElementLabel(element)}</strong>
                                        </div>
                                        <div className="studio-layer-actions">
                                            <span className="studio-layer-z">z{element.zIndex || 0}</span>
                                            <span className={`studio-layer-visibility ${element.visible === false ? 'hidden' : ''}`}>
                                                {element.visible === false ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </section>
                        )}
                    </aside>
                </div>
            </div>
        </div>
    );
}

