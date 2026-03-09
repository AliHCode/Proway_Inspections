import { useState } from 'react';
import { X } from 'lucide-react';
import { INSPECTION_TYPES } from '../utils/constants';

export default function EditRFIModal({ rfi, onSave, onClose }) {
    const [description, setDescription] = useState(rfi.description || '');
    const [location, setLocation] = useState(rfi.location || '');
    const [inspectionType, setInspectionType] = useState(rfi.inspectionType || INSPECTION_TYPES[0]);
    const [existingImages, setExistingImages] = useState(rfi.images || []);
    const [newFiles, setNewFiles] = useState([]);

    function handleSubmit(e) {
        e.preventDefault();
        if (!description.trim() || !location.trim()) return;
        onSave({
            description: description.trim(),
            location: location.trim(),
            inspectionType,
            existingImages,
            newFiles,
        });
        onClose();
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
                <div className="modal-header">
                    <div className="modal-title">
                        <h3>Edit RFI #{rfi.serialNo}</h3>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-body" style={{ display: 'grid', gap: '1rem' }}>
                    <div>
                        <label className="modal-label">Description</label>
                        <textarea
                            className="modal-textarea"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                            required
                        />
                    </div>

                    <div>
                        <label className="modal-label">Location</label>
                        <input
                            className="cell-input"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            required
                        />
                    </div>

                    <div>
                        <label className="modal-label">Inspection Type</label>
                        <select
                            className="cell-select"
                            value={inspectionType}
                            onChange={(e) => setInspectionType(e.target.value)}
                        >
                            {INSPECTION_TYPES.map((type) => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="modal-label">Current Attachments</label>
                        {existingImages.length === 0 ? (
                            <div className="text-muted">No attachments</div>
                        ) : (
                            <div className="image-preview-grid">
                                {existingImages.map((url, idx) => (
                                    <div key={`${url}-${idx}`} className="thumbnail-wrapper">
                                        <img src={url} alt="attachment" className="thumbnail" />
                                        <button
                                            type="button"
                                            className="btn-remove-thumb"
                                            onClick={() => setExistingImages(existingImages.filter((_, i) => i !== idx))}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="modal-label">Add New Attachments</label>
                        <input
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={(e) => setNewFiles(Array.from(e.target.files || []))}
                        />
                        {newFiles.length > 0 && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                {newFiles.length} new file(s) selected
                            </div>
                        )}
                    </div>

                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    );
}
