import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { useProject } from '../context/ProjectContext';
import { getToday, formatDateDisplay } from '../utils/rfiLogic';
import Header from '../components/Header';
import DateNavigator from '../components/DateNavigator';
import StatusBadge from '../components/StatusBadge';
import RejectModal from '../components/RejectModal';
import InfoRequestModal from '../components/InfoRequestModal';
import RFIDetailModal from '../components/RFIDetailModal';
import UserAvatar from '../components/UserAvatar';
import { exportToExcel, exportToPDF, generateDailyReport } from '../utils/exportUtils';
import { CheckCircle, XCircle, MessageSquare, X, FileText, FileSpreadsheet } from 'lucide-react';

export default function ReviewQueue() {
    const { user } = useAuth();
    const { approveRFI, rejectRFI, requestInfo, getReviewQueue, rfis, uploadImages, contractors } = useRFI();
    const { activeProject } = useProject();
    const activeProjectName = activeProject?.name || 'ProWay Project';
    const [currentDate, setCurrentDate] = useState(getToday());
    const [rejectTarget, setRejectTarget] = useState(null);
    const [infoRequestTarget, setInfoRequestTarget] = useState(null);
    const [detailTarget, setDetailTarget] = useState(null);
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
    if (filter === 'my_assigned') filteredItems = queue.all.filter(r => r.assignedTo === user.id);

    function handleApprove(rfiId) {
        approveRFI(rfiId, user.id);
        setActionMessage('✅ RFI Approved');
        setTimeout(() => setActionMessage(''), 2000);
    }

    async function handleReject(rfiId, remarks, files = []) {
        const uploaded = files.length > 0 ? await uploadImages(files) : [];
        rejectRFI(rfiId, user.id, remarks, uploaded);
        setActionMessage('RFI Rejected and sent back to contractor.');
        setTimeout(() => setActionMessage(''), 3000);
    }

    function handleRequestInfo(rfiId, remarks) {
        requestInfo(rfiId, user.id, remarks);
        setActionMessage('⚠️ Info Requested — returned to contractor');
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
                    <div className="review-header-controls">
                        <div className="export-actions review-export-actions">
                            <button
                                className="btn btn-ghost btn-sm export-icon-btn pdf-icon-btn"
                                onClick={() => exportToPDF(filteredItems, `ProWay_Inspections_${currentDate}`)}
                                title="Export to PDF"
                                aria-label="Export to PDF"
                            >
                                <FileText size={16} />
                            </button>
                            <button
                                className="btn btn-ghost btn-sm export-icon-btn excel-icon-btn"
                                onClick={() => exportToExcel(filteredItems, `ProWay_Inspections_${currentDate}`)}
                                title="Export to Excel"
                                aria-label="Export to Excel"
                            >
                                <FileSpreadsheet size={16} />
                            </button>
                            <button
                                className="btn btn-sm"
                                style={{ backgroundColor: 'var(--clr-brand-secondary)', color: 'white', gap: '0.35rem' }}
                                onClick={() => generateDailyReport(filteredItems, currentDate, activeProjectName)}
                                title="Generate branded daily report"
                            >
                                <FileText size={16} /> Daily Report
                            </button>
                        </div>
                        <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                    </div>
                </div>

                {/* Mini Stats (Acts as filters) */}
                <div className="review-mini-stats">
                    <div className="mini-stat pending" onClick={() => setFilter('to_review')} style={{ cursor: 'pointer', border: filter === 'to_review' ? '2px solid var(--clr-brand-secondary)' : '' }}>
                        <span className="mini-stat-label">To Review</span>
                        <span className="mini-stat-value">{queue.all.length}</span>
                    </div>
                    <div className="mini-stat approved" onClick={() => setFilter('approved')} style={{ cursor: 'pointer', border: filter === 'approved' ? '2px solid var(--clr-success)' : '' }}>
                        <span className="mini-stat-label">Approved Today</span>
                        <span className="mini-stat-value">{todayApproved.length}</span>
                    </div>
                    <div className="mini-stat rejected" onClick={() => setFilter('rejected')} style={{ cursor: 'pointer', border: filter === 'rejected' ? '2px solid var(--clr-danger)' : '' }}>
                        <span className="mini-stat-label">Rejected Today</span>
                        <span className="mini-stat-value">{todayRejected.length}</span>
                    </div>
                    <div className="mini-stat assigned" onClick={() => setFilter('my_assigned')} style={{ cursor: 'pointer', border: filter === 'my_assigned' ? '2px solid var(--clr-brand-primary)' : '' }}>
                        <span className="mini-stat-label">Assigned to Me</span>
                        <span className="mini-stat-value">{queue.all.filter(r => r.assignedTo === user.id).length}</span>
                    </div>
                </div>

                {actionMessage && (
                    <div className={`submit-message ${actionMessage.includes('✅') ? 'success' : 'warning'}`}>
                        {actionMessage}
                    </div>
                )}

                {/* Review Table (Excel-like format) */}
                {filteredItems.length === 0 ? (
                    <div className="empty-state">
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                            <CheckCircle size={24} color="var(--clr-success)" /> All Caught Up!
                        </h3>
                        <p>{filter === 'to_review' ? 'All RFIs have been reviewed for this date.' : 'No items match this filter.'}</p>
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
                                        <th className="col-assign">Assigned To</th>
                                        <th className="col-status">Filed</th>
                                        <th className="col-remarks">Remarks/Notes</th>
                                        <th className="col-files">Attachments</th>
                                        <th className="col-actions">{filter === 'to_review' || filter === 'my_assigned' ? 'Actions' : 'Status'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredItems.map((rfi) => {
                                        const isCarryover = rfi.status === 'rejected' && rfi.carryoverTo === currentDate;
                                        return (
                                            <tr key={rfi.id} className={isCarryover ? 'carryover-row' : ''}>
                                                <td className="col-serial" data-label="#">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <UserAvatar name={rfi.filerName} size={32} />
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>#{rfi.serialNo}</div>
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>
                                                                {rfi.filerName}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {isCarryover && (
                                                        <div className="carryover-count" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                                                            ×{rfi.carryoverCount} Carryover
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="col-desc" data-label="Description">{rfi.description}</td>
                                                <td className="col-loc" data-label="Location">{rfi.location}</td>
                                                <td className="col-type" data-label="Type">{rfi.inspectionType}</td>
                                                <td className="col-assign" data-label="Assigned To">
                                                    {rfi.assigneeName ? (
                                                        <span className={`assign-badge ${rfi.assignedTo === user.id ? 'is-me' : ''}`}>
                                                            {rfi.assignedTo === user.id ? '📌 You' : rfi.assigneeName}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted">— Auto —</span>
                                                    )}
                                                </td>
                                                <td className="col-status" data-label="Filed Date">{formatDateDisplay(rfi.originalFiledDate)}</td>
                                                <td className="col-remarks" data-label="Remarks">
                                                    {isCarryover && rfi.remarks ? (
                                                        <span className="remarks-text">{rfi.remarks}</span>
                                                    ) : '—'}
                                                </td>
                                                <td className="col-files" data-label="Attachments">
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
                                                <td className="col-actions" style={{ width: (filter === 'to_review' || filter === 'my_assigned') ? '340px' : '100px' }}>
                                                    {(filter === 'to_review' || filter === 'my_assigned') ? (
                                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                                            <button
                                                                className="btn btn-sm btn-success"
                                                                onClick={() => handleApprove(rfi.id)}
                                                                title="Approve"
                                                            >
                                                                <CheckCircle size={14} />
                                                            </button>
                                                            <button
                                                                className="btn btn-sm"
                                                                style={{ backgroundColor: 'var(--clr-brand-secondary)', color: 'white' }}
                                                                onClick={() => setInfoRequestTarget(rfi)}
                                                                title="Cancel"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-danger"
                                                                onClick={() => setRejectTarget(rfi)}
                                                                title="Reject"
                                                            >
                                                                <XCircle size={14} />
                                                            </button>
                                                            <button
                                                                className="btn btn-sm btn-ghost"
                                                                onClick={() => setDetailTarget(rfi)}
                                                                title="Chat"
                                                            >
                                                                <MessageSquare size={14} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                                                            <StatusBadge status={rfi.status} />
                                                            <button
                                                                className="btn btn-sm btn-ghost"
                                                                onClick={() => setDetailTarget(rfi)}
                                                                title="Open Discussion"
                                                            >
                                                                <MessageSquare size={14} />
                                                            </button>
                                                        </div>
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

                {/* Detail & Comments Modal */}
                {detailTarget && (
                    <RFIDetailModal
                        rfi={detailTarget}
                        onClose={() => setDetailTarget(null)}
                    />
                )}

                {/* Reject Modal */}
                {rejectTarget && (
                    <RejectModal
                        rfi={rejectTarget}
                        onReject={handleReject}
                        contractors={contractors}
                        onClose={() => setRejectTarget(null)}
                    />
                )}

                {/* Request Info Modal */}
                {infoRequestTarget && (
                    <InfoRequestModal
                        rfi={infoRequestTarget}
                        onRequestInfo={handleRequestInfo}
                        onClose={() => setInfoRequestTarget(null)}
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

