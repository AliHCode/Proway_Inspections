import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { getToday, formatDateDisplay } from '../utils/rfiLogic';
import Header from '../components/Header';
import DateNavigator from '../components/DateNavigator';
import StatusBadge from '../components/StatusBadge';
import RejectModal from '../components/RejectModal';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, MessageSquare, Filter, Download, Image as ImageIcon, X } from 'lucide-react';

export default function ReviewQueue() {
    const { user } = useAuth();
    const { approveRFI, rejectRFI, getReviewQueue, rfis } = useRFI();
    const [currentDate, setCurrentDate] = useState(getToday());
    const [rejectTarget, setRejectTarget] = useState(null);
    const [filter, setFilter] = useState('to_review'); // to_review, approved, rejected
    const [actionMessage, setActionMessage] = useState('');
    const [selectedImages, setSelectedImages] = useState(null);

    const queue = getReviewQueue(currentDate);

    // Also get approved/rejected for today for reference
    const todayApproved = rfis.filter(
        (r) => r.status === 'approved' && r.reviewedAt && r.reviewedAt.startsWith(currentDate)
    );
    const todayRejected = rfis.filter(
        (r) => r.status === 'rejected' && r.reviewedAt && r.reviewedAt.startsWith(currentDate)
    );

    let filteredItems = queue.all;
    if (filter === 'approved') filteredItems = todayApproved;
    if (filter === 'rejected') filteredItems = todayRejected;

    function handleApprove(rfiId) {
        approveRFI(rfiId, user.id);
        setActionMessage('✅ RFI Approved');
        setTimeout(() => setActionMessage(''), 2000);
    }

    function handleReject(rfiId, remarks) {
        rejectRFI(rfiId, user.id, remarks);
        setActionMessage('❌ RFI Rejected — will carry over to next day');
        setTimeout(() => setActionMessage(''), 3000);
    }

    return (
        <div className="page-wrapper">
            <Header />
            <main className="review-page">
                <div className="sheet-header">
                    <div>
                        <h1>🔍 Review Queue</h1>
                        <p className="subtitle" style={{ marginTop: '0.25rem' }}>Manage & export daily inspections</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <div className="export-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => exportToPDF(filteredItems, `ClearLine_Inspections_${currentDate}`)}
                                title="Export to PDF"
                            >
                                <Download size={16} /> PDF
                            </button>
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => exportToExcel(filteredItems, `ClearLine_Inspections_${currentDate}`)}
                                title="Export to Excel"
                            >
                                <Download size={16} /> Excel
                            </button>
                        </div>
                        <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                    </div>
                </div>

                {/* Mini Stats */}
                <div className="review-mini-stats">
                    <div className="mini-stat pending" onClick={() => setFilter('to_review')} style={{ cursor: 'pointer', border: filter === 'to_review' ? '2px solid var(--clr-brand-secondary)' : '' }}>
                        <span className="mini-stat-value">{queue.all.length}</span>
                        <span className="mini-stat-label">To Review</span>
                    </div>
                    <div className="mini-stat approved" onClick={() => setFilter('approved')} style={{ cursor: 'pointer', border: filter === 'approved' ? '2px solid var(--clr-success)' : '' }}>
                        <span className="mini-stat-value">{todayApproved.length}</span>
                        <span className="mini-stat-label">Approved Today</span>
                    </div>
                    <div className="mini-stat rejected" onClick={() => setFilter('rejected')} style={{ cursor: 'pointer', border: filter === 'rejected' ? '2px solid var(--clr-danger)' : '' }}>
                        <span className="mini-stat-value">{todayRejected.length}</span>
                        <span className="mini-stat-label">Rejected Today</span>
                    </div>
                </div>

                {/* Filter */}
                <div className="review-filter">
                    <Filter size={16} />
                    <button
                        className={`filter-btn ${filter === 'to_review' ? 'active' : ''}`}
                        onClick={() => setFilter('to_review')}
                    >
                        To Review ({queue.all.length})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'approved' ? 'active' : ''}`}
                        onClick={() => setFilter('approved')}
                    >
                        Approved Today ({todayApproved.length})
                    </button>
                    <button
                        className={`filter-btn ${filter === 'rejected' ? 'active' : ''}`}
                        onClick={() => setFilter('rejected')}
                    >
                        Rejected Today ({todayRejected.length})
                    </button>
                </div>

                {actionMessage && (
                    <div className={`submit-message ${actionMessage.includes('✅') ? 'success' : 'warning'}`}>
                        {actionMessage}
                    </div>
                )}

                {/* Review Table (Excel-like format) */}
                {filteredItems.length === 0 ? (
                    <div className="empty-state">
                        <CheckCircle size={48} />
                        <h3>No RFIs to Review</h3>
                        <p>{filter !== 'all' ? 'Try changing the filter ' : 'All RFIs have been reviewed for this date.'}</p>
                    </div>
                ) : (
                    <div className="sheet-section">
                        <div className="rfi-table-wrapper">
                            <table className="rfi-table editable">
                                <thead>
                                    <tr>
                                        <th className="col-serial">#</th>
                                        <th className="col-desc">Description</th>
                                        <th className="col-loc">Location</th>
                                        <th className="col-type">Type</th>
                                        <th className="col-status">Filed</th>
                                        <th className="col-remarks">Remarks/Notes</th>
                                        <th className="col-files">Attachments</th>
                                        <th className="col-actions">{filter === 'to_review' ? 'Actions' : 'Status'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.map((rfi) => {
                                        const isCarryover = rfi.status === 'rejected' && rfi.carryoverTo === currentDate;
                                        return (
                                            <tr key={rfi.id} className={isCarryover ? 'carryover-row' : ''}>
                                                <td className="col-serial">
                                                    {rfi.serialNo}
                                                    {isCarryover && (
                                                        <div className="carryover-count" style={{ marginTop: '0.25rem', display: 'inline-block' }}>
                                                            ×{rfi.carryoverCount}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="col-desc">{rfi.description}</td>
                                                <td className="col-loc">{rfi.location}</td>
                                                <td className="col-type">{rfi.inspectionType}</td>
                                                <td className="col-status">{formatDateDisplay(rfi.originalFiledDate)}</td>
                                                <td className="col-remarks">
                                                    {isCarryover && rfi.remarks ? (
                                                        <span className="remarks-text">{rfi.remarks}</span>
                                                    ) : '—'}
                                                </td>
                                                <td className="col-files">
                                                    {rfi.images && rfi.images.length > 0 ? (
                                                        <div
                                                            className="image-preview-grid consultant-grid"
                                                            onClick={() => setSelectedImages(rfi.images)}
                                                            title="Click to view full size"
                                                        >
                                                            {rfi.images.slice(0, 3).map((url, idx) => (
                                                                <img
                                                                    key={idx}
                                                                    src={url}
                                                                    alt="attachment"
                                                                    className="thumbnail"
                                                                />
                                                            ))}
                                                            {rfi.images.length > 3 && (
                                                                <div className="thumbnail-more">
                                                                    +{rfi.images.length - 3}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted">—</span>
                                                    )}
                                                </td>
                                                <td className="col-actions" style={{ width: filter === 'to_review' ? '200px' : '100px' }}>
                                                    {filter === 'to_review' ? (
                                                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                            <button
                                                                className="btn btn-sm btn-success"
                                                                onClick={() => handleApprove(rfi.id)}
                                                                title="Approve"
                                                            >
                                                                <CheckCircle size={14} /> Approve
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-danger"
                                                                onClick={() => setRejectTarget(rfi)}
                                                                title="Reject"
                                                            >
                                                                <XCircle size={14} /> Reject
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <StatusBadge status={rfi.status} />
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Reject Modal */}
                {rejectTarget && (
                    <RejectModal
                        rfi={rejectTarget}
                        onReject={handleReject}
                        onClose={() => setRejectTarget(null)}
                    />
                )}

                {/* Lightbox for Images */}
                {selectedImages && (
                    <div className="modal-overlay" onClick={() => setSelectedImages(null)}>
                        <div className="modal lightbox" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>Attachments ({selectedImages.length})</h3>
                                <button className="btn-close" onClick={() => setSelectedImages(null)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="lightbox-content">
                                {selectedImages.map((url, idx) => (
                                    <div key={idx} className="lightbox-image-wrapper">
                                        <img src={url} alt={`Attachment ${idx + 1}`} className="lightbox-image" />
                                        <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost lightbox-download">
                                            Open Full Size
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
