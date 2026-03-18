import { useState, useRef } from 'react';
import { X, Upload, Brush, Send, Camera, MapPin } from 'lucide-react';
import FieldMarkupStudio from './FieldMarkupStudio';

function StatusBadgeStrip({ mode }) {
    const cfg = {
        full: { label: 'AWAITING APPROVAL', bg: '#fffbeb', color: '#b45309', dot: '#f59e0b' },
        conditional: { label: 'AWAITING CONDITIONS', bg: '#fff7ed', color: '#c2410c', dot: '#f97316' },
    }[mode] || { label: 'AWAITING APPROVAL', bg: '#fffbeb', color: '#b45309', dot: '#f59e0b' };

    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.35rem 0.75rem', borderRadius: '999px',
            background: cfg.bg, border: `1px solid ${cfg.dot}22`,
            fontSize: '0.7rem', fontWeight: 700, color: cfg.color,
            letterSpacing: '0.04em'
        }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
            {cfg.label}
        </div>
    );
}

function SectionLabel({ children, right }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {children}
            </label>
            {right && <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{right}</span>}
        </div>
    );
}

function PillTag({ children }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.3rem 0.75rem', borderRadius: '8px',
            background: '#f1f5f9', border: '1px solid #e2e8f0',
            fontSize: '0.78rem', color: '#334155', fontWeight: 600,
        }}>
            {children}
        </span>
    );
}

export default function ApproveModal({ rfi, onApprove, onClose, contractors = [], mode = 'full' }) {
    const [remarks, setRemarks] = useState('');
    const [files, setFiles] = useState([]);
    const [markupIndex, setMarkupIndex] = useState(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef(null);

    function toMentionKey(name) { return name.toLowerCase().replace(/\s+/g, ''); }
    function appendMention(name) {
        const mention = `@${toMentionKey(name)}`;
        setRemarks(prev => (prev.trim().length ? `${prev} ${mention}` : mention));
    }
    function handleSubmit(e) {
        e?.preventDefault();
        onApprove(rfi.id, remarks.trim(), files, mode === 'conditional' ? 'conditional_approve' : 'approved');
        onClose();
    }
    function getPreviewUrl(file) { return typeof file === 'string' ? file : URL.createObjectURL(file); }
    function removeFile(index) { setFiles(prev => prev.filter((_, i) => i !== index)); }
    function replaceFile(index, newFile) { setFiles(prev => prev.map((f, i) => i === index ? newFile : f)); }
    function addFiles(incoming) { setFiles(prev => [...prev, ...Array.from(incoming)]); }

    const markupImage = markupIndex !== null ? files[markupIndex] : null;
    const isConditional = mode === 'conditional';
    const accentColor = isConditional ? '#f97316' : '#059669';
    const accentBg = isConditional ? '#fff7ed' : '#ecfdf5';
    const focusShadow = isConditional ? 'rgba(249,115,22,0.15)' : 'rgba(5,150,105,0.15)';
    const title = isConditional ? 'Conditionally Approve' : 'Approve Inspection';
    const confirmLabel = isConditional ? 'Confirm Conditions' : 'Confirm Approval';

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div
                className="modal-content review-action-modal"
                onClick={e => e.stopPropagation()}
            >
                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="ram-header">
                    <div>
                        <div className="ram-title-row">
                            <h3 className="ram-title">{title}</h3>
                            <StatusBadgeStrip mode={mode} />
                        </div>
                        <div className="ram-subtitle">
                            <strong>RFI #{rfi.customFields?.rfi_no || rfi.serialNo}</strong>
                            {rfi.location && <><span className="ram-dot">·</span><MapPin size={12} />{rfi.location}</>}
                        </div>
                    </div>
                    <button className="ram-close" onClick={onClose}><X size={18} /></button>
                </div>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div className="ram-body">
                    {/* Pills */}
                    <div className="ram-pills">
                        <PillTag><span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>TYPE</span> {rfi.inspectionType}</PillTag>
                        <PillTag><span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>FILED BY</span> <span style={{ width:20, height:20, borderRadius:'50%', background:'#3b82f6', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', color:'#fff', fontWeight:700 }}>{(rfi.filerName||'?')[0].toUpperCase()}</span>{rfi.filerName}</PillTag>
                    </div>

                    {/* Remarks */}
                    <div className="ram-field">
                        <SectionLabel right="Markdown supported">
                            {isConditional ? 'Conditions / Remarks (Required)' : 'Approval Remarks (Optional)'}
                        </SectionLabel>
                        <textarea
                            className="ram-textarea"
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                            rows={4}
                            autoFocus
                            placeholder={`Add ${isConditional ? 'conditions' : 'approval'} notes and optionally tag contractors using @...`}
                            onFocus={e => { e.target.style.borderColor = accentColor; e.target.style.boxShadow = `0 0 0 3px ${focusShadow}`; }}
                            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                        />
                        {contractors.length > 0 && (
                            <div className="ram-mentions">
                                {contractors.slice(0, 10).map(c => (
                                    <button key={c.id} type="button" className="ram-mention-chip" onClick={() => appendMention(c.name)}>
                                        @{toMentionKey(c.name)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Evidence Photos */}
                    <div className="ram-field">
                        <SectionLabel right={<button type="button" className="ram-add-photo-btn" onClick={() => fileInputRef.current?.click()}><Camera size={14} /> Add Photos</button>}>
                            Evidence Photos (Optional)
                        </SectionLabel>
                        <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }}
                            onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />

                        {files.length === 0 ? (
                            <div
                                className={`ram-dropzone ${isDragOver ? 'drag-over' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={e => { e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
                            >
                                <div className="ram-dropzone-icon"><Upload size={22} /></div>
                                <p className="ram-dropzone-title">Drag and drop files here</p>
                                <p className="ram-dropzone-sub">JPG, PNG or PDF (Max 10MB per file)</p>
                            </div>
                        ) : (
                            <div className="ram-thumbs">
                                {files.map((file, idx) => (
                                    <div key={idx} className="ram-thumb-wrap">
                                        <img src={getPreviewUrl(file)} alt={`Evidence ${idx + 1}`} className="ram-thumb" />
                                        <div className="ram-thumb-overlay">
                                            <button type="button" className="ram-thumb-btn" onClick={() => setMarkupIndex(idx)}><Brush size={13} /></button>
                                            <button type="button" className="ram-thumb-btn ram-thumb-del" onClick={() => removeFile(idx)}><X size={13} /></button>
                                        </div>
                                    </div>
                                ))}
                                <div className="ram-thumb-add" onClick={() => fileInputRef.current?.click()}><Upload size={18} /></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────────────────── */}
                <div className="ram-footer">
                    <button type="button" className="ram-btn-ghost" onClick={onClose}>Keep Pending</button>
                    <button
                        type="button"
                        className="ram-btn-primary"
                        style={{ background: accentColor, opacity: (isConditional && !remarks.trim()) ? 0.5 : 1, cursor: (isConditional && !remarks.trim()) ? 'not-allowed' : 'pointer' }}
                        disabled={isConditional && !remarks.trim()}
                        onClick={handleSubmit}
                    >
                        <Send size={15} /> {confirmLabel}
                    </button>
                </div>
            </div>

            {markupIndex !== null && markupImage && (
                <FieldMarkupStudio image={markupImage} onClose={() => setMarkupIndex(null)}
                    onSave={annotatedFile => { replaceFile(markupIndex, annotatedFile); setMarkupIndex(null); }} />
            )}
        </div>
    );
}
