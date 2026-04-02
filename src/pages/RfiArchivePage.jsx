import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Download, Eye, FileText, Search, Trash2, Upload, X, RefreshCw } from 'lucide-react';
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

const ARCHIVE_ELIGIBLE_STATUSES = new Set([
    RFI_STATUS.APPROVED,
    RFI_STATUS.CONDITIONAL_APPROVE,
    RFI_STATUS.REJECTED,
    RFI_STATUS.CANCELLED,
]);
let jsZipPromise;

async function loadJsZip() {
    if (!jsZipPromise) {
        jsZipPromise = import('jszip').then((jsZipModule) => (
            jsZipModule.default || jsZipModule
        ));
    }

    return jsZipPromise;
}

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

function normalizeArchiveMatchKey(value) {
    return String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
}

function getFileStem(fileName = '') {
    return String(fileName).replace(/\.[^.]+$/, '');
}

function buildBulkUploadDraft(files, rfis, archiveByRfi) {
    const matchers = (rfis || [])
        .map((rfi) => ({
            rfiId: rfi.id,
            rfiLabel: getRfiLabel(rfi),
            normalizedLabel: normalizeArchiveMatchKey(getRfiLabel(rfi)),
        }))
        .filter((item) => item.normalizedLabel)
        .sort((a, b) => b.normalizedLabel.length - a.normalizedLabel.length);

    const initialRows = files.map((file) => {
        const normalizedStem = normalizeArchiveMatchKey(getFileStem(file.name));
        const exactMatches = matchers.filter((item) => normalizedStem.includes(item.normalizedLabel));
        const sameLengthMatches = exactMatches.filter((item) => item.normalizedLabel.length === (exactMatches[0]?.normalizedLabel.length || 0));
        const uniqueMatches = sameLengthMatches.filter((item, index, array) => (
            array.findIndex((candidate) => candidate.rfiId === item.rfiId) === index
        ));

        if (!normalizedStem) {
            return {
                id: `${file.name}-${file.lastModified}`,
                file,
                status: 'unmatched',
                reason: 'Filename is empty or unsupported.',
                matchedRfiId: '',
                matchedRfiLabel: '',
                uploadFileName: '',
            };
        }

        if (uniqueMatches.length === 0) {
            return {
                id: `${file.name}-${file.lastModified}`,
                file,
                status: 'unmatched',
                reason: 'No RFI number was found in the filename.',
                matchedRfiId: '',
                matchedRfiLabel: '',
                uploadFileName: '',
            };
        }

        if (uniqueMatches.length > 1) {
            return {
                id: `${file.name}-${file.lastModified}`,
                file,
                status: 'ambiguous',
                reason: `Filename matches multiple RFIs: ${uniqueMatches.map((item) => item.rfiLabel).join(', ')}`,
                matchedRfiId: '',
                matchedRfiLabel: '',
                uploadFileName: '',
            };
        }

        return {
            id: `${file.name}-${file.lastModified}`,
            file,
            status: 'matched',
            reason: '',
            matchedRfiId: uniqueMatches[0].rfiId,
            matchedRfiLabel: uniqueMatches[0].rfiLabel,
            uploadFileName: '',
        };
    });

    const groupedCounts = initialRows.reduce((accumulator, row) => {
        if (row.status !== 'matched' || !row.matchedRfiId) return accumulator;
        accumulator[row.matchedRfiId] = (accumulator[row.matchedRfiId] || 0) + 1;
        return accumulator;
    }, {});

    const nextPerRfiIndex = {};

    return initialRows.map((row) => {
        if (row.status !== 'matched' || !row.matchedRfiId) return row;

        nextPerRfiIndex[row.matchedRfiId] = (nextPerRfiIndex[row.matchedRfiId] || 0) + 1;
        const existingCount = archiveByRfi[row.matchedRfiId]?.count || 0;
        const incomingCount = groupedCounts[row.matchedRfiId] || 0;
        const sequence = nextPerRfiIndex[row.matchedRfiId];
        const shouldUseBaseName = existingCount === 0 && incomingCount === 1;
        const suffix = shouldUseBaseName ? '' : `-${existingCount + sequence}`;

        return {
            ...row,
            uploadFileName: buildPdfName(row.matchedRfiLabel, suffix),
        };
    });
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
    const [pendingUpload, setPendingUpload] = useState({ rfiId: '', files: [] });
    const [uploading, setUploading] = useState(false);
    const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
    const [bulkDownloading, setBulkDownloading] = useState(false);
    const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
    const [bulkUploadDraft, setBulkUploadDraft] = useState([]);
    const [bulkUploadSubmitting, setBulkUploadSubmitting] = useState(false);
    const [previewingRfiId, setPreviewingRfiId] = useState('');
    const [downloadingRfiId, setDownloadingRfiId] = useState('');
    const [removingRfiId, setRemovingRfiId] = useState('');
    const [rangeFrom, setRangeFrom] = useState('');
    const [rangeTo, setRangeTo] = useState('');
    const [previewState, setPreviewState] = useState({ open: false, url: '', fileName: '' });

    const latestRfis = useMemo(() => (
        rfis.filter((rfi) => !rfis.some((child) => child.parentId === rfi.id))
    ), [rfis]);

    const archiveEligibleRfis = useMemo(() => {
        const base = latestRfis.filter((rfi) => ARCHIVE_ELIGIBLE_STATUSES.has(rfi.status));
        const scoped = user?.role === 'consultant' || user?.role === 'admin' || user?.role === 'contractor'
            ? base
            : [];
        const term = search.trim().toLowerCase();
        return term
            ? scoped.filter((rfi) => {
                const rfiNo = getRfiLabel(rfi).toLowerCase();
                const description = String(rfi.description || '').toLowerCase();
                const location = String(rfi.location || '').toLowerCase();
                return rfiNo.includes(term) || description.includes(term) || location.includes(term);
            })
            : scoped;
    }, [latestRfis, search, user?.role]);

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

    const visibleRfis = useMemo(() => {
        const roleScoped = user?.role === 'consultant'
            ? archiveEligibleRfis.filter((rfi) => (archiveByRfi[rfi.id]?.count || 0) > 0)
            : archiveEligibleRfis;

        return roleScoped.sort((a, b) => {
            const aTime = new Date(a.reviewedAt || a.filedDate).getTime();
            const bTime = new Date(b.reviewedAt || b.filedDate).getTime();
            return bTime - aTime;
        });
    }, [archiveByRfi, archiveEligibleRfis, user?.role]);

    const selectedRfi = useMemo(() => (
        visibleRfis.find((rfi) => rfi.id === selectedRfiId) || visibleRfis[0] || null
    ), [selectedRfiId, visibleRfis]);

    const rfiRangeOptions = useMemo(() => (
        visibleRfis
            .map((rfi) => ({ id: rfi.id, label: getRfiLabel(rfi), sortValue: extractSortValue(getRfiLabel(rfi)) }))
            .sort((a, b) => a.sortValue - b.sortValue || a.label.localeCompare(b.label))
    ), [visibleRfis]);

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
            if (archiveEligibleRfis.length === 0) {
                setArchiveRows([]);
                return;
            }

            setLoadingArchive(true);
            try {
                const rows = await listRfiScannedDocumentsForRfis(archiveEligibleRfis.map((rfi) => rfi.id));
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
    }, [archiveEligibleRfis, docsReloadKey]);

    const canUploadForRfi = (rfi) => Boolean(
        rfi && (
            user?.role === 'admin'
            || (
                user?.role === 'contractor'
                && contractorPermissions.canUploadRfiArchive
            )
        )
    );

    const canBulkUpload = Boolean(
        activeProject?.id && (
            user?.role === 'admin'
            || (
                user?.role === 'contractor'
                && contractorPermissions.canUploadRfiArchive
            )
        )
    );

    const getArchiveForRfi = (rfiId) => archiveByRfi[rfiId] || { count: 0, latest: null, docs: [] };

    const buildUploadNames = (rfi, files) => {
        const rfiLabel = getRfiLabel(rfi);
        const existingCount = getArchiveForRfi(rfi.id).count || 0;

        if (files.length === 1 && existingCount === 0) {
            return [buildPdfName(rfiLabel)];
        }

        return files.map((_, index) => buildPdfName(rfiLabel, `-${existingCount + index + 1}`));
    };

    const handleFilePick = (rfiId, event) => {
        const files = Array.from(event.target.files || []).filter((file) => file.type.includes('pdf'));
        setSelectedRfiId(rfiId);
        setPendingUpload({ rfiId, files });
    };

    const handleUpload = async (rfi) => {
        if (!rfi || pendingUpload.rfiId !== rfi.id || pendingUpload.files.length === 0 || !activeProject?.id || !user?.id) return;

        setUploading(true);
        try {
            const uploadNames = buildUploadNames(rfi, pendingUpload.files);
            for (let index = 0; index < pendingUpload.files.length; index += 1) {
                await uploadRfiScannedDocument(rfi.id, pendingUpload.files[index], activeProject.id, user.id, uploadNames[index]);
            }
            toast.success(`${pendingUpload.files.length} scanned document${pendingUpload.files.length > 1 ? 's' : ''} uploaded`);
            setPendingUpload({ rfiId: '', files: [] });
            setDocsReloadKey((value) => value + 1);
        } catch (error) {
            console.error('Failed to upload scanned documents:', error);
            toast.error(error.message || 'Upload failed.');
        } finally {
            setUploading(false);
        }
    };

    const handleBulkFilePick = (event) => {
        const files = Array.from(event.target.files || []).filter((file) => (
            file.type.includes('pdf') || /\.pdf$/i.test(file.name)
        ));

        event.target.value = '';

        if (files.length === 0) {
            toast.error('Pick one or more PDF files.');
            return;
        }

        const nextDraft = buildBulkUploadDraft(files, archiveEligibleRfis, archiveByRfi);
        setBulkUploadDraft(nextDraft);
        setBulkUploadOpen(true);
    };

    const handleBulkUpload = async () => {
        if (!activeProject?.id || !user?.id) return;

        const matchedRows = bulkUploadDraft.filter((row) => row.status === 'matched' && row.matchedRfiId);
        if (matchedRows.length === 0) {
            toast.error('No matched PDFs are ready to upload.');
            return;
        }

        setBulkUploadSubmitting(true);
        try {
            for (const row of matchedRows) {
                await uploadRfiScannedDocument(
                    row.matchedRfiId,
                    row.file,
                    activeProject.id,
                    user.id,
                    row.uploadFileName || row.file.name,
                );
            }

            const skippedCount = bulkUploadDraft.length - matchedRows.length;
            toast.success(
                `${matchedRows.length} PDF${matchedRows.length === 1 ? '' : 's'} uploaded${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`,
            );
            setBulkUploadDraft([]);
            setBulkUploadOpen(false);
            setDocsReloadKey((value) => value + 1);
        } catch (error) {
            console.error('Failed to bulk upload scanned documents:', error);
            toast.error(error.message || 'Bulk upload failed.');
        } finally {
            setBulkUploadSubmitting(false);
        }
    };

    const handlePreviewLatest = async (rfi) => {
        const archive = getArchiveForRfi(rfi.id);
        if (!archive.latest) {
            toast.error('No scanned copy is available for preview.');
            return;
        }

        setPreviewingRfiId(rfi.id);
        try {
            const data = await getRfiScannedDocumentUrl(archive.latest.id, 'preview');
            setPreviewState({ open: true, url: data.url, fileName: buildPdfName(getRfiLabel(rfi)) });
        } catch (error) {
            console.error('Failed to open scanned document:', error);
            toast.error(error.message || 'Could not open document.');
        } finally {
            setPreviewingRfiId('');
        }
    };

    const downloadDocsAsZip = async (docs, zipNameBase, labelResolver) => {
        const JSZip = await loadJsZip();
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
        const archive = getArchiveForRfi(rfi.id);
        if (!archive.docs.length) {
            toast.error('No scanned copy is available for download.');
            return;
        }

        const label = getRfiLabel(rfi);

        setDownloadingRfiId(rfi.id);
        try {
            if (archive.docs.length === 1) {
                await downloadRfiScannedDocument(archive.docs[0].id, buildPdfName(label));
                return;
            }

            await downloadDocsAsZip(archive.docs, label, () => label);
        } catch (error) {
            console.error('Failed to download scanned documents:', error);
            toast.error(error.message || 'Could not download scanned documents.');
        } finally {
            setDownloadingRfiId('');
        }
    };

    const handleDeleteLatest = async (rfi) => {
        const archive = getArchiveForRfi(rfi.id);
        if (!archive.latest) return;

        const confirmed = window.confirm('Delete the latest scanned copy from this RFI?');
        if (!confirmed) return;

        setRemovingRfiId(rfi.id);
        try {
            await deleteRfiScannedDocument(archive.latest.id);
            toast.success('Latest scanned copy removed');
            if (pendingUpload.rfiId === rfi.id) {
                setPendingUpload({ rfiId: '', files: [] });
            }
            setDocsReloadKey((value) => value + 1);
        } catch (error) {
            console.error('Failed to delete scanned document:', error);
            toast.error(error.message || 'Could not remove the document.');
        } finally {
            setRemovingRfiId('');
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
            setBulkDialogOpen(false);
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
                        {canBulkUpload && (
                            <label className="rfi-archive-pill rfi-archive-pill-action">
                                <Upload size={15} />
                                Bulk Upload
                                <input
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    multiple
                                    hidden
                                    onChange={handleBulkFilePick}
                                />
                            </label>
                        )}
                        <button type="button" className="rfi-archive-pill rfi-archive-pill-action" onClick={() => setBulkDialogOpen(true)}>
                            <Download size={15} />
                            Bulk Download
                        </button>
                        <span className="rfi-archive-pill">{activeProject?.name || 'No active project'}</span>
                        <span className="rfi-archive-pill">{visibleRfis.length} {user?.role === 'consultant' ? 'archived RFIs' : 'completed RFIs'}</span>
                    </div>
                </section>

                <section className="rfi-archive-board">
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
                        <strong>{user?.role === 'consultant' ? 'Uploaded archives' : 'Completed RFIs'}</strong>
                        <span>{visibleRfis.length}</span>
                    </div>

                    {loadingArchive ? (
                        <div className="rfi-archive-empty compact">
                            Loading scanned archive...
                        </div>
                    ) : visibleRfis.length === 0 ? (
                        <div className="rfi-archive-empty compact">
                            {user?.role === 'consultant'
                                ? 'No scanned archive files have been uploaded yet.'
                                : 'No completed RFIs are available for archive yet.'}
                        </div>
                    ) : (
                        <div className="rfi-archive-card-grid">
                            {visibleRfis.map((rfi) => {
                                const isActive = selectedRfi?.id === rfi.id;
                                const archive = getArchiveForRfi(rfi.id);
                                const hasFiles = archive.count > 0;
                                const canUpload = canUploadForRfi(rfi);
                                const pendingHere = pendingUpload.rfiId === rfi.id;
                                const pendingNames = pendingHere ? buildUploadNames(rfi, pendingUpload.files) : [];
                                const rowBusy = previewingRfiId === rfi.id || downloadingRfiId === rfi.id || removingRfiId === rfi.id || (uploading && pendingHere);

                                return (
                                    <article key={rfi.id} className={`rfi-archive-item rfi-archive-item-wide ${isActive ? 'active' : ''}`}>
                                        <button
                                            type="button"
                                            className="rfi-archive-item-select"
                                            onClick={() => setSelectedRfiId(rfi.id)}
                                        >
                                            <div className="rfi-archive-item-top">
                                                <strong className="rfi-archive-item-title">#{getRfiLabel(rfi)}</strong>
                                                <StatusBadge status={rfi.status} />
                                            </div>
                                            <div className="rfi-archive-item-desc">
                                                {rfi.description || 'No description'}
                                            </div>
                                            <div className="rfi-archive-item-meta">
                                                <span>{rfi.location || 'No location'}</span>
                                                <span>{archive.count} file{archive.count === 1 ? '' : 's'}</span>
                                            </div>
                                        </button>

                                        <div className="rfi-archive-item-actions compact">
                                            <button
                                                type="button"
                                                className={`rfi-archive-action-btn btn-progress-static ${previewingRfiId === rfi.id ? 'is-loading' : ''}`}
                                                disabled={!hasFiles || rowBusy}
                                                onClick={() => handlePreviewLatest(rfi)}
                                            >
                                                <span className="btn-progress-icon">
                                                    {previewingRfiId === rfi.id ? <RefreshCw size={15} className="spin-slow" /> : <Eye size={15} />}
                                                </span>
                                                <span className="btn-progress-label">
                                                    <span className="btn-progress-visible">{previewingRfiId === rfi.id ? '...' : 'Preview'}</span>
                                                    <span className="btn-progress-measure" aria-hidden="true">Preview</span>
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                className={`rfi-archive-action-btn btn-progress-static ${downloadingRfiId === rfi.id ? 'is-loading' : ''}`}
                                                disabled={!hasFiles || rowBusy}
                                                onClick={() => handleDownloadRfi(rfi)}
                                            >
                                                <span className="btn-progress-icon">
                                                    {downloadingRfiId === rfi.id ? <RefreshCw size={15} className="spin-slow" /> : <Download size={15} />}
                                                </span>
                                                <span className="btn-progress-label">
                                                    <span className="btn-progress-visible">{downloadingRfiId === rfi.id ? '...' : 'Download'}</span>
                                                    <span className="btn-progress-measure" aria-hidden="true">Download</span>
                                                </span>
                                            </button>
                                        </div>

                                        {isActive && canUpload && (
                                            <div className="rfi-archive-inline-upload">
                                                <div className="rfi-archive-inline-upload-head">
                                                    <strong>Upload scanned PDFs</strong>
                                                    {hasFiles && (
                                                        <button type="button" className={`rfi-archive-action-btn danger btn-progress-static ${removingRfiId === rfi.id ? 'is-loading' : ''}`} onClick={() => handleDeleteLatest(rfi)} disabled={rowBusy}>
                                                            <span className="btn-progress-icon">
                                                                {removingRfiId === rfi.id ? <RefreshCw size={15} className="spin-slow" /> : <Trash2 size={15} />}
                                                            </span>
                                                            <span className="btn-progress-label">
                                                                <span className="btn-progress-visible">{removingRfiId === rfi.id ? '...' : 'Remove Latest'}</span>
                                                                <span className="btn-progress-measure" aria-hidden="true">Remove Latest</span>
                                                            </span>
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="rfi-archive-upload-actions">
                                                    <label className="rfi-archive-action-btn">
                                                        <Upload size={15} />
                                                        Pick PDFs
                                                        <input
                                                            type="file"
                                                            accept="application/pdf,.pdf"
                                                            multiple
                                                            hidden
                                                            onChange={(event) => handleFilePick(rfi.id, event)}
                                                        />
                                                    </label>
                                                    {pendingHere && pendingUpload.files.length > 0 && (
                                                        <>
                                                            <button type="button" className={`rfi-archive-action-btn primary btn-progress-static ${uploading ? 'is-loading' : ''}`} onClick={() => handleUpload(rfi)} disabled={uploading}>
                                                                <span className="btn-progress-icon">
                                                                    {uploading ? <RefreshCw size={15} className="spin-slow" /> : <Upload size={15} />}
                                                                </span>
                                                                <span className="btn-progress-label">
                                                                    <span className="btn-progress-visible">{uploading ? '...' : 'Upload'}</span>
                                                                    <span className="btn-progress-measure" aria-hidden="true">Upload</span>
                                                                </span>
                                                            </button>
                                                            <button type="button" className="rfi-archive-action-btn" onClick={() => setPendingUpload({ rfiId: '', files: [] })} disabled={uploading}>
                                                                Clear
                                                            </button>
                                                        </>
                                                    )}
                                                </div>

                                                {pendingHere && pendingUpload.files.length > 0 && (
                                                    <div className="rfi-archive-pending-list compact">
                                                        {pendingUpload.files.map((file, index) => (
                                                            <div key={`${file.name}-${file.lastModified}`} className="rfi-archive-pending-file compact">
                                                                <div className="rfi-archive-pending-copy">
                                                                    <FileText size={15} />
                                                                    <span>{pendingNames[index]}</span>
                                                                </div>
                                                                <small>{formatBytes(file.size)}</small>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </section>

                <datalist id="rfi-range-options">
                    {rfiRangeOptions.map((option) => (
                        <option key={option.id} value={option.label} />
                    ))}
                </datalist>
            </main>

            {bulkDialogOpen && (
                <div className="rfi-archive-bulk-overlay" onClick={() => setBulkDialogOpen(false)}>
                    <div className="rfi-archive-bulk-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="rfi-archive-bulk-head">
                            <div>
                                <strong>Bulk Download</strong>
                                <span>Download all scanned PDFs between two RFI numbers.</span>
                            </div>
                            <button type="button" className="rfi-archive-action-btn" onClick={() => setBulkDialogOpen(false)}>
                                <X size={15} />
                                Close
                            </button>
                        </div>

                        <div className="rfi-archive-bulk-controls modal">
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
                            <button type="button" className={`rfi-archive-action-btn primary btn-progress-static ${bulkDownloading ? 'is-loading' : ''}`} onClick={handleDownloadRange} disabled={bulkDownloading || loadingArchive}>
                                <span className="btn-progress-icon">
                                    {bulkDownloading ? <RefreshCw size={15} className="spin-slow" /> : <Download size={15} />}
                                </span>
                                <span className="btn-progress-label">
                                    <span className="btn-progress-visible">{bulkDownloading ? '...' : 'Download Range'}</span>
                                    <span className="btn-progress-measure" aria-hidden="true">Download Range</span>
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {bulkUploadOpen && (
                <div className="rfi-archive-bulk-overlay" onClick={() => !bulkUploadSubmitting && setBulkUploadOpen(false)}>
                    <div className="rfi-archive-bulk-modal rfi-archive-bulk-upload-modal" onClick={(event) => event.stopPropagation()}>
                        <div className="rfi-archive-bulk-head">
                            <div>
                                <strong>Bulk Auto-Match Upload</strong>
                                <span>Name each PDF with its RFI number and the system will place it in the correct archive automatically.</span>
                            </div>
                            <button type="button" className="rfi-archive-action-btn" onClick={() => setBulkUploadOpen(false)} disabled={bulkUploadSubmitting}>
                                <X size={15} />
                                Close
                            </button>
                        </div>

                        <div className="rfi-archive-bulk-upload-summary">
                            <span>{bulkUploadDraft.filter((row) => row.status === 'matched').length} matched</span>
                            <span>{bulkUploadDraft.filter((row) => row.status === 'unmatched').length} unmatched</span>
                            <span>{bulkUploadDraft.filter((row) => row.status === 'ambiguous').length} ambiguous</span>
                        </div>

                        <div className="rfi-archive-bulk-upload-list">
                            {bulkUploadDraft.map((row) => (
                                <div key={row.id} className={`rfi-archive-bulk-upload-row ${row.status}`}>
                                    <div className="rfi-archive-bulk-upload-copy">
                                        <strong>{row.file.name}</strong>
                                        <span>{formatBytes(row.file.size)}</span>
                                    </div>
                                    <div className="rfi-archive-bulk-upload-result">
                                        {row.status === 'matched' ? (
                                            <>
                                                <strong>{row.matchedRfiLabel}</strong>
                                                <span>{row.uploadFileName}</span>
                                            </>
                                        ) : (
                                            <>
                                                <strong>{row.status === 'ambiguous' ? 'Needs review' : 'No match found'}</strong>
                                                <span>{row.reason}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="rfi-archive-bulk-upload-actions">
                            <label className="rfi-archive-action-btn">
                                <Upload size={15} />
                                Replace PDFs
                                <input
                                    type="file"
                                    accept="application/pdf,.pdf"
                                    multiple
                                    hidden
                                    onChange={handleBulkFilePick}
                                />
                            </label>
                            <button
                                type="button"
                                className={`rfi-archive-action-btn primary btn-progress-static ${bulkUploadSubmitting ? 'is-loading' : ''}`}
                                onClick={handleBulkUpload}
                                disabled={bulkUploadSubmitting || bulkUploadDraft.every((row) => row.status !== 'matched')}
                            >
                                <span className="btn-progress-icon">
                                    {bulkUploadSubmitting ? <RefreshCw size={15} className="spin-slow" /> : <Upload size={15} />}
                                </span>
                                <span className="btn-progress-label">
                                    <span className="btn-progress-visible">{bulkUploadSubmitting ? '...' : 'Upload Matched'}</span>
                                    <span className="btn-progress-measure" aria-hidden="true">Upload Matched</span>
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
