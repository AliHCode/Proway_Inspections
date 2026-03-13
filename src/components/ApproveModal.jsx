import { useState, useRef } from 'react';
import { X, CheckCircle2, Upload, Brush, Send, Tag, User, Camera } from 'lucide-react';
import ImageMarkupModal from './ImageMarkupModal';

export default function ApproveModal({ rfi, onApprove, onClose, contractors = [] }) {
    const [remarks, setRemarks] = useState('');
    const [files, setFiles] = useState([]);
    const [markupIndex, setMarkupIndex] = useState(null);
    const fileInputRef = useRef(null);

    function toMentionKey(name) {
        return name.toLowerCase().replace(/\s+/g, '');
    }

    function appendMention(name) {
        const mention = `@${toMentionKey(name)}`;
        setRemarks((prev) => (prev.trim().length ? `${prev} ${mention}` : mention));
    }

    function handleSubmit(e) {
        e.preventDefault();
        const confirmed = window.confirm('Confirm approval for this inspection?');
        if (!confirmed) return;
        onApprove(rfi.id, remarks.trim(), files);
        onClose();
    }

    function getPreviewUrl(file) {
        if (typeof file === 'string') return file;
        return URL.createObjectURL(file);
    }

    function removeFile(index) {
        setFiles((prev) => prev.filter((_, i) => i !== index));
    }

    function replaceFile(index, newFile) {
        setFiles((prev) => prev.map((f, i) => (i === index ? newFile : f)));
    }

    const markupImage = markupIndex !== null ? files[markupIndex] : null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '600px',
                    width: '95%',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '85vh',
                    boxShadow: 'var(--shadow-float)'
                }}
            >
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid var(--clr-border)',
                    background: 'linear-gradient(180deg, #ffffff, #f8fafc)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: 'var(--clr-success-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <CheckCircle2 size={20} color="var(--clr-success)" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--clr-text-main)' }}>
                                Approve Inspection
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--clr-text-secondary)' }}>
                                RFI #{rfi.serialNo} · {rfi.location}
                            </p>
                        </div>
                    </div>
                    <button className="btn-close" onClick={onClose}>
                        <X size={20} color="var(--clr-text-secondary)" />
                    </button>
                </div>

                <div style={{
                    padding: '1.5rem',
                    overflowY: 'auto',
                    flex: 1,
                    background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)'
                }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                            padding: '0.4rem 0.75rem', borderRadius: '8px',
                            background: '#fff', border: '1px solid var(--clr-border)',
                            fontSize: '0.8rem', color: 'var(--clr-text-main)', fontWeight: 500,
                        }}>
                            <Tag size={14} color="var(--clr-text-muted)" /> {rfi.inspectionType}
                        </span>
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                            padding: '0.4rem 0.75rem', borderRadius: '8px',
                            background: '#fff', border: '1px solid var(--clr-border)',
                            fontSize: '0.8rem', color: 'var(--clr-text-main)', fontWeight: 500,
                        }}>
                            <User size={14} color="var(--clr-text-muted)" /> {rfi.filerName}
                        </span>
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--clr-text-main)', marginBottom: '0.5rem' }}>
                            Approval Remarks (optional)
                        </label>
                        <textarea
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            rows={5}
                            autoFocus
                            placeholder="Add approved notes and optionally tag contractors using @..."
                            style={{
                                width: '100%', padding: '1rem', borderRadius: '12px',
                                border: '1px solid var(--clr-border)',
                                background: '#fff',
                                fontSize: '0.95rem', lineHeight: '1.6', resize: 'none',
                                fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                transition: 'all 0.2s',
                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                            }}
                            onFocus={e => {
                                e.target.style.borderColor = 'var(--clr-success)';
                                e.target.style.boxShadow = '0 0 0 3px rgba(5, 150, 105, 0.1)';
                            }}
                            onBlur={e => {
                                e.target.style.borderColor = 'var(--clr-border)';
                                e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.02)';
                            }}
                        />
                        {contractors.length > 0 && (
                            <div style={{ marginTop: '0.75rem' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                    {contractors.slice(0, 10).map((c) => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => appendMention(c.name)}
                                            style={{
                                                padding: '0.25rem 0.65rem', fontSize: '0.75rem', borderRadius: '6px',
                                                border: '1px solid var(--clr-border)', background: '#fff',
                                                color: 'var(--clr-text-secondary)', cursor: 'pointer', fontFamily: 'inherit',
                                                transition: 'all 0.15s'
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.background = 'var(--clr-bg-hover)';
                                                e.currentTarget.style.borderColor = 'var(--clr-text-muted)';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = '#fff';
                                                e.currentTarget.style.borderColor = 'var(--clr-border)';
                                            }}
                                        >
                                            @{toMentionKey(c.name)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--clr-text-main)' }}>
                                Evidence Photos (optional)
                            </label>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    fontSize: '0.8rem', color: 'var(--clr-info)', background: 'transparent',
                                    border: 'none', fontWeight: 600, cursor: 'pointer'
                                }}
                            >
                                <Camera size={14} /> Add Photos
                            </button>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const incoming = Array.from(e.target.files || []);
                                setFiles((prev) => [...prev, ...incoming]);
                                e.target.value = '';
                            }}
                        />

                        {files.length === 0 ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    border: '1.5px dashed var(--clr-border)', borderRadius: '12px',
                                    padding: '2rem 1rem', textAlign: 'center', cursor: 'pointer',
                                    background: 'rgba(248, 250, 252, 0.5)', transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--clr-text-muted)'; e.currentTarget.style.background = 'var(--clr-bg-hover)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--clr-border)'; e.currentTarget.style.background = 'rgba(248, 250, 252, 0.5)'; }}
                            >
                                <Upload size={24} color="var(--clr-text-muted)" style={{ marginBottom: '0.5rem' }} />
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--clr-text-secondary)' }}>
                                    Upload approval evidence snapshots
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                {files.map((file, idx) => (
                                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{
                                            position: 'relative', width: '90px', height: '90px', borderRadius: '10px',
                                            overflow: 'hidden', border: '1px solid var(--clr-border)',
                                            boxShadow: 'var(--shadow-sm)'
                                        }}>
                                            <img src={getPreviewUrl(file)} alt={`Evidence ${idx + 1}`}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            <div style={{
                                                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.2)',
                                                opacity: 0, transition: 'opacity 0.2s', display: 'flex',
                                                alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                                            }} className="desktop-hover-only" onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                                                <button type="button" onClick={() => setMarkupIndex(idx)}
                                                    style={{
                                                        width: '28px', height: '28px', borderRadius: '6px', border: 'none',
                                                        background: '#fff', color: 'var(--clr-text-main)', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        boxShadow: 'var(--shadow-sm)'
                                                    }}>
                                                    <Brush size={14} />
                                                </button>
                                                <button type="button" onClick={() => removeFile(idx)}
                                                    style={{
                                                        width: '28px', height: '28px', borderRadius: '6px', border: 'none',
                                                        background: '#fff', color: 'var(--clr-danger)', cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        boxShadow: 'var(--shadow-sm)'
                                                    }}>
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mobile-only-flex" style={{ display: 'none', justifyContent: 'center', gap: '12px' }}>
                                            <button type="button" onClick={() => setMarkupIndex(idx)}
                                                style={{ background: 'transparent', border: 'none', color: 'var(--clr-info)', padding: '4px' }}>
                                                <Brush size={18} />
                                            </button>
                                            <button type="button" onClick={() => removeFile(idx)}
                                                style={{ background: 'transparent', border: 'none', color: 'var(--clr-danger)', padding: '4px' }}>
                                                <X size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        width: '90px', height: '90px', borderRadius: '10px',
                                        border: '1.5px dashed var(--clr-border)', display: 'flex',
                                        alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                                        background: 'rgba(248, 250, 252, 0.5)'
                                    }}
                                >
                                    <Upload size={20} color="var(--clr-text-muted)" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderTop: '1px solid var(--clr-border)',
                    background: '#fff',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.75rem',
                    borderRadius: '0 0 16px 16px'
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn"
                        style={{
                            background: 'transparent',
                            color: 'var(--clr-text-secondary)',
                            border: '1px solid var(--clr-border)',
                            fontWeight: 600
                        }}
                    >
                        Keep Pending
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        className="btn"
                        style={{
                            background: 'var(--clr-success)',
                            color: 'white',
                            border: 'none',
                            fontWeight: 600,
                            padding: '0.6rem 1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <Send size={16} /> Confirm Approval
                    </button>
                </div>
            </div>

            {markupIndex !== null && markupImage && (
                <ImageMarkupModal
                    image={markupImage}
                    onClose={() => setMarkupIndex(null)}
                    onSave={(annotatedFile) => {
                        replaceFile(markupIndex, annotatedFile);
                        setMarkupIndex(null);
                    }}
                />
            )}
        </div>
    );
}
