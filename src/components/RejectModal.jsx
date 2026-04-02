import { useState, useRef, useMemo } from 'react';
import { X, Upload, Brush, Send, Camera, MapPin, RefreshCw } from 'lucide-react';
import FieldMarkupStudio from './FieldMarkupStudio';

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
            background: 'var(--clr-bg-hover)', border: '1px solid var(--clr-border)',
            fontSize: '0.78rem', color: 'var(--clr-text-main)', fontWeight: 600,
        }}>
            {children}
        </span>
    );
}

export default function RejectModal({ rfi, onReject, onClose, contractors = [] }) {
    const [remarks, setRemarks] = useState('');
    const [files, setFiles] = useState([]);

    const [markupIndex, setMarkupIndex] = useState(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef(null);

    const mergedData = useMemo(() => {
        if (!rfi) return {};
        return {
            description: rfi.description || '',
            location: rfi.location || '',
            inspection_type: rfi.inspectionType || rfi.inspection_type || '',
            ...(rfi.customFields || {})
        };
    }, [rfi]);

    function toMentionKey(name) { return name.toLowerCase().replace(/\s+/g, ''); }
    function appendMention(name) {
        const mention = `@${toMentionKey(name)}`;
        setRemarks(prev => (prev.trim().length ? `${prev} ${mention}` : mention));
    }
    async function handleSubmit() {
        if (isSubmitting) return;
        setIsSubmitting(true);

        try {
            await onReject(rfi.id, remarks.trim(), files, null);
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    }
    function getPreviewUrl(file) { return typeof file === 'string' ? file : URL.createObjectURL(file); }
    function removeFile(index) { setFiles(prev => prev.filter((_, i) => i !== index)); }
    function replaceFile(index, newFile) { setFiles(prev => prev.map((f, i) => i === index ? newFile : f)); }
    function addFiles(incoming) { setFiles(prev => [...prev, ...Array.from(incoming)]); }

    const markupImage = markupIndex !== null ? files[markupIndex] : null;
    const canSubmit = remarks.trim().length > 0;

    return (
        <div className="modal-overlay" onClick={() => { if (!isSubmitting) onClose(); }} style={{ zIndex: 1100 }}>
            <div className="modal-content review-action-modal" onClick={e => e.stopPropagation()}>

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="ram-header">
                    <div>
                        <div className="ram-title-row">
                            <h3 className="ram-title">Reject Inspection</h3>
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.35rem 0.75rem', borderRadius: '999px',
                                background: '#fef2f2', border: '1px solid #fca5a522',
                                fontSize: '0.7rem', fontWeight: 700, color: '#b91c1c', letterSpacing: '0.04em'
                            }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                                REJECTION REQUIRED
                            </div>
                        </div>
                        <div className="ram-subtitle">
                            <strong>RFI #{rfi.customFields?.rfi_no || rfi.serialNo}</strong>
                            {mergedData.location && <><span className="ram-dot">·</span><MapPin size={12} />{mergedData.location}</>}
                        </div>
                    </div>
                    <button className="ram-close" onClick={onClose} disabled={isSubmitting}><X size={18} /></button>
                </div>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div className="ram-body">
                    {/* Pills */}
                    <div className="ram-pills">
                        {mergedData.inspection_type && <PillTag><span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>TYPE</span> {mergedData.inspection_type}</PillTag>}
                        <PillTag><span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>FILED BY</span> <span style={{ width:20, height:20, borderRadius:'50%', background:'#3b82f6', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', color:'#fff', fontWeight:700 }}>{(rfi.filerName||'?')[0].toUpperCase()}</span>{rfi.filerName}</PillTag>
                    </div>



                    {/* Corrective Actions */}
                    <div className="ram-field">
                        <SectionLabel right="Markdown supported">Corrective Actions Needed <span style={{ color: '#ef4444' }}>*</span></SectionLabel>
                        <textarea
                            className="ram-textarea"
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                            rows={4}
                            autoFocus
                            placeholder="Detail exactly what needs to be fixed. Mention specific contractors using @..."
                            onFocus={e => { e.target.style.borderColor = 'var(--clr-danger)'; e.target.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.1)'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--clr-border)'; e.target.style.boxShadow = 'none'; }}
                        />
                        {contractors.length > 0 && (
                            <div className="ram-mentions">
                                {contractors.slice(0, 10).map(c => (
                                    <button key={c.id} type="button" className="ram-mention-chip" onClick={() => appendMention(c.name)} disabled={isSubmitting}>
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
                        <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }} disabled={isSubmitting}
                            onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />

                        {files.length === 0 ? (
                            <div
                                className={`ram-dropzone ${isDragOver ? 'drag-over' : ''}`}
                                onClick={() => { if (!isSubmitting) fileInputRef.current?.click(); }}
                                onDragOver={e => { if (isSubmitting) return; e.preventDefault(); setIsDragOver(true); }}
                                onDragLeave={() => setIsDragOver(false)}
                                onDrop={e => { if (isSubmitting) return; e.preventDefault(); setIsDragOver(false); addFiles(e.dataTransfer.files); }}
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
                                            <button type="button" className="ram-thumb-btn" onClick={() => setMarkupIndex(idx)} disabled={isSubmitting}><Brush size={13} /></button>
                                            <button type="button" className="ram-thumb-btn ram-thumb-del" onClick={() => removeFile(idx)} disabled={isSubmitting}><X size={13} /></button>
                                        </div>
                                    </div>
                                ))}
                                <div className="ram-thumb-add" onClick={() => { if (!isSubmitting) fileInputRef.current?.click(); }}><Upload size={18} /></div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────────────────── */}
                <div className="ram-footer">
                    <button type="button" className="ram-btn-ghost" onClick={onClose} disabled={isSubmitting}>Keep Pending</button>
                    <button
                        type="button"
                        className="ram-btn-primary"
                        style={{ background: canSubmit ? 'var(--clr-danger)' : 'var(--clr-danger-bg)', cursor: canSubmit ? 'pointer' : 'not-allowed', color: canSubmit ? '#fff' : 'var(--clr-danger)' }}
                        disabled={!canSubmit || isSubmitting}
                        onClick={handleSubmit}
                    >
                        {isSubmitting ? <RefreshCw size={15} className="spin-slow" /> : <Send size={15} />} {isSubmitting ? 'Submitting...' : 'Confirm Rejection'}
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
