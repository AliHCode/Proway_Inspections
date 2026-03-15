import React, { useState } from 'react';
import { useRFI } from '../context/RFIContext';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { INSPECTION_TYPES } from '../utils/constants';
import { getToday } from '../utils/rfiLogic';
import { X, Send, Paperclip, AlertCircle, MessageSquare, Info, MapPin, Layers, User, Trash2, Camera, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function CreateRevisionModal({ parentRfi, onClose, onSuccess }) {
    const { user } = useAuth();
    const { createRFI, uploadImages, consultants } = useRFI();
    const { projectFields, activeProject } = useProject();

    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Initial state derived from the rejected parent
    const [formData, setFormData] = useState({
        description: parentRfi.description || '',
        location: parentRfi.location || '',
        inspectionType: parentRfi.inspectionType || INSPECTION_TYPES[0],
        assignedTo: parentRfi.assignedTo || '',
        contractorRemarks: '',
        customFields: typeof parentRfi.customFields === 'string' 
            ? JSON.parse(parentRfi.customFields || '{}') 
            : { ...(parentRfi.customFields || {}) }
    });

    const [files, setFiles] = useState([]);

    const handleFileChange = (e) => {
        if (e.target.files) {
            setFiles(prev => [...prev, ...Array.from(e.target.files)]);
        }
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.contractorRemarks.trim()) {
            toast.error("Please provide contractor remarks explaining the changes.");
            return;
        }

        setIsSubmitting(true);
        try {
            let uploadedUrls = [];
            if (files.length > 0) {
                uploadedUrls = await uploadImages(files);
            }

            // Calculate next revision code
            const parentCode = parentRfi.customFields?.rfi_no || '1';
            let nextCode = '';
            if (parentCode.includes('-R')) {
                const parts = parentCode.split('-R');
                nextCode = `${parts[0]}-R${parseInt(parts[1], 10) + 1}`;
            } else {
                nextCode = `${parentCode}-R1`;
            }

            // Prepare custom fields
            const finalCustomFields = {
                ...formData.customFields,
                rfi_no: nextCode,
                parentId: parentRfi.id,
                contractor_remarks: formData.contractorRemarks
            };

            const payload = {
                description: formData.description,
                location: formData.location,
                inspectionType: formData.inspectionType,
                assignedTo: formData.assignedTo || null,
                images: uploadedUrls,
                customFields: finalCustomFields,
                parentId: parentRfi.id,
                filedDate: getToday()
            };

            await createRFI(payload);
            toast.success(`Revision ${nextCode} filed successfully!`);
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error("Error creating revision:", error);
            toast.error("Failed to submit revision.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const rfiNo = parentRfi.customFields?.rfi_no || 'RFI';

    return (
        <div className="modal-overlay" onClick={onClose} style={{ backdropFilter: 'blur(4px)', backgroundColor: 'rgba(15, 23, 42, 0.7)' }}>
            <div className="modal premium-revision-modal" style={{ maxWidth: '1000px', width: '95%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)' }} onClick={e => e.stopPropagation()}>
                
                {/* Premium Header */}
                <div className="modal-header" style={{ padding: '1.25rem 2rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ backgroundColor: 'var(--clr-brand-primary)', color: 'white', padding: '0.5rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <RefreshCw size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>Create RFI Revision</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Original Reference:</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--clr-brand-primary)', backgroundColor: '#eff6ff', padding: '0.1rem 0.5rem', borderRadius: '4px' }}>{rfiNo}</span>
                            </div>
                        </div>
                    </div>
                    <button className="btn-close modal-close" onClick={onClose} disabled={isSubmitting} style={{ color: '#94a3b8' }}>
                        <X size={24} />
                    </button>
                </div>

                <div className="modal-body" style={{ display: 'flex', height: 'auto', maxHeight: '80vh', padding: 0, backgroundColor: '#f8fafc', overflowY: 'auto' }}>
                    
                    {/* LEFT SIDE: Original Context (Read Only) */}
                    <div className="revision-sidebar" style={{ width: '40%', borderRight: '1px solid #e2e8f0', padding: '2rem', overflowY: 'auto' }}>
                        
                        {/* Rejection Briefing */}
                        <div style={{ backgroundColor: '#fff', border: '1px solid #fee2e2', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#b91c1c', marginBottom: '0.75rem' }}>
                                <AlertCircle size={18} />
                                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>Rejection Reason</h4>
                            </div>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#7f1d1d', lineHeight: 1.5, fontStyle: 'italic' }}>
                                "{parentRfi.remarks || 'No detailed remarks provided.'}"
                            </p>
                            <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <User size={12} /> {consultants.find(c => c.id === parentRfi.reviewedBy)?.name || 'Consultant'} • {parentRfi.reviewedAt ? new Date(parentRfi.reviewedAt).toLocaleDateString() : 'N/A'}
                            </div>
                        </div>

                        <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: '1rem', fontWeight: 600 }}>Original Details</h3>
                        
                        <div style={{ display: 'grid', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <div style={{ color: '#64748b', marginTop: '0.2rem' }}><Info size={16} /></div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>Description</div>
                                    <div style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>{formData.description}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <div style={{ color: '#64748b', marginTop: '0.2rem' }}><MapPin size={16} /></div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>Location</div>
                                    <div style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>{formData.location}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <div style={{ color: '#64748b', marginTop: '0.2rem' }}><Layers size={16} /></div>
                                <div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>Inspection Type</div>
                                    <div style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 500 }}>{formData.inspectionType}</div>
                                </div>
                            </div>
                        </div>

                        {/* Custom Fields Grid */}
                        {projectFields && projectFields.length > 0 && (
                            <div style={{ marginTop: '2rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    {projectFields.map(field => (
                                        <div key={field.id}>
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>{field.field_name}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#475569' }}>{formData.customFields[field.field_key] || '—'}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* RIGHT SIDE: Revision Action Area */}
                    <div className="revision-workspace" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                        <form onSubmit={handleSubmit} id="revision-form" style={{ maxWidth: '600px' }}>
                            <div style={{ marginBottom: '2rem' }}>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '1rem' }}>
                                    <MessageSquare size={20} style={{ color: 'var(--clr-brand-primary)' }} />
                                    Revision Remarks
                                </h3>
                                <div style={{ position: 'relative' }}>
                                    <textarea 
                                        rows="6"
                                        required
                                        placeholder="Explain the corrective actions taken. For example: 'Fixed the concrete curing issue as per consultant's comments...'"
                                        value={formData.contractorRemarks}
                                        onChange={e => setFormData(prev => ({...prev, contractorRemarks: e.target.value}))}
                                        style={{ 
                                            width: '100%', 
                                            padding: '1.25rem', 
                                            fontSize: '1rem',
                                            border: '2px solid #e2e8f0', 
                                            borderRadius: '12px', 
                                            backgroundColor: '#fff',
                                            transition: 'border-color 0.2s',
                                            resize: 'vertical',
                                            outline: 'none',
                                            color: '#1e293b'
                                        }}
                                        onFocus={e => e.target.style.borderColor = 'var(--clr-brand-primary)'}
                                        onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                    />
                                    <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                                        Required
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '1rem' }}>
                                    <Camera size={20} style={{ color: 'var(--clr-brand-primary)' }} />
                                    New Attachments
                                </h3>
                                
                                <label 
                                    style={{ 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        alignItems: 'center', 
                                        justifyContent: 'center',
                                        padding: '2rem',
                                        backgroundColor: '#fff',
                                        border: '2px dashed #cbd5e1',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                    className="revision-upload-zone"
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--clr-brand-primary)'; e.currentTarget.style.backgroundColor = '#f0f9ff'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.backgroundColor = '#fff'; }}
                                >
                                    <Paperclip size={32} style={{ color: '#94a3b8', marginBottom: '0.75rem' }} />
                                    <span style={{ fontWeight: 600, color: '#64748b' }}>Click to upload photos or documents</span>
                                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>Images, PDFs (Max 10MB)</span>
                                    <input 
                                        type="file" 
                                        multiple 
                                        accept="image/*,.pdf" 
                                        onChange={handleFileChange}
                                        style={{ display: 'none' }}
                                    />
                                </label>

                                {files.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
                                        {files.map((f, i) => (
                                            <div key={i} style={{ position: 'relative', backgroundColor: '#fff', padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                                                <button 
                                                    type="button" 
                                                    onClick={() => removeFile(i)} 
                                                    style={{ position: 'absolute', top: '-8px', right: '-8px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </form>
                    </div>
                </div>

                {/* Premium Footer */}
                <div className="modal-footer" style={{ padding: '1.25rem 2rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#fff', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                    <button type="button" className="btn btn-ghost" onClick={onClose} disabled={isSubmitting} style={{ fontWeight: 600 }}>
                        Cancel
                    </button>
                    <button type="submit" form="revision-form" className="btn btn-primary" disabled={isSubmitting} style={{ padding: '0.75rem 2rem', borderRadius: '8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        {isSubmitting ? 'Processing...' : <><Send size={18} /> Submit RFI Revision</>}
                    </button>
                </div>
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
                .premium-revision-modal {
                    animation: modalSlideUp 0.3s ease-out;
                }
                @keyframes modalSlideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @media (max-width: 768px) {
                    .modal-body { flex-direction: column !important; overflow-y: auto !important; }
                    .revision-sidebar, .revision-workspace { 
                        width: 100% !important; 
                        border-right: none !important; 
                        overflow-y: visible !important; 
                        max-height: none !important; 
                    }
                    .revision-sidebar { border-bottom: 1px solid #e2e8f0 !important; }
                }
            `}} />
        </div>

    );
}
