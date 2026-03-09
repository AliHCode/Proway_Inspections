import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export default function RejectModal({ rfi, onReject, onClose, contractors = [] }) {
    const [remarks, setRemarks] = useState('');
    const [files, setFiles] = useState([]);

    function toMentionKey(name) {
        return name.toLowerCase().replace(/\s+/g, '');
    }

    function appendMention(name) {
        const mention = `@${toMentionKey(name)}`;
        setRemarks((prev) => (prev.trim().length ? `${prev} ${mention}` : mention));
    }

    function handleSubmit(e) {
        e.preventDefault();
        if (!remarks.trim()) return;
        onReject(rfi.id, remarks.trim(), files);
        onClose();
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal-content premium-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px', padding: 0, overflow: 'hidden' }}>

                {/* Header Area */}
                <div style={{ backgroundColor: '#fef2f2', borderBottom: '1px solid #fee2e2', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ backgroundColor: '#fee2e2', padding: '0.75rem', borderRadius: '50%', display: 'flex' }}>
                            <AlertTriangle size={24} color="#ef4444" />
                        </div>
                        <div>
                            <h3 style={{ color: '#991b1b', margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Reject Inspection Request</h3>
                            <p style={{ color: '#b91c1c', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>RFI #{rfi.serialNo}</p>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose} style={{ backgroundColor: 'transparent', color: '#ef4444' }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body" style={{ padding: '1.5rem' }}>

                    {/* RFI Summary Card */}
                    <div style={{ backgroundColor: 'var(--clr-bg-hover)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem', border: '1px solid var(--clr-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--clr-text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>Description</span>
                            <span style={{ fontWeight: 500 }}>{rfi.description}</span>
                        </div>
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--clr-text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>Location</span>
                            <span style={{ fontWeight: 500 }}>{rfi.location}</span>
                        </div>
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--clr-text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>Type</span>
                            <span style={{ fontWeight: 500 }}>{rfi.inspectionType}</span>
                        </div>
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--clr-text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>Filer</span>
                            <span style={{ fontWeight: 500 }}>{rfi.filerName}</span>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label className="modal-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--clr-text)' }}>
                                <span>Specific Reason for Rejection <span className="required" style={{ color: '#ef4444' }}>*</span></span>
                            </label>
                            <textarea
                                className="modal-textarea"
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                placeholder="Explain specifically why the work is not accepted or what needs to be rectified before re-inspection..."
                                rows={5}
                                required
                                autoFocus
                                style={{
                                    width: '100%',
                                    padding: '0.875rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--clr-border)',
                                    resize: 'vertical',
                                    fontSize: '0.95rem',
                                    lineHeight: '1.5',
                                    backgroundColor: 'var(--clr-surface)'
                                }}
                            />
                            {contractors.length > 0 && (
                                <div style={{ marginTop: '0.6rem' }}>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--clr-text-secondary)', marginBottom: '0.35rem' }}>
                                        Tag contractors in remarks with <strong>@</strong>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {contractors.slice(0, 8).map((contractor) => (
                                            <button
                                                key={contractor.id}
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => appendMention(contractor.name)}
                                                title={`Tag @${toMentionKey(contractor.name)}`}
                                            >
                                                @{toMentionKey(contractor.name)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label className="modal-label" style={{ marginBottom: '0.5rem', fontWeight: 600, color: 'var(--clr-text)', display: 'block' }}>
                                Attachments from Consultant (optional)
                            </label>
                            <input
                                type="file"
                                multiple
                                accept="image/*"
                                onChange={(e) => setFiles(Array.from(e.target.files || []))}
                            />
                            {files.length > 0 && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--clr-text-secondary)' }}>
                                    {files.length} attachment(s) selected
                                </div>
                            )}
                        </div>

                        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--clr-border)', paddingTop: '1.5rem', marginTop: '1rem' }}>
                            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: '0.6rem 1.25rem', fontWeight: 600 }}>
                                Cancel
                            </button>
                            <button type="submit" className="btn btn-danger" disabled={!remarks.trim()} style={{ padding: '0.6rem 1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertTriangle size={16} /> Confirm Rejection
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
