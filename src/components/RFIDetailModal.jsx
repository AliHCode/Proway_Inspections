import React, { useState } from 'react';
import { X, Calendar, MapPin, Tag, User, MessageSquare, History } from 'lucide-react';
import ThreadedComments from './ThreadedComments';
import AuditLog from './AuditLog';
import StatusBadge from './StatusBadge';
import { formatDateDisplay } from '../utils/rfiLogic';

export default function RFIDetailModal({ rfi, onClose }) {
    const [activeTab, setActiveTab] = useState('discussion');
    if (!rfi) return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%', padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                <div className="modal-header" style={{ padding: '1.5rem', backgroundColor: 'var(--clr-bg-main)', borderBottom: '1px solid var(--clr-border)' }}>
                    <div className="modal-title" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>RFI #{rfi.serialNo}</h2>
                                <StatusBadge status={rfi.status} />
                            </div>
                            <p style={{ margin: 0, color: 'var(--clr-text-secondary)', fontSize: '0.9rem' }}>
                                {rfi.description}
                            </p>
                        </div>
                        <button className="btn-close" onClick={onClose} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}>
                            <X size={24} color="var(--clr-text-secondary)" />
                        </button>
                    </div>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'row', flex: 1, overflow: 'hidden' }}>

                    {/* Left sidebar: RFI Details */}
                    <div style={{ padding: '1.5rem', width: '300px', borderRight: '1px solid var(--clr-border)', backgroundColor: 'var(--clr-bg-main)', overflowY: 'auto' }}>
                        <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--clr-text-muted)', marginBottom: '1rem', letterSpacing: '0.05em' }}>
                            Inspection Details
                        </h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <MapPin size={18} color="var(--clr-text-muted)" style={{ marginTop: '0.1rem' }} />
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>Location</div>
                                    <div style={{ fontWeight: 500 }}>{rfi.location}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <Tag size={18} color="var(--clr-text-muted)" style={{ marginTop: '0.1rem' }} />
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>Type</div>
                                    <div style={{ fontWeight: 500 }}>{rfi.inspectionType}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <Calendar size={18} color="var(--clr-text-muted)" style={{ marginTop: '0.1rem' }} />
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>Filed Date</div>
                                    <div style={{ fontWeight: 500 }}>{formatDateDisplay(rfi.originalFiledDate)}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                <User size={18} color="var(--clr-text-muted)" style={{ marginTop: '0.1rem' }} />
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>Filed By</div>
                                    <div style={{ fontWeight: 500 }}>{rfi.filerName}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-secondary)' }}>{rfi.filerCompany}</div>
                                </div>
                            </div>
                        </div>

                        {rfi.remarks && (
                            <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'var(--clr-danger-bg)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--clr-danger)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                                    Latest Remarks
                                </div>
                                <div style={{ color: 'var(--clr-danger)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                    "{rfi.remarks}"
                                </div>
                            </div>
                        )}

                        {rfi.images && rfi.images.length > 0 && (
                            <div style={{ marginTop: '2rem' }}>
                                <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--clr-text-muted)', marginBottom: '1rem', letterSpacing: '0.05em' }}>
                                    Attachments
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                    {rfi.images.map((img, idx) => (
                                        <div key={idx} style={{ width: '100%', height: '80px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--clr-border)' }}>
                                            <a href={img} target="_blank" rel="noopener noreferrer">
                                                <img src={img} alt={`Attachment ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right side: Tabbed Discussion / Audit */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--clr-bg-secondary)', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '1rem', borderBottom: '2px solid var(--clr-border)' }}>
                            <button
                                onClick={() => setActiveTab('discussion')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem',
                                    border: 'none', background: 'none', cursor: 'pointer',
                                    fontWeight: activeTab === 'discussion' ? 700 : 500,
                                    fontSize: '0.9rem', fontFamily: 'var(--font-main)',
                                    color: activeTab === 'discussion' ? 'var(--clr-brand-secondary)' : 'var(--clr-text-muted)',
                                    borderBottom: activeTab === 'discussion' ? '2px solid var(--clr-brand-secondary)' : '2px solid transparent',
                                    marginBottom: '-2px',
                                }}
                            >
                                <MessageSquare size={16} /> Discussion
                            </button>
                            <button
                                onClick={() => setActiveTab('audit')}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem',
                                    border: 'none', background: 'none', cursor: 'pointer',
                                    fontWeight: activeTab === 'audit' ? 700 : 500,
                                    fontSize: '0.9rem', fontFamily: 'var(--font-main)',
                                    color: activeTab === 'audit' ? 'var(--clr-brand-secondary)' : 'var(--clr-text-muted)',
                                    borderBottom: activeTab === 'audit' ? '2px solid var(--clr-brand-secondary)' : '2px solid transparent',
                                    marginBottom: '-2px',
                                }}
                            >
                                <History size={16} /> Audit Trail
                            </button>
                        </div>
                        <div style={{ flex: 1, backgroundColor: 'white', borderRadius: 'var(--radius-md)', border: '1px solid var(--clr-border)', overflow: 'hidden' }}>
                            {activeTab === 'discussion' ? (
                                <ThreadedComments rfiId={rfi.id} />
                            ) : (
                                <AuditLog rfiId={rfi.id} />
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
