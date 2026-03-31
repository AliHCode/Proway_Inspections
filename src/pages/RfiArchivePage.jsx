import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import toast from 'react-hot-toast';
import { Download, Eye, FileText, Search, Trash2, Upload, X } from 'lucide-react';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { useRFI } from '../context/RFIContext';
import { RFI_STATUS } from '../utils/constants';
import {
    deleteRfiScannedDocument,
    downloadRfiScannedDocument,
    fetchRfiScannedDocumentBlob,
    getRfiScannedDocumentUrl,
    listRfiScannedDocumentsForRfis,
    uploadRfiScannedDocument,
} from '../utils/rfiScannedDocs';

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

function getRfiLabel(rfi) {
    return String(rfi?.customFields?.rfi_no || rfi?.serialNo || 'RFI').trim();
}

function sanitizeFileStem(value) {
    return String(value || 'RFI')
        .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
        .replace(/-+/g, '-')
        .trim()
        || 'RFI';
}

function buildPdfName(rfiLabel, suffix = '') {
    return `${sanitizeFileStem(rfiLabel)}${suffix}.pdf`;
}

function buildZipName(stem) {
    return `${sanitizeFileStem(stem)}.zip`;
}

function extractSortValue(label) {
    const matches = String(label || '').match(/\d+/g);
    if (!matches) return Number.MAX_SAFE_INTEGER;
    return Number(matches.join(''));
}

function saveBlob(blob, fileName) {
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
}

