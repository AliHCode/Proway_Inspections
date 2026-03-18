import { useState } from 'react';
import { X, AlertTriangle, MapPin } from 'lucide-react';

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

export default function CancelModal({ isOpen, onClose, onConfirm, rfi }) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const rfiNo = rfi?.customFields?.rfi_no || rfi?.serialNo || '—';

    const handleConfirm = () => {
        if (!reason.trim()) { setError('Please provide a cancellation reason.'); return; }
        onConfirm(reason.trim());
        setReason('');
        setError('');
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div className="modal-content review-action-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="ram-header">
                    <div>
                        <div className="ram-title-row">
                            <h3 className="ram-title">Cancel RFI</h3>
                            <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                padding: '0.35rem 0.75rem', borderRadius: '999px',
                                background: '#f8fafc', border: '1px solid #cbd5e122',
                                fontSize: '0.7rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.04em'
                            }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#64748b', display: 'inline-block' }} />
                                TERMINAL ACTION
                            </div>
                        </div>
                        <div className="ram-subtitle">
                            <strong>RFI #{rfiNo}</strong>
                            {rfi?.location && <><span className="ram-dot">·</span><MapPin size={12} />{rfi.location}</>}
                        </div>
                    </div>
                    <button className="ram-close" onClick={onClose}><X size={18} /></button>
                </div>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div className="ram-body">
                    {/* Pills */}
                    <div className="ram-pills">
                        {rfi?.inspectionType && <PillTag><span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>TYPE</span> {rfi.inspectionType}</PillTag>}
                        {rfi?.filerName && <PillTag><span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>FILED BY</span> <span style={{ width:20, height:20, borderRadius:'50%', background:'#3b82f6', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', color:'#fff', fontWeight:700 }}>{(rfi.filerName||'?')[0].toUpperCase()}</span>{rfi.filerName}</PillTag>}
                    </div>

                    {/* Warning */}
                    <div style={{
                        display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                        background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px',
                        padding: '0.875rem 1rem', marginBottom: '1.25rem',
                    }}>
                        <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#991b1b', lineHeight: 1.6 }}>
                            <strong>Warning:</strong> Cancellation is a terminal state. This RFI will be archived and no further revisions or approvals will be possible.
                        </p>
                    </div>

                    {/* Reason */}
                    <div className="ram-field">
                        <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'block', marginBottom: '0.5rem' }}>
                            Cancellation Reason (Required)
                        </label>
                        <textarea
                            className="ram-textarea"
                            value={reason}
                            onChange={e => { setReason(e.target.value); if (error) setError(''); }}
                            rows={4}
                            autoFocus
                            placeholder="e.g., Duplicate of RFI-004, Addressed in site walk, Out of scope..."
                            style={{ borderColor: error ? '#ef4444' : undefined }}
                            onFocus={e => { e.target.style.borderColor = '#64748b'; e.target.style.boxShadow = '0 0 0 3px rgba(100,116,139,0.12)'; }}
                            onBlur={e => { e.target.style.borderColor = error ? '#ef4444' : '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
                        />
                        {error && <span style={{ display: 'block', marginTop: '0.4rem', fontSize: '0.78rem', color: '#ef4444', fontWeight: 500 }}>{error}</span>}
                    </div>
                </div>

                {/* ── Footer ─────────────────────────────────────────────── */}
                <div className="ram-footer">
                    <button type="button" className="ram-btn-ghost" onClick={onClose}>Keep RFI</button>
                    <button
                        type="button"
                        className="ram-btn-primary"
                        style={{ background: reason.trim() ? '#475569' : '#94a3b8', cursor: reason.trim() ? 'pointer' : 'not-allowed' }}
                        disabled={!reason.trim()}
                        onClick={handleConfirm}
                    >
                        Confirm Cancellation
                    </button>
                </div>
            </div>
        </div>
    );
}
