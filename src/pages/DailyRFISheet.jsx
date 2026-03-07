import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { getToday } from '../utils/rfiLogic';
import { INSPECTION_TYPES } from '../utils/constants';
import Header from '../components/Header';
import DateNavigator from '../components/DateNavigator';
import StatusBadge from '../components/StatusBadge';
import { Plus, Trash2, Send, AlertTriangle, RefreshCw, Save, X } from 'lucide-react';

export default function DailyRFISheet() {
    const { user } = useAuth();
    const { createRFI, uploadImages, getRFIsForDate, resubmitRFI, deleteRFI } = useRFI();
    const [currentDate, setCurrentDate] = useState(getToday());
    const [newRows, setNewRows] = useState([createEmptyRow()]);
    const [submitMessage, setSubmitMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedImages, setSelectedImages] = useState(null);

    const { carriedOver, newRfis } = getRFIsForDate(currentDate);

    // Filter to only show this contractor's RFIs
    const myCarriedOver = carriedOver.filter((r) => r.filedBy === user.id);
    const myNewRfis = newRfis.filter((r) => r.filedBy === user.id);

    function createEmptyRow() {
        return {
            tempId: Date.now() + Math.random(),
            description: '',
            location: '',
            inspectionType: INSPECTION_TYPES[0],
            images: [],
        };
    }

    function addRow() {
        setNewRows((prev) => [...prev, createEmptyRow()]);
    }

    function removeRow(tempId) {
        setNewRows((prev) => prev.filter((r) => r.tempId !== tempId));
    }

    function updateRow(tempId, field, value) {
        setNewRows((prev) =>
            prev.map((r) => (r.tempId === tempId ? { ...r, [field]: value } : r))
        );
    }

    function removeImage(tempId, imgIndex) {
        setNewRows((prev) =>
            prev.map((r) => {
                if (r.tempId === tempId) {
                    const newImages = [...r.images];
                    newImages.splice(imgIndex, 1);
                    return { ...r, images: newImages };
                }
                return r;
            })
        );
    }

    async function handleSubmit() {
        const validRows = newRows.filter((r) => r.description.trim() && r.location.trim());
        if (validRows.length === 0) {
            setSubmitMessage('Please fill in at least one RFI with description and location.');
            setTimeout(() => setSubmitMessage(''), 3000);
            return;
        }

        setIsSubmitting(true);
        setSubmitMessage('Uploading files and submitting RFIs...');

        try {
            for (const row of validRows) {
                // Upload images to Supabase Storage first, if any
                const uploadedUrls = await uploadImages(row.images);

                // Then create the DB record
                await createRFI({
                    description: row.description.trim(),
                    location: row.location.trim(),
                    inspectionType: row.inspectionType,
                    filedBy: user.id,
                    filedDate: currentDate,
                    images: uploadedUrls,
                });
            }

            setNewRows([createEmptyRow()]);
            setSubmitMessage(`✅ ${validRows.length} RFI(s) submitted successfully!`);
        } catch (error) {
            console.error("Submit error:", error);
            setSubmitMessage('❌ Error submitting RFIs. Please try again.');
        } finally {
            setIsSubmitting(false);
            setTimeout(() => setSubmitMessage(''), 3000);
        }
    }

    function handleResubmit(rfiId) {
        resubmitRFI(rfiId, currentDate);
    }

    return (
        <div className="page-wrapper">
            <Header />
            <main className="rfi-sheet-page">
                <div className="sheet-header">
                    <h1>📋 Daily RFI Sheet</h1>
                    <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                </div>

                {/* Carried Over Section */}
                {myCarriedOver.length > 0 && (
                    <div className="sheet-section carryover-section">
                        <div className="section-banner carryover-banner">
                            <AlertTriangle size={18} />
                            <span>
                                <strong>{myCarriedOver.length} Rejected RFI{myCarriedOver.length > 1 ? 's' : ''}</strong>
                                {' '}carried over — re-submit for re-inspection
                            </span>
                        </div>
                        <div className="rfi-table-wrapper">
                            <table className="rfi-table editable">
                                <thead>
                                    <tr>
                                        <th className="col-serial">#</th>
                                        <th className="col-desc">Description</th>
                                        <th className="col-loc">Location</th>
                                        <th className="col-type">Type</th>
                                        <th className="col-status">Status</th>
                                        <th className="col-remarks">Remarks</th>
                                        <th className="col-actions">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myCarriedOver.map((rfi, idx) => (
                                        <tr key={rfi.id} className="carryover-row">
                                            <td className="col-serial">{idx + 1}</td>
                                            <td className="col-desc">{rfi.description}</td>
                                            <td className="col-loc">{rfi.location}</td>
                                            <td className="col-type">{rfi.inspectionType}</td>
                                            <td className="col-status">
                                                <StatusBadge status={rfi.status} />
                                                {rfi.carryoverCount > 0 && (
                                                    <span className="carryover-count">×{rfi.carryoverCount}</span>
                                                )}
                                            </td>
                                            <td className="col-remarks remarks-text">{rfi.remarks || '—'}</td>
                                            <td className="col-actions">
                                                <button
                                                    className="btn btn-sm btn-action btn-resubmit"
                                                    onClick={() => handleResubmit(rfi.id)}
                                                    title="Re-submit for inspection"
                                                >
                                                    <RefreshCw size={14} /> Re-submit
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Already Filed RFIs for Today */}
                {myNewRfis.length > 0 && (
                    <div className="sheet-section filed-section">
                        <h2 className="section-title">📝 Filed RFIs for {currentDate}</h2>
                        <div className="rfi-table-wrapper">
                            <table className="rfi-table editable">
                                <thead>
                                    <tr>
                                        <th className="col-serial">#</th>
                                        <th className="col-desc">Description</th>
                                        <th className="col-loc">Location</th>
                                        <th className="col-type">Type</th>
                                        <th className="col-status">Status</th>
                                        <th className="col-remarks">Remarks</th>
                                        <th className="col-actions">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myNewRfis.map((rfi) => (
                                        <tr key={rfi.id}>
                                            <td className="col-serial">{rfi.serialNo}</td>
                                            <td className="col-desc">{rfi.description}</td>
                                            <td className="col-loc">{rfi.location}</td>
                                            <td className="col-type">{rfi.inspectionType}</td>
                                            <td className="col-status"><StatusBadge status={rfi.status} /></td>
                                            <td className="col-remarks remarks-text">{rfi.remarks || '—'}</td>
                                            <td className="col-actions">
                                                {rfi.status === 'pending' && (
                                                    <button
                                                        className="btn btn-sm btn-action btn-delete"
                                                        onClick={() => deleteRFI(rfi.id)}
                                                        title="Delete RFI"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* New RFI Entry (Spreadsheet-like) */}
                <div className="sheet-section new-entry-section">
                    <h2 className="section-title">
                        <Plus size={18} /> Add New RFIs
                    </h2>
                    <div className="rfi-table-wrapper">
                        <table className="rfi-table editable">
                            <thead>
                                <tr>
                                    <th className="col-serial">#</th>
                                    <th className="col-desc">Description *</th>
                                    <th className="col-loc">Location *</th>
                                    <th className="col-type">Inspection Type</th>
                                    <th className="col-files">Attachments</th>
                                    <th className="col-actions"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {newRows.map((row, idx) => (
                                    <tr key={row.tempId}>
                                        <td className="col-serial">{myNewRfis.length + idx + 1}</td>
                                        <td className="col-desc">
                                            <input
                                                type="text"
                                                className="cell-input"
                                                value={row.description}
                                                onChange={(e) => updateRow(row.tempId, 'description', e.target.value)}
                                                placeholder="e.g. Concrete pouring Zone B"
                                            />
                                        </td>
                                        <td className="col-loc">
                                            <input
                                                type="text"
                                                className="cell-input"
                                                value={row.location}
                                                onChange={(e) => updateRow(row.tempId, 'location', e.target.value)}
                                                placeholder="e.g. Floor 3, Zone A"
                                            />
                                        </td>
                                        <td className="col-type">
                                            <select
                                                className="cell-select"
                                                value={row.inspectionType}
                                                onChange={(e) => updateRow(row.tempId, 'inspectionType', e.target.value)}
                                            >
                                                {INSPECTION_TYPES.map((type) => (
                                                    <option key={type} value={type}>{type}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="col-files">
                                            <div className="file-upload-cell">
                                                <label className="file-upload-label">
                                                    <input
                                                        type="file"
                                                        multiple
                                                        accept="image/*"
                                                        onChange={(e) => {
                                                            const files = Array.from(e.target.files);
                                                            // Append to existing images rather than replace
                                                            updateRow(row.tempId, 'images', [...row.images, ...files]);
                                                        }}
                                                        className="file-input-hidden"
                                                        style={{ display: 'none' }}
                                                    />
                                                    <span className="file-upload-btn btn btn-sm btn-ghost">
                                                        Attach Photos
                                                    </span>
                                                </label>

                                                {row.images.length > 0 && (
                                                    <div className="image-preview-grid">
                                                        {row.images.map((img, i) => (
                                                            <div key={i} className="thumbnail-wrapper">
                                                                <img
                                                                    src={URL.createObjectURL(img)}
                                                                    alt="preview"
                                                                    className="thumbnail"
                                                                    style={{ cursor: 'pointer' }}
                                                                    onClick={() => setSelectedImages(row.images)}
                                                                />
                                                                <button
                                                                    className="btn-remove-thumb"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        removeImage(row.tempId, i);
                                                                    }}
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="col-actions">
                                            {newRows.length > 1 && (
                                                <button
                                                    className="btn btn-sm btn-action btn-delete"
                                                    onClick={() => removeRow(row.tempId)}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="sheet-actions">
                        <button className="btn btn-ghost" onClick={addRow} disabled={isSubmitting}>
                            <Plus size={16} /> Add Row
                        </button>
                        <button className="btn btn-primary" onClick={handleSubmit} disabled={isSubmitting}>
                            {isSubmitting ? <RefreshCw size={16} className="spin" /> : <Send size={16} />}
                            {isSubmitting ? 'Submitting...' : 'Submit RFIs'}
                        </button>
                    </div>

                    {submitMessage && (
                        <div className={`submit-message ${submitMessage.includes('✅') ? 'success' : 'error'}`}>
                            {submitMessage}
                        </div>
                    )}
                </div>

                {/* Lightbox for Contractor Uploads */}
                {selectedImages && (
                    <div className="modal-overlay" onClick={() => setSelectedImages(null)}>
                        <div className="modal lightbox" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>Previews ({selectedImages.length})</h3>
                                <button className="btn-close modal-close" onClick={() => setSelectedImages(null)}>
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="lightbox-content">
                                {selectedImages.map((img, idx) => {
                                    const objectUrl = URL.createObjectURL(img);
                                    return (
                                        <div key={idx} className="lightbox-image-wrapper">
                                            <img src={objectUrl} alt={`Attachment ${idx + 1}`} className="lightbox-image" />
                                            <a href={objectUrl} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-ghost lightbox-download">
                                                Open Full Size
                                            </a>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
