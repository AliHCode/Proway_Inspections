import { useState, useRef, useMemo } from 'react';
import { X, Calendar, MapPin, Tag, MessageSquare, History, List, Upload, CheckCircle, ClipboardList, XCircle, Hand, Ban, Edit3, Users, FileDown, RefreshCw } from 'lucide-react';
import ThreadedComments from './ThreadedComments';
import AuditLog from './AuditLog';
import StatusBadge from './StatusBadge';
import UserAvatar from './UserAvatar';
import { formatDateDisplay, getThumbnailUrl } from '../utils/rfiLogic';
import { useRFI } from '../context/RFIContext';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { RFI_STATUS } from '../utils/constants';

export default function RFIDetailModal({ 
    rfi, 
    projectFields = [], 
    orderedColumns = [], 
    onClose, 
    externalScrollTrigger,
    onApprove,
    onConditional,
    onReject,
    onCancel,
    onEditDecision,
    onDownloadCustomReport
}) {
    const [activeTab, setActiveTab] = useState('review');
    const [tabScrollTrigger, setTabScrollTrigger] = useState(0);
    const { rfis, updateRFI, claimRFI, submitInternalReview } = useRFI();
    const { activeProject, assignmentMode } = useProject();
    const { user } = useAuth();
    
    const [showInternalReviewForm, setShowInternalReviewForm] = useState(false);
    const [internalStatus, setInternalStatus] = useState('approved');
    const [internalRemarks, setInternalRemarks] = useState('');
    const fileInputRef = useRef(null);
    const [resolveFile, setResolveFile] = useState(null);
    const [isResolving, setIsResolving] = useState(false);
    const [isDownloadingCustomReport, setIsDownloadingCustomReport] = useState(false);

    const mergedData = useMemo(() => {
        if (!rfi) return {};
        return {
            description: rfi.description || '',
            location: rfi.location || '',
            inspection_type: rfi.inspectionType || rfi.inspection_type || '',
            ...(rfi.customFields || {})
        };
    }, [rfi]);

    const displayColumns = useMemo(() => {
        const skip = new Set(['serial', 'rfi_no', 'status', 'actions', 'remarks', 'attachments']);
        const columns = orderedColumns && orderedColumns.length > 0 
            ? orderedColumns 
            : [
                { field_key: 'description', field_name: 'Description' },
                { field_key: 'location', field_name: 'Location' },
                { field_key: 'inspection_type', field_name: 'Inspection Type' },
                ...(projectFields || [])
            ];
        return columns.filter(col => !skip.has(col.field_key));
    }, [orderedColumns, projectFields]);

    async function handleResolve() {
        if (!resolveFile) {
            alert('Please select a final photo first.');
            return;
        }
        setIsResolving(true);
        try {
            await updateRFI(rfi.id, {
                status: RFI_STATUS.VERIFICATION_PENDING,
                appendFiles: [resolveFile],
                remarks: 'Proof submitted. Awaiting final consultant verification.'
            });
            onClose();
        } catch (error) {
            console.error('Error resolving conditional approval:', error);
            alert('Failed to resolve. Please try again.');
        } finally {
            setIsResolving(false);
        }
    }

    if (!rfi) return null;

    const getLineage = () => {
        let current = rfi;
        while (current && current.parentId) {
            const parent = rfis.find(r => r.id === current.parentId);
            if (!parent) break;
            current = parent;
        }
        const root = current;
        const chain = [];
        const seen = new Set();
        const collect = (item) => {
            if (seen.has(item.id)) return;
            seen.add(item.id);
            chain.push(item);
            const children = rfis.filter(r => r.parentId === item.id);
            children.forEach(collect);
        };
        if (root) collect(root);
        return chain.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    };

    const lineage = getLineage();
    const hasRevisions = lineage.length > 1;
    const combinedTrigger = (externalScrollTrigger || 0) + tabScrollTrigger;

    const handleTabClick = (tab) => {
        if (tab === 'discussion') {
            setTabScrollTrigger(prev => prev + 1);
        }
        setActiveTab(tab);
    };

    const rfiNo = rfi.customFields?.rfi_no || rfi.serialNo;

    const handleDownloadCustomReport = async () => {
        if (!onDownloadCustomReport || isDownloadingCustomReport) return;
        setIsDownloadingCustomReport(true);
        try {
            await onDownloadCustomReport(rfi);
        } finally {
            setIsDownloadingCustomReport(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
            <div className="modal-content rfi-detail-modal universal-tabbed" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header rfi-detail-header">
                    <div className="modal-title rfi-detail-title">
                        <div>
                            <div className="rfi-title-row">
                                <h2>RFI #{rfiNo}</h2>
                                <StatusBadge status={rfi.status} />
                            </div>
                            <p>{mergedData.description || mergedData.inspection_type || 'RFI Details'}</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            {onDownloadCustomReport && (
                                <button
                                    className="btn-change-decision-compat"
                                    onClick={handleDownloadCustomReport}
                                    disabled={isDownloadingCustomReport}
                                    title="Download custom Excel report"
                                >
                                    {isDownloadingCustomReport ? <RefreshCw size={14} className="spin-slow" /> : <FileDown size={14} />}
                                    <span>{isDownloadingCustomReport ? '...' : 'Custom Report'}</span>
                                </button>
                            )}
                            <button className="btn-close-hex" onClick={onClose}>
                                <X size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="rfi-universal-tabs">
                    <button onClick={() => handleTabClick('review')} className={`rfi-tab-btn ${activeTab === 'review' ? 'active' : ''}`}><CheckCircle size={18} /><span>Review</span></button>
                    {user?.role === 'consultant' && activeProject?.multi_review_enabled && (
                        <button onClick={() => handleTabClick('internal')} className={`rfi-tab-btn ${activeTab === 'internal' ? 'active' : ''}`}>
                            <Users size={18} />
                            <span>Team Feedback</span>
                            {rfi.internalReviews?.length > 0 && <span className="tab-badge-mini">{rfi.internalReviews.length}</span>}
                        </button>
                    )}
                    <button onClick={() => handleTabClick('details')} className={`rfi-tab-btn ${activeTab === 'details' ? 'active' : ''}`}><List size={18} /><span>Details</span></button>
                    <button onClick={() => handleTabClick('discussion')} className={`rfi-tab-btn ${activeTab === 'discussion' ? 'active' : ''}`}><MessageSquare size={18} /><span>Chat</span></button>
                    <button onClick={() => handleTabClick('audit')} className={`rfi-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}><History size={18} /><span>History</span></button>
                    {hasRevisions && (
                        <button onClick={() => handleTabClick('revisions')} className={`rfi-tab-btn ${activeTab === 'revisions' ? 'active' : ''}`}><List size={18} /><span>Versions</span></button>
                    )}
                </div>

                <div className="modal-body rfi-universal-body">
                    {activeTab === 'review' && (
                        <div className="rfi-tab-panel-full review-panel">
                            <div className="panel-header-row" style={{ alignItems: 'center', marginBottom: '0.5rem' }}>
                                <h4 className="panel-heading" style={{ margin: 0 }}>Decision History</h4>
                                {rfi.status !== RFI_STATUS.PENDING && rfi.status !== RFI_STATUS.VERIFICATION_PENDING && onEditDecision && user.role === 'consultant' && user.id === rfi.reviewedBy && (
                                    <button 
                                        className="btn-change-decision-compat"
                                        onClick={() => onEditDecision(rfi)}
                                    >
                                        <Edit3 size={14} />
                                        <span>Change Decision</span>
                                    </button>
                                )}
                            </div>

                            {rfi.status === RFI_STATUS.PENDING && (!rfi.internalReviews || rfi.internalReviews.length === 0) && (
                                <div className="rfi-verdict-card pending">
                                    <div className="verdict-status">
                                        <ClipboardList size={20} />
                                        <span>Awaiting Review</span>
                                    </div>
                                    <p className="verdict-helper">
                                        This RFI is currently in the queue and has not been reviewed by a consultant yet.
                                    </p>
                                    {assignmentMode === 'claim' && !rfi.assignedTo && user?.role === 'consultant' && (
                                        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                                            <button
                                                className="btn btn-claim"
                                                onClick={() => { claimRFI(rfi.id, user.id); onClose(); }}
                                                style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
                                            >
                                                <Hand size={18} /> Claim Inspection
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="verdict-history-feed">
                                {/* 1. Show all internal recommendations/signatures */}
                                {rfi.internalReviews?.map((rev) => (
                                    <div key={rev.id} className="verdict-bubble">
                                        <div className="bubble-avatar">
                                            <UserAvatar name={rev.reviewer?.name} avatarUrl={rev.reviewer?.avatar_url} size={40} />
                                        </div>
                                        <div className="bubble-content">
                                            <div className="bubble-header">
                                                <span className="bubble-name">{rev.reviewer?.name || 'Consultant'}</span>
                                                <div className={`compact-status-badge ${rev.status_recommendation}`}>
                                                    {rev.status_recommendation === 'conditional_approve' ? 'Cond. Approved' : rev.status_recommendation.toUpperCase()}
                                                </div>
                                            </div>
                                            <div className="bubble-remarks">{rev.remarks}</div>
                                            
                                            {rev.images && rev.images.length > 0 && (
                                                <div className="bubble-attachments">
                                                    <div className="rfi-attachments-grid small">
                                                        {rev.images.map((img, idx) => (
                                                            <a key={idx} href={img} target="_blank" rel="noopener noreferrer" className="rfi-attachment-thumb">
                                                                <img src={img} alt="Markup" onError={(e) => { e.target.src = getThumbnailUrl(img, { width: 100, height: 100 }) }} />
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* 2. Show the final official verdict if RFI is closed/finalized */}
                                {rfi.status !== RFI_STATUS.PENDING && rfi.status !== RFI_STATUS.VERIFICATION_PENDING && (
                                    <div className={`verdict-bubble final-verdict ${rfi.status.toLowerCase()}`}>
                                        <div className="bubble-avatar">
                                            <UserAvatar name={rfi.reviewerName} avatarUrl={rfi.reviewerAvatarUrl} size={40} />
                                        </div>
                                        <div className="bubble-content">
                                            <div className="bubble-header">
                                                <span className="bubble-name">{rfi.reviewerName || 'Consultant'} <span className="final-tag">(Final)</span></span>
                                                <div className={`compact-status-badge ${rfi.status.toLowerCase()}`}>
                                                    {rfi.status === RFI_STATUS.CONDITIONAL_APPROVE ? 'Cond. Approved' : rfi.status.toUpperCase()}
                                                </div>
                                            </div>
                                            <div className="bubble-remarks">{rfi.remarks}</div>
                                            
                                            {rfi.images && rfi.images.length > 0 && (
                                                <div className="bubble-attachments">
                                                    <div className="rfi-attachments-grid small">
                                                        {rfi.images.map((img, idx) => (
                                                            <a key={idx} href={img} target="_blank" rel="noopener noreferrer" className="rfi-attachment-thumb">
                                                                <img src={img} alt="Final Proof" onError={(e) => { e.target.src = getThumbnailUrl(img, { width: 100, height: 100 }) }} />
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Resolution section for contractors */}
                            {rfi.status === RFI_STATUS.CONDITIONAL_APPROVE && user.role === 'contractor' && (
                                <div className="rfi-resolve-section-inline" style={{ marginTop: '1rem' }}>
                                    <h4 className="resolve-title"><CheckCircle size={18} /> Resolve Conditions</h4>
                                    <p className="resolve-helper">Upload a final proof photo to complete this inspection.</p>
                                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={(e) => e.target.files && setResolveFile(e.target.files[0])} />
                                    {!resolveFile ? (
                                        <button onClick={() => fileInputRef.current?.click()} className="btn btn-resolve-pick"><Upload size={18} /> Select Proof Photo</button>
                                    ) : (
                                        <div className="resolve-preview">
                                            <div className="file-pill"><span>{resolveFile.name}</span><button onClick={() => setResolveFile(null)}><X size={14}/></button></div>
                                            <button onClick={handleResolve} disabled={isResolving} className="btn btn-resolve-submit">{isResolving ? 'Resolving...' : 'Upload & Resolve'}</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'internal' && user?.role === 'consultant' && activeProject?.multi_review_enabled && (
                        <div className="rfi-tab-panel-full internal-panel">
                            <div className="panel-header-row">
                                <h4 className="panel-heading">Team Feedback Log</h4>
                                {!showInternalReviewForm && rfi.status === RFI_STATUS.PENDING && (
                                    <button className="btn-add-internal-compact" onClick={() => setShowInternalReviewForm(true)}>
                                        <Users size={14} /> + New Review
                                    </button>
                                )}
                            </div>
                            
                            {showInternalReviewForm && (
                                <div className="internal-review-form-flat">
                                    <div className="form-title">Submit Technical Review</div>
                                    <div className="form-body">
                                        <div className="field-group">
                                            <label>Recommendation</label>
                                            <select value={internalStatus} onChange={(e) => setInternalStatus(e.target.value)}>
                                                <option value="approved">Approve</option>
                                                <option value="conditional_approve">Conditionally Approve</option>
                                                <option value="rejected">Reject</option>
                                            </select>
                                        </div>
                                        <div className="field-group">
                                            <label>Technical Remarks</label>
                                            <textarea 
                                                value={internalRemarks} 
                                                onChange={(e) => setInternalRemarks(e.target.value)} 
                                                rows={3} 
                                                placeholder="Provide internal feedback or technical notes..."
                                            />
                                        </div>
                                        <div className="form-actions">
                                            <button className="btn-cancel-flat" onClick={() => setShowInternalReviewForm(false)}>Cancel</button>
                                            <button 
                                                className="btn-submit-flat"
                                                disabled={!internalRemarks.trim()}
                                                onClick={async () => {
                                                    const success = await submitInternalReview(rfi.id, internalStatus, internalRemarks);
                                                    if (success) {
                                                        setShowInternalReviewForm(false);
                                                        setInternalRemarks('');
                                                    }
                                                }}
                                            >
                                                Post Review
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="internal-reviews-feed">
                                {rfi.internalReviews?.length > 0 ? (
                                    [...rfi.internalReviews].reverse().map(rev => (
                                        <div key={rev.id} className="internal-feed-item">
                                            <div className="feed-avatar">
                                                <UserAvatar name={rev.reviewer?.name} avatarUrl={rev.reviewer?.avatar_url} size={32} />
                                            </div>
                                            <div className="feed-content">
                                                <div className="feed-header">
                                                    <span className="feed-name">{rev.reviewer?.name || 'Consultant'}</span>
                                                    <div className={`feed-badge ${rev.status_recommendation}`}>
                                                        {rev.status_recommendation === 'conditional_approve' ? 'COND. APPROVE' : rev.status_recommendation.toUpperCase()}
                                                    </div>
                                                    <span className="feed-time">{formatDateDisplay(rev.created_at?.split('T')[0])}</span>
                                                </div>
                                                <div className="feed-remarks">{rev.remarks}</div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="empty-feed">
                                        <div className="empty-icon"><Users size={32} /></div>
                                        <p>No internal technical reviews have been logged for this RFI yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'details' && (
                        <div className="rfi-tab-panel-full details-panel">
                            <h4 className="panel-heading">Inspection Details</h4>
                            <div className="rfi-detail-grid-universal">
                                {displayColumns.map(col => {
                                    const value = mergedData[col.field_key];
                                    if (!value) return null;
                                    
                                    let icon = <List size={20} />;
                                    if (col.field_key === 'location') icon = <MapPin size={20} />;
                                    if (col.field_key === 'inspection_type' || col.field_key === 'description') icon = <Tag size={20} />;

                                    return (
                                        <div className="rfi-detail-item" key={col.field_key}>
                                            {icon}
                                            <div>
                                                <div className="rfi-detail-label">{col.field_name || col.field_key}</div>
                                                <div className="rfi-detail-value">{value}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                
                                <div className="rfi-detail-item">
                                    <Calendar size={20} />
                                    <div><div className="rfi-detail-label">Submission Date</div><div className="rfi-detail-value">{formatDateDisplay(rfi.originalFiledDate)}</div></div>
                                </div>
                                <div className="rfi-detail-item">
                                    <UserAvatar name={rfi.filerName} avatarUrl={rfi.filerAvatarUrl} size={40} />
                                    <div><div className="rfi-detail-label">Filed By</div><div className="rfi-detail-value">{rfi.filerName}</div><div className="rfi-detail-subvalue">{rfi.filerCompany}</div></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'discussion' && (
                        <div className="rfi-tab-panel-full chat-panel">
                            <ThreadedComments rfiId={rfi.id} scrollTrigger={combinedTrigger} />
                        </div>
                    )}

                    {activeTab === 'audit' && (
                        <div className="rfi-tab-panel-full audit-panel">
                            <AuditLog rfiId={rfi.id} />
                        </div>
                    )}

                    {activeTab === 'revisions' && (
                        <div className="rfi-tab-panel-full revision-panel">
                            <div className="revision-timeline universal">
                                {lineage.map((item, idx) => {
                                    const itemData = {
                                        description: item.description || '',
                                        inspection_type: item.inspectionType || item.inspection_type || '',
                                        ...(item.customFields || {})
                                    };
                                    return (
                                        <div key={item.id} className={`revision-node ${item.id === rfi.id ? 'current' : ''}`}>
                                            <div className="revision-connector"><div className="node-dot"></div>{idx < lineage.length - 1 && <div className="node-line"></div>}</div>
                                            <div className="revision-card">
                                                <div className="revision-card-header"><span className="revision-version">V{idx + 1} - RFI #{item.customFields?.rfi_no || item.serialNo}</span><StatusBadge status={item.status} /></div>
                                                <div className="revision-card-meta"><span>{item.status === 'pending' ? `Filed on ${formatDateDisplay(item.filedDate)}` : `${item.status === 'rejected' ? 'Rejected' : 'Approved'} on ${formatDateDisplay(item.reviewedAt?.split('T')[0] || item.filedDate)}`}</span></div>
                                                <div className="revision-card-desc">{itemData.description || itemData.inspection_type || 'Revision Details'}</div>
                                                {item.remarks && <div className="revision-card-remarks"><strong>Feedback:</strong> {item.remarks}</div>}
                                                {item.id === rfi.id && <div className="current-badge">Currently Viewing</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>
                {`
                .rfi-detail-modal.universal-tabbed { width: 95vw; max-width: 900px; height: 90vh; max-height: 800px; display: flex; flex-direction: column; background: #f8fafc; border-radius: 1.5rem; overflow: hidden; }
                .modal-inner { display: flex; flex-direction: column; height: 100%; width: 100%; }
                .rfi-detail-header { padding: 1.25rem 1.5rem; border-bottom: 1px solid #e2e8f0; background: white; }
                .rfi-detail-title { display: flex; justify-content: space-between; align-items: center; width: 100%; }
                .rfi-title-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem; }
                .rfi-title-row h2 { font-size: 1.25rem; font-weight: 800; color: #0f172a; margin: 0; }
                .rfi-subtitle-location { font-size: 0.85rem; color: #64748b; font-weight: 500; margin: 0; }
                
                .btn-close-hex {
                    width: 36px;
                    height: 36px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 10px;
                    border: 1px solid #e2e8f0;
                    background: #f8fafc;
                    color: #64748b;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .btn-close-hex:hover {
                    background: #fee2e2;
                    color: #ef4444;
                    border-color: #fca5a5;
                    transform: rotate(90deg);
                }

                .rfi-universal-tabs { display: flex; background: white; padding: 0 1rem; border-bottom: 1px solid #e2e8f0; gap: 0.5rem; overflow-x: auto; scrollbar-width: none; }
                .rfi-universal-tabs::-webkit-scrollbar { display: none; }
                .rfi-tab-btn { padding: 1rem 1.25rem; font-size: 0.9rem; font-weight: 600; color: #64748b; border: none; background: none; display: flex; align-items: center; gap: 0.75rem; cursor: pointer; white-space: nowrap; border-bottom: 3px solid transparent; transition: all 0.2s; position: relative; }
                .rfi-tab-btn.active { color: var(--clr-brand-primary); border-bottom-color: var(--clr-brand-primary); background: rgba(6, 182, 212, 0.05); }
                
                .tab-badge-mini { background: var(--clr-brand-primary); color: white; border-radius: 99px; padding: 2px 6px; font-size: 0.65rem; font-weight: 800; min-width: 18px; text-align: center; }

                .rfi-universal-body { flex: 1; overflow-y: auto; padding: 1.5rem; background: #f8fafc; }
                .rfi-tab-panel-full { max-width: 800px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 1.5rem; }
                
                .panel-heading { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 0; }
                .panel-header-row { display: flex; justify-content: space-between; align-items: center; }

                /* Team Feedback Log Styles */
                .internal-reviews-feed { display: flex; flex-direction: column; gap: 1rem; margin-top: 0.5rem; }
                .internal-feed-item { display: flex; gap: 1rem; background: white; padding: 1rem; border-radius: 1rem; border: 1px solid #e2e8f0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
                .feed-avatar { flex-shrink: 0; }
                .feed-content { flex: 1; min-width: 0; }
                .feed-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
                .feed-name { font-weight: 700; color: #1e293b; font-size: 0.9rem; }
                .feed-badge { font-size: 0.65rem; font-weight: 800; padding: 2px 8px; border-radius: 6px; text-transform: uppercase; }
                .feed-badge.approved { background: #dcfce7; color: #166534; }
                .feed-badge.conditional_approve { background: #fef3c7; color: #92400e; }
                .feed-badge.rejected { background: #fee2e2; color: #991b1b; }
                .feed-time { font-size: 0.75rem; color: #94a3b8; margin-left: auto; }
                .feed-remarks { font-size: 0.95rem; color: #475569; line-height: 1.5; white-space: pre-wrap; }
                
                /* Compact Form Style */
                .internal-review-form-flat { background: white; border: 1px solid #e2e8f0; border-radius: 1.25rem; overflow: hidden; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
                .internal-review-form-flat .form-title { padding: 1rem 1.25rem; background: #f8fafc; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem; font-weight: 700; color: #334155; }
                .internal-review-form-flat .form-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
                .field-group label { display: block; font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; margin-bottom: 0.5rem; }
                .field-group select, .field-group textarea { width: 100%; padding: 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.75rem; font-size: 0.95rem; outline: none; }
                .field-group textarea { resize: vertical; }
                .form-actions { display: flex; gap: 0.75rem; justify-content: flex-end; padding-top: 0.5rem; }
                .btn-cancel-flat { padding: 0.6rem 1.25rem; font-weight: 600; color: #64748b; background: #f1f5f9; border: none; border-radius: 0.75rem; cursor: pointer; }
                .btn-submit-flat { padding: 0.6rem 1.5rem; font-weight: 600; color: white; background: var(--clr-brand-primary); border: none; border-radius: 0.75rem; cursor: pointer; }
                .btn-submit-flat:disabled { background: #cbd5e1; cursor: not-allowed; }
                
                .btn-add-internal-compact { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; font-size: 0.85rem; font-weight: 700; color: var(--clr-brand-primary); background: rgba(6, 182, 212, 0.08); border: 1px solid rgba(6, 182, 212, 0.2); border-radius: 0.75rem; cursor: pointer; transition: all 0.2s; }
                .btn-add-internal-compact:hover { background: rgba(6, 182, 212, 0.15); }

                .empty-feed { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem 1rem; color: #94a3b8; text-align: center; }
                .empty-icon { margin-bottom: 1rem; opacity: 0.3; }

                /* Standard Elements */
                .rfi-verdict-card { padding: 1.5rem; border-radius: 1.25rem; border: 1px solid transparent; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); background: white; }
                .rfi-verdict-card.approved { border-left: 6px solid #22c55e; }
                .rfi-verdict-card.rejected { border-left: 6px solid #ef4444; }
                .rfi-verdict-card.conditional_approve { border-left: 6px solid #f59e0b; }
                .rfi-verdict-card.pending { border: 2px dashed #cbd5e1; background: #f1f5f9; }
                .verdict-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
                .verdict-status { display: flex; align-items: center; gap: 0.75rem; font-weight: 800; font-size: 1.1rem; }
                .verdict-meta { font-size: 0.8rem; opacity: 0.7; font-weight: 600; }
                .rfi-verdict-remarks { font-size: 0.95rem; line-height: 1.6; font-style: italic; color: #334155; padding: 1rem; background: rgba(0,0,0,0.02); border-radius: 0.75rem; margin-bottom: 1.25rem; }
                .rfi-attachments-grid.large { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.75rem; }
                .rfi-attachment-thumb { aspect-ratio: 1; border-radius: 0.75rem; overflow: hidden; border: 1px solid #e2e8f0; transition: transform 0.2s; }
                .rfi-attachment-thumb img { width: 100%; height: 100%; object-fit: cover; }
                .rfi-detail-grid-universal { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1.5rem; background: white; padding: 1.5rem; border-radius: 1.25rem; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .rfi-detail-item { display: flex; gap: 1rem; align-items: flex-start; }
                .rfi-detail-item svg { color: #94a3b8; margin-top: 3px; }
                .rfi-detail-label { font-size: 0.7rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.25rem; }
                .rfi-detail-value { font-size: 0.95rem; font-weight: 600; color: #1e293b; }
                .rfi-detail-subvalue { font-size: 0.8rem; color: #64748b; }
                .chat-panel, .audit-panel { background: white; border-radius: 1.25rem; border: 1px solid #e2e8f0; overflow: hidden; height: 100%; min-height: 500px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
                .revision-timeline.universal { background: white; padding: 1.5rem; border-radius: 1.25rem; border: 1px solid #e2e8f0; }
                .revision-node { display: flex; gap: 1.25rem; }
                .node-dot { width: 12px; height: 12px; border-radius: 50%; background: #cbd5e1; margin-top: 12px; }
                .revision-node.current .node-dot { background: var(--clr-brand-primary); }
                .revision-connector { display: flex; flex-direction: column; align-items: center; }
                .node-line { width: 2px; flex: 1; background: #f1f5f9; }
                .revision-card { padding: 1rem; border-radius: 1rem; border: 1px solid #f1f5f9; margin-bottom: 1rem; background: white; flex: 1; }
                .revision-node.current .revision-card { border-color: var(--clr-brand-primary); background: #f0f9ff; }
                .revision-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
                .revision-version { font-weight: 700; font-size: 0.9rem; }
                .revision-card-meta { font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; }
                .revision-card-desc { font-size: 0.85rem; color: #475569; }
                .revision-card-remarks { font-size: 0.85rem; padding: 0.5rem; background: #00000005; border-radius: 0.4rem; margin-top: 0.5rem; font-style: italic; }
                .current-badge { font-size: 0.65rem; font-weight: 800; color: var(--clr-brand-primary); margin-top: 0.5rem; }

                .rfi-resolve-section-inline { padding: 1.5rem; background: #fffbeb; border-radius: 1.25rem; border: 1px solid #fef3c7; margin-top: 1rem; }
                .ir-remarks { font-size: 0.9rem; color: #475569; font-style: italic; background: #f8fafc; padding: 0.75rem; border-radius: 0.5rem; }
                .no-internal-reviews { font-size: 0.9rem; color: #94a3b8; font-style: italic; }

                @media (max-width: 768px) {
                    .rfi-detail-modal.universal-tabbed { width: 100vw; height: 100vh; max-height: none; border-radius: 0; }
                    .rfi-tab-btn span { display: none; }
                    .rfi-tab-btn { flex: 1; justify-content: center; padding: 1rem 0; }
                    .rfi-universal-body { padding: 1rem; }
                    .rfi-detail-grid-universal { grid-template-columns: 1fr; }
                }
                .btn-change-decision-compat {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    background: white;
                    color: #475569;
                    font-size: 0.75rem;
                    font-weight: 700;
                    padding: 6px 12px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }
                .btn-change-decision-compat:hover {
                    background: #f8fafc;
                    border-color: #cbd5e1;
                    color: #1e293b;
                }

                .verdict-history-feed {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    margin-top: 0.5rem;
                }
                .verdict-bubble {
                    background: white;
                    border-radius: 20px;
                    padding: 16px;
                    display: flex;
                    gap: 16px;
                    border: 1px solid #f1f5f9;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.03);
                    position: relative;
                }
                .verdict-bubble.final-verdict {
                    border-left: 4px solid #06b6d4;
                    background: #fcfdfe;
                }
                .verdict-bubble.final-verdict.approved { border-left-color: #22c55e; }
                .verdict-bubble.final-verdict.rejected { border-left-color: #ef4444; }
                .verdict-bubble.final-verdict.conditional_approve { border-left-color: #f59e0b; }

                .bubble-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .bubble-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .bubble-name {
                    font-size: 0.95rem;
                    font-weight: 700;
                    color: #1e293b;
                }
                .final-tag {
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: #64748b;
                    background: #f1f5f9;
                    padding: 2px 6px;
                    border-radius: 4px;
                    margin-left: 4px;
                }
                .bubble-remarks {
                    font-size: 0.85rem;
                    color: #475569;
                    line-height: 1.5;
                    margin: 0;
                }
                .bubble-attachments {
                    margin-top: 8px;
                    border-top: 1px solid #f1f5f9;
                    padding-top: 8px;
                }

                .compact-status-badge {
                    font-size: 0.7rem;
                    font-weight: 700;
                    padding: 4px 12px;
                    border-radius: 99px;
                    text-transform: capitalize;
                }
                .compact-status-badge.approved { background: #dcfce7; color: #166534; }
                .compact-status-badge.rejected { background: #fee2e2; color: #991b1b; }
                .compact-status-badge.conditional_approve { background: #fef3c7; color: #92400e; }
                .compact-status-badge.cancelled { background: #f1f5f9; color: #475569; }

                .rfi-attachments-grid.small {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                }
                .rfi-attachments-grid.small .rfi-attachment-thumb {
                    width: 60px;
                    height: 60px;
                    border-radius: 8px;
                    overflow: hidden;
                }
                `}
            </style>
        </div>
    );
}
