import { useState, useRef, useMemo } from 'react';
import { X, Calendar, MapPin, Tag, MessageSquare, History, List, Upload, CheckCircle, ClipboardList, XCircle, Hand, Ban } from 'lucide-react';
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
    // Decision Actions
    onApprove,
    onConditional,
    onReject,
    onCancel
}) {
    const [activeTab, setActiveTab] = useState('review');
    const [tabScrollTrigger, setTabScrollTrigger] = useState(0);
    const { rfis, updateRFI, claimRFI } = useRFI();
    const { assignmentMode } = useProject();
    const { user } = useAuth();
    const fileInputRef = useRef(null);
    const [resolveFile, setResolveFile] = useState(null);
    const [isResolving, setIsResolving] = useState(false);

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
                        <button className="btn-close" onClick={onClose}>
                            <X size={24} color="var(--clr-text-secondary)" />
                        </button>
                    </div>
                </div>

                <div className="rfi-universal-tabs">
                    <button onClick={() => handleTabClick('review')} className={`rfi-tab-btn ${activeTab === 'review' ? 'active' : ''}`}><CheckCircle size={18} /><span>Review</span></button>
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
                            <h4 className="panel-heading">Review Verdict</h4>
                            {rfi.status === RFI_STATUS.PENDING || rfi.status === RFI_STATUS.VERIFICATION_PENDING ? (
                                <div className="rfi-verdict-card pending">
                                    <div className="verdict-status">
                                        <ClipboardList size={24} />
                                        <span>{rfi.status === RFI_STATUS.VERIFICATION_PENDING ? 'Verification Pending' : 'Awaiting Review'}</span>
                                    </div>
                                    <p className="verdict-helper">
                                        {rfi.status === RFI_STATUS.VERIFICATION_PENDING 
                                            ? 'Proof has been submitted and is awaiting your final verification.' 
                                            : 'This RFI is currently in the queue and has not been reviewed by a consultant yet.'}
                                    </p>
                                    
                                    {assignmentMode === 'claim' && !rfi.assignedTo && user?.role === 'consultant' && (
                                        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                                            <button
                                                className="btn btn-claim"
                                                onClick={() => { claimRFI(rfi.id, user.id); onClose(); }}
                                                title="Claim this RFI for review"
                                                style={{ padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
                                            >
                                                <Hand size={18} /> Claim Inspection
                                            </button>
                                        </div>
                                    )}

                                    {/* Action Center for Claimed/Assigned Consultant */}
                                    {user?.role === 'consultant' && (rfi.assignedTo === user.id || assignmentMode === 'open') && (
                                        <div className="consultant-action-center" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--clr-border)', paddingTop: '1.25rem' }}>
                                            <div style={{ textAlign: 'center', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--clr-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                Decision Action Center
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
                                                {rfi.status === RFI_STATUS.PENDING ? (
                                                    <>
                                                        <button 
                                                            className="btn btn-approve-full" 
                                                            onClick={onApprove}
                                                            style={{ backgroundColor: 'var(--clr-success)', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                                                        >
                                                            <CheckCircle size={18} /> Approve
                                                        </button>
                                                        <button 
                                                            className="btn btn-approve-cond" 
                                                            onClick={onConditional}
                                                            style={{ backgroundColor: 'var(--clr-warning)', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                                                        >
                                                            <CheckCircle size={18} /> Cond. Approve
                                                        </button>
                                                        <button 
                                                            className="btn btn-reject-full" 
                                                            onClick={onReject}
                                                            style={{ backgroundColor: 'var(--clr-danger)', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                                                        >
                                                            <XCircle size={18} /> Reject
                                                        </button>
                                                    </>
                                                ) : (
                                                    /* Verification Pending Case */
                                                    <>
                                                        <button 
                                                            className="btn btn-approve-full" 
                                                            onClick={onApprove}
                                                            style={{ backgroundColor: 'var(--clr-success)', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                                                        >
                                                            <CheckCircle size={18} /> Verify & Approve
                                                        </button>
                                                        <button 
                                                            className="btn btn-reject-full" 
                                                            onClick={onReject}
                                                            style={{ backgroundColor: 'var(--clr-danger)', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                                                        >
                                                            <XCircle size={18} /> Deny Proof
                                                        </button>
                                                    </>
                                                )}
                                                
                                                <button 
                                                    className="btn btn-cancel-terminal" 
                                                    onClick={onCancel}
                                                    style={{ backgroundColor: '#4b5563', color: 'white', border: 'none', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
                                                >
                                                    <Ban size={18} /> Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className={`rfi-verdict-card ${rfi.status.toLowerCase()}`}>
                                    <div className="verdict-header">
                                        <div className="verdict-status">
                                            {(rfi.status === RFI_STATUS.APPROVED || rfi.status === RFI_STATUS.CONDITIONAL_APPROVE) && <CheckCircle size={24} />}
                                            {rfi.status === RFI_STATUS.REJECTED && <XCircle size={24} />}
                                            <span className="verdict-label">
                                                {rfi.status === RFI_STATUS.CONDITIONAL_APPROVE ? 'Cond. Approved' : rfi.status.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="verdict-meta">Reviewed by {rfi.reviewerName || 'Consultant'}</div>
                                    </div>
                                    {rfi.remarks && <div className="rfi-verdict-remarks"><p>"{rfi.remarks}"</p></div>}
                                    {rfi.images && rfi.images.length > 0 && (
                                        <div className="rfi-verdict-attachments">
                                            <div className="attachment-label">Proof & Attachments ({rfi.images.length})</div>
                                            <div className="rfi-attachments-grid large">
                                                {rfi.images.map((img, idx) => (
                                                    <a key={idx} href={img} target="_blank" rel="noopener noreferrer" className="rfi-attachment-thumb">
                                                        <img 
                                                            src={img} 
                                                            alt={`Attachment ${idx + 1}`}
                                                            onError={(e) => {
                                                                // Fallback: if original fails, try thumbnail transform
                                                                const thumbUrl = getThumbnailUrl(img, { width: 200, height: 200 });
                                                                if (e.target.src !== thumbUrl) {
                                                                    e.target.src = thumbUrl;
                                                                }
                                                            }}
                                                        />
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            {rfi.status === RFI_STATUS.CONDITIONAL_APPROVE && user.role === 'contractor' && (
                                <div className="rfi-resolve-section-inline">
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
                .rfi-universal-tabs { display: flex; background: white; padding: 0 1rem; border-bottom: 1px solid #e2e8f0; gap: 0.5rem; overflow-x: auto; scrollbar-width: none; }
                .rfi-universal-tabs::-webkit-scrollbar { display: none; }
                .rfi-tab-btn { padding: 1rem 1.25rem; font-size: 0.9rem; font-weight: 600; color: #64748b; border: none; background: none; display: flex; align-items: center; gap: 0.75rem; cursor: pointer; white-space: nowrap; border-bottom: 3px solid transparent; transition: all 0.2s; position: relative; }
                .rfi-tab-btn.active { color: var(--clr-brand-primary); border-bottom-color: var(--clr-brand-primary); background: rgba(6, 182, 212, 0.05); }
                .rfi-universal-body { flex: 1; overflow-y: auto; padding: 1.5rem; background: #f8fafc; }
                .rfi-tab-panel-full { max-width: 800px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 1.5rem; }
                
                .panel-heading { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 0.5rem; }
                
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
                .rfi-attachment-thumb:hover { transform: scale(1.05); }
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
                .revision-card { padding: 1rem; border-radius: 1rem; border: 1px solid #f1f5f9; margin-bottom: 1rem; background: white; }
                .revision-node.current .revision-card { border-color: var(--clr-brand-primary); background: #f0f9ff; }
                
                .rfi-resolve-section-inline { padding: 1.5rem; background: #fffbeb; border-radius: 1.25rem; border: 1px solid #fef3c7; margin-top: 1rem; }
                .btn-resolve-pick { width: 100%; background: white; border: 2px dashed #fde68a; color: #92400e; padding: 0.75rem; font-weight: 700; border-radius: 0.75rem; }
                .file-pill { background: white; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px solid #fde68a; display: flex; justify-content: space-between; margin-bottom: 1rem; }
                .btn-resolve-submit { width: 100%; background: #d97706; color: white; padding: 0.75rem; font-weight: 700; border-radius: 0.75rem; }

                @media (max-width: 768px) {
                    .rfi-detail-modal.universal-tabbed { width: 100vw; height: 100vh; max-height: none; border-radius: 0; }
                    .rfi-tab-btn span { display: none; }
                    .rfi-tab-btn { flex: 1; justify-content: center; padding: 1rem 0; }
                    .rfi-universal-body { padding: 1rem; }
                    .rfi-detail-grid-universal { grid-template-columns: 1fr; }
                }
                `}
            </style>
        </div>
    );
}
