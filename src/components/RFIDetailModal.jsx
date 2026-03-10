import { useState } from 'react';
import { X, Calendar, MapPin, Tag, User, MessageSquare, History, List } from 'lucide-react';
import ThreadedComments from './ThreadedComments';
import AuditLog from './AuditLog';
import StatusBadge from './StatusBadge';
import { formatDateDisplay } from '../utils/rfiLogic';
import { useRFI } from '../context/RFIContext';

export default function RFIDetailModal({ rfi, onClose, externalScrollTrigger }) {
    const [activeTab, setActiveTab] = useState('discussion');
    const [tabScrollTrigger, setTabScrollTrigger] = useState(0);
    const { rfis } = useRFI();

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
                                <h2>RFI #{rfi.serialNo}</h2>
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
                                    {Object.entries(rfi.customFields).map(([key, value]) => (
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

                        {rfi.remarks && (
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
                                                    <span className="revision-version">V{idx + 1} - RFI #{item.serialNo}</span>
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
