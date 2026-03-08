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
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-title" style={{ color: 'var(--clr-brand-secondary)' }}>
                        <MessageSquare size={20} />
                        <h3 style={{ color: 'var(--clr-brand-secondary)' }}>Request Info: RFI #{rfi.serialNo}</h3>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="modal-rfi-info">
                        <p><strong>Description:</strong> {rfi.description}</p>
                        <p><strong>Location:</strong> {rfi.location}</p>
                    </div>
                    <div className="alert-info" style={{ backgroundColor: 'var(--clr-bg-hover)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                        This will kick the RFI back to the contractor's queue without marking it as formally rejected. Use this to ask for clearer photos, specific measurements, or missing documentation.
                    </div>
                    <form onSubmit={handleSubmit}>
                        <label className="modal-label">
                            What information is missing? <span className="required">*</span>
                        </label>
                        <textarea
                            className="modal-textarea"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="e.g., Please upload a clearer photo of the rebar spacing..."
                            rows={4}
                            required
                            autoFocus
                        />
                        <div className="modal-actions">
                            <button type="button" className="btn btn-secondary" onClick={onClose}>
                                Cancel
                            </button>
                            <button type="submit" className="btn" style={{ backgroundColor: 'var(--clr-brand-secondary)', color: 'white' }} disabled={!remarks.trim()}>
                                Send Request
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
