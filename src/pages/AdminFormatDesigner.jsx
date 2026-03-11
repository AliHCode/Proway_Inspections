import { useEffect, useMemo, useState } from 'react';
import { FileText, Move, Save, RotateCcw, Image, Columns, Settings, Layers, X, Square, Circle, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../components/Header';
import { useProject } from '../context/ProjectContext';

const A4_LANDSCAPE_WIDTH = 1123;
const A4_LANDSCAPE_HEIGHT = 794;
const DEFAULT_ZONES = {
    header: { x: 30, y: 24, w: 1063, h: 132 },
    table: { x: 30, y: 170, w: 1063, h: 510 },
    footer: { x: 30, y: 694, w: 1063, h: 74 },
};

const DEFAULT_TEMPLATE = {
    elements: [
        { id: 'master_table', type: 'table', x: 30, y: 170, w: 1063, h: 510, zIndex: 10 },
        { id: 'default_title', type: 'text', content: 'RFI Summary', x: 360, y: 42, w: 400, h: 36, styles: { fontSize: 30, fontWeight: 800, textAlign: 'center' }, zIndex: 20 },
        { id: 'default_subtitle', type: 'text', content: 'Construction Report', x: 360, y: 80, w: 400, h: 22, styles: { fontSize: 12, fontWeight: 600, textAlign: 'center' }, zIndex: 21 },
        { id: 'default_project_line', type: 'text', content: 'Project Name', x: 300, y: 104, w: 520, h: 20, styles: { fontSize: 11, fontWeight: 500, textAlign: 'center' }, zIndex: 21 },
        { id: 'default_submission_date', type: 'text', content: 'Submission Date: DD.MM.YYYY', x: 900, y: 26, w: 180, h: 18, styles: { fontSize: 10, fontWeight: 600, textAlign: 'right' }, zIndex: 22 },
        { id: 'footer_submitted_by', type: 'text', content: 'Submitted by', x: 36, y: 730, w: 250, h: 20, styles: { fontSize: 11, fontWeight: 600, textAlign: 'left' }, zIndex: 23 },
        { id: 'footer_submitted_to', type: 'text', content: 'Submitted to', x: 837, y: 730, w: 250, h: 20, styles: { fontSize: 11, fontWeight: 600, textAlign: 'right' }, zIndex: 23 },
    ],
    tableConfig: {
        headFillColor: '#5bb3d9',
        headTextColor: '#000000',
        columnLabels: {},
        groupedHeaders: [
            { title: 'Chainage', fromKey: 'chainage_from', toKey: 'chainage_to' }
        ],
    },
    canvas: {
        width: A4_LANDSCAPE_WIDTH,
        height: A4_LANDSCAPE_HEIGHT,
        showGrid: true,
        snapToGrid: true,
        zones: DEFAULT_ZONES,
    }
};

function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeStudioTemplate(rawTemplate) {
    const base = deepClone(DEFAULT_TEMPLATE);
    if (!rawTemplate || typeof rawTemplate !== 'object') return base;

    // Saved export schema that embeds studio state
    if (rawTemplate.studioDesigner && typeof rawTemplate.studioDesigner === 'object') {
        const studio = rawTemplate.studioDesigner;
        return ensureRequiredElements({
            ...base,
            elements: Array.isArray(studio.elements) ? studio.elements : base.elements,
            tableConfig: {
                ...base.tableConfig,
                ...(studio.tableConfig || {}),
                // Keep latest saved export table style as source of truth when present.
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
                // Keep editor on A4 landscape for consistent WYSIWYG.
                width: A4_LANDSCAPE_WIDTH,
                height: A4_LANDSCAPE_HEIGHT,
            },
        });
    }

    // New studio schema
    if (Array.isArray(rawTemplate.elements) && rawTemplate.tableConfig && rawTemplate.canvas) {
        return ensureRequiredElements({
            ...base,
            ...rawTemplate,
            elements: Array.isArray(rawTemplate.elements) ? rawTemplate.elements : base.elements,
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

    // Legacy export schema -> convert to studio schema
    const legacy = rawTemplate;
    const converted = deepClone(base);

    const titleEl = converted.elements.find((e) => e.id === 'default_title');
    if (titleEl) titleEl.content = legacy?.header?.title || 'RFI SUMMARY';

    if (legacy?.header?.subtitle) {
        converted.elements.push({
            id: 'legacy_subtitle',
            type: 'text',
            content: legacy.header.subtitle,
            x: 350,
            y: 90,
            w: 500,
            h: 28,
            styles: { fontSize: 18, fontWeight: 500, textAlign: 'center' },
            zIndex: 21,
        });
    }

    if (legacy?.header?.projectLine) {
        converted.elements.push({
            id: 'legacy_project_line',
            type: 'text',
            content: legacy.header.projectLine,
            x: 300,
            y: 120,
            w: 600,
            h: 24,
            styles: { fontSize: 13, fontWeight: 400, textAlign: 'center' },
            zIndex: 22,
        });
    }

    if (legacy?.header?.leftLogoUrl) {
        converted.elements.push({
            id: 'legacy_left_logo',
            type: 'image',
            url: legacy.header.leftLogoUrl,
            x: 40,
            y: 30,
            w: 160,
            h: 64,
            zIndex: 15,
            styles: {},
        });
    }

    if (legacy?.header?.rightLogoUrl) {
        converted.elements.push({
            id: 'legacy_right_logo',
            type: 'image',
            url: legacy.header.rightLogoUrl,
            x: 1000,
            y: 30,
            w: 160,
            h: 64,
            zIndex: 15,
            styles: {},
        });
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
    const withCopy = deepClone(template);
    const existingIds = new Set((withCopy.elements || []).map((e) => e.id));
    // Keep only truly required building blocks. Optional text/logo blocks must stay deletable.
    const required = deepClone(DEFAULT_TEMPLATE.elements)
        .filter((e) => e.id === 'master_table')
        .filter((e) => !existingIds.has(e.id));
    withCopy.elements = [...(withCopy.elements || []), ...required];
    return withCopy;
}

function buildExportTemplateFromStudio(studioTemplate, activeProjectName = '') {
    const elements = Array.isArray(studioTemplate?.elements) ? studioTemplate.elements : [];
    const byId = Object.fromEntries(elements.map((e) => [e.id, e]));

    const titleEl = byId.default_title || elements.find((e) => e.type === 'text');
    const subtitleEl = byId.default_subtitle || byId.legacy_subtitle || elements.find((e) => e.id === 'subtitle');
    const projectLineEl = byId.default_project_line || byId.legacy_project_line || elements.find((e) => e.id === 'project_line');
    const submissionDateEl = byId.default_submission_date || elements.find((e) => e.id === 'submission_date');
    const leftLogoEl = byId.legacy_left_logo || elements.find((e) => e.id === 'left_logo' || (e.type === 'image' && e.x < 300));
    const rightLogoEl = byId.legacy_right_logo || elements.find((e) => e.id === 'right_logo' || (e.type === 'image' && e.x > 800));
    const tableEl = byId.master_table || elements.find((e) => e.type === 'table');
    const submittedByEl = byId.footer_submitted_by;
    const submittedToEl = byId.footer_submitted_to;

    const additionalLogos = elements
        .filter((e) => e.type === 'image' && e.id !== leftLogoEl?.id && e.id !== rightLogoEl?.id)
        .map((e) => ({
            id: e.id,
            url: e.url || '',
            x: Number(e.x || 0),
            y: Number(e.y || 0),
            w: Number(e.w || 120),
            h: Number(e.h || 40),
            visible: e.visible !== false,
        }))
        .filter((e) => !!e.url);

    const canvasW = studioTemplate?.canvas?.width || A4_LANDSCAPE_WIDTH;
    const canvasH = studioTemplate?.canvas?.height || A4_LANDSCAPE_HEIGHT;

    const zones = {
        ...DEFAULT_ZONES,
        ...(studioTemplate?.canvas?.zones || {}),
    };

    const defaultLayoutElements = {
        leftLogo: { x: 20, y: 20, w: 140, h: 46 },
        rightLogo: { x: 960, y: 20, w: 140, h: 46 },
        title: { x: 300, y: 40, w: 520, h: 36, fontSize: 30 },
        subtitle: { x: 300, y: 80, w: 520, h: 24, fontSize: 12 },
        projectLine: { x: 260, y: 104, w: 600, h: 20, fontSize: 11 },
        submissionDate: { x: 880, y: 26, w: 210, h: 18, fontSize: 10 },
        table: { x: zones.table.x, y: zones.table.y, w: zones.table.w, h: zones.table.h },
    };

    function mapElement(el, fallback, textDefault = '') {
        return {
            x: Number(el?.x ?? fallback.x),
            y: Number(el?.y ?? fallback.y),
            w: Number(el?.w ?? fallback.w),
            h: Number(el?.h ?? fallback.h),
            fontSize: Number(el?.styles?.fontSize ?? fallback.fontSize ?? 12),
            visible: el?.visible !== false,
            text: typeof el?.content === 'string' ? el.content : textDefault,
        };
    }

    const mappedTitle = mapElement(titleEl, defaultLayoutElements.title, 'RFI Summary');
    const mappedSubtitle = mapElement(subtitleEl, defaultLayoutElements.subtitle, '');
    const mappedProject = mapElement(projectLineEl, defaultLayoutElements.projectLine, '');
    const mappedSubmission = mapElement(submissionDateEl, defaultLayoutElements.submissionDate, '');
    const mappedLeftLogo = mapElement(leftLogoEl, defaultLayoutElements.leftLogo, '');
    const mappedRightLogo = mapElement(rightLogoEl, defaultLayoutElements.rightLogo, '');
    const mappedTable = mapElement(tableEl, defaultLayoutElements.table, '');

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
            bodyFontSize: 10,
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
            canvasWidth: canvasW,
            canvasHeight: canvasH,
            gridSize: 8,
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

export default function AdminFormatDesigner() {
    const { activeProject, orderedTableColumns, saveProjectExportTemplate } = useProject();
    const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
    const [saving, setSaving] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [activeRailTab, setActiveRailTab] = useState('branding');
    const [drawerOpen, setDrawerOpen] = useState(true);
    const [interaction, setInteraction] = useState(null);
    const [zoom, setZoom] = useState(0.8);
    const [hasDraft, setHasDraft] = useState(false);

    const draftStorageKey = useMemo(() => {
        if (!activeProject?.id) return '';
        return `format_studio_draft_${activeProject.id}`;
    }, [activeProject?.id]);

    function getElementZone(id) {
        if (id === 'master_table') return 'table';
        if (id === 'footer_submitted_by' || id === 'footer_submitted_to') return 'footer';
        return 'header';
    }

    function clampRectToZone(rect, zoneName, canvas) {
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
                const parsed = JSON.parse(rawDraft);
                setTemplate(normalizeStudioTemplate(parsed));
                setHasDraft(true);
                return;
            }
        } catch {
            // Ignore corrupted drafts and fallback to server template.
        }

        setTemplate(normalizeStudioTemplate(activeProject?.export_template || null));
        setHasDraft(false);
    }, [activeProject?.id, activeProject?.export_template, draftStorageKey]);

    useEffect(() => {
        if (!draftStorageKey || !activeProject?.id) return;
        try {
            localStorage.setItem(draftStorageKey, JSON.stringify(template));
        } catch {
            // Ignore quota/storage errors.
        }
    }, [template, draftStorageKey, activeProject?.id]);

    const previewColumns = useMemo(() => {
        return (orderedTableColumns || []).filter((c) => c.field_key !== 'actions');
    }, [orderedTableColumns]);

    const previewHeaderKeys = useMemo(() => previewColumns.map((c) => c.field_key), [previewColumns]);

    const addElement = (type, defaults = {}) => {
        const id = 'el_' + Date.now();
        const imageCount = template.elements.filter((e) => e.type === 'image').length;
        const imageOffset = imageCount * 34;
        const newEl = {
            id,
            type,
            x: type === 'image' ? 80 + imageOffset : 100,
            y: type === 'image' ? 36 + imageOffset * 0.2 : 100,
            w: type === 'image' ? 140 : 200,
            h: type === 'image' ? 56 : 50,
            zIndex: template.elements.length + 1,
            rotation: 0,
            content: type === 'text' ? 'New Text' : '',
            styles: {},
            ...defaults
        };
        setTemplate(prev => ({ ...prev, elements: [...prev.elements, newEl] }));
        setSelectedId(id);
    };

    const updateElement = (id, patch) => {
        setTemplate(prev => ({
            ...prev,
            elements: prev.elements.map(el => el.id === id ? { ...el, ...patch } : el)
        }));
    };

    const updateElementStyle = (id, stylePatch) => {
        setTemplate(prev => ({
            ...prev,
            elements: prev.elements.map(el => el.id === id ? { ...el, styles: { ...el.styles, ...stylePatch } } : el)
        }));
    };

    const deleteElement = (id) => {
        if (id === 'master_table') return; // Protect table
        setTemplate(prev => ({ ...prev, elements: prev.elements.filter(el => el.id !== id) }));
        if (selectedId === id) setSelectedId(null);
    };

    const duplicateElement = (id) => {
        const el = template.elements.find(e => e.id === id);
        if (!el || id === 'master_table') return;
        const newId = 'el_' + Date.now();
        setTemplate(prev => ({
            ...prev,
            elements: [...prev.elements, { ...el, id: newId, x: el.x + 20, y: el.y + 20, zIndex: prev.elements.length + 1 }]
        }));
        setSelectedId(newId);
    };

    const bringToFront = (id) => {
        const maxZ = Math.max(...template.elements.map(e => e.zIndex || 0));
        updateElement(id, { zIndex: maxZ + 1 });
    };

    const sendToBack = (id) => {
        const minZ = Math.min(...template.elements.map(e => e.zIndex || 0));
        updateElement(id, { zIndex: minZ - 1 });
    };

    const previewGroupedHeaders = useMemo(() => {
        return (template?.tableConfig?.groupedHeaders || [])
            .map((g) => {
                const start = previewHeaderKeys.indexOf(g.fromKey);
                const end = previewHeaderKeys.indexOf(g.toKey);
                if (start < 0 || end < 0 || end <= start) return null;
                return { ...g, start, end, span: end - start + 1 };
            })
            .filter(Boolean)
            .sort((a, b) => a.start - b.start);
    }, [template?.tableConfig?.groupedHeaders, previewHeaderKeys]);

    function startInteraction(e, id, mode, handle = null) {
        e.preventDefault(); e.stopPropagation();
        setSelectedId(id);
        const el = template.elements.find(e => e.id === id);
        if (!el) return;
        setInteraction({ id, mode, handle, startX: e.clientX, startY: e.clientY, startRect: { ...el } });
    }

    useEffect(() => {
        if (!interaction) return;
        function onMouseMove(e) {
            const dx = (e.clientX - interaction.startX) / zoom;
            const dy = (e.clientY - interaction.startY) / zoom;
            const grid = template?.canvas?.snapToGrid ? 8 : 1;
            const el = interaction.startRect;
            if (interaction.mode === 'move') {
                const nextRect = {
                    ...el,
                    x: snap(el.x + dx, grid, true),
                    y: snap(el.y + dy, grid, true),
                    w: el.w,
                    h: el.h,
                };
                const safe = clampRectToZone(nextRect, getElementZone(interaction.id), template.canvas);
                updateElement(interaction.id, { x: safe.x, y: safe.y });
            } else if (interaction.mode === 'resize') {
                const h = interaction.handle;
                let { x, y, w, h: height } = el;
                if (h.includes('e')) w = snap(el.w + dx, grid, true);
                if (h.includes('s')) height = snap(el.h + dy, grid, true);
                if (h.includes('w')) { const nextW = snap(el.w - dx, grid, true); if (nextW > 10) { x = snap(el.x + (el.w - nextW), grid, true); w = nextW; } }
                if (h.includes('n')) { const nextH = snap(el.h - dy, grid, true); if (nextH > 10) { y = snap(el.y + (el.h - nextH), grid, true); height = nextH; } }
                const safe = clampRectToZone({ ...el, x, y, w, h: height }, getElementZone(interaction.id), template.canvas);
                updateElement(interaction.id, { x: safe.x, y: safe.y, w: safe.w, h: safe.h });
            } else if (interaction.mode === 'rotate') {
                const rect = document.getElementById('el_' + interaction.id).getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI) + 90;
                updateElement(interaction.id, { rotation: Math.round(angle / 5) * 5 });
            }
        }
        function onMouseUp() { setInteraction(null); }
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
    }, [interaction, zoom, template?.canvas?.snapToGrid]);

    const handleSave = async () => {
        const exportTemplate = buildExportTemplateFromStudio(template, activeProject?.name || '');
        setSaving(true);
        const result = await saveProjectExportTemplate(exportTemplate);
        setSaving(false);
        if (result?.success) {
            if (draftStorageKey) {
                localStorage.removeItem(draftStorageKey);
            }
            setHasDraft(false);
            toast.success('Studio design deployed');
        }
        else toast.error(result?.error || 'Save failed');
    };

    const selectedElement = template.elements.find(el => el.id === selectedId);

    return (
        <div className="format-studio-page">
            <Header />
            <div className="studio-terminal-frame no-margin">
                <header className="terminal-titlebar">
                    <div className="terminal-window-dots"><div className="window-dot red"></div><div className="window-dot yellow"></div><div className="window-dot green"></div></div>
                    <div className="terminal-app-title">Visual Studio V2 // Genesis Mode</div>
                    <div className="terminal-actions">
                        {hasDraft && <span style={{ fontSize: '0.72rem', color: '#facc15', marginRight: '0.45rem' }}>Draft auto-saved</span>}
                        <button className="terminal-btn" onClick={() => setTemplate(deepClone(DEFAULT_TEMPLATE))}><RotateCcw size={14} /> Reset</button>
                        <button className="terminal-btn primary" onClick={handleSave} disabled={saving}><Save size={14} /> {saving ? 'Saving...' : 'Deploy'}</button>
                    </div>
                </header>

                <div className="format-studio-layout h-full">
                    <aside className="studio-vertical-rail">
                        <div className={`rail-item ${activeRailTab === 'branding' ? 'active' : ''}`} onClick={() => {setActiveRailTab('branding'); setDrawerOpen(true);}} title="Text & Elements"><FileText size={22} /></div>
                        <div className={`rail-item ${activeRailTab === 'shapes' ? 'active' : ''}`} onClick={() => {setActiveRailTab('shapes'); setDrawerOpen(true);}} title="Shapes Library"><Square size={22} /></div>
                        <div className={`rail-item ${activeRailTab === 'images' ? 'active' : ''}`} onClick={() => {setActiveRailTab('images'); setDrawerOpen(true);}} title="Images"><Image size={22} /></div>
                        <div className={`rail-item ${activeRailTab === 'columns' ? 'active' : ''}`} onClick={() => {setActiveRailTab('columns'); setDrawerOpen(true);}} title="Table Columns"><Columns size={22} /></div>
                    </aside>

                    <main className="studio-main-stage">
                        <section className={`studio-internal-drawer ${drawerOpen ? 'open' : ''}`}>
                            <header className="drawer-header">
                                <h3>{activeRailTab} engine</h3>
                                <button className="terminal-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setDrawerOpen(false)}><X size={14} /></button>
                            </header>
                            
                            <div className="drawer-content">
                                {activeRailTab === 'branding' && (
                                    <div className="studio-sidebar-section">
                                        <button className="terminal-btn primary w-full mb-4" onClick={() => addElement('text')}>+ New Text Block</button>
                                        <p className="text-[10px] text-studio-text-muted mt-2">Add custom titles, labels, or project summaries manually.</p>
                                    </div>
                                )}

                                {activeRailTab === 'shapes' && (
                                    <div className="library-section">
                                        <div className="library-grid">
                                            <div className="library-item" onClick={() => addElement('shape', { shapeType: 'rectangle', w: 100, h: 100, styles: { border: '1px solid #000' } })}>
                                                <Square size={20} />
                                                <span>Rectangle</span>
                                            </div>
                                            <div className="library-item" onClick={() => addElement('shape', { shapeType: 'circle', w: 100, h: 100, styles: { border: '1px solid #000', borderRadius: '50%' } })}>
                                                <Circle size={20} />
                                                <span>Circle</span>
                                            </div>
                                            <div className="library-item" onClick={() => addElement('shape', { shapeType: 'line', w: 200, h: 2, styles: { background: '#000' } })}>
                                                <Minus size={20} />
                                                <span>Line</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeRailTab === 'images' && (
                                    <div className="studio-sidebar-section">
                                        <button className="terminal-btn primary w-full mb-4" onClick={() => addElement('image')}>+ New Image Slot</button>
                                    </div>
                                )}

                                {activeRailTab === 'columns' && (
                                    <div className="studio-sidebar-section">
                                        <div className="studio-input-group mb-4">
                                            <label>Head Fill Color</label>
                                            <input type="color" value={template.tableConfig.headFillColor} onChange={(e) => setTemplate(prev => ({ ...prev, tableConfig: { ...prev.tableConfig, headFillColor: e.target.value } }))} />
                                        </div>
                                        <div className="studio-scroll-area">
                                            {previewColumns.map((col) => (
                                                <div key={col.field_key} className="studio-input-group mb-2">
                                                    <label>{col.field_key}</label>
                                                    <input type="text" value={template.tableConfig.columnLabels?.[col.field_key] ?? col.field_name} onChange={(e) => {
                                                        const val = e.target.value;
                                                        setTemplate(prev => ({
                                                            ...prev,
                                                            tableConfig: {
                                                                ...prev.tableConfig,
                                                                columnLabels: { ...prev.tableConfig.columnLabels, [col.field_key]: val }
                                                            }
                                                        }));
                                                    }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedElement && (
                                    <div className="mt-8 pt-6 border-t border-studio-border">
                                        <h3 style={{ fontSize: '0.75rem', color: 'var(--studio-accent)', textTransform: 'uppercase', marginBottom: '1rem' }}>Inspector</h3>
                                        <div className="studio-prop-grid mb-4">
                                            <div className="studio-input-group"><label>X</label><input type="number" value={Math.round(selectedElement.x)} onChange={(e) => updateElement(selectedId, { x: Number(e.target.value) })} /></div>
                                            <div className="studio-input-group"><label>Y</label><input type="number" value={Math.round(selectedElement.y)} onChange={(e) => updateElement(selectedId, { y: Number(e.target.value) })} /></div>
                                            <div className="studio-input-group"><label>W</label><input type="number" value={Math.round(selectedElement.w)} onChange={(e) => updateElement(selectedId, { w: Number(e.target.value) })} /></div>
                                            <div className="studio-input-group"><label>H</label><input type="number" value={Math.round(selectedElement.h)} onChange={(e) => updateElement(selectedId, { h: Number(e.target.value) })} /></div>
                                        </div>
                                        
                                        {selectedElement.type === 'text' && (
                                            <>
                                                <div className="studio-input-group mb-3">
                                                    <label>Content</label>
                                                    <textarea value={selectedElement.content} onChange={(e) => updateElement(selectedId, { content: e.target.value })} rows={3} style={{ width: '100%', background: '#0d1117', border: '1px solid #30363d', color: '#fff', padding: '8px', fontSize: '0.8rem' }} />
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mb-3">
                                                    <div className="studio-input-group">
                                                        <label>Size</label>
                                                        <input type="number" value={selectedElement.styles?.fontSize || 14} onChange={(e) => updateElementStyle(selectedId, { fontSize: Number(e.target.value) })} />
                                                    </div>
                                                    <div className="studio-input-group">
                                                        <label>Color</label>
                                                        <input type="color" value={selectedElement.styles?.color || '#000000'} onChange={(e) => updateElementStyle(selectedId, { color: e.target.value })} />
                                                    </div>
                                                </div>
                                                <div className="flex gap-2 mb-4">
                                                    <button className="terminal-btn flex-1" onClick={() => updateElementStyle(selectedId, { textAlign: 'left' })}>Left</button>
                                                    <button className="terminal-btn flex-1" onClick={() => updateElementStyle(selectedId, { textAlign: 'center' })}>Center</button>
                                                    <button className="terminal-btn flex-1" onClick={() => updateElementStyle(selectedId, { textAlign: 'right' })}>Right</button>
                                                </div>
                                            </>
                                        )}

                                        <div className="grid grid-cols-2 gap-2">
                                            <button className="terminal-btn" onClick={() => duplicateElement(selectedId)}>Clone</button>
                                            <button className="terminal-btn text-red-500" onClick={() => deleteElement(selectedId)}>Delete</button>
                                            <button className="terminal-btn" onClick={() => bringToFront(selectedId)}>Layer ↑</button>
                                            <button className="terminal-btn" onClick={() => sendToBack(selectedId)}>Layer ↓</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        <div className="studio-stage-viewport" onClick={() => setSelectedId(null)}>
                            <div
                                className="studio-terminal-canvas"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                    width: template.canvas.width + 'px',
                                    height: template.canvas.height + 'px',
                                    transform: 'scale(' + zoom + ')',
                                    transformOrigin: 'top center',
                                    border: '1px solid #000',
                                    background: '#fff',
                                    position: 'relative',
                                    boxShadow: '0 30px 60px rgba(0,0,0,0.5)'
                                }}
                            >
                                {Object.entries(template.canvas.zones || DEFAULT_ZONES).map(([zoneName, z]) => (
                                    <div
                                        key={`zone_${zoneName}`}
                                        style={{
                                            position: 'absolute',
                                            left: z.x,
                                            top: z.y,
                                            width: z.w,
                                            height: z.h,
                                            border: zoneName === 'table' ? '2px dashed rgba(14,116,144,0.6)' : '1.5px dashed rgba(71,85,105,0.45)',
                                            background: zoneName === 'header' ? 'rgba(14,116,144,0.04)' : zoneName === 'footer' ? 'rgba(15,118,110,0.04)' : 'transparent',
                                            pointerEvents: 'none',
                                            zIndex: 1,
                                        }}
                                    >
                                        <span
                                            style={{
                                                position: 'absolute',
                                                top: -16,
                                                left: 0,
                                                fontSize: 10,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.08em',
                                                color: '#334155',
                                                fontWeight: 700,
                                            }}
                                        >
                                            {zoneName} zone
                                        </span>
                                    </div>
                                ))}

                                {template.elements.slice().sort((a,b) => (a.zIndex||0) - (b.zIndex||0)).map(el => (
                                    <div
                                        key={el.id}
                                        id={'el_' + el.id}
                                        className="studio-v2-element"
                                        onMouseDown={(e) => startInteraction(e, el.id, 'move')}
                                        style={{
                                            position: 'absolute',
                                            left: el.x + 'px',
                                            top: el.y + 'px',
                                            width: el.w + 'px',
                                            height: el.h + 'px',
                                            transform: 'rotate(' + (el.rotation || 0) + 'deg)',
                                            zIndex: el.zIndex || 1,
                                            outline: selectedId === el.id ? '2px solid var(--studio-accent)' : 'none',
                                            cursor: 'move'
                                        }}
                                    >
                                        <div style={{ width: '100%', height: '100%', ...el.styles, overflow: 'hidden' }}>
                                            {el.type === 'text' && (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: el.styles?.textAlign || 'center', whiteSpace: 'pre-wrap' }}>
                                                    {el.content}
                                                </div>
                                            )}
                                            {el.type === 'image' && (
                                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #ccc' }}>
                                                    <input type="file" style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }} onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onload = () => updateElement(el.id, { url: reader.result });
                                                            reader.readAsDataURL(file);
                                                        }
                                                    }} />
                                                    {el.url ? <img src={el.url} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} /> : <Image size={24} className="opacity-20" />}
                                                </div>
                                            )}
                                            {el.type === 'shape' && <div style={{ width: '100%', height: '100%', background: el.styles?.background || 'transparent', border: el.styles?.border }} />}
                                            {el.type === 'table' && (
                                                <div style={{ width: '100%', height: '100%', border: '2px solid #000' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                                        <thead style={{ background: template.tableConfig.headFillColor }}>
                                                            <tr>{previewColumns.map(c => <th key={c.field_key} style={{ border: '1px solid #000', padding: '4px' }}>{template.tableConfig.columnLabels?.[c.field_key] || c.field_name}</th>)}</tr>
                                                        </thead>
                                                        <tbody>{[1,2,3,4,5,6,7,8,9,10].map(r => <tr key={r}>{previewColumns.map(c => <td key={c.field_key} style={{ border: '1px solid #000', padding: '4px' }}>{r === 1 ? `Sample ${template.tableConfig.columnLabels?.[c.field_key] || c.field_name}` : ' '}</td>)}</tr>)}</tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>

                                        {selectedId === el.id && (
                                            <>
                                                <div className="handle handle-nw" onMouseDown={(e) => startInteraction(e, el.id, 'resize', 'nw')} />
                                                <div className="handle handle-ne" onMouseDown={(e) => startInteraction(e, el.id, 'resize', 'ne')} />
                                                <div className="handle handle-sw" onMouseDown={(e) => startInteraction(e, el.id, 'resize', 'sw')} />
                                                <div className="handle handle-se" onMouseDown={(e) => startInteraction(e, el.id, 'resize', 'se')} />
                                                <div className="handle-rotate" onMouseDown={(e) => startInteraction(e, el.id, 'rotate')}><RotateCcw size={10} /></div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </main>

                    <aside className="studio-canvas-zoom fixed bottom-6 right-6 flex items-center gap-2 bg-studio-bg-alt border border-studio-border p-2 rounded shadow-xl z-50">
                        <button className="terminal-btn px-2" onClick={() => setZoom(z => Math.max(0.1, z - 0.1))}>-</button>
                        <span className="text-[10px] font-mono min-w-[50px] text-center">{Math.round(zoom * 100)}%</span>
                        <button className="terminal-btn px-2" onClick={() => setZoom(z => Math.min(2, z + 0.1))}>+</button>
                    </aside>
                </div>
            </div>
        </div>
    );
}