export default function RfiArchivePage() {
    const { user } = useAuth();
    const { activeProject, contractorPermissions } = useProject();
    const { rfis } = useRFI();
    const [searchParams, setSearchParams] = useSearchParams();
    const [search, setSearch] = useState('');
    const [selectedRfiId, setSelectedRfiId] = useState(searchParams.get('rfi') || '');
    const [docsReloadKey, setDocsReloadKey] = useState(0);
    const [archiveRows, setArchiveRows] = useState([]);
    const [loadingArchive, setLoadingArchive] = useState(false);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [bulkDownloading, setBulkDownloading] = useState(false);
    const [rangeFrom, setRangeFrom] = useState('');
    const [rangeTo, setRangeTo] = useState('');
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
                const rfiNo = getRfiLabel(rfi).toLowerCase();
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

    const rfiRangeOptions = useMemo(() => (
        visibleRfis
            .map((rfi, index) => ({ id: rfi.id, label: getRfiLabel(rfi), sortValue: extractSortValue(getRfiLabel(rfi)), index }))
            .sort((a, b) => a.sortValue - b.sortValue || a.label.localeCompare(b.label))
    ), [visibleRfis]);

    const archiveByRfi = useMemo(() => {
        const next = {};
        for (const row of archiveRows) {
            if (!next[row.rfi_id]) {
                next[row.rfi_id] = { count: 0, latest: row, docs: [] };
            }
            next[row.rfi_id].count += 1;
            next[row.rfi_id].docs.push(row);
        }
        return next;
    }, [archiveRows]);

    const selectedArchive = selectedRfi
        ? archiveByRfi[selectedRfi.id] || { count: 0, latest: null, docs: [] }
        : { count: 0, latest: null, docs: [] };

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
        if (rfiRangeOptions.length === 0) {
            setRangeFrom('');
            setRangeTo('');
            return;
        }

        setRangeFrom((current) => current || rfiRangeOptions[0].label);
        setRangeTo((current) => current || rfiRangeOptions[rfiRangeOptions.length - 1].label);
    }, [rfiRangeOptions]);

    useEffect(() => {
        let isActive = true;

        async function loadArchiveRows() {
            if (visibleRfis.length === 0) {
                setArchiveRows([]);
                return;
            }

            setLoadingArchive(true);
            try {
                const rows = await listRfiScannedDocumentsForRfis(visibleRfis.map((rfi) => rfi.id));
                if (!isActive) return;
                setArchiveRows(rows);
            } catch (error) {
                if (!isActive) return;
                console.error('Failed to load scanned RFI archive summary:', error);
                toast.error(error.message || 'Could not load scanned archive data.');
            } finally {
                if (isActive) setLoadingArchive(false);
            }
        }

        loadArchiveRows();
        return () => {
            isActive = false;
        };
    }, [docsReloadKey, visibleRfis]);

    const handleFilePick = (event) => {
        const files = Array.from(event.target.files || []).filter((file) => file.type.includes('pdf'));
        setPendingFiles(files);
    };

    const buildUploadNames = () => {
        const rfiLabel = getRfiLabel(selectedRfi);
        const existingCount = selectedArchive.count || 0;

        if (pendingFiles.length === 1 && existingCount === 0) {
            return [buildPdfName(rfiLabel)];
        }

        return pendingFiles.map((_, index) => buildPdfName(rfiLabel, `-${existingCount + index + 1}`));
    };

    const handleUpload = async () => {
        if (!selectedRfi || pendingFiles.length === 0 || !activeProject?.id || !user?.id) return;

        setUploading(true);
        try {
            const uploadNames = buildUploadNames();
            for (let index = 0; index < pendingFiles.length; index += 1) {
                await uploadRfiScannedDocument(selectedRfi.id, pendingFiles[index], activeProject.id, user.id, uploadNames[index]);
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

    const handlePreviewLatest = async (rfi) => {
        const archive = archiveByRfi[rfi.id];
        if (!archive?.latest) {
            toast.error('No scanned copy is available for preview.');
            return;
        }

        try {
            const data = await getRfiScannedDocumentUrl(archive.latest.id, 'preview');
            setPreviewState({ open: true, url: data.url, fileName: buildPdfName(getRfiLabel(rfi)) });
        } catch (error) {
            console.error('Failed to open scanned document:', error);
            toast.error(error.message || 'Could not open document.');
        }
    };

    const downloadDocsAsZip = async (docs, zipNameBase, labelResolver) => {
        const zip = new JSZip();
        const grouped = docs.reduce((accumulator, doc) => {
            if (!accumulator[doc.rfi_id]) accumulator[doc.rfi_id] = [];
            accumulator[doc.rfi_id].push(doc);
            return accumulator;
        }, {});

        for (const [rfiId, rfiDocs] of Object.entries(grouped)) {
            const label = labelResolver(rfiId);
            const orderedDocs = [...rfiDocs].sort((a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());
            for (let index = 0; index < orderedDocs.length; index += 1) {
                const { blob } = await fetchRfiScannedDocumentBlob(orderedDocs[index].id);
                const suffix = orderedDocs.length > 1 ? `-${index + 1}` : '';
                zip.file(buildPdfName(label, suffix), blob);
            }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        saveBlob(blob, buildZipName(zipNameBase));
    };

    const handleDownloadRfi = async (rfi) => {
        const archive = archiveByRfi[rfi.id];
        if (!archive?.docs?.length) {
            toast.error('No scanned copy is available for download.');
            return;
        }

        const label = getRfiLabel(rfi);

        try {
            if (archive.docs.length === 1) {
                await downloadRfiScannedDocument(archive.docs[0].id, buildPdfName(label));
                return;
            }

            await downloadDocsAsZip(archive.docs, label, () => label);
        } catch (error) {
            console.error('Failed to download scanned documents:', error);
            toast.error(error.message || 'Could not download scanned documents.');
        }
    };

    const handleDeleteLatest = async () => {
        if (!selectedArchive.latest) return;
        const confirmed = window.confirm('Delete the latest scanned copy from this RFI?');
        if (!confirmed) return;

        try {
            await deleteRfiScannedDocument(selectedArchive.latest.id);
            toast.success('Latest scanned copy removed');
            setDocsReloadKey((value) => value + 1);
        } catch (error) {
            console.error('Failed to delete scanned document:', error);
            toast.error(error.message || 'Could not remove the document.');
        }
    };

    const handleDownloadRange = async () => {
        if (!rangeFrom || !rangeTo) {
            toast.error('Select a start and end RFI number.');
            return;
        }

        const startIndex = rfiRangeOptions.findIndex((item) => item.label.toLowerCase() === rangeFrom.trim().toLowerCase());
        const endIndex = rfiRangeOptions.findIndex((item) => item.label.toLowerCase() === rangeTo.trim().toLowerCase());

        if (startIndex === -1 || endIndex === -1) {
            toast.error('Use valid RFI numbers from the archive list.');
            return;
        }

        const [fromIndex, toIndex] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const rangeIds = new Set(rfiRangeOptions.slice(fromIndex, toIndex + 1).map((item) => item.id));
        const docs = archiveRows.filter((row) => rangeIds.has(row.rfi_id));

        if (docs.length === 0) {
            toast.error('No scanned copies are available in that range.');
            return;
        }

        const rfiMap = new Map(visibleRfis.map((rfi) => [rfi.id, getRfiLabel(rfi)]));
        const startLabel = rfiRangeOptions[fromIndex].label;
        const endLabel = rfiRangeOptions[toIndex].label;

        setBulkDownloading(true);
        try {
            await downloadDocsAsZip(docs, `${startLabel}-to-${endLabel}`, (rfiId) => rfiMap.get(rfiId) || 'RFI');
        } catch (error) {
            console.error('Failed to download range archive:', error);
            toast.error(error.message || 'Could not prepare the range download.');
        } finally {
            setBulkDownloading(false);
        }
    };

    return (
        <div className="page-wrapper premium-dashboard">
            <Header />
            <main className="dashboard-page rfi-archive-page">
                <section className="rfi-archive-topbar slim">
                    <div className="rfi-archive-topbar-copy compact">
                        <h1>RFI Archive</h1>
                    </div>
                    <div className="rfi-archive-topbar-meta">
                        <span className="rfi-archive-pill">{activeProject?.name || 'No active project'}</span>
                        <span className="rfi-archive-pill">{visibleRfis.length} ready RFIs</span>
                    </div>
                </section>

                <section className="rfi-archive-layout rfi-archive-shell tall">
                    <aside className="rfi-archive-rail full-height">
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

                        <div className="rfi-archive-rail-list full-height">
                            {visibleRfis.length === 0 ? (
                                <div className="rfi-archive-empty compact">
                                    No approved RFIs are ready yet.
                                </div>
                            ) : (
                                visibleRfis.map((rfi) => {
                                    const isActive = selectedRfi?.id === rfi.id;
                                    const archive = archiveByRfi[rfi.id] || { count: 0, latest: null, docs: [] };
                                    const hasFiles = archive.count > 0;

                                    return (
                                        <div key={rfi.id} className={`rfi-archive-item ${isActive ? 'active' : ''}`}>
                                            <button
                                                type="button"
                                                className="rfi-archive-item-select"
                                                onClick={() => setSelectedRfiId(rfi.id)}
                                            >
                                                <div className="rfi-archive-item-top">
                                                    <strong className="rfi-archive-item-title">#{getRfiLabel(rfi)}</strong>
                                                    <StatusBadge status={rfi.status} />
                                                </div>
                                                <div className="rfi-archive-item-desc">{rfi.description || 'No description'}</div>
                                                <div className="rfi-archive-item-meta">
                                                    <span>{rfi.location || 'No location'}</span>
                                                    <span>{archive.count} file{archive.count === 1 ? '' : 's'}</span>
                                                </div>
                                            </button>

                                            <div className="rfi-archive-item-actions compact">
                                                <button
                                                    type="button"
                                                    className="rfi-archive-action-btn"
                                                    disabled={!hasFiles}
                                                    onClick={() => handlePreviewLatest(rfi)}
                                                >
                                                    <Eye size={15} />
                                                    Preview
                                                </button>
                                                <button
                                                    type="button"
                                                    className="rfi-archive-action-btn"
                                                    disabled={!hasFiles}
                                                    onClick={() => handleDownloadRfi(rfi)}
                                                >
                                                    <Download size={15} />
                                                    Download
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </aside>

                    <section className="rfi-archive-main compact">
                        {!selectedRfi ? (
                            <div className="rfi-archive-empty">
                                Select an approved RFI to open its archive actions.
                            </div>
                        ) : (
                            <>
                                <div className="rfi-archive-main-head compact">
                                    <div className="rfi-archive-rfi-copy compact">
                                        <div className="rfi-archive-rfi-row">
                                            <h2 className="rfi-archive-rfi-title">RFI #{getRfiLabel(selectedRfi)}</h2>
                                            <StatusBadge status={selectedRfi.status} />
                                        </div>
                                        <div className="rfi-archive-rfi-meta compact">
                                            <span>{selectedRfi.location || 'No location'}</span>
                                            <span>{selectedArchive.count} file{selectedArchive.count === 1 ? '' : 's'}</span>
                                            <span>{selectedArchive.latest ? `Latest ${formatDateTime(selectedArchive.latest.uploaded_at)}` : 'No upload yet'}</span>
                                        </div>
                                    </div>
                                </div>

                                {canUploadForSelected && (
                                    <div className="rfi-archive-upload-bar compact">
                                        <div className="rfi-archive-upload-copy">
                                            <strong>Upload scanned PDFs</strong>
                                            <span>New files will save as {buildPdfName(getRfiLabel(selectedRfi), selectedArchive.count > 0 || pendingFiles.length > 1 ? '-1' : '')}</span>
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
                                    <div className="rfi-archive-pending-list compact">
                                        {pendingFiles.map((file, index) => {
                                            const uploadNames = buildUploadNames();
                                            return (
                                                <div key={`${file.name}-${file.lastModified}`} className="rfi-archive-pending-file compact">
                                                    <div className="rfi-archive-pending-copy">
                                                        <FileText size={15} />
                                                        <span>{uploadNames[index]}</span>
                                                    </div>
                                                    <small>{formatBytes(file.size)}</small>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                <div className="rfi-archive-bulk-panel">
                                    <div className="rfi-archive-bulk-copy">
                                        <strong>Bulk download</strong>
                                        <span>Download all scanned PDFs in an RFI range</span>
                                    </div>

                                    <div className="rfi-archive-bulk-controls">
                                        <input
                                            list="rfi-range-options"
                                            value={rangeFrom}
                                            onChange={(event) => setRangeFrom(event.target.value)}
                                            placeholder="From RFI no"
                                        />
                                        <input
                                            list="rfi-range-options"
                                            value={rangeTo}
                                            onChange={(event) => setRangeTo(event.target.value)}
                                            placeholder="To RFI no"
                                        />
                                        <button type="button" className="rfi-archive-action-btn primary" onClick={handleDownloadRange} disabled={bulkDownloading || loadingArchive}>
                                            <Download size={15} />
                                            {bulkDownloading ? 'Preparing...' : 'Download Range'}
                                        </button>
                                    </div>
                                </div>

                                <div className="rfi-archive-side-note">
                                    <div>
                                        <strong>Selected archive</strong>
                                        <span>Use the left card buttons for preview and direct download.</span>
                                    </div>
                                    {canUploadForSelected && selectedArchive.latest && (
                                        <button type="button" className="rfi-archive-action-btn danger" onClick={handleDeleteLatest}>
                                            <Trash2 size={15} />
                                            Remove Latest
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </section>
                </section>
                <datalist id="rfi-range-options">
                    {rfiRangeOptions.map((option) => (
                        <option key={option.id} value={option.label} />
                    ))}
                </datalist>
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
