import { useEffect, useMemo, useState } from 'react';
import { FileText, Move, Save, RotateCcw, Image, Columns, Settings, Layers, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../components/Header';
import { useProject } from '../context/ProjectContext';

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 760;

const DEFAULT_TEMPLATE = {
    header: {
        title: 'RFI Summary',
        subtitle: '',
        projectLine: '',
        showSubmissionDate: true,
        leftLogoUrl: '',
        rightLogoUrl: '',
    },
    customImages: [], // New: Multiple images
    table: {
        headFillColor: '#5bb3d9',
        headTextColor: '#0b1f33',
        bodyFontSize: 8,
        headFontSize: 8,
        compactMode: false,
        headerLayerHeight: 130,
        columnLabels: {},
        groupedHeaders: [],
    },
    footer: {
        leftLabel: 'Contractor Representative',
        rightLabel: 'Consultant Representative',
        showFooter: true,
    },
    layout: {
        canvasWidth: CANVAS_WIDTH,
        canvasHeight: 1600, // Increased height for professional sheet
        gridSize: 8,
        snapToGrid: true,
        showConnector: true, // New: Header-to-Columns outline
        elements: {
            leftLogo: { x: 40, y: 40, w: 100, h: 60, visible: true },
            rightLogo: { x: 1060, y: 40, w: 100, h: 60, visible: true },
            title: { x: 300, y: 35, w: 600, h: 45, visible: true },
            subtitle: { x: 300, y: 85, w: 600, h: 25, visible: true },
            projectLine: { x: 40, y: 130, w: 1120, h: 30, visible: true },
            submissionDate: { x: 960, y: 130, w: 200, h: 20, visible: true },
            table: { x: 40, y: 190, w: 1120, h: 500, visible: true },
        },
    },
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function snap(value, grid, enabled) {
    if (!enabled) return value;
    return Math.round(value / grid) * grid;
}

function mergeTemplate(base, incoming) {
    return {
        header: { ...base.header, ...(incoming?.header || {}) },
        table: {
            ...base.table,
            ...(incoming?.table || {}),
            columnLabels: {
                ...(base.table.columnLabels || {}),
                ...(incoming?.table?.columnLabels || {}),
            },
            groupedHeaders: incoming?.table?.groupedHeaders || base.table.groupedHeaders || [],
        },
        footer: { ...base.footer, ...(incoming?.footer || {}) },
        layout: {
            ...base.layout,
            ...(incoming?.layout || {}),
            elements: {
                ...base.layout.elements,
                ...(incoming?.layout?.elements || {}),
            },
        },
    };
}

function normalizeGroupedHeaders(groups, columns) {
    const keys = columns.map((c) => c.field_key);
    const withIndexes = (groups || [])
        .map((g) => {
            const start = keys.indexOf(g.fromKey);
            const end = keys.indexOf(g.toKey);
            if (start < 0 || end < 0 || end <= start) return null;
            return {
                title: g.title || 'Group',
                fromKey: g.fromKey,
                toKey: g.toKey,
                start,
                end,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);

    const nonOverlapping = [];
    let lastEnd = -1;
    withIndexes.forEach((g) => {
        if (g.start > lastEnd) {
            nonOverlapping.push(g);
            lastEnd = g.end;
        }
    });

    return nonOverlapping.map((g) => ({ title: g.title, fromKey: g.fromKey, toKey: g.toKey }));
}

export default function AdminFormatDesigner() {
    const { activeProject, orderedTableColumns, saveProjectExportTemplate } = useProject();
    const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
    const [saving, setSaving] = useState(false);
    const [selectedElement, setSelectedElement] = useState('title');
    const [activeRailTab, setActiveRailTab] = useState('canvas');
    const [drawerOpen, setDrawerOpen] = useState(true);
    const [interaction, setInteraction] = useState(null);

    useEffect(() => {
        setTemplate(mergeTemplate(DEFAULT_TEMPLATE, activeProject?.export_template || {}));
    }, [activeProject?.id, activeProject?.export_template]);

    const previewColumns = useMemo(() => {
        return (orderedTableColumns || []).filter((c) => c.field_key !== 'actions');
    }, [orderedTableColumns]);

    const previewHeaderKeys = useMemo(() => previewColumns.map((c) => c.field_key), [previewColumns]);
    const previewHeaderNameMap = useMemo(() => {
        const map = {};
        previewColumns.forEach((c) => {
            map[c.field_key] = template.table.columnLabels?.[c.field_key] || c.field_name;
        });
        return map;
    }, [previewColumns, template.table.columnLabels]);

    const previewGroupedHeaders = useMemo(() => {
        const groups = normalizeGroupedHeaders(template.table.groupedHeaders || [], previewColumns);
        return groups
            .map((g) => {
                const start = previewHeaderKeys.indexOf(g.fromKey);
                const end = previewHeaderKeys.indexOf(g.toKey);
                if (start < 0 || end < 0 || end <= start) return null;
                return { ...g, start, end, span: end - start + 1 };
            })
            .filter(Boolean)
            .sort((a, b) => a.start - b.start);
    }, [template.table.groupedHeaders, previewHeaderKeys, previewColumns]);

    function addCustomImage() {
        if (!activeProject?.id) {
            toast.error('Select a project first.');
            return;
        }
        const id = `img_${Date.now()}`;
        setTemplate((prev) => ({
            ...prev,
            customImages: [...(prev.customImages || []), { id, url: '', x: 400, y: 400, w: 200, h: 200, visible: true }],
        }));
        setSelectedElement(id);
    }

    function removeCustomImage(id) {
        setTemplate((prev) => ({
            ...prev,
            customImages: (prev.customImages || []).filter((img) => img.id !== id),
        }));
        if (selectedElement === id) setSelectedElement(null);
    }

    function updateCustomImage(id, patch) {
        setTemplate((prev) => ({
            ...prev,
            customImages: (prev.customImages || []).map((img) => (img.id === id ? { ...img, ...patch } : img)),
        }));
    }

    async function handleCustomImageFile(id, file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => updateCustomImage(id, { url: String(reader.result || '') });
        reader.readAsDataURL(file);
    }

    function getRect(key) {
        if (key?.startsWith('img_')) {
            return template.customImages?.find((img) => img.id === key);
        }
        return template.layout.elements[key];
    }

    function updateLayoutElement(key, patch) {
        if (key?.startsWith('img_')) {
            updateCustomImage(key, patch);
            return;
        }
        setTemplate((prev) => ({
            ...prev,
            layout: {
                ...prev.layout,
                elements: {
                    ...prev.layout.elements,
                    [key]: {
                        ...prev.layout.elements[key],
                        ...patch,
                    },
                },
            },
        }));
    }

    function setGroupedHeaders(next) {
        const normalized = normalizeGroupedHeaders(next, previewColumns);
        setTemplate((prev) => ({
            ...prev,
            table: {
                ...prev.table,
                groupedHeaders: normalized,
            },
        }));
    }

    function addGroupedHeader() {
        if (previewColumns.length < 2) {
            toast.error('Need at least 2 columns for grouped headings.');
            return;
        }
        const next = [
            ...(template.table.groupedHeaders || []),
            {
                title: 'New Group',
                fromKey: previewColumns[0].field_key,
                toKey: previewColumns[1].field_key,
            },
        ];
        setGroupedHeaders(next);
    }

    function updateGroupedHeader(index, key, value) {
        const next = [...(template.table.groupedHeaders || [])];
        next[index] = { ...next[index], [key]: value };
        setGroupedHeaders(next);
    }

    function removeGroupedHeader(index) {
        setGroupedHeaders((template.table.groupedHeaders || []).filter((_, i) => i !== index));
    }

    function startInteraction(e, elementKey, mode) {
        e.preventDefault();
        e.stopPropagation();
        setSelectedElement(elementKey);
        const startRect = getRect(elementKey);
        if (!startRect) return;
        setInteraction({
            mode,
            elementKey,
            startX: e.clientX,
            startY: e.clientY,
            startRect,
        });
    }

    useEffect(() => {
        if (!interaction) return;

        function onMouseMove(e) {
            const dx = e.clientX - interaction.startX;
            const dy = e.clientY - interaction.startY;
            const grid = template.layout.gridSize || 8;
            const snapOn = !!template.layout.snapToGrid;
            const canvasW = template.layout.canvasWidth || CANVAS_WIDTH;
            const canvasH = template.layout.canvasHeight || CANVAS_HEIGHT;

            const start = interaction.startRect;
            if (interaction.mode === 'move') {
                const nx = clamp(
                    snap(start.x + dx, grid, snapOn),
                    0,
                    Math.max(0, canvasW - start.w)
                );
                const ny = clamp(
                    snap(start.y + dy, grid, snapOn),
                    0,
                    Math.max(0, canvasH - start.h)
                );
                updateLayoutElement(interaction.elementKey, { x: nx, y: ny });
                return;
            }

            if (interaction.mode === 'resize') {
                const nw = clamp(
                    snap(start.w + dx, grid, snapOn),
                    60,
                    Math.max(60, canvasW - start.x)
                );
                const nh = clamp(
                    snap(start.h + dy, grid, snapOn),
                    24,
                    Math.max(24, canvasH - start.y)
                );
                updateLayoutElement(interaction.elementKey, { w: nw, h: nh });
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
    }, [interaction, template.layout.gridSize, template.layout.snapToGrid, template.layout.canvasWidth, template.layout.canvasHeight]);

    async function handleFileToDataUrl(file, sectionKey) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setTemplate(prev => ({
                ...prev,
                header: { ...prev.header, [sectionKey]: String(reader.result || '') }
            }));
        };
        reader.readAsDataURL(file);
    }

    function updateSection(section, key, value) {
        setTemplate((prev) => ({
            ...prev,
            [section]: {
                ...prev[section],
                [key]: value,
            },
        }));
    }

    function updateColumnLabel(fieldKey, label) {
        setTemplate((prev) => ({
            ...prev,
            table: {
                ...prev.table,
                columnLabels: {
                    ...(prev.table.columnLabels || {}),
                    [fieldKey]: label,
                },
            },
        }));
    }

    async function handleSave() {
        if (!activeProject?.id) {
            toast.error('Select a project first.');
            return;
        }

        const cleanedTemplate = {
            ...template,
            table: {
                ...template.table,
                groupedHeaders: normalizeGroupedHeaders(template.table.groupedHeaders || [], previewColumns),
            },
        };

        setSaving(true);
        const result = await saveProjectExportTemplate(cleanedTemplate);
        setSaving(false);

        if (!result?.success) {
            toast.error(result?.error || 'Failed to save template');
            return;
        }

        toast.success('Project export format saved');
    }

    function handleReset() {
        setTemplate(mergeTemplate(DEFAULT_TEMPLATE, {}));
    }

    const toggleRailTab = (tab) => {
        if (activeRailTab === tab) {
            setDrawerOpen(!drawerOpen);
        } else {
            setActiveRailTab(tab);
            setDrawerOpen(true);
        }
    };

    const selectedRect = getRect(selectedElement);

    return (
        <div className="format-studio-page">
            <Header />
            <div className="studio-terminal-frame">
                <header className="terminal-titlebar">
                    <div className="terminal-window-dots">
                        <div className="window-dot red"></div>
                        <div className="window-dot yellow"></div>
                        <div className="window-dot green"></div>
                    </div>
                    <div className="terminal-app-title">Studio IDE // Project Export Terminal</div>
                    <div className="terminal-actions">
                        <button className="terminal-btn" onClick={handleReset}>
                            <RotateCcw size={14} /> Reset
                        </button>
                        <button className="terminal-btn primary" onClick={handleSave} disabled={saving}>
                            <Save size={14} /> {saving ? 'Saving...' : 'Save Config'}
                        </button>
                    </div>
                </header>

                <div className="format-studio-layout">
                    <aside className="studio-vertical-rail">
                        <div className={`rail-item ${activeRailTab === 'canvas' && drawerOpen ? 'active' : ''}`} onClick={() => toggleRailTab('canvas')} title="Canvas Settings">
                            <Layers size={22} />
                        </div>
                        <div className={`rail-item ${activeRailTab === 'branding' && drawerOpen ? 'active' : ''}`} onClick={() => toggleRailTab('branding')} title="Branding & Logos">
                            <Settings size={22} />
                        </div>
                        <div className={`rail-item ${activeRailTab === 'images' && drawerOpen ? 'active' : ''}`} onClick={() => toggleRailTab('images')} title="Dynamic Images">
                            <Image size={22} />
                        </div>
                        <div className={`rail-item ${activeRailTab === 'columns' && drawerOpen ? 'active' : ''}`} onClick={() => toggleRailTab('columns')} title="Table Headings">
                            <Columns size={22} />
                        </div>
                    </aside>

                    <main className="studio-main-stage">
                        <section className={`studio-internal-drawer ${drawerOpen ? 'open' : ''}`}>
                            <header className="drawer-header">
                                <h3>{activeRailTab} settings</h3>
                                <button className="terminal-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setDrawerOpen(false)}><X size={14} /></button>
                            </header>
                            <div className="drawer-content">
                                {activeRailTab === 'canvas' && (
                                    <div className="studio-sidebar-section">
                                        <div className="studio-controls-grid">
                                            <label className="studio-label-row">
                                                <input type="checkbox" checked={template.layout.snapToGrid} onChange={(e) => updateSection('layout', 'snapToGrid', e.target.checked)} />
                                                <span>Snap Grid</span>
                                            </label>
                                            <div className="studio-input-group">
                                                <label>Size</label>
                                                <input type="number" value={template.layout.gridSize} onChange={(e) => updateSection('layout', 'gridSize', Number(e.target.value || 8))} />
                                            </div>
                                            <label className="studio-label-row" style={{ gridColumn: 'span 2', marginTop: '1rem' }}>
                                                <input type="checkbox" checked={template.layout.showConnector} onChange={(e) => updateSection('layout', 'showConnector', e.target.checked)} />
                                                <span>Header Connector</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {activeRailTab === 'branding' && (
                                    <>
                                        <div className="studio-sidebar-section">
                                            <div className="studio-input-group">
                                                <label>Headline</label>
                                                <input type="text" value={template.header.title} onChange={(e) => updateSection('header', 'title', e.target.value)} />
                                            </div>
                                            <div className="studio-input-group" style={{ marginTop: '1rem' }}>
                                                <label>Sub-text</label>
                                                <input type="text" value={template.header.subtitle} onChange={(e) => updateSection('header', 'subtitle', e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="studio-sidebar-section">
                                            <div className="studio-input-group">
                                                <label>Left Logo</label>
                                                <input type="file" onChange={(e) => handleFileToDataUrl(e.target.files?.[0], 'leftLogoUrl')} />
                                            </div>
                                            <div className="studio-input-group" style={{ marginTop: '1rem' }}>
                                                <label>Right Logo</label>
                                                <input type="file" onChange={(e) => handleFileToDataUrl(e.target.files?.[0], 'rightLogoUrl')} />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {activeRailTab === 'images' && (
                                    <div className="studio-sidebar-section">
                                        <button className="terminal-btn primary w-full mb-4" onClick={addCustomImage}>+ Add Drag Image</button>
                                        <div className="studio-scroll-area">
                                            {(template.customImages || []).map(img => (
                                                <div key={img.id} className="studio-group-item mb-2" style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem' }}>
                                                    <div className="studio-input-group mb-2">
                                                        <label>Source</label>
                                                        <input type="file" onChange={(e) => handleCustomImageFile(img.id, e.target.files?.[0])} />
                                                    </div>
                                                    <button className="terminal-btn" style={{ width: '100%', justifyContent: 'center', borderColor: '#ef4444', color: '#ef4444' }} onClick={() => removeCustomImage(img.id)}>Remove</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeRailTab === 'columns' && (
                                    <div className="studio-sidebar-section">
                                        <div className="studio-scroll-area">
                                            {previewColumns.map((col) => (
                                                <div key={`col_${col.field_key}`} className="studio-input-group" style={{ marginBottom: '1rem' }}>
                                                    <label>{col.field_key}</label>
                                                    <input type="text" value={template.table.columnLabels?.[col.field_key] ?? col.field_name} onChange={(e) => updateColumnLabel(col.field_key, e.target.value)} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedElement && selectedRect && (
                                    <div className="mt-8 pt-6 border-t border-studio-border">
                                        <h3 style={{ fontSize: '0.75rem', color: 'var(--studio-accent)', textTransform: 'uppercase', marginBottom: '1rem' }}>Properties: {selectedElement.startsWith('img_') ? 'Image' : selectedElement}</h3>
                                        <div className="studio-prop-grid">
                                            <div className="studio-input-group">
                                                <label>X</label>
                                                <input type="number" value={Math.round(selectedRect.x)} onChange={(e) => updateLayoutElement(selectedElement, { x: Number(e.target.value) })} />
                                            </div>
                                            <div className="studio-input-group">
                                                <label>Y</label>
                                                <input type="number" value={Math.round(selectedRect.y)} onChange={(e) => updateLayoutElement(selectedElement, { y: Number(e.target.value) })} />
                                            </div>
                                            <div className="studio-input-group">
                                                <label>W</label>
                                                <input type="number" value={Math.round(selectedRect.w)} onChange={(e) => updateLayoutElement(selectedElement, { w: Number(e.target.value) })} />
                                            </div>
                                            <div className="studio-input-group">
                                                <label>H</label>
                                                <input type="number" value={Math.round(selectedRect.h)} onChange={(e) => updateLayoutElement(selectedElement, { h: Number(e.target.value) })} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        <div className="studio-stage-viewport">
                            <div
                                className="studio-terminal-canvas"
                                style={{
                                    width: `${template.layout.canvasWidth}px`,
                                    height: `${template.layout.canvasHeight}px`,
                                    transform: 'scale(0.8)',
                                    transformOrigin: 'top center',
                                    backgroundImage: template.layout.snapToGrid ? 'radial-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)' : 'none',
                                    backgroundSize: `${template.layout.gridSize}px ${template.layout.gridSize}px`
                                }}
                            >
                                {/* Header Connector Logic */}
                                {template.layout.showConnector && (
                                    <>
                                        <div className="header-connector-box" style={{
                                            left: template.layout.elements.table.x,
                                            top: Math.min(template.layout.elements.leftLogo.y, template.layout.elements.rightLogo.y, template.layout.elements.title.y) - 20,
                                            width: template.layout.elements.table.w,
                                            height: template.layout.elements.table.y - (Math.min(template.layout.elements.leftLogo.y, template.layout.elements.rightLogo.y, template.layout.elements.title.y) - 20)
                                        }} />
                                    </>
                                )}

                                {/* Standard Elements */}
                                {['leftLogo', 'rightLogo', 'title', 'subtitle', 'projectLine', 'submissionDate', 'table'].map(key => {
                                    const rect = template.layout.elements[key];
                                    if (!rect?.visible) return null;
                                    const isSelected = selectedElement === key;

                                    return (
                                        <div
                                            key={key}
                                            onMouseDown={(e) => startInteraction(e, key, 'move')}
                                            style={{
                                                position: 'absolute',
                                                left: `${rect.x}px`,
                                                top: `${rect.y}px`,
                                                width: `${rect.w}px`,
                                                height: `${rect.h}px`,
                                                cursor: 'move',
                                                zIndex: isSelected ? 30 : 10,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}
                                        >
                                            <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {key === 'leftLogo' && (
                                                    <img src={template.header.leftLogoUrl || '/dashboardlogo.png'} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                )}
                                                {key === 'rightLogo' && (
                                                    <img src={template.header.rightLogoUrl || '/dashboardlogo.png'} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                )}
                                                {key === 'title' && (
                                                    <h1 style={{ margin: 0, fontSize: `${rect.fontSize || 24}px`, textAlign: 'center', width: '100%' }}>{template.header.title}</h1>
                                                )}
                                                {key === 'subtitle' && (
                                                    <p style={{ margin: 0, fontSize: `${rect.fontSize || 14}px`, textAlign: 'center', color: '#64748b' }}>{template.header.subtitle}</p>
                                                )}
                                                {key === 'projectLine' && (
                                                    <div style={{ width: '100%', borderBottom: '2px solid #000', paddingBottom: '4px', fontSize: `${rect.fontSize || 12}px` }}>
                                                        {template.header.projectLine}
                                                    </div>
                                                )}
                                                {key === 'submissionDate' && template.header.showSubmissionDate && (
                                                    <div style={{ width: '100%', textAlign: 'right', fontSize: `${rect.fontSize || 11}px` }}>Date: DD.MM.YYYY</div>
                                                )}
                                                {key === 'table' && (
                                                    <div style={{ width: '100%', height: '100%', border: '1px solid #000', padding: '1px' }}>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px' }}>
                                                            <thead>
                                                                <tr style={{ background: template.table.headFillColor, color: template.table.headTextColor }}>
                                                                    {previewColumns.map(c => (
                                                                        <th key={c.field_key} style={{ border: '1px solid #000', padding: '4px' }}>{template.table.columnLabels?.[c.field_key] || c.field_name}</th>
                                                                    ))}
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {[1, 2, 3].map(r => (
                                                                    <tr key={r}>
                                                                        {previewColumns.map(c => <td key={c.field_key} style={{ border: '1px solid #000', padding: '4px' }}>-</td>)}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}
                                            </div>

                                            {isSelected && (
                                                <>
                                                    <div className="tech-block-outline" />
                                                    <div className="tech-drag-handle" style={{ right: -5, bottom: -5 }} onMouseDown={(e) => startInteraction(e, key, 'resize')} />
                                                </>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* Custom Images Layer */}
                                {(template.customImages || []).map(img => (
                                    <div
                                        key={img.id}
                                        onMouseDown={(e) => startInteraction(e, img.id, 'move')}
                                        style={{
                                            position: 'absolute',
                                            left: `${img.x}px`,
                                            top: `${img.y}px`,
                                            width: `${img.w}px`,
                                            height: `${img.h}px`,
                                            cursor: 'move',
                                            zIndex: 25,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: img.url ? 'transparent' : 'rgba(16, 185, 129, 0.05)',
                                            border: selectedElement === img.id ? 'none' : '1px dashed var(--studio-accent)'
                                        }}
                                    >
                                        {img.url ? <img src={img.url} alt="Custom" style={{ maxWidth: '100%', maxHeight: '100%', pointerEvents: 'none' }} /> : <Image size={24} color="var(--studio-accent)" />}
                                        {selectedElement === img.id && (
                                            <>
                                                <div className="tech-block-outline" />
                                                <div className="tech-drag-handle" style={{ right: -5, bottom: -5 }} onMouseDown={(e) => startInteraction(e, img.id, 'resize')} />
                                                <div className="tech-drag-handle" style={{ left: -5, top: -5 }} title="Move Origin" />
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    );
}
