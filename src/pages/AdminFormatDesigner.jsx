import { useEffect, useMemo, useState } from 'react';
import { FileText, Move, Save, RotateCcw, Image, Columns, Settings, Layers, X, Square, Circle, Minus } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../components/Header';
import { useProject } from '../context/ProjectContext';

const CANVAS_WIDTH = 1200;

const DEFAULT_TEMPLATE = {
    elements: [
        { id: 'master_table', type: 'table', x: 40, y: 300, w: 1120, h: 1000, zIndex: 10 },
        { id: 'default_title', type: 'text', content: 'RFI SUMMARY', x: 300, y: 40, w: 600, h: 50, styles: { fontSize: 32, fontWeight: 800, textAlign: 'center' }, zIndex: 20 },
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
        width: CANVAS_WIDTH,
        height: 1600,
        showGrid: true,
        snapToGrid: true,
    }
};

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

    useEffect(() => {
        if (activeProject?.export_template) {
            setTemplate(activeProject.export_template);
        }
    }, [activeProject?.id, activeProject?.export_template]);

    const previewColumns = useMemo(() => {
        return (orderedTableColumns || []).filter((c) => c.field_key !== 'actions');
    }, [orderedTableColumns]);

    const previewHeaderKeys = useMemo(() => previewColumns.map((c) => c.field_key), [previewColumns]);

    const addElement = (type, defaults = {}) => {
        const id = 'el_' + Date.now();
        const newEl = {
            id,
            type,
            x: 100,
            y: 100,
            w: 200,
            h: 50,
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
        return (template.tableConfig.groupedHeaders || [])
            .map((g) => {
                const start = previewHeaderKeys.indexOf(g.fromKey);
                const end = previewHeaderKeys.indexOf(g.toKey);
                if (start < 0 || end < 0 || end <= start) return null;
                return { ...g, start, end, span: end - start + 1 };
            })
            .filter(Boolean)
            .sort((a, b) => a.start - b.start);
    }, [template.tableConfig.groupedHeaders, previewHeaderKeys]);

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
            const grid = template.canvas.snapToGrid ? 8 : 1;
            const el = interaction.startRect;
            if (interaction.mode === 'move') {
                updateElement(interaction.id, { x: snap(el.x + dx, grid, true), y: snap(el.y + dy, grid, true) });
            } else if (interaction.mode === 'resize') {
                const h = interaction.handle;
                let { x, y, w, h: height } = el;
                if (h.includes('e')) w = snap(el.w + dx, grid, true);
                if (h.includes('s')) height = snap(el.h + dy, grid, true);
                if (h.includes('w')) { const nextW = snap(el.w - dx, grid, true); if (nextW > 10) { x = snap(el.x + (el.w - nextW), grid, true); w = nextW; } }
                if (h.includes('n')) { const nextH = snap(el.h - dy, grid, true); if (nextH > 10) { y = snap(el.y + (el.h - nextH), grid, true); height = nextH; } }
                updateElement(interaction.id, { x, y, w, h: height });
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
    }, [interaction, zoom, template.canvas.snapToGrid]);

    const handleSave = async () => {
        setSaving(true);
        const result = await saveProjectExportTemplate(template);
        setSaving(false);
        if (result?.success) toast.success('Studio design deployed');
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
                        <button className="terminal-btn" onClick={() => setTemplate(DEFAULT_TEMPLATE)}><RotateCcw size={14} /> Reset</button>
                        <button className="terminal-btn primary" onClick={handleSave} disabled={saving}><Save size={14} /> {saving ? 'Saving...' : 'Deploy'}</button>
                    </div>
                </header>

                <div className="format-studio-layout h-full">
                    <aside className="studio-vertical-rail">
                        <div className={ail-item } onClick={() => {setActiveRailTab('branding'); setDrawerOpen(true);}} title="Text & Elements"><FileText size={22} /></div>
                        <div className={ail-item } onClick={() => {setActiveRailTab('shapes'); setDrawerOpen(true);}} title="Shapes Library"><Square size={22} /></div>
                        <div className={ail-item } onClick={() => {setActiveRailTab('images'); setDrawerOpen(true);}} title="Images"><Image size={22} /></div>
                        <div className={ail-item } onClick={() => {setActiveRailTab('columns'); setDrawerOpen(true);}} title="Table Columns"><Columns size={22} /></div>
                    </aside>

                    <main className="studio-main-stage">
                        <section className={studio-internal-drawer }>
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
                                            <button className="terminal-btn" onClick={() => bringToFront(selectedId)}>Layer ?</button>
                                            <button className="terminal-btn" onClick={() => sendToBack(selectedId)}>Layer ?</button>
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
                                                            <tr>{previewColumns.slice(0, 10).map(c => <th key={c.field_key} style={{ border: '1px solid #000', padding: '4px' }}>{template.tableConfig.columnLabels?.[c.field_key] || c.field_name}</th>)}</tr>
                                                        </thead>
                                                        <tbody>{[1,2,3,4,5].map(r => <tr key={r}>{previewColumns.slice(0, 10).map(c => <td key={c.field_key} style={{ border: '1px solid #000', padding: '4px' }}>&nbsp;</td>)}</tr>)}</tbody>
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