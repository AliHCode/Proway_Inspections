import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download, Eye, FileText, Search, Trash2, Upload, X } from 'lucide-react';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { useRFI } from '../context/RFIContext';
import { RFI_STATUS } from '../utils/constants';
import { deleteRfiScannedDocument, getRfiScannedDocumentUrl, listRfiScannedDocuments, uploadRfiScannedDocument } from '../utils/rfiScannedDocs';

const PAGE_SIZE = 12;
const READY_STATUSES = new Set([RFI_STATUS.APPROVED, RFI_STATUS.CONDITIONAL_APPROVE]);

function formatBytes(bytes = 0) {
    if (!bytes) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDateTime(value) {
    if (!value) return 'Unknown time';
    return new Date(value).toLocaleString();
}

export default function RfiArchivePage() {
    const { user } = useAuth();
    const { activeProject, contractorPermissions } = useProject();
    const { rfis } = useRFI();
    const [searchParams, setSearchParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const [selectedRfiId, setSelectedRfiId] = useState(searchParams.get('rfi') || '');
    const [docPage, setDocPage] = useState(0);
    const [docsReloadKey, setDocsReloadKey] = useState(0);
    const [documents, setDocuments] = useState([]);
    const [documentCount, setDocumentCount] = useState(0);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [previewState, setPreviewState] = useState({ open: false, url: '', fileName: '' });

    const latestRfis = useMemo(() => (
        rfis.filter((rfi) => !rfis.some((child) => child.parentId === rfi.id))
    ), [rfis]);

    const visibleRfis = useMemo(() => {
        const base = latestRfis.filter((rfi) => READY_STATUSES.has(rfi.status));
        const scoped = user?.role === 'consultant' || user?.role === 'admin'
            ? base
            : contractorPermissions.canManageContractorPermissions
                ? base
                : base.filter((rfi) => rfi.filedBy === user?.id);

        const term = search.trim().toLowerCase();
        const filtered = term
            ? scoped.filter((rfi) => {
                const rfiNo = String(rfi.customFields?.rfi_no || rfi.serialNo || '').toLowerCase();
                const description = String(rfi.description || '').toLowerCase();
                const location = String(rfi.location || '').toLowerCase();
                return rfiNo.includes(term) || description.includes(term) || location.includes(term);
            })
            : scoped;

        return filtered.sort((a, b) => {
            const aTime = new Date(a.reviewedAt || a.filedDate).getTime();
            const bTime = new Date(b.reviewedAt || b.filedDate).getTime();
            return bTime - aTime;
        });
    }, [contractorPermissions.canManageContractorPermissions, latestRfis, search, user?.id, user?.role]);

    const selectedRfi = useMemo(() => (
        visibleRfis.find((rfi) => rfi.id === selectedRfiId) || visibleRfis[0] || null
    ), [selectedRfiId, visibleRfis]);

    const canUploadForSelected = Boolean(
        selectedRfi && (
            user?.role === 'admin'
            || (
                user?.role === 'contractor'
                && (contractorPermissions.canManageContractorPermissions || selectedRfi.filedBy === user?.id)
            )
        )
    );

    useEffect(() => {
        if (!selectedRfi && selectedRfiId) {
            setSelectedRfiId('');
        }
        if (selectedRfi && selectedRfi.id !== selectedRfiId) {
            setSelectedRfiId(selectedRfi.id);
        }
    }, [selectedRfi, selectedRfiId]);

    useEffect(() => {
        if (selectedRfiId) {
            setSearchParams({ rfi: selectedRfiId }, { replace: true });
        } else {
            setSearchParams({}, { replace: true });
        }
    }, [selectedRfiId, setSearchParams]);

    useEffect(() => {
        setDocPage(0);
    }, [selectedRfiId]);

    useEffect(() => {
        let isActive = true;

        async function loadDocuments() {
            if (!selectedRfi?.id) {
                setDocuments([]);
                setDocumentCount(0);
                return;
            }

            setLoadingDocs(true);
            try {
                const result = await listRfiScannedDocuments(selectedRfi.id, docPage, PAGE_SIZE);
                if (!isActive) return;
                setDocuments(result.rows);
                setDocumentCount(result.count);
            } catch (error) {
                if (!isActive) return;
                console.error('Failed to load scanned RFI documents:', error);
                toast.error(error.message || 'Could not load scanned documents.');
            } finally {
                if (isActive) setLoadingDocs(false);
            }
        }

        loadDocuments();
        return () => {
            isActive = false;
        };
    }, [docPage, docsReloadKey, selectedRfi]);

    const totalPages = Math.max(1, Math.ceil(documentCount / PAGE_SIZE));

    const handleFilePick = (event) => {
        const files = Array.from(event.target.files || []).filter((file) => file.type.includes('pdf'));
        setPendingFiles(files);
    };

    const handleUpload = async () => {
        if (!selectedRfi || pendingFiles.length === 0 || !activeProject?.id || !user?.id) return;

        setUploading(true);
        try {
            for (const file of pendingFiles) {
                await uploadRfiScannedDocument(selectedRfi.id, file, activeProject.id, user.id);
            }
            toast.success(`${pendingFiles.length} scanned document${pendingFiles.length > 1 ? 's' : ''} uploaded`);
            setPendingFiles([]);
            setDocsReloadKey((value) => value + 1);
        } catch (error) {
            console.error('Failed to upload scanned documents:', error);
            toast.error(error.message || 'Upload failed.');
        } finally {
            setUploading(false);
        }
    };

    const handleOpenDocument = async (documentId, mode) => {
        try {
            const data = await getRfiScannedDocumentUrl(documentId, mode);
            if (mode === 'download') {
                window.open(data.url, '_blank', 'noopener,noreferrer');
                return;
            }
            setPreviewState({ open: true, url: data.url, fileName: data.originalFileName || 'Preview' });
        } catch (error) {
            console.error('Failed to open scanned document:', error);
            toast.error(error.message || 'Could not open document.');
        }
    };

    const handleDeleteDocument = async (documentId) => {
        const confirmed = window.confirm('Delete this scanned copy from the archive?');
        if (!confirmed) return;

        try {
            await deleteRfiScannedDocument(documentId);
            toast.success('Scanned copy removed');
            setDocsReloadKey((value) => value + 1);
        } catch (error) {
            console.error('Failed to delete scanned document:', error);
            toast.error(error.message || 'Could not remove the document.');
        }
    };

    return (
        <div className="page-wrapper premium-dashboard">
            <Header />
            <main className="dashboard-page rfi-archive-page">
                <section className="rfi-archive-topbar">
                    <div className="rfi-archive-topbar-copy">
                        <span className="rfi-archive-kicker">Shared archive</span>
                        <h1>RFI Archive</h1>
                    </div>
                    <div className="rfi-archive-topbar-meta">
                        <span className="rfi-archive-pill">{activeProject?.name || 'No active project'}</span>
                        <span className="rfi-archive-pill">{visibleRfis.length} ready RFIs</span>
                    </div>
                </section>

                <section className="rfi-archive-layout rfi-archive-shell">
                    <aside className="rfi-archive-rail">
                        <div className="rfi-archive-search">
                            <Search size={16} />
                            <input
                                type="text"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search RFI no, location, description"
                            />
                        </div>

                        <div className="rfi-archive-rail-head">
                            <strong>Ready RFIs</strong>
                            <span>{visibleRfis.length}</span>
                        </div>

                        <div className="rfi-archive-rail-list">
                            {visibleRfis.length === 0 ? (
                                <div className="rfi-archive-empty compact">
                                    No approved RFIs are ready yet.
                                </div>
                            ) : (
                                visibleRfis.map((rfi) => {
                                    const isActive = selectedRfi?.id === rfi.id;
                                    return (
                                        <button
                                            key={rfi.id}
                                            type="button"
                                            className={`rfi-archive-item ${isActive ? 'active' : ''}`}
                                            onClick={() => setSelectedRfiId(rfi.id)}
                                        >
                                            <div className="rfi-archive-item-top">
                                                <strong className="rfi-archive-item-title">
                                                    #{rfi.customFields?.rfi_no || rfi.serialNo}
                                                </strong>
                                                <StatusBadge status={rfi.status} />
                                            </div>
                                            <div className="rfi-archive-item-desc">
                                                {rfi.description || 'No description'}
                                            </div>
                                            <div className="rfi-archive-item-meta">
                                                <span>{rfi.location || 'No location'}</span>
                                                <span>{rfi.filedDate || 'No filed date'}</span>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </aside>

                    <section className="rfi-archive-main">
                        {!selectedRfi ? (
                            <div className="rfi-archive-empty">
                                Select an approved RFI to open its scanned archive.
                            </div>
                        ) : (
                            <>
                                <div className="rfi-archive-main-head">
                                    <div className="rfi-archive-rfi-copy">
                                        <div className="rfi-archive-rfi-row">
                                            <h2 className="rfi-archive-rfi-title">
                                                RFI #{selectedRfi.customFields?.rfi_no || selectedRfi.serialNo}
                                            </h2>
                                            <StatusBadge status={selectedRfi.status} />
                                        </div>
                                        <div className="rfi-archive-rfi-desc">
                                            {selectedRfi.description || 'No description'}
                                        </div>
                                        <div className="rfi-archive-rfi-meta">
                                            <span>{selectedRfi.location || 'No location'}</span>
                                            <span>Filed by {selectedRfi.filerName || 'Contractor'}</span>
                                            <span>{selectedRfi.reviewedAt ? `Reviewed ${formatDateTime(selectedRfi.reviewedAt)}` : 'Review time not recorded'}</span>
                                        </div>
                                    </div>

                                    <div className="rfi-archive-stat">
                                        <span>Files</span>
                                        <strong>{documentCount}</strong>
                                    </div>
                                </div>

                                {canUploadForSelected && (
                                    <div className="rfi-archive-upload-bar">
                                        <div className="rfi-archive-upload-copy">
                                            <strong>Upload scanned PDFs</strong>
                                            {pendingFiles.length > 0 && (
                                                <span>{pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''} selected</span>
                                            )}
                                        </div>

                                        <div className="rfi-archive-upload-actions">
                                            <label className="rfi-archive-action-btn">
                                                <Upload size={15} />
                                                Pick PDFs
                                                <input type="file" accept="application/pdf,.pdf" multiple hidden onChange={handleFilePick} />
                                            </label>
                                            {pendingFiles.length > 0 && (
                                                <>
                                                    <button type="button" className="rfi-archive-action-btn primary" onClick={handleUpload} disabled={uploading}>
                                                        <Upload size={15} />
                                                        {uploading ? 'Uploading...' : 'Upload'}
                                                    </button>
                                                    <button type="button" className="rfi-archive-action-btn" onClick={() => setPendingFiles([])} disabled={uploading}>
                                                        Clear
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {pendingFiles.length > 0 && (
                                    <div className="rfi-archive-pending-list">
                                        {pendingFiles.map((file) => (
                                            <div key={`${file.name}-${file.lastModified}`} className="rfi-archive-pending-file">
                                                <div className="rfi-archive-pending-copy">
                                                    <FileText size={15} />
                                                    <span>{file.name}</span>
                                                </div>
                                                <small>{formatBytes(file.size)}</small>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="rfi-archive-section-head">
                                    <strong>Scanned Copies</strong>
                                    <span>Page {docPage + 1} of {totalPages}</span>
                                </div>

                                {loadingDocs ? (
                                    <div className="rfi-archive-empty compact">
                                        Loading scanned documents...
                                    </div>
                                ) : documents.length === 0 ? (
                                    <div className="rfi-archive-empty compact">
                                        No scanned copies uploaded for this RFI yet.
                                    </div>
                                ) : (
                                    <div className="rfi-archive-doc-list">
                                        {documents.map((document) => (
                                            <div key={document.id} className="rfi-archive-doc-row">
                                                <div className="rfi-archive-doc-copy">
                                                    <div className="rfi-archive-doc-icon">
                                                        <FileText size={17} />
                                                    </div>
                                                    <div className="rfi-archive-doc-text">
                                                        <strong className="rfi-archive-doc-name">{document.original_file_name}</strong>
                                                        <span className="rfi-archive-doc-meta">
                                                            {formatBytes(document.file_size_bytes)} • {formatDateTime(document.uploaded_at)}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="rfi-archive-doc-actions">
                                                    <button type="button" className="rfi-archive-action-btn" onClick={() => handleOpenDocument(document.id, 'preview')}>
                                                        <Eye size={15} />
                                                        Preview
                                                    </button>
                                                    <button type="button" className="rfi-archive-action-btn" onClick={() => handleOpenDocument(document.id, 'download')}>
                                                        <Download size={15} />
                                                        Download
                                                    </button>
                                                    {canUploadForSelected && (
                                                        <button type="button" className="rfi-archive-action-btn danger" onClick={() => handleDeleteDocument(document.id)}>
                                                            <Trash2 size={15} />
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {documentCount > PAGE_SIZE && (
                                    <div className="rfi-archive-pagination">
                                        <button type="button" className="rfi-archive-action-btn" onClick={() => setDocPage((value) => Math.max(0, value - 1))} disabled={docPage === 0}>
                                            Previous
                                        </button>
                                        <button type="button" className="rfi-archive-action-btn" onClick={() => setDocPage((value) => Math.min(totalPages - 1, value + 1))} disabled={docPage >= totalPages - 1}>
                                            Next
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </section>
            </main>

            {previewState.open && (
                <div className="rfi-archive-preview-backdrop">
                    <div className="rfi-archive-preview-modal">
                        <div className="rfi-archive-preview-head">
                            <strong>{previewState.fileName}</strong>
                            <button type="button" className="rfi-archive-action-btn" onClick={() => setPreviewState({ open: false, url: '', fileName: '' })}>
                                <X size={15} />
                                Close
                            </button>
                        </div>
                        <iframe title={previewState.fileName} src={previewState.url} className="rfi-archive-preview-frame" />
                    </div>
                </div>
            )}
        </div>
    );
}
