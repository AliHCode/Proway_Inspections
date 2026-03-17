import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';

export default function CancelModal({ isOpen, onClose, onConfirm, rfi }) {
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const rfiNo = rfi?.customFields?.rfi_no || rfi?.serialNo || '—';

    const handleConfirm = () => {
        if (!reason.trim()) {
            setError('Please provide a mandatory cancellation reason.');
            return;
        }
        onConfirm(reason.trim());
        setReason('');
        setError('');
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: '500px',
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
                            background: 'var(--clr-danger-bg)', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <AlertTriangle size={20} color="var(--clr-danger)" />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--clr-text-main)' }}>
                                Cancel RFI #{rfiNo}
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.85rem', color: 'var(--clr-text-secondary)' }}>
                                {rfi?.location || 'General'} · {rfi?.inspectionType || 'RFI'}
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
                    <div style={{
                        background: '#fef2f2',
                        border: '1px solid #fee2e2',
                        borderRadius: '12px',
                        padding: '1rem',
                        marginBottom: '1.5rem',
                        display: 'flex',
                        gap: '0.75rem'
                    }}>
                        <div style={{ color: 'var(--clr-danger)', marginTop: '2px' }}>
                            <AlertTriangle size={18} />
                        </div>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: '#991b1b', lineHeight: '1.5' }}>
                            <strong>Warning:</strong> Cancellation is a terminal state. This RFI will be archived, and no further revisions or approvals will be possible.
                        </p>
                    </div>

                    <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: 'var(--clr-text-main)', marginBottom: '0.5rem' }}>
                            Cancellation Reason (Required)
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => {
                                setReason(e.target.value);
                                if (error) setError('');
                            }}
                            rows={4}
                            autoFocus
                            placeholder="e.g., Duplicate of RFI-004, Addressed in site walk, Out of scope..."
                            style={{
                                width: '100%', padding: '1rem', borderRadius: '12px',
                                border: error ? '1px solid var(--clr-danger)' : '1px solid var(--clr-border)',
                                background: '#fff',
                                fontSize: '0.95rem', lineHeight: '1.6', resize: 'none',
                                fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                                transition: 'all 0.2s',
                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                            }}
                            onFocus={e => {
                                if (!error) {
                                    e.target.style.borderColor = 'var(--clr-brand-accent)';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(51, 65, 85, 0.1)';
                                }
                            }}
                            onBlur={e => {
                                e.target.style.borderColor = error ? 'var(--clr-danger)' : 'var(--clr-border)';
                                e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.02)';
                            }}
                        />
                        {error && (
                            <span style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--clr-danger)', fontWeight: 500 }}>
                                {error}
                            </span>
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
                        Keep RFI
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        className="btn"
                        style={{
                            background: 'var(--clr-danger)',
                            color: 'white',
                            border: 'none',
                            fontWeight: 600,
                            padding: '0.6rem 1.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s'
                        }}
                    >
                        Confirm Cancellation
                    </button>
                </div>
            </div>
        </div>
    );
}
