import { useEffect, useMemo, useState } from 'react';
import { FileText, Move, Save, RotateCcw } from 'lucide-react';
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
        canvasHeight: CANVAS_HEIGHT,
        gridSize: 8,
        snapToGrid: true,
        elements: {
            leftLogo: { x: 20, y: 20, w: 140, h: 46, visible: true },
            rightLogo: { x: 1040, y: 20, w: 140, h: 46, visible: true },
            title: { x: 420, y: 18, w: 360, h: 36, fontSize: 30, visible: true },
            subtitle: { x: 420, y: 56, w: 360, h: 24, fontSize: 14, visible: true },
            projectLine: { x: 380, y: 82, w: 440, h: 22, fontSize: 12, visible: true },
            submissionDate: { x: 960, y: 86, w: 220, h: 20, fontSize: 11, visible: true },
            table: { x: 20, y: 142, w: 1160, h: 150, visible: true },
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

    function updateLayoutElement(key, patch) {
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
        const startRect = template.layout.elements[elementKey];
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
        reader.onload = () => updateSection('header', sectionKey, String(reader.result || ''));
        reader.readAsDataURL(file);
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

    const selectedRect = template.layout.elements[selectedElement] || null;
    const tableElement = template.layout.elements.table;

    return (
        <div className="page-wrapper">
            <Header />
            <main className="admin-page format-studio-page">
                <div className="sheet-header format-studio-header">
                    <div>
                        <h1><FileText size={24} /> Project Export Format</h1>
                        <p className="subtitle" style={{ marginTop: '0.25rem' }}>
                            Canva-style editor: drag and resize each block, then export the same project format for contractor and consultant.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.6rem' }}>
                        <button className="btn btn-ghost btn-sm" onClick={handleReset}>
                            <RotateCcw size={15} /> Reset
                        </button>
                        <button className="btn btn-sm" onClick={handleSave} disabled={saving} style={{ background: 'var(--clr-brand-secondary)', color: '#fff', border: 'none' }}>
                            <Save size={15} /> {saving ? 'Saving...' : 'Save Format'}
                        </button>
                    </div>
                </div>

                <div className="admin-section format-studio-layout">
                    <section className="format-studio-sidebar">
                        <h3 style={{ marginBottom: '0.65rem' }}>Canvas Settings</h3>
                        <div style={{ display: 'grid', gap: '0.55rem', marginBottom: '0.85rem' }}>
                            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem' }}>
                                <input
                                    type="checkbox"
                                    checked={template.layout.snapToGrid}
                                    onChange={(e) => updateSection('layout', 'snapToGrid', e.target.checked)}
                                />
                                Snap to grid
                            </label>
                            <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.85rem' }}>
                                Grid size
                                <input
                                    type="number"
                                    min={2}
                                    max={40}
                                    value={template.layout.gridSize}
                                    onChange={(e) => updateSection('layout', 'gridSize', Number(e.target.value || 8))}
                                />
                            </label>
                        </div>

                        <h3 style={{ marginBottom: '0.65rem' }}>Header Content</h3>
                        <div style={{ display: 'grid', gap: '0.55rem', marginBottom: '0.9rem' }}>
                            <input type="text" value={template.header.title} placeholder="Title" onChange={(e) => updateSection('header', 'title', e.target.value)} />
                            <input type="text" value={template.header.subtitle} placeholder="Subtitle" onChange={(e) => updateSection('header', 'subtitle', e.target.value)} />
                            <input type="text" value={template.header.projectLine} placeholder="Project line" onChange={(e) => updateSection('header', 'projectLine', e.target.value)} />
                            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem' }}>
                                <input
                                    type="checkbox"
                                    checked={template.header.showSubmissionDate}
                                    onChange={(e) => updateSection('header', 'showSubmissionDate', e.target.checked)}
                                />
                                Show submission date
                            </label>
                            <input type="text" value={template.header.leftLogoUrl} placeholder="Left logo URL" onChange={(e) => updateSection('header', 'leftLogoUrl', e.target.value)} />
                            <input type="file" accept="image/*" onChange={(e) => handleFileToDataUrl(e.target.files?.[0], 'leftLogoUrl')} />
                            <input type="text" value={template.header.rightLogoUrl} placeholder="Right logo URL" onChange={(e) => updateSection('header', 'rightLogoUrl', e.target.value)} />
                            <input type="file" accept="image/*" onChange={(e) => handleFileToDataUrl(e.target.files?.[0], 'rightLogoUrl')} />
                        </div>

                        <h3 style={{ marginBottom: '0.65rem' }}>Table Headings</h3>
                        <div style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.9rem', maxHeight: '180px', overflowY: 'auto' }}>
                            {previewColumns.map((col) => (
                                <div key={`col_${col.field_key}`} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.4rem', alignItems: 'center' }}>
                                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{col.field_key}</div>
                                    <input
                                        type="text"
                                        value={template.table.columnLabels?.[col.field_key] ?? col.field_name}
                                        onChange={(e) => updateColumnLabel(col.field_key, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>

                        <h3 style={{ marginBottom: '0.65rem' }}>Grouped Headings</h3>
                        <div style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.65rem' }}>
                            {(template.table.groupedHeaders || []).map((group, i) => (
                                <div key={`grp_${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.35rem', alignItems: 'center' }}>
                                    <input
                                        value={group.title || ''}
                                        onChange={(e) => updateGroupedHeader(i, 'title', e.target.value)}
                                        placeholder="Group title"
                                    />
                                    <select value={group.fromKey} onChange={(e) => updateGroupedHeader(i, 'fromKey', e.target.value)}>
                                        {previewColumns.map((c) => <option key={`gf_${i}_${c.field_key}`} value={c.field_key}>{c.field_name}</option>)}
                                    </select>
                                    <select value={group.toKey} onChange={(e) => updateGroupedHeader(i, 'toKey', e.target.value)}>
                                        {previewColumns.map((c) => <option key={`gt_${i}_${c.field_key}`} value={c.field_key}>{c.field_name}</option>)}
                                    </select>
                                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--clr-danger)' }} onClick={() => removeGroupedHeader(i)}>Remove</button>
                                </div>
                            ))}
                            <button className="btn btn-sm btn-ghost" onClick={addGroupedHeader}>Add Grouped Header</button>
                        </div>

                        {selectedRect && (
                            <>
                                <h3 style={{ marginBottom: '0.65rem' }}>Selected Block: {selectedElement}</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.78rem' }}>
                                        X
                                        <input type="number" value={selectedRect.x} onChange={(e) => updateLayoutElement(selectedElement, { x: Number(e.target.value || 0) })} />
                                    </label>
                                    <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.78rem' }}>
                                        Y
                                        <input type="number" value={selectedRect.y} onChange={(e) => updateLayoutElement(selectedElement, { y: Number(e.target.value || 0) })} />
                                    </label>
                                    <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.78rem' }}>
                                        Width
                                        <input type="number" value={selectedRect.w} onChange={(e) => updateLayoutElement(selectedElement, { w: Number(e.target.value || 0) })} />
                                    </label>
                                    <label style={{ display: 'grid', gap: '0.2rem', fontSize: '0.78rem' }}>
                                        Height
                                        <input type="number" value={selectedRect.h} onChange={(e) => updateLayoutElement(selectedElement, { h: Number(e.target.value || 0) })} />
                                    </label>
                                </div>
                            </>
                        )}
                    </section>

                    <section className="format-studio-canvas-panel">
                        <div className="format-studio-toolbar">
                            <Move size={16} /> Drag blocks, resize from bottom-right handle.
                        </div>
                        <div className="format-studio-canvas-scroll">
                            <div
                                className="format-studio-canvas"
                                style={{
                                    width: `${template.layout.canvasWidth}px`,
                                    height: `${template.layout.canvasHeight}px`,
                                    position: 'relative',
                                    margin: '1rem',
                                    background: '#ffffff',
                                    backgroundImage: template.layout.snapToGrid ? 'linear-gradient(to right, rgba(100,116,139,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.12) 1px, transparent 1px)' : 'none',
                                    backgroundSize: `${template.layout.gridSize}px ${template.layout.gridSize}px`,
                                }}
                            >
                                {['leftLogo', 'rightLogo', 'title', 'subtitle', 'projectLine', 'submissionDate', 'table'].map((key) => {
                                    const box = template.layout.elements[key];
                                    if (!box?.visible) return null;
                                    const isSelected = selectedElement === key;
                                    return (
                                        <div
                                            key={key}
                                            onMouseDown={(e) => startInteraction(e, key, 'move')}
                                            onClick={() => setSelectedElement(key)}
                                            style={{
                                                position: 'absolute',
                                                left: `${box.x}px`,
                                                top: `${box.y}px`,
                                                width: `${box.w}px`,
                                                height: `${box.h}px`,
                                                border: isSelected ? '2px solid #2563eb' : '1px dashed #94a3b8',
                                                background: key === 'table' ? '#ffffff' : 'rgba(255,255,255,0.85)',
                                                cursor: 'move',
                                                overflow: 'hidden',
                                                userSelect: 'none',
                                            }}
                                        >
                                            {key === 'leftLogo' && (
                                                <img src={template.header.leftLogoUrl || '/dashboardlogo.png'} alt="Left" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            )}
                                            {key === 'rightLogo' && (
                                                <img src={template.header.rightLogoUrl || '/dashboardlogo.png'} alt="Right" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            )}
                                            {key === 'title' && (
                                                <div style={{ fontSize: `${box.fontSize || 30}px`, fontWeight: 700, textAlign: 'center' }}>{template.header.title || 'RFI Summary'}</div>
                                            )}
                                            {key === 'subtitle' && (
                                                <div style={{ fontSize: `${box.fontSize || 14}px`, textAlign: 'center' }}>{template.header.subtitle || 'Subtitle'}</div>
                                            )}
                                            {key === 'projectLine' && (
                                                <div style={{ fontSize: `${box.fontSize || 12}px`, textAlign: 'center' }}>{template.header.projectLine || activeProject?.name || 'Project Line'}</div>
                                            )}
                                            {key === 'submissionDate' && template.header.showSubmissionDate && (
                                                <div style={{ fontSize: `${box.fontSize || 11}px`, textAlign: 'right' }}>Submission Date: DD.MM.YYYY</div>
                                            )}
                                            {key === 'table' && (
                                                <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                                    <thead>
                                                        {previewGroupedHeaders.length > 0 && (
                                                            <tr style={{ background: template.table.headFillColor, color: template.table.headTextColor }}>
                                                                {(() => {
                                                                    const cells = [];
                                                                    let idx = 0;
                                                                    while (idx < previewColumns.length) {
                                                                        const group = previewGroupedHeaders.find((g) => g.start === idx);
                                                                        if (group) {
                                                                            cells.push(
                                                                                <th key={`pg_${idx}`} colSpan={group.span} style={{ border: '1px solid #0f172a', padding: '0.2rem', fontSize: `${template.table.headFontSize}px` }}>{group.title}</th>
                                                                            );
                                                                            idx += group.span;
                                                                        } else {
                                                                            cells.push(
                                                                                <th key={`ps_${idx}`} rowSpan={2} style={{ border: '1px solid #0f172a', padding: '0.2rem', fontSize: `${template.table.headFontSize}px` }}>{previewHeaderNameMap[previewColumns[idx].field_key]}</th>
                                                                            );
                                                                            idx += 1;
                                                                        }
                                                                    }
                                                                    return cells;
                                                                })()}
                                                            </tr>
                                                        )}
                                                        <tr style={{ background: template.table.headFillColor, color: template.table.headTextColor }}>
                                                            {previewColumns
                                                                .filter((col) => previewGroupedHeaders.length === 0 || previewGroupedHeaders.some((g) => {
                                                                    const index = previewHeaderKeys.indexOf(col.field_key);
                                                                    return index >= g.start && index <= g.end;
                                                                }))
                                                                .map((col) => (
                                                                    <th
                                                                        key={`ph_${col.field_key}`}
                                                                        onDoubleClick={() => {
                                                                            const next = window.prompt('Rename heading', previewHeaderNameMap[col.field_key]);
                                                                            if (next !== null) updateColumnLabel(col.field_key, next);
                                                                        }}
                                                                        style={{ border: '1px solid #0f172a', padding: '0.2rem', fontSize: `${template.table.headFontSize}px` }}
                                                                        title="Double-click to rename"
                                                                    >
                                                                        {previewHeaderNameMap[col.field_key]}
                                                                    </th>
                                                                ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            {previewColumns.map((col) => (
                                                                <td key={`pv_${col.field_key}`} style={{ border: '1px solid #0f172a', padding: '0.2rem', fontSize: `${template.table.bodyFontSize}px` }}>
                                                                    {col.field_key === 'serial' ? '1' : `Sample ${previewHeaderNameMap[col.field_key]}`}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            )}

                                            {isSelected && (
                                                <span
                                                    onMouseDown={(e) => startInteraction(e, key, 'resize')}
                                                    style={{
                                                        position: 'absolute',
                                                        right: 0,
                                                        bottom: 0,
                                                        width: '12px',
                                                        height: '12px',
                                                        background: '#2563eb',
                                                        cursor: 'nwse-resize',
                                                    }}
                                                />
                                            )}
                                        </div>
                                    );
                                })}

                                <div
                                    style={{
                                        position: 'absolute',
                                        left: 0,
                                        top: `${tableElement?.y ? tableElement.y - 6 : 136}px`,
                                        right: 0,
                                        borderTop: '2px dashed rgba(2,132,199,0.7)',
                                        pointerEvents: 'none',
                                    }}
                                />
                            </div>
                        </div>
                    </section>
                </div>
            </main>
        </div>
    );
}
