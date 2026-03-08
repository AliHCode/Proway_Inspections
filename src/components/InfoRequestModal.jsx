import { useState } from 'react';
import { X, MessageSquare } from 'lucide-react';

export default function InfoRequestModal({ rfi, onRequestInfo, onClose }) {
    const [remarks, setRemarks] = useState('');

    function handleSubmit(e) {
        e.preventDefault();
        if (!remarks.trim()) return;
        onRequestInfo(rfi.id, remarks.trim());
        onClose();
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal-content premium-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '550px', padding: 0, overflow: 'hidden' }}>

                {/* Header Area */}
                <div style={{ backgroundColor: '#eff6ff', borderBottom: '1px solid #dbeafe', padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div style={{ backgroundColor: '#dbeafe', padding: '0.75rem', borderRadius: '50%', display: 'flex' }}>
                            <MessageSquare size={24} color="#3b82f6" />
                        </div>
                        <div>
                            <h3 style={{ color: '#1e3a8a', margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Request Missing Information</h3>
                            <p style={{ color: '#1d4ed8', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>RFI #{rfi.serialNo}</p>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose} style={{ backgroundColor: 'transparent', color: '#3b82f6' }}>
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body" style={{ padding: '1.5rem' }}>

                    {/* RFI Summary Card */}
                    <div style={{ backgroundColor: 'var(--clr-bg-hover)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1rem', border: '1px solid var(--clr-border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--clr-text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>Description</span>
                            <span style={{ fontWeight: 500 }}>{rfi.description}</span>
                        </div>
                        <div>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--clr-text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.25rem' }}>Location</span>
                            <span style={{ fontWeight: 500 }}>{rfi.location}</span>
                        </div>
                    </div>

                    <div className="alert-info" style={{ backgroundColor: '#eef2ff', color: '#4338ca', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.85rem', border: '1px solid #e0e7ff', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '1.1rem' }}>💡</span>
                        <div style={{ lineHeight: 1.4 }}>
                            <strong>Note:</strong> This returns the RFI to the contractor's queue for editing. It does <strong>not</strong> count as a formal rejection or increment the carryover count.
                        </div>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label className="modal-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 600, color: 'var(--clr-text)' }}>
                                <span>What information do you need? <span className="required" style={{ color: '#3b82f6' }}>*</span></span>
                            </label>
                            <textarea
                                className="modal-textarea"
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                placeholder="e.g., Please attach a clearer photo of the rebar spacing, or specify the exact grid coordinates..."
                                rows={4}
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
                        </div>

                        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--clr-border)', paddingTop: '1.5rem', marginTop: '1rem' }}>
                            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: '0.6rem 1.25rem', fontWeight: 600 }}>
                                Cancel
                            </button>
                            <button type="submit" className="btn" disabled={!remarks.trim()} style={{ backgroundColor: '#3b82f6', color: 'white', padding: '0.6rem 1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <MessageSquare size={16} /> Send Request
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
