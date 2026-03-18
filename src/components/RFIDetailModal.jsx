import { useState, useRef } from 'react';
import { X, Calendar, MapPin, Tag, User, MessageSquare, History, List, Upload, CheckCircle, Ban } from 'lucide-react';
import ThreadedComments from './ThreadedComments';
import AuditLog from './AuditLog';
import StatusBadge from './StatusBadge';
import { formatDateDisplay } from '../utils/rfiLogic';
import { useRFI } from '../context/RFIContext';
import { useAuth } from '../context/AuthContext';
import { RFI_STATUS } from '../utils/constants';

export default function RFIDetailModal({ rfi, onClose, externalScrollTrigger }) {
    const [activeTab, setActiveTab] = useState('discussion');
    const [tabScrollTrigger, setTabScrollTrigger] = useState(0);
    const { rfis, updateRFI } = useRFI();
    const { user } = useAuth();
    const fileInputRef = useRef(null);
    const [resolveFile, setResolveFile] = useState(null);
    const [isResolving, setIsResolving] = useState(false);

    async function handleResolve() {
        if (!resolveFile) {
            alert('Please select a final photo first.');
            return;
        }
        setIsResolving(true);
        try {
            await updateRFI(rfi.id, {
                status: 'approved',
                appendFiles: [resolveFile],
                remarks: 'Conditions resolved via final photo upload.'
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

    // Find all RFIs in the same lineage
    const getLineage = () => {
        let current = rfi;
        // Walk up to find root
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

    // Combine triggers into a unique value that changes on every relevant click
    const combinedTrigger = (externalScrollTrigger || 0) + tabScrollTrigger;

    const handleTabClick = (tab) => {
        if (tab === 'discussion') {
            setTabScrollTrigger(prev => prev + 1);
        }
        setActiveTab(tab);
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
            <div className="modal-content rfi-detail-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header rfi-detail-header">
                    <div className="modal-title rfi-detail-title">
                        <div>
                            <div className="rfi-title-row">
                                <h2>RFI #{rfi.customFields?.rfi_no || rfi.serialNo}</h2>
                                <StatusBadge status={rfi.status} />
                            </div>
                            <p>{rfi.description}</p>
                        </div>
                        <button className="btn-close" onClick={onClose}>
                            <X size={24} color="var(--clr-text-secondary)" />
                        </button>
                    </div>
                </div>

                <div className="modal-body rfi-detail-body">
                    <aside className="rfi-details-pane">
                        <h4 className="rfi-pane-heading">Inspection Details</h4>

                        <div className="rfi-detail-list">
                            <div className="rfi-detail-item">
                                <MapPin size={18} color="var(--clr-text-muted)" />
                                <div>
                                    <div className="rfi-detail-label">Location</div>
                                    <div className="rfi-detail-value">{rfi.location}</div>
                                </div>
                            </div>

                            <div className="rfi-detail-item">
                                <Tag size={18} color="var(--clr-text-muted)" />
                                <div>
                                    <div className="rfi-detail-label">Type</div>
                                    <div className="rfi-detail-value">{rfi.inspectionType}</div>
                                </div>
                            </div>

                            <div className="rfi-detail-item">
                                <Calendar size={18} color="var(--clr-text-muted)" />
                                <div>
                                    <div className="rfi-detail-label">Filed Date</div>
                                    <div className="rfi-detail-value">{formatDateDisplay(rfi.originalFiledDate)}</div>
                                </div>
                            </div>

                            <div className="rfi-detail-item">
                                <User size={18} color="var(--clr-text-muted)" />
                                <div>
                                    <div className="rfi-detail-label">Filed By</div>
                                    <div className="rfi-detail-value">{rfi.filerName}</div>
                                    <div className="rfi-detail-subvalue">{rfi.filerCompany}</div>
                                </div>
                            </div>
                        </div>

                        {/* Custom fields */}
                        {rfi.customFields && Object.keys(rfi.customFields).length > 0 && (
                            <div style={{ marginTop: '1rem' }}>
                                <h4 className="rfi-pane-heading">Additional Fields</h4>
                                <div className="rfi-detail-list">
                                    {Object.entries(rfi.customFields)
                                        .filter(([key]) => key !== 'rfi_no' && key !== 'parentId')
                                        .map(([key, value]) => (
                                        <div className="rfi-detail-item" key={key}>
                                            <List size={18} color="var(--clr-text-muted)" />
                                            <div>
                                                <div className="rfi-detail-label">{key.replace(/_/g, ' ')}</div>
                                                <div className="rfi-detail-value">{value || '—'}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {rfi.status === RFI_STATUS.CANCELLED && (
                            <div className="alert-box danger-light mb-4" style={{ borderRadius: '12px', padding: '1rem', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--clr-danger)', fontWeight: 700, marginBottom: '4px' }}>
                                    <Ban size={18} /> RFI CANCELLED
                                </div>
                                <p style={{ fontSize: '0.85rem', color: 'var(--clr-text-secondary)', margin: 0 }}>
                                    <strong>Cancellation Reason:</strong> {rfi.remarks || 'No reason provided.'}
                                </p>
                            </div>
                        )}

                        {rfi.remarks && rfi.status !== RFI_STATUS.CANCELLED && (
                            <div className="rfi-latest-remarks">
                                <div className="rfi-detail-label">Latest Remarks</div>
                                <div>"{rfi.remarks}"</div>
                            </div>
                        )}

                        {rfi.images && rfi.images.length > 0 && (
                            <div className="rfi-attachments-pane">
                                <h4 className="rfi-pane-heading">Attachments</h4>
                                <div className="rfi-attachments-grid">
                                    {rfi.images.map((img, idx) => (
                                        <a key={idx} href={img} target="_blank" rel="noopener noreferrer" className="rfi-attachment-thumb">
                                            <img src={img} alt={`Attachment ${idx + 1}`} />
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {rfi.status === RFI_STATUS.CONDITIONAL_APPROVE && user.role === 'contractor' && (rfi.filedBy === user.id || rfi.assignedTo === user.id) && (
                            <div className="rfi-resolve-section" style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--clr-warning-bg)', borderRadius: '12px', border: '1px solid var(--clr-warning-border)' }}>
                                <h4 style={{ margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--clr-warning)' }}>
                                    <CheckCircle size={16} /> Resolve Conditions
                                </h4>
                                <p style={{ fontSize: '0.85rem', color: 'var(--clr-text-secondary)', marginBottom: '1rem', lineHeight: 1.4 }}>
                                    Upload a final photo demonstrating you have satisfied the consultant's conditions to fully approve this inspection.
                                </p>
                                
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    accept="image/*"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            setResolveFile(e.target.files[0]);
                                        }
                                    }}
                                />

                                {!resolveFile ? (
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className="btn"
                                        style={{ width: '100%', background: 'var(--clr-bg-elevated)', border: '1px dashed var(--clr-warning)', color: 'var(--clr-warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0.65rem' }}
                                    >
                                        <Upload size={16} /> Select Final Photo
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--clr-bg-elevated)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--clr-border)', fontSize: '0.85rem' }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--clr-text-main)' }}>{resolveFile.name}</span>
                                            <button onClick={() => setResolveFile(null)} style={{ background: 'transparent', border: 'none', color: 'var(--clr-danger)', cursor: 'pointer' }}><X size={14}/></button>
                                        </div>
                                        <button 
                                            onClick={handleResolve}
                                            disabled={isResolving}
                                            className="btn"
                                            style={{ width: '100%', background: 'var(--clr-warning)', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0.65rem', fontWeight: 600, border: 'none' }}
                                        >
                                            {isResolving ? 'Resolving...' : 'Submit Resolution'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                    </aside>

                    <section className="rfi-discussion-pane">
                        <div className="rfi-tabs">
                            <button
                                onClick={() => handleTabClick('discussion')}
                                className={`rfi-tab-btn ${activeTab === 'discussion' ? 'active' : ''}`}
                            >
                                <MessageSquare size={16} /> Discussion
                            </button>
                            <button
                                onClick={() => handleTabClick('audit')}
                                className={`rfi-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
                            >
                                <History size={16} /> Audit Trail
                            </button>
                            {hasRevisions && (
                                <button
                                    onClick={() => handleTabClick('revisions')}
                                    className={`rfi-tab-btn ${activeTab === 'revisions' ? 'active' : ''}`}
                                >
                                    <History size={16} /> Revisions ({lineage.length})
                                </button>
                            )}
                        </div>

                        <div className="rfi-tab-panel">
                            {activeTab === 'discussion' && (
                                <ThreadedComments rfiId={rfi.id} scrollTrigger={combinedTrigger} />
                            )}
                            {activeTab === 'audit' && (
                                <AuditLog rfiId={rfi.id} />
                            )}
                            {activeTab === 'revisions' && (
                                <div className="revision-timeline">
                                    {lineage.map((item, idx) => (
                                        <div key={item.id} className={`revision-node ${item.id === rfi.id ? 'current' : ''}`}>
                                            <div className="revision-connector">
                                                <div className="node-dot"></div>
                                                {idx < lineage.length - 1 && <div className="node-line"></div>}
                                            </div>
                                            <div className="revision-card">
                                                <div className="revision-card-header">
                                                    <span className="revision-version">V{idx + 1} - RFI #{item.customFields?.rfi_no || item.serialNo}</span>
                                                    <StatusBadge status={item.status} />
                                                </div>
                                                <div className="revision-card-meta">
                                                    <span>{formatDateDisplay(item.filedDate)}</span>
                                                    {item.filedBy === rfi.filedBy && <span>• Same Filer</span>}
                                                </div>
                                                <div className="revision-card-desc">{item.description}</div>
                                                {item.remarks && (
                                                    <div className="revision-card-remarks">
                                                        <strong>Remarks:</strong> {item.remarks}
                                                    </div>
                                                )}
                                                {item.id === rfi.id && <div className="current-badge">Currently Viewing</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
            <style>
                {`
                .revision-timeline {
                    padding: 1.5rem 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                }
                .revision-node {
                    display: flex;
                    gap: 1.5rem;
                }
                .revision-connector {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 12px;
                }
                .node-dot {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: var(--clr-border-dark);
                    flex-shrink: 0;
                    margin-top: 10px;
                    z-index: 1;
                }
                .revision-node.current .node-dot {
                    background: var(--clr-brand-primary);
                    box-shadow: 0 0 0 4px rgba(6, 182, 212, 0.2);
                }
                .node-line {
                    width: 2px;
                    flex-grow: 1;
                    background: var(--clr-border-dark);
                    margin: 4px 0;
                }
                .revision-card {
                    flex-grow: 1;
                    padding: 1rem;
                    border-radius: 0.75rem;
                    border: 1px solid var(--clr-border-dark);
                    background: var(--clr-bg-paper);
                    margin-bottom: 1rem;
                    transition: all 0.2s;
                }
                .revision-node.current .revision-card {
                    border-color: var(--clr-brand-primary);
                    background: rgba(6, 182, 212, 0.03);
                }
                .revision-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.5rem;
                }
                .revision-version {
                    font-weight: 600;
                    font-size: 0.9rem;
                }
                .revision-card-meta {
                    font-size: 0.75rem;
                    color: var(--clr-text-muted);
                    margin-bottom: 0.5rem;
                }
                .revision-card-desc {
                    font-size: 0.85rem;
                    line-height: 1.5;
                }
                .revision-card-remarks {
                    margin-top: 0.75rem;
                    padding-top: 0.75rem;
                    border-top: 1px dashed var(--clr-border-dark);
                    font-size: 0.8rem;
                    color: var(--clr-text-secondary);
                }
                .current-badge {
                    display: inline-block;
                    margin-top: 0.75rem;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: var(--clr-brand-primary);
                    letter-spacing: 0.05em;
                }
                `}
            </style>
        </div>
    );
}
