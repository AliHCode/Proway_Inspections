import { useEffect, useState } from 'react';
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
import { CheckCircle, XCircle, MessageSquare, X, FileDown, Table, ClipboardList } from 'lucide-react';

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
    const [scrollTrigger, setScrollTrigger] = useState(0);
    const [selectedRfiIds, setSelectedRfiIds] = useState([]);

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
        setActionMessage('✅ Inspection Approved Successfully');
        setTimeout(() => setActionMessage(''), 2000);
    }

    async function handleReject(rfiId, remarks, files = []) {
        const uploaded = files.length > 0 ? await uploadImages(files) : [];
        rejectRFI(rfiId, user.id, remarks, uploaded);
        setActionMessage('❌ Inspection Rejected & Returned');
        setTimeout(() => setActionMessage(''), 3000);
    }

    function handleRequestInfo(rfiId, remarks) {
        requestInfo(rfiId, user.id, remarks);
        setActionMessage('⚠️ Info Requested — returned to contractor');
        setTimeout(() => setActionMessage(''), 3000);
    }

    const { bulkApproveRFI } = useRFI();

    function toggleSelect(id) {
        setSelectedRfiIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    }

    function handleSelectAll() {
        if (selectedRfiIds.length === filteredItems.length) {
            setSelectedRfiIds([]);
        } else {
            setSelectedRfiIds(filteredItems.map(r => r.id));
        }
    }

    async function handleBulkApprove() {
        if (window.confirm(`Approve ${selectedRfiIds.length} selected RFIs?`)) {
            await bulkApproveRFI(selectedRfiIds, user.id);
            setSelectedRfiIds([]);
        }
    }

    useEffect(() => {
        // If the timeline date changes, close any previously opened discussion modal.
        setDetailTarget(null);
    }, [currentDate]);

    // Background Scroll Locking
    useEffect(() => {
        const isModalOpen = !!(detailTarget || rejectTarget || infoRequestTarget || selectedImages);
        if (isModalOpen) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
        return () => document.body.classList.remove('no-scroll');
    }, [detailTarget, rejectTarget, infoRequestTarget, selectedImages]);

    function scrollToPageBottom() {
        const scrollNow = () => {
            const pageHeight = Math.max(
                document.body?.scrollHeight || 0,
                document.documentElement?.scrollHeight || 0,
                document.body?.offsetHeight || 0,
                document.documentElement?.offsetHeight || 0
            );
            window.scrollTo({ top: pageHeight, behavior: 'smooth' });
        };

        // Multiple attempts to ensure scroll reaches true bottom after modal renders
        scrollNow();
        requestAnimationFrame(() => setTimeout(scrollNow, 100));
        setTimeout(scrollNow, 300);
        setTimeout(scrollNow, 600);
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
                        <div className="export-actions review-export-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <button
                                className="btn btn-sm"
                                style={{ backgroundColor: 'transparent', color: 'var(--clr-brand-secondary)', border: '1px solid var(--clr-border-dark)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                onClick={() => exportToPDF(filteredItems, `ProWay_Inspections_${currentDate}`)}
                                title="Export to PDF"
                                aria-label="Export to PDF"
                            >
                                <FileDown size={16} /> PDF
                            </button>
                            <button
                                className="btn btn-sm"
                                style={{ backgroundColor: 'transparent', color: 'var(--clr-brand-secondary)', border: '1px solid var(--clr-border-dark)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                onClick={() => exportToExcel(filteredItems, `ProWay_Inspections_${currentDate}`)}
                                title="Export to Excel"
                                aria-label="Export to Excel"
                            >
                                <Table size={16} /> Excel
                            </button>
                            <button
                                className="btn btn-sm"
                                style={{ backgroundColor: 'var(--clr-brand-secondary)', color: 'white', border: '1px solid var(--clr-brand-secondary)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                onClick={() => generateDailyReport([...todayApproved, ...todayRejected], currentDate, activeProjectName)}
                                title="Generate branded daily report"
                            >
                                <ClipboardList size={16} /> Daily Report
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
                                        <th className="col-serial" style={{ width: '40px' }}>
                                            {(filter === 'to_review' || filter === 'my_assigned') && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRfiIds.length > 0 && selectedRfiIds.length === filteredItems.length}
                                                    onChange={handleSelectAll}
                                                />
                                            )}
                                        </th>
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
                                                <td className="col-serial">
                                                    {(filter === 'to_review' || filter === 'my_assigned') && (
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedRfiIds.includes(rfi.id)}
                                                            onChange={() => toggleSelect(rfi.id)}
                                                        />
                                                    )}
                                                </td>
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
                                                                onClick={() => handleApprove(rfi.id)}
                                                                title="Approve"
                                                                style={{
                                                                    background: 'transparent', border: '1.5px solid #d1d5db',
                                                                    borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                                    color: '#6b7280', fontSize: '0.8rem', fontWeight: 500,
                                                                    fontFamily: 'inherit', transition: 'all 0.15s',
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = '#f9fafb'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                                                            >
                                                                <CheckCircle size={15} />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setRejectTarget(rfi);
                                                                    setDetailTarget(null); // Close chat if open
                                                                }}
                                                                title="Reject"
                                                                style={{
                                                                    background: 'transparent', border: '1.5px solid #d1d5db',
                                                                    borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                                    color: '#6b7280', fontSize: '0.8rem', fontWeight: 500,
                                                                    fontFamily: 'inherit', transition: 'all 0.15s',
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = '#f9fafb'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                                                            >
                                                                <XCircle size={15} />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setDetailTarget(rfi);
                                                                    setRejectTarget(null); // Ensure rejection is closed
                                                                    setInfoRequestTarget(null); // Ensure info request is closed
                                                                    setScrollTrigger(prev => prev + 1);
                                                                    setTimeout(() => scrollToPageBottom(), 80);
                                                                }}
                                                                title="Chat"
                                                                style={{
                                                                    background: 'transparent', border: '1.5px solid #d1d5db',
                                                                    borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                                    color: '#6b7280', fontSize: '0.8rem', fontWeight: 500,
                                                                    fontFamily: 'inherit', transition: 'all 0.15s',
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = '#f9fafb'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                                                            >
                                                                <MessageSquare size={15} />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}>
                                                            <StatusBadge status={rfi.status} />
                                                            <button
                                                                onClick={() => {
                                                                    setDetailTarget(rfi);
                                                                    setRejectTarget(null); 
                                                                    setInfoRequestTarget(null);
                                                                    setScrollTrigger(prev => prev + 1);
                                                                    setTimeout(() => scrollToPageBottom(), 80);
                                                                }}
                                                                title="Open Discussion"
                                                                style={{
                                                                    background: 'transparent', border: '1.5px solid #d1d5db',
                                                                    borderRadius: '8px', padding: '6px 10px', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                                    color: '#6b7280', fontSize: '0.8rem', fontWeight: 500,
                                                                    fontFamily: 'inherit', transition: 'all 0.15s',
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = '#f9fafb'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}
                                                            >
                                                                <MessageSquare size={15} />
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
                        key={detailTarget.id}
                        rfi={detailTarget}
                        onClose={() => setDetailTarget(null)}
                        externalScrollTrigger={scrollTrigger}
                    />
                )}

                {/* Inline Rejection Widget */}
                {rejectTarget && (
                    <RejectModal
                        key={rejectTarget.id}
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

                {/* Batch Action Bar */}
                {selectedRfiIds.length > 0 && (
                    <div className="batch-action-bar">
                        <div className="batch-action-selected">
                            <span className="selected-count">{selectedRfiIds.length} Selected</span>
                            <button className="btn btn-sm btn-ghost clear-btn" onClick={() => setSelectedRfiIds([])}>Clear</button>
                        </div>
                        <div className="batch-divider"></div>
                        <div className="batch-action-ops">
                            <button className="btn btn-primary approve-btn" onClick={handleBulkApprove}>
                                <CheckCircle size={18} /> Bulk Approve
                            </button>
                        </div>
                    </div>
                )}
                        
            </main>
            <style>
                {`
                @keyframes slideUp {
                    from { transform: translate(-50%, 20px); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }

                .batch-action-bar {
                    position: fixed;
                    bottom: 2rem;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #0f172a;
                    color: white;
                    padding: 0.75rem 1.5rem;
                    border-radius: 999px;
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1);
                    z-index: 1000;
                    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    width: max-content;
                    max-width: 95vw;
                }

                .batch-action-selected {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .batch-divider {
                    width: 1px;
                    height: 1.5rem;
                    background: rgba(255,255,255,0.2);
                }

                .selected-count {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: white;
                    white-space: nowrap;
                }

                .clear-btn {
                    color: rgba(255,255,255,0.6);
                    font-size: 0.75rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                .batch-action-ops {
                    display: flex;
                    align-items: center;
                }

                .approve-btn {
                    background-color: var(--clr-success) !important;
                    border-color: var(--clr-success) !important;
                    color: white !important;
                    font-weight: 600 !important;
                    border-radius: 999px !important;
                    padding: 0.5rem 1.5rem !important;
                    white-space: nowrap;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    transition: all 0.2s;
                }

                .approve-btn:hover {
                    box-shadow: 0 0 15px rgba(5, 150, 105, 0.4);
                    transform: translateY(-1px);
                }

                @media (max-width: 600px) {
                    .batch-action-bar {
                        bottom: 1.5rem;
                        padding: 0.75rem 1.25rem;
                        gap: 1rem;
                        border-radius: 1rem;
                    }
                    .selected-count {
                        font-size: 0.85rem;
                    }
                    .approve-btn {
                        padding: 0.5rem 1rem !important;
                        font-size: 0.8rem !important;
                    }
                }
                `}
            </style>
        </div>
    );
}

