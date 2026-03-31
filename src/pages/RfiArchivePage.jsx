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
            <main className="dashboard-page" style={{ gap: '1.25rem' }}>
                <section style={{
                    borderRadius: '24px',
                    padding: '1.5rem',
                    background: 'linear-gradient(145deg, rgba(15,23,42,0.96), rgba(30,41,59,0.92))',
                    color: '#f8fafc',
                    boxShadow: '0 28px 60px rgba(15,23,42,0.18)',
                    border: '1px solid rgba(148,163,184,0.16)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: '0.76rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#38bdf8', fontWeight: 800, marginBottom: '0.35rem' }}>
                                Shared Archive
                            </div>
                            <h1 style={{ margin: 0, fontSize: '1.85rem' }}>RFI Scanned Documents</h1>
                            <p style={{ margin: '0.55rem 0 0', maxWidth: '760px', color: '#cbd5e1', lineHeight: 1.6 }}>
                                Contractors upload final scanned PDF copies after approval, and consultants can preview or download them from the same project archive.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                            <span style={{ padding: '0.45rem 0.8rem', borderRadius: '999px', background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(148,163,184,0.18)', fontWeight: 700 }}>
                                {activeProject?.name || 'No active project'}
                            </span>
                            <span style={{ padding: '0.45rem 0.8rem', borderRadius: '999px', background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(148,163,184,0.18)', fontWeight: 700 }}>
                                {visibleRfis.length} ready RFIs
                            </span>
                        </div>
                    </div>
                </section>

                <section className="rfi-archive-layout" style={{
                    display: 'grid',
                    gap: '1rem',
                    alignItems: 'start',
                }}>
                    <aside style={{
                        borderRadius: '20px',
                        border: '1px solid rgba(148,163,184,0.14)',
                        background: 'rgba(255,255,255,0.92)',
                        boxShadow: '0 20px 50px rgba(15,23,42,0.08)',
                        overflow: 'hidden',
                    }}>
                        <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search by RFI no, location, description"
                                    style={{
                                        width: '100%',
                                        borderRadius: '14px',
                                        border: '1px solid #cbd5e1',
                                        padding: '0.8rem 0.85rem 0.8rem 2.25rem',
                                        fontSize: '0.9rem',
                                        background: '#f8fafc',
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ maxHeight: '70vh', overflow: 'auto', padding: '0.75rem' }}>
                            {visibleRfis.length === 0 ? (
                                <div style={{ padding: '1rem', color: '#64748b', lineHeight: 1.6 }}>
                                    No approved RFIs are ready for scanned-copy archiving on this project yet.
                                </div>
                            ) : (
                                visibleRfis.map((rfi) => {
                                    const isActive = selectedRfi?.id === rfi.id;
                                    return (
                                        <button
                                            key={rfi.id}
                                            onClick={() => setSelectedRfiId(rfi.id)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                borderRadius: '16px',
                                                padding: '0.95rem',
                                                marginBottom: '0.75rem',
                                                border: isActive ? '1px solid #38bdf8' : '1px solid #e2e8f0',
                                                background: isActive ? 'linear-gradient(180deg, rgba(14,165,233,0.08), rgba(255,255,255,0.98))' : '#ffffff',
                                                boxShadow: isActive ? '0 12px 30px rgba(14,165,233,0.12)' : 'none',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                                                <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>
                                                    #{rfi.customFields?.rfi_no || rfi.serialNo}
                                                </strong>
                                                <StatusBadge status={rfi.status} />
                                            </div>
                                            <div style={{ marginTop: '0.55rem', color: '#334155', fontWeight: 600, lineHeight: 1.45 }}>
                                                {rfi.description || 'No description'}
                                            </div>
                                            <div style={{ marginTop: '0.55rem', color: '#64748b', fontSize: '0.82rem' }}>
                                                {rfi.location || 'No location'} | Filed {rfi.filedDate}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </aside>

                    <section style={{
                        borderRadius: '20px',
                        border: '1px solid rgba(148,163,184,0.14)',
                        background: 'rgba(255,255,255,0.96)',
                        boxShadow: '0 20px 50px rgba(15,23,42,0.08)',
                        padding: '1.1rem',
                    }}>
                        {!selectedRfi ? (
                            <div style={{ padding: '2rem', color: '#64748b' }}>
                                Select an approved RFI from the left to manage its scanned copies.
                            </div>
                        ) : (
                            <>
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '1rem',
                                    flexWrap: 'wrap',
                                    alignItems: 'flex-start',
                                    paddingBottom: '1rem',
                                    borderBottom: '1px solid #e2e8f0',
                                }}>
                                    <div>
                                        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>
                                                RFI #{selectedRfi.customFields?.rfi_no || selectedRfi.serialNo}
                                            </h2>
                                            <StatusBadge status={selectedRfi.status} />
                                        </div>
                                        <p style={{ margin: '0.45rem 0 0', color: '#475569', lineHeight: 1.6 }}>
                                            {selectedRfi.description || 'No description'}
                                        </p>
                                        <div style={{ marginTop: '0.6rem', color: '#64748b', fontSize: '0.86rem' }}>
                                            {selectedRfi.location || 'No location'} | Filed by {selectedRfi.filerName || 'Contractor'} | Reviewed {selectedRfi.reviewedAt ? formatDateTime(selectedRfi.reviewedAt) : 'Not recorded'}
                                        </div>
                                    </div>
                                    <div style={{ padding: '0.75rem 0.9rem', borderRadius: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', minWidth: '180px' }}>
                                        <div style={{ color: '#64748b', fontSize: '0.76rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                                            Archive Count
                                        </div>
                                        <div style={{ marginTop: '0.35rem', fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>
                                            {documentCount}
                                        </div>
                                    </div>
                                </div>

                                {canUploadForSelected && (
                                    <div style={{
                                        marginTop: '1rem',
                                        borderRadius: '18px',
                                        border: '1px dashed #38bdf8',
                                        background: 'linear-gradient(180deg, rgba(14,165,233,0.06), rgba(248,250,252,0.9))',
                                        padding: '1rem',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <div>
                                                <strong style={{ display: 'block', color: '#0f172a' }}>Upload final scanned PDFs</strong>
                                                <span style={{ color: '#475569', fontSize: '0.86rem' }}>
                                                    PDF files go to Cloudflare R2 and become visible to consultants on this same page.
                                                </span>
                                            </div>
                                            <label style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '0.8rem 1rem',
                                                borderRadius: '14px',
                                                background: '#ffffff',
                                                border: '1px solid #cbd5e1',
                                                cursor: 'pointer',
                                                fontWeight: 700,
                                                color: '#0f172a',
                                            }}>
                                                <Upload size={16} />
                                                Pick PDFs
                                                <input type="file" accept="application/pdf,.pdf" multiple hidden onChange={handleFilePick} />
                                            </label>
                                        </div>

                                        {pendingFiles.length > 0 && (
                                            <div style={{ marginTop: '0.9rem' }}>
                                                <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.85rem' }}>
                                                    {pendingFiles.map((file) => (
                                                        <div
                                                            key={`${file.name}-${file.lastModified}`}
                                                            style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                gap: '0.75rem',
                                                                padding: '0.7rem 0.85rem',
                                                                borderRadius: '12px',
                                                                background: '#ffffff',
                                                                border: '1px solid #e2e8f0',
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', minWidth: 0 }}>
                                                                <FileText size={16} color="#0f172a" />
                                                                <span style={{ color: '#0f172a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                                                            </div>
                                                            <span style={{ color: '#64748b', fontSize: '0.82rem' }}>{formatBytes(file.size)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                    <button className="btn-command" onClick={handleUpload} disabled={uploading}>
                                                        <Upload size={16} /> {uploading ? 'Uploading...' : `Upload ${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''}`}
                                                    </button>
                                                    <button className="btn btn-ghost" onClick={() => setPendingFiles([])} disabled={uploading}>
                                                        Clear list
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ marginTop: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.9rem' }}>
                                        <div>
                                            <h3 style={{ margin: 0, color: '#0f172a' }}>Scanned Copies</h3>
                                            <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.86rem' }}>
                                                Preview inside the app or download the original PDF.
                                            </p>
                                        </div>
                                        <span style={{ color: '#64748b', fontSize: '0.84rem' }}>
                                            Page {docPage + 1} of {totalPages}
                                        </span>
                                    </div>

                                    {loadingDocs ? (
                                        <div style={{ padding: '1.5rem', borderRadius: '16px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                                            Loading scanned documents...
                                        </div>
                                    ) : documents.length === 0 ? (
                                        <div style={{ padding: '1.5rem', borderRadius: '16px', border: '1px dashed #cbd5e1', color: '#64748b' }}>
                                            No scanned copies uploaded for this RFI yet.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                                            {documents.map((document) => (
                                                <div
                                                    key={document.id}
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        gap: '1rem',
                                                        flexWrap: 'wrap',
                                                        padding: '0.9rem 1rem',
                                                        borderRadius: '16px',
                                                        border: '1px solid #e2e8f0',
                                                        background: '#ffffff',
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                                                            <FileText size={18} color="#0f172a" />
                                                            <strong style={{ color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {document.original_file_name}
                                                            </strong>
                                                        </div>
                                                        <div style={{ marginTop: '0.45rem', color: '#64748b', fontSize: '0.84rem' }}>
                                                            {formatBytes(document.file_size_bytes)} | Uploaded {formatDateTime(document.uploaded_at)}
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                                                        <button className="btn btn-ghost" onClick={() => handleOpenDocument(document.id, 'preview')}>
                                                            <Eye size={16} /> Preview
                                                        </button>
                                                        <button className="btn btn-ghost" onClick={() => handleOpenDocument(document.id, 'download')}>
                                                            <Download size={16} /> Download
                                                        </button>
                                                        {canUploadForSelected && (
                                                            <button className="btn btn-ghost" style={{ color: '#b91c1c' }} onClick={() => handleDeleteDocument(document.id)}>
                                                                <Trash2 size={16} /> Remove
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {documentCount > PAGE_SIZE && (
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                                            <button className="btn btn-ghost" onClick={() => setDocPage((value) => Math.max(0, value - 1))} disabled={docPage === 0}>
                                                Previous
                                            </button>
                                            <button className="btn btn-ghost" onClick={() => setDocPage((value) => Math.min(totalPages - 1, value + 1))} disabled={docPage >= totalPages - 1}>
                                                Next
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </section>
                </section>
            </main>

            {previewState.open && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15,23,42,0.55)',
                    zIndex: 1100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem',
                }}>
                    <div style={{
                        width: 'min(1100px, 100%)',
                        height: 'min(88vh, 900px)',
                        borderRadius: '22px',
                        background: '#ffffff',
                        boxShadow: '0 32px 80px rgba(15,23,42,0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: '1rem',
                            alignItems: 'center',
                            padding: '1rem 1.15rem',
                            borderBottom: '1px solid #e2e8f0',
                        }}>
                            <div style={{ minWidth: 0 }}>
                                <strong style={{ display: 'block', color: '#0f172a' }}>{previewState.fileName}</strong>
                                <span style={{ color: '#64748b', fontSize: '0.82rem' }}>Signed preview link from Cloudflare R2</span>
                            </div>
                            <button className="btn btn-ghost" onClick={() => setPreviewState({ open: false, url: '', fileName: '' })}>
                                <X size={16} /> Close
                            </button>
                        </div>
                        <iframe title={previewState.fileName} src={previewState.url} style={{ flex: 1, border: 'none', width: '100%' }} />
                    </div>
                </div>
            )}
        </div>
    );
}
