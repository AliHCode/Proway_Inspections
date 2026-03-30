import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import Header from '../components/Header';
import {
    ArrowLeft, Trash2, AlertTriangle, Search, ChevronLeft, ChevronRight,
    Database, Image, CalendarDays, FileText, RefreshCw, CheckSquare, Square,
    ShieldAlert, X, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';

const PAGE_SIZE = 50;

export default function AdminDataManager() {
    const { user } = useAuth();
    const { projects, activeProject } = useProject();
    const navigate = useNavigate();

    const [selectedProjectId, setSelectedProjectId] = useState(activeProject?.id || '');
    const [rfis, setRfis] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [totalImages, setTotalImages] = useState(0);
    const [dateRange, setDateRange] = useState({ min: null, max: null });
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [deleting, setDeleting] = useState(null); // rfiId or 'bulk' or 'purge'
    const [purgeConfirmText, setPurgeConfirmText] = useState('');
    const [showPurgeModal, setShowPurgeModal] = useState(false);
    const [actionMessage, setActionMessage] = useState('');

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    // ─── Fetch RFIs for selected project ───
    const fetchProjectRfis = useCallback(async () => {
        if (!selectedProjectId) return;
        setLoading(true);
        try {
            // Get total count
            const { count, error: countError } = await supabase
                .from('rfis')
                .select('*', { count: 'exact', head: true })
                .eq('project_id', selectedProjectId);
            if (countError) throw countError;
            setTotalCount(count || 0);

            // Get total images count
            const { data: imgData, error: imgError } = await supabase
                .from('rfis')
                .select('images')
                .eq('project_id', selectedProjectId)
                .not('images', 'is', null);
            if (!imgError) {
                const total = (imgData || []).reduce((sum, r) => sum + (Array.isArray(r.images) ? r.images.length : 0), 0);
                setTotalImages(total);
            }

            // Get date range
            const { data: minData } = await supabase
                .from('rfis')
                .select('filed_date')
                .eq('project_id', selectedProjectId)
                .order('filed_date', { ascending: true })
                .limit(1);
            const { data: maxData } = await supabase
                .from('rfis')
                .select('filed_date')
                .eq('project_id', selectedProjectId)
                .order('filed_date', { ascending: false })
                .limit(1);
            setDateRange({
                min: minData?.[0]?.filed_date || null,
                max: maxData?.[0]?.filed_date || null,
            });

            // Fetch page of RFIs
            let query = supabase
                .from('rfis')
                .select('id, serial_no, custom_fields, description, location, status, filed_date, images, filed_by, reviewed_by')
                .eq('project_id', selectedProjectId)
                .order('serial_no', { ascending: true })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            const { data, error } = await query;
            if (error) throw error;
            setRfis(data || []);
        } catch (err) {
            console.error('Error fetching RFIs:', err);
            toast.error('Failed to load RFI data');
        } finally {
            setLoading(false);
        }
    }, [selectedProjectId, page]);

    useEffect(() => {
        setPage(0);
        setSelectedIds([]);
        setSearchQuery('');
    }, [selectedProjectId]);

    useEffect(() => {
        fetchProjectRfis();
    }, [fetchProjectRfis]);

    // ─── Filtered RFIs (client-side search within the fetched page) ───
    const filteredRfis = useMemo(() => {
        if (!searchQuery.trim()) return rfis;
        const q = searchQuery.toLowerCase();
        return rfis.filter(r => {
            const rfiNo = r.custom_fields?.rfi_no || '';
            const desc = r.description || '';
            const loc = r.location || '';
            return rfiNo.toLowerCase().includes(q) || desc.toLowerCase().includes(q) || loc.toLowerCase().includes(q);
        });
    }, [rfis, searchQuery]);

    // ─── Delete images from Supabase Storage ───
    async function deleteImagesFromStorage(imageUrls) {
        if (!imageUrls || imageUrls.length === 0) return;
        const paths = imageUrls
            .map(url => {
                // Extract path from public URL: ...rfi-images/PROJECT_ID/filename.jpg
                const match = url.match(/rfi-images\/(.+)/);
                return match ? match[1] : null;
            })
            .filter(Boolean);

        if (paths.length === 0) return;

        // Supabase allows max 1000 files per remove call
        const BATCH = 100;
        for (let i = 0; i < paths.length; i += BATCH) {
            const batch = paths.slice(i, i + BATCH);
            const { error } = await supabase.storage.from('rfi-images').remove(batch);
            if (error) console.warn('Error removing images:', error);
        }
    }

    // ─── Delete a single RFI ───
    async function handleDeleteSingle(rfi) {
        if (!confirm(`Delete RFI ${rfi.custom_fields?.rfi_no || `#${rfi.serial_no}`}?\n\nThis will permanently remove the RFI and its images.`)) return;
        setDeleting(rfi.id);
        try {
            await deleteImagesFromStorage(rfi.images);
            const { error } = await supabase.from('rfis').delete().eq('id', rfi.id);
            toast.success(`Deleted ${rfi.custom_fields?.rfi_no || `RFI #${rfi.serial_no}`}`);
            setSelectedIds(prev => prev.filter(id => id !== rfi.id));
            if (rfis.length <= 1 && page > 0) {
                setPage(p => p - 1);
            } else {
                fetchProjectRfis();
            }
        } catch (err) {
            console.error('Error deleting RFI:', err);
            toast.error('Failed to delete RFI');
        } finally {
            setDeleting(null);
        }
    }

    // ─── Bulk delete selected RFIs ───
    async function handleBulkDelete() {
        if (selectedIds.length === 0) return;
        if (!confirm(`Delete ${selectedIds.length} selected RFIs?\n\nThis will permanently remove them and their images.`)) return;
        setDeleting('bulk');
        try {
            // Collect images from selected RFIs
            const targetRfis = rfis.filter(r => selectedIds.includes(r.id));
            const allImages = targetRfis.flatMap(r => r.images || []);
            await deleteImagesFromStorage(allImages);

            // Delete in batches of 50
            for (let i = 0; i < selectedIds.length; i += 50) {
                const batch = selectedIds.slice(i, i + 50);
                const { error } = await supabase.from('rfis').delete().in('id', batch);
                if (error) throw error;
            }

            toast.success(`Deleted ${selectedIds.length} RFIs`);
            setSelectedIds([]);
            if (rfis.length <= selectedIds.length && page > 0) {
                setPage(0);
            } else {
                fetchProjectRfis();
            }
        } catch (err) {
            console.error('Error bulk deleting RFIs:', err);
            toast.error('Failed to delete some RFIs');
        } finally {
            setDeleting(null);
        }
    }

    // ─── Purge ALL project data ───
    async function handlePurgeAll() {
        if (!selectedProjectId || purgeConfirmText !== selectedProject?.name) return;
        setDeleting('purge');
        setShowPurgeModal(false);
        const toastId = toast.loading('Purging project data...');

        try {
            // 1. Get ALL rfi IDs for this project
            const { data: allRfis, error: fetchErr } = await supabase
                .from('rfis')
                .select('id, images')
                .eq('project_id', selectedProjectId);
            if (fetchErr) throw fetchErr;

            const rfiIds = (allRfis || []).map(r => r.id);
            const allImages = (allRfis || []).flatMap(r => r.images || []);

            // 2. Delete all images from storage
            if (allImages.length > 0) {
                toast.loading('Removing images...', { id: toastId });
                await deleteImagesFromStorage(allImages);
            }

            // 3. Delete comments linked to these RFIs
            if (rfiIds.length > 0) {
                toast.loading('Removing comments...', { id: toastId });
                for (let i = 0; i < rfiIds.length; i += 50) {
                    const batch = rfiIds.slice(i, i + 50);
                    await supabase.from('comments').delete().in('rfi_id', batch);
                }
            }

            // 4. Delete notifications linked to these RFIs
            if (rfiIds.length > 0) {
                toast.loading('Removing notifications...', { id: toastId });
                for (let i = 0; i < rfiIds.length; i += 50) {
                    const batch = rfiIds.slice(i, i + 50);
                    await supabase.from('notifications').delete().in('rfi_id', batch);
                }
            }

            // 5. Delete audit_log entries for these RFIs
            if (rfiIds.length > 0) {
                toast.loading('Removing audit logs...', { id: toastId });
                for (let i = 0; i < rfiIds.length; i += 50) {
                    const batch = rfiIds.slice(i, i + 50);
                    await supabase.from('audit_log').delete().in('rfi_id', batch);
                }
            }

            // 6. Delete ALL RFIs for this project
            toast.loading('Removing all RFIs...', { id: toastId });
            const { error: deleteErr } = await supabase
                .from('rfis')
                .delete()
                .eq('project_id', selectedProjectId);
            if (deleteErr) throw deleteErr;

            // 7. Also try to delete orphaned storage files under projectId/ folder
            try {
                const { data: storageFiles } = await supabase.storage
                    .from('rfi-images')
                    .list(selectedProjectId, { limit: 1000 });
                if (storageFiles && storageFiles.length > 0) {
                    const paths = storageFiles.map(f => `${selectedProjectId}/${f.name}`);
                    for (let i = 0; i < paths.length; i += 100) {
                        await supabase.storage.from('rfi-images').remove(paths.slice(i, i + 100));
                    }
                }
            } catch (storageErr) {
                console.warn('Storage folder cleanup warning:', storageErr);
            }

            toast.success(`All data purged for "${selectedProject?.name}". Project is now fresh.`, { id: toastId, duration: 5000 });
            setPurgeConfirmText('');
            setSelectedIds([]);
            setPage(0);
            setRfis([]);
            setTotalCount(0);
            setTotalImages(0);
            
            // Re-fetch to ensure sync
            setTimeout(() => {
                fetchProjectRfis();
            }, 500);
        } catch (err) {
            console.error('Error purging project data:', err);
            toast.error('Purge failed. Some data may remain.', { id: toastId });
        } finally {
            setDeleting(null);
        }
    }

    // ─── Selection helpers ───
    const isAllSelected = filteredRfis.length > 0 && filteredRfis.every(r => selectedIds.includes(r.id));
    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedIds(prev => prev.filter(id => !filteredRfis.some(r => r.id === id)));
        } else {
            const newIds = filteredRfis.map(r => r.id);
            setSelectedIds(prev => [...new Set([...prev, ...newIds])]);
        }
    };
    const toggleSelect = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const totalPages = Math.ceil(totalCount / PAGE_SIZE);

    const getStatusColor = (status) => {
        switch (status) {
            case 'approved': return '#10b981';
            case 'conditional_approve': return '#f59e0b';
            case 'rejected': return '#f43f5e';
            case 'cancelled': return '#94a3b8';
            case 'pending': return '#3b82f6';
            case 'verification_pending': return '#8b5cf6';
            default: return '#64748b';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'approved': return 'Approved';
            case 'conditional_approve': return 'Cond. Approved';
            case 'rejected': return 'Rejected';
            case 'cancelled': return 'Cancelled';
            case 'pending': return 'Pending';
            case 'verification_pending': return 'Verifying';
            default: return status;
        }
    };

    if (user?.role !== 'admin') {
        navigate('/');
        return null;
    }

    return (
        <div className="page-wrapper">
            <Header />
            <main className="admin-page" style={{ maxWidth: '1100px', margin: '0 auto' }}>

                {/* ─── Top Bar ─── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => navigate('/admin')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                            background: 'none', border: '1.5px solid var(--clr-border)', padding: '0.5rem 1rem',
                            borderRadius: '12px', fontWeight: 600, color: 'var(--clr-text-secondary)',
                            cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s'
                        }}
                    >
                        <ArrowLeft size={16} /> Back to Dashboard
                    </button>
                    <div style={{ flex: 1 }} />
                    <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--clr-text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Database size={20} /> Data Manager
                    </h2>
                </div>

                {/* ─── Project Selector ─── */}
                <div className="dm-card">
                    <label className="dm-label">Select Project</label>
                    <select
                        className="dm-select"
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                    >
                        <option value="" disabled>Choose a project...</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                        ))}
                    </select>
                </div>

                {selectedProjectId && (
                    <>
                        {/* ─── Summary Cards ─── */}
                        <div className="dm-summary-grid">
                            <div className="dm-stat-card">
                                <div className="dm-stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <div className="dm-stat-value">{totalCount}</div>
                                    <div className="dm-stat-label">Total RFIs</div>
                                </div>
                            </div>
                            <div className="dm-stat-card">
                                <div className="dm-stat-icon" style={{ background: 'rgba(168, 85, 247, 0.1)', color: '#a855f7' }}>
                                    <Image size={20} />
                                </div>
                                <div>
                                    <div className="dm-stat-value">{totalImages}</div>
                                    <div className="dm-stat-label">Total Images</div>
                                </div>
                            </div>
                            <div className="dm-stat-card">
                                <div className="dm-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                                    <CalendarDays size={20} />
                                </div>
                                <div>
                                    <div className="dm-stat-value" style={{ fontSize: '0.95rem' }}>
                                        {dateRange.min ? `${dateRange.min}` : '—'}
                                    </div>
                                    <div className="dm-stat-label">First Entry</div>
                                </div>
                            </div>
                            <div className="dm-stat-card">
                                <div className="dm-stat-icon" style={{ background: 'rgba(244, 63, 94, 0.1)', color: '#f43f5e' }}>
                                    <CalendarDays size={20} />
                                </div>
                                <div>
                                    <div className="dm-stat-value" style={{ fontSize: '0.95rem' }}>
                                        {dateRange.max ? `${dateRange.max}` : '—'}
                                    </div>
                                    <div className="dm-stat-label">Last Entry</div>
                                </div>
                            </div>
                        </div>

                        {/* ─── RFI Browser ─── */}
                        <div className="dm-card">
                            <div className="dm-browser-header">
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                                    RFI Browser
                                </h3>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    {selectedIds.length > 0 && (
                                        <button
                                            className="dm-btn dm-btn-danger"
                                            onClick={handleBulkDelete}
                                            disabled={deleting === 'bulk'}
                                        >
                                            {deleting === 'bulk' ? <Loader2 size={14} className="spinner" /> : <Trash2 size={14} />}
                                            Delete {selectedIds.length} Selected
                                        </button>
                                    )}
                                    <div className="dm-search-wrap">
                                        <Search size={14} />
                                        <input
                                            type="text"
                                            placeholder="Search RFI #, description..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            className="dm-search-input"
                                        />
                                        {searchQuery && (
                                            <button className="dm-search-clear" onClick={() => setSearchQuery('')}>
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                    <button className="dm-btn dm-btn-ghost" onClick={fetchProjectRfis} disabled={loading}>
                                        <RefreshCw size={14} className={loading ? 'spinner' : ''} />
                                    </button>
                                </div>
                            </div>

                            {loading ? (
                                <div className="dm-loading">
                                    <Loader2 size={20} className="spinner" />
                                    <span>Loading RFIs...</span>
                                </div>
                            ) : filteredRfis.length === 0 ? (
                                <div className="dm-empty">
                                    {totalCount === 0 ? 'No RFIs in this project.' : 'No results match your search.'}
                                </div>
                            ) : (
                                <>
                                    <div className="dm-table-wrapper">
                                        <table className="dm-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '40px' }}>
                                                        <button className="dm-check-btn" onClick={toggleSelectAll}>
                                                            {isAllSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                                                        </button>
                                                    </th>
                                                    <th>RFI #</th>
                                                    <th>Description</th>
                                                    <th>Status</th>
                                                    <th>Filed Date</th>
                                                    <th style={{ textAlign: 'center' }}>Images</th>
                                                    <th style={{ textAlign: 'center', width: '80px' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredRfis.map(rfi => (
                                                    <tr key={rfi.id} className={selectedIds.includes(rfi.id) ? 'dm-row-selected' : ''}>
                                                        <td>
                                                            <button className="dm-check-btn" onClick={() => toggleSelect(rfi.id)}>
                                                                {selectedIds.includes(rfi.id) ? <CheckSquare size={16} style={{ color: '#3b82f6' }} /> : <Square size={16} />}
                                                            </button>
                                                        </td>
                                                        <td className="dm-cell-code">{rfi.custom_fields?.rfi_no || `#${rfi.serial_no}`}</td>
                                                        <td className="dm-cell-desc">
                                                            <div className="dm-cell-desc-text">{rfi.description || rfi.location || '—'}</div>
                                                        </td>
                                                        <td>
                                                            <span className="dm-status-dot" style={{ background: getStatusColor(rfi.status) }} />
                                                            {getStatusLabel(rfi.status)}
                                                        </td>
                                                        <td style={{ whiteSpace: 'nowrap' }}>{rfi.filed_date || '—'}</td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            {Array.isArray(rfi.images) && rfi.images.length > 0
                                                                ? <span className="dm-img-count">{rfi.images.length}</span>
                                                                : <span style={{ color: '#94a3b8' }}>0</span>
                                                            }
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <button
                                                                className="dm-btn-icon-danger"
                                                                onClick={() => handleDeleteSingle(rfi)}
                                                                disabled={deleting === rfi.id}
                                                                title="Delete this RFI"
                                                            >
                                                                {deleting === rfi.id ? <Loader2 size={14} className="spinner" /> : <Trash2 size={14} />}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination */}
                                    {totalPages > 1 && (
                                        <div className="dm-pagination">
                                            <button className="dm-btn dm-btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                                                <ChevronLeft size={16} /> Prev
                                            </button>
                                            <span className="dm-page-info">
                                                Page {page + 1} of {totalPages}
                                            </span>
                                            <button className="dm-btn dm-btn-ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                                                Next <ChevronRight size={16} />
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* ─── DANGER ZONE ─── */}
                        <div className="dm-danger-zone">
                            <div className="dm-danger-header">
                                <ShieldAlert size={22} />
                                <div>
                                    <h3>Danger Zone — Purge All Project Data</h3>
                                    <p>Permanently delete <strong>all {totalCount} RFIs</strong>, <strong>{totalImages} images</strong>, comments, notifications, and audit logs for <strong>"{selectedProject?.name}"</strong>. The project settings, team members, and field configuration will be preserved. RFI numbering will restart from <strong>{selectedProject?.rfi_start_number || 1}</strong>.</p>
                                </div>
                            </div>
                            <button
                                className="dm-btn dm-btn-danger-lg"
                                onClick={() => { setShowPurgeModal(true); setPurgeConfirmText(''); }}
                                disabled={totalCount === 0 || deleting === 'purge'}
                            >
                                {deleting === 'purge' ? <><Loader2 size={16} className="spinner" /> Purging...</> : <><Trash2 size={16} /> Purge All Data</>}
                            </button>
                        </div>
                    </>
                )}

                {/* ─── Purge Confirmation Modal ─── */}
                {showPurgeModal && (
                    <div className="dm-modal-overlay" onClick={() => setShowPurgeModal(false)}>
                        <div className="dm-modal" onClick={e => e.stopPropagation()}>
                            <div className="dm-modal-header">
                                <AlertTriangle size={24} style={{ color: '#f43f5e' }} />
                                <h3>Confirm Full Data Purge</h3>
                                <button className="dm-modal-close" onClick={() => setShowPurgeModal(false)}>
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="dm-modal-body">
                                <p>You are about to <strong>permanently delete ALL data</strong> for the project:</p>
                                <div className="dm-modal-project-name">{selectedProject?.name}</div>
                                <ul className="dm-modal-list">
                                    <li>{totalCount} RFIs</li>
                                    <li>{totalImages} uploaded images</li>
                                    <li>All comments & discussions</li>
                                    <li>All notifications</li>
                                    <li>All audit history</li>
                                </ul>
                                <p className="dm-modal-warning">This action is <strong>irreversible</strong>. Type the project name below to confirm:</p>
                                <input
                                    type="text"
                                    className="dm-confirm-input"
                                    placeholder={selectedProject?.name}
                                    value={purgeConfirmText}
                                    onChange={e => setPurgeConfirmText(e.target.value)}
                                    autoFocus
                                />
                            </div>
                            <div className="dm-modal-footer">
                                <button className="dm-btn dm-btn-ghost" onClick={() => setShowPurgeModal(false)}>
                                    Cancel
                                </button>
                                <button
                                    className="dm-btn dm-btn-danger-lg"
                                    disabled={purgeConfirmText !== selectedProject?.name}
                                    onClick={handlePurgeAll}
                                >
                                    <Trash2 size={16} /> Purge Everything
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <style>{`
                    /* ─── Data Manager Tokens ─── */
                    .dm-card {
                        background: var(--clr-bg-card, #fff);
                        border: 1px solid var(--clr-border, #e2e8f0);
                        border-radius: 16px;
                        padding: 1.25rem;
                        margin-bottom: 1.25rem;
                    }
                    .dm-label {
                        font-size: 0.8rem;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.08em;
                        color: var(--clr-text-secondary, #64748b);
                        margin-bottom: 0.5rem;
                        display: block;
                    }
                    .dm-select {
                        width: 100%;
                        padding: 0.7rem 1rem;
                        border: 1.5px solid var(--clr-border, #e2e8f0);
                        border-radius: 12px;
                        font-size: 0.95rem;
                        font-weight: 600;
                        color: var(--clr-text-main, #0f172a);
                        background: var(--clr-bg-elevated, #f8fafc);
                        transition: border-color 0.2s;
                    }
                    .dm-select:focus {
                        outline: none;
                        border-color: #0f172a;
                        box-shadow: 0 0 0 3px rgba(15,23,42,0.06);
                    }

                    /* Summary Grid */
                    .dm-summary-grid {
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 0.75rem;
                        margin-bottom: 1.25rem;
                    }
                    @media (max-width: 768px) {
                        .dm-summary-grid { grid-template-columns: repeat(2, 1fr); }
                    }
                    .dm-stat-card {
                        background: var(--clr-bg-card, #fff);
                        border: 1px solid var(--clr-border, #e2e8f0);
                        border-radius: 14px;
                        padding: 1rem;
                        display: flex;
                        align-items: center;
                        gap: 0.85rem;
                    }
                    .dm-stat-icon {
                        width: 44px;
                        height: 44px;
                        border-radius: 12px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        flex-shrink: 0;
                    }
                    .dm-stat-value {
                        font-size: 1.35rem;
                        font-weight: 800;
                        color: var(--clr-text-main, #0f172a);
                        line-height: 1.1;
                    }
                    .dm-stat-label {
                        font-size: 0.75rem;
                        color: var(--clr-text-secondary, #64748b);
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                        margin-top: 2px;
                    }

                    /* Browser Header */
                    .dm-browser-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 1rem;
                        gap: 0.75rem;
                        flex-wrap: wrap;
                    }
                    .dm-search-wrap {
                        display: flex;
                        align-items: center;
                        gap: 0.4rem;
                        background: var(--clr-bg-elevated, #f8fafc);
                        border: 1.5px solid var(--clr-border, #e2e8f0);
                        border-radius: 10px;
                        padding: 0.45rem 0.75rem;
                        min-width: 200px;
                    }
                    .dm-search-wrap:focus-within {
                        border-color: #0f172a;
                        box-shadow: 0 0 0 3px rgba(15,23,42,0.06);
                    }
                    .dm-search-input {
                        border: none;
                        background: transparent;
                        font-size: 0.85rem;
                        outline: none;
                        width: 100%;
                        color: var(--clr-text-main, #0f172a);
                    }
                    .dm-search-clear {
                        background: none;
                        border: none;
                        color: #94a3b8;
                        cursor: pointer;
                        padding: 0;
                        display: flex;
                    }

                    /* Buttons */
                    .dm-btn {
                        display: inline-flex;
                        align-items: center;
                        gap: 0.4rem;
                        padding: 0.5rem 1rem;
                        border: none;
                        border-radius: 10px;
                        font-size: 0.8rem;
                        font-weight: 700;
                        cursor: pointer;
                        transition: all 0.2s;
                        white-space: nowrap;
                    }
                    .dm-btn-ghost {
                        background: var(--clr-bg-elevated, #f8fafc);
                        border: 1.5px solid var(--clr-border, #e2e8f0);
                        color: var(--clr-text-secondary, #64748b);
                    }
                    .dm-btn-ghost:hover { background: #e2e8f0; color: #0f172a; }
                    .dm-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
                    .dm-btn-danger {
                        background: #fef2f2;
                        color: #dc2626;
                        border: 1.5px solid #fecaca;
                    }
                    .dm-btn-danger:hover { background: #fee2e2; }
                    .dm-btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
                    .dm-btn-danger-lg {
                        background: #dc2626;
                        color: white;
                        padding: 0.7rem 1.5rem;
                        border-radius: 12px;
                        font-size: 0.85rem;
                        font-weight: 700;
                        box-shadow: 0 4px 12px rgba(220,38,38,0.25);
                    }
                    .dm-btn-danger-lg:hover { background: #b91c1c; transform: translateY(-1px); }
                    .dm-btn-danger-lg:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }
                    .dm-btn-icon-danger {
                        background: none;
                        border: 1.5px solid #fecaca;
                        color: #f87171;
                        width: 32px;
                        height: 32px;
                        border-radius: 8px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .dm-btn-icon-danger:hover { background: #fef2f2; color: #dc2626; border-color: #f87171; }
                    .dm-btn-icon-danger:disabled { opacity: 0.4; cursor: not-allowed; }
                    .dm-check-btn {
                        background: none;
                        border: none;
                        color: #94a3b8;
                        cursor: pointer;
                        padding: 0;
                        display: flex;
                        align-items: center;
                    }
                    .dm-check-btn:hover { color: #0f172a; }

                    /* Table */
                    .dm-table-wrapper {
                        overflow-x: auto;
                        -webkit-overflow-scrolling: touch;
                        border-radius: 12px;
                        border: 1px solid var(--clr-border, #e2e8f0);
                    }
                    .dm-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 0.85rem;
                    }
                    .dm-table thead th {
                        background: var(--clr-bg-elevated, #f8fafc);
                        padding: 0.65rem 0.75rem;
                        text-align: left;
                        font-size: 0.72rem;
                        font-weight: 700;
                        text-transform: uppercase;
                        letter-spacing: 0.06em;
                        color: var(--clr-text-secondary, #64748b);
                        border-bottom: 1.5px solid var(--clr-border, #e2e8f0);
                        white-space: nowrap;
                    }
                    .dm-table tbody td {
                        padding: 0.6rem 0.75rem;
                        border-bottom: 1px solid var(--clr-border-light, #f1f5f9);
                        color: var(--clr-text-main, #0f172a);
                        vertical-align: middle;
                    }
                    .dm-table tbody tr:last-child td { border-bottom: none; }
                    .dm-table tbody tr:hover { background: rgba(15,23,42,0.015); }
                    .dm-row-selected { background: rgba(59,130,246,0.04) !important; }
                    .dm-cell-code {
                        font-weight: 700;
                        font-family: 'SF Mono', 'Fira Code', monospace;
                        font-size: 0.82rem;
                        white-space: nowrap;
                    }
                    .dm-cell-desc { max-width: 280px; }
                    .dm-cell-desc-text {
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                        color: var(--clr-text-secondary, #64748b);
                        font-size: 0.82rem;
                    }
                    .dm-status-dot {
                        display: inline-block;
                        width: 8px;
                        height: 8px;
                        border-radius: 50%;
                        margin-right: 6px;
                        vertical-align: middle;
                    }
                    .dm-img-count {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        background: rgba(168,85,247,0.1);
                        color: #a855f7;
                        font-weight: 700;
                        font-size: 0.75rem;
                        min-width: 26px;
                        height: 22px;
                        border-radius: 6px;
                        padding: 0 6px;
                    }

                    /* Pagination */
                    .dm-pagination {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        gap: 1rem;
                        padding: 1rem 0 0;
                    }
                    .dm-page-info {
                        font-size: 0.82rem;
                        font-weight: 600;
                        color: var(--clr-text-secondary, #64748b);
                    }

                    /* Loading / Empty */
                    .dm-loading, .dm-empty {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 0.5rem;
                        padding: 3rem 1rem;
                        color: var(--clr-text-secondary, #64748b);
                        font-size: 0.9rem;
                    }

                    /* Danger Zone */
                    .dm-danger-zone {
                        background: #fef2f2;
                        border: 2px solid #fecaca;
                        border-radius: 16px;
                        padding: 1.5rem;
                        margin-bottom: 2rem;
                    }
                    .dm-danger-header {
                        display: flex;
                        gap: 1rem;
                        align-items: flex-start;
                        margin-bottom: 1.25rem;
                        color: #dc2626;
                    }
                    .dm-danger-header h3 {
                        margin: 0;
                        font-size: 1rem;
                        font-weight: 800;
                        color: #991b1b;
                    }
                    .dm-danger-header p {
                        margin: 0.35rem 0 0;
                        font-size: 0.85rem;
                        color: #7f1d1d;
                        line-height: 1.5;
                    }

                    /* Modal */
                    .dm-modal-overlay {
                        position: fixed;
                        inset: 0;
                        background: rgba(15,23,42,0.5);
                        backdrop-filter: blur(4px);
                        z-index: 10000;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 1rem;
                    }
                    .dm-modal {
                        background: #fff;
                        border-radius: 20px;
                        max-width: 500px;
                        width: 100%;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.2);
                        overflow: hidden;
                    }
                    .dm-modal-header {
                        display: flex;
                        align-items: center;
                        gap: 0.75rem;
                        padding: 1.25rem 1.5rem;
                        border-bottom: 1px solid #f1f5f9;
                    }
                    .dm-modal-header h3 {
                        margin: 0;
                        flex: 1;
                        font-size: 1.05rem;
                        font-weight: 800;
                        color: #0f172a;
                    }
                    .dm-modal-close {
                        background: none;
                        border: none;
                        color: #94a3b8;
                        cursor: pointer;
                        padding: 4px;
                        border-radius: 8px;
                    }
                    .dm-modal-close:hover { background: #f1f5f9; color: #0f172a; }
                    .dm-modal-body {
                        padding: 1.5rem;
                    }
                    .dm-modal-body p {
                        margin: 0 0 0.75rem;
                        font-size: 0.9rem;
                        color: #334155;
                        line-height: 1.5;
                    }
                    .dm-modal-project-name {
                        background: #fef2f2;
                        border: 1.5px solid #fecaca;
                        border-radius: 12px;
                        padding: 0.75rem 1rem;
                        font-weight: 800;
                        font-size: 1rem;
                        color: #991b1b;
                        text-align: center;
                        margin-bottom: 1rem;
                    }
                    .dm-modal-list {
                        margin: 0 0 1rem;
                        padding-left: 1.25rem;
                        font-size: 0.85rem;
                        color: #64748b;
                        line-height: 1.8;
                    }
                    .dm-modal-warning {
                        color: #dc2626 !important;
                        font-weight: 600;
                    }
                    .dm-confirm-input {
                        width: 100%;
                        padding: 0.7rem 1rem;
                        border: 2px solid #fecaca;
                        border-radius: 12px;
                        font-size: 0.95rem;
                        color: #0f172a;
                        transition: border-color 0.2s;
                    }
                    .dm-confirm-input:focus {
                        outline: none;
                        border-color: #dc2626;
                        box-shadow: 0 0 0 3px rgba(220,38,38,0.1);
                    }
                    .dm-modal-footer {
                        display: flex;
                        justify-content: flex-end;
                        gap: 0.75rem;
                        padding: 1rem 1.5rem;
                        border-top: 1px solid #f1f5f9;
                        background: #fafafa;
                    }

                    .spinner {
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}</style>
            </main>
        </div>
    );
}
