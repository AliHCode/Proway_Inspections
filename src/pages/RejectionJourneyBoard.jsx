import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    GitBranch, ChevronRight, AlertCircle, User,
    Calendar, Hash, ArrowRight, Clock, CheckCircle2,
    RefreshCw, XCircle, FileText, MapPin, FileDown, Table, Search
} from 'lucide-react';
import Header from '../components/Header';
import DateNavigator from '../components/DateNavigator';
import { useRFI } from '../context/RFIContext';
import { useProject } from '../context/ProjectContext';
import { RFI_STATUS } from '../utils/constants';
import { getToday, formatDateDisplay } from '../utils/rfiLogic';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

/* ─── Helpers ─── */

function statusLabel(s) {
    if (s === RFI_STATUS.REJECTED) return 'Rejected';
    if (s === RFI_STATUS.APPROVED) return 'Approved';
    if (s === RFI_STATUS.PENDING)  return 'Under Review';
    return s;
}

function statusColor(s) {
    if (s === RFI_STATUS.REJECTED) return '#ef4444';
    if (s === RFI_STATUS.APPROVED) return '#10b981';
    if (s === RFI_STATUS.PENDING)  return '#f59e0b';
    return '#94a3b8';
}

function statusIcon(s) {
    if (s === RFI_STATUS.REJECTED) return <XCircle size={14} />;
    if (s === RFI_STATUS.APPROVED) return <CheckCircle2 size={14} />;
    if (s === RFI_STATUS.PENDING)  return <Clock size={14} />;
    return <FileText size={14} />;
}

/* ─── Timeline Step ─── */

function TimelineStep({ label, date, actor, color, isLast, active }) {
    return (
        <div className={`rj-step ${active ? 'active' : ''}`}>
            <div className="rj-step-node" style={{ borderColor: color, background: active ? color : 'var(--clr-bg-elevated)' }}>
                <div className="rj-step-dot" style={{ background: color }} />
            </div>
            {!isLast && <div className="rj-step-line" style={{ background: `linear-gradient(to bottom, ${color}, var(--clr-border))` }} />}
            <div className="rj-step-content">
                <span className="rj-step-label" style={{ color }}>{label}</span>
                {date && <span className="rj-step-date">{formatDateDisplay(date)}</span>}
                {actor && <span className="rj-step-actor"><User size={10} /> {actor}</span>}
            </div>
        </div>
    );
}

/* ─── Journey Card ─── */

function JourneyCard({ chain, resolveName }) {
    const [expanded, setExpanded] = useState(false);
    const navigate = useNavigate();
    const root = chain.chainItems[0];
    const latest = chain.chainItems[chain.chainItems.length - 1];
    const firstInvalid = chain.chainItems.find(r => r.status === RFI_STATUS.REJECTED);
    const hasRevision = chain.chainItems.length > 1 && chain.chainItems.some(r => r.parentId);
    const revisionCount = chain.chainItems.filter(r => r.parentId).length;

    /* Build simple timeline steps */
    const steps = [];

    // 1) Created
    steps.push({
        label: 'Created',
        date: root.filedDate,
        actor: null,
        color: '#6366f1'
    });

    // 2) Each rejection
    chain.chainItems.filter(r => r.status === RFI_STATUS.REJECTED).forEach((rej, idx) => {
        steps.push({
            label: 'Rejected',
            date: rej.reviewedAt ? rej.reviewedAt.split('T')[0] : rej.filedDate,
            actor: resolveName(rej.reviewedBy),
            color: '#ef4444'
        });

        // Check if a revision was filed after this rejection
        const rev = chain.chainItems.find(r => r.parentId === rej.id);
        if (rev) {
            steps.push({
                label: `Revision R${idx + 1}`,
                date: rev.filedDate,
                actor: null,
                color: '#3b82f6'
            });
        }
    });

    // 3) Current status of the latest RFI (if not already covered)
    if (latest.status !== RFI_STATUS.REJECTED || !steps.find(s => s.label === 'Rejected' && s.date === (latest.reviewedAt?.split('T')[0] || latest.filedDate))) {
        if (latest.status === RFI_STATUS.APPROVED) {
            steps.push({ label: 'Approved', date: latest.reviewedAt?.split('T')[0], actor: resolveName(latest.reviewedBy), color: '#10b981' });
        } else if (latest.status === RFI_STATUS.PENDING) {
            steps.push({ label: 'Under Review', date: null, actor: null, color: '#f59e0b' });
        }
    }

    // If rejected and NO revision filed → show "Awaiting Revision"
    if (latest.status === RFI_STATUS.REJECTED && !chain.chainItems.some(r => r.parentId === latest.id)) {
        steps.push({ label: 'Awaiting Revision', date: null, actor: 'Contractor', color: '#f59e0b' });
    }

    const clr = statusColor(latest.status);

    return (
        <div className="rj-card">
            {/* Top Row */}
            <div className="rj-card-top">
                <div className="rj-badge">
                    <Hash size={13} />
                    <span>{root.customFields?.rfi_no || `RFI ${root.serialNo}`}</span>
                </div>
                <div className="rj-pill" style={{ color: clr, background: `${clr}12`, borderColor: `${clr}30` }}>
                    {statusIcon(latest.status)}
                    <span>{latest.status === RFI_STATUS.REJECTED
                        ? (chain.chainItems.some(r => r.parentId === latest.id) ? `R${revisionCount} Filed` : 'Awaiting Revision')
                        : statusLabel(latest.status)
                    }</span>
                </div>
            </div>

            {/* Description */}
            <p className="rj-desc">{root.description}</p>

            {/* Quick Info */}
            <div className="rj-info-row">
                <div className="rj-info"><Calendar size={12} /> Rejected: {firstInvalid ? formatDateDisplay(firstInvalid.reviewedAt?.split('T')[0] || firstInvalid.filedDate) : '—'}</div>
                <div className="rj-info"><MapPin size={12} /> {root.location || 'N/A'}</div>
            </div>

            {/* Mini Progress Bar */}
            <div className="rj-progress-track">
                {steps.map((s, i) => (
                    <div key={i} className="rj-progress-dot" title={s.label} style={{ background: s.color }}>
                        <span className="rj-progress-tip">{s.label}</span>
                    </div>
                ))}
                <div className="rj-progress-line" />
            </div>

            {/* Expanded Timeline */}
            {expanded && (
                <div className="rj-timeline" onClick={e => e.stopPropagation()}>
                    {steps.map((s, i) => (
                        <TimelineStep key={i} {...s} isLast={i === steps.length - 1} active={i === steps.length - 1} />
                    ))}
                    <button className="rj-view-btn" onClick={() => navigate(`/consultant/review?rfi=${latest.id}&source=rejection-journey`)}>
                        View Full Details <ArrowRight size={14} />
                    </button>
                </div>
            )}

            {/* Expand Hint */}
            <div className={`rj-expand-hint ${expanded ? 'expanded' : ''}`} onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
                <ChevronRight size={14} className={expanded ? 'rotated' : ''} />
                <span>{expanded ? 'Collapse' : 'View Journey'}</span>
            </div>
        </div>
    );
}

/* ─── Main Component ─── */

export default function RejectionJourneyBoard() {
    const { rfis, consultants } = useRFI();
    const { activeProject, orderedTableColumns, columnWidthMap } = useProject();
    const [currentDate, setCurrentDate] = useState(getToday());
    const [searchQuery, setSearchQuery] = useState('');
    const [showAll, setShowAll] = useState(false);
    const [activeTab, setActiveTab] = useState('active'); // 'active' or 'history'

    const resolveName = (id) => {
        if (!id) return 'Consultant';
        const found = (consultants || []).find(c => c.id === id);
        return found?.name || 'Consultant';
    };

    const journeys = useMemo(() => {
        const byId = new Map((rfis || []).map(r => [r.id, r]));

        const resolveRoot = (rfi) => {
            let cur = rfi, depth = 0;
            while (cur?.parentId && byId.has(cur.parentId) && depth < 30) { cur = byId.get(cur.parentId); depth++; }
            return cur?.id || rfi.id;
        };

        const grouped = new Map();
        (rfis || []).forEach(rfi => {
            const rootId = resolveRoot(rfi);
            if (!grouped.has(rootId)) grouped.set(rootId, []);
            grouped.get(rootId).push(rfi);
        });

        const chains = [];
        grouped.forEach(items => {
            if (!items.some(r => r.status === RFI_STATUS.REJECTED)) return;
            const ordered = [...items].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
            const latest = ordered[ordered.length - 1];
            const firstInvalid = ordered.find(r => r.status === RFI_STATUS.REJECTED);
            const rejDate = firstInvalid ? (firstInvalid.reviewedAt?.split('T')[0] || firstInvalid.filedDate) : latest.filedDate;
            chains.push({
                id: ordered[0].id,
                chainItems: ordered,
                rejectedDate: rejDate,
                lastActivityAt: latest.createdAt || latest.filedDate
            });
        });

        chains.sort((a, b) => (b.lastActivityAt || '').localeCompare(a.lastActivityAt || ''));
        return {
            active: chains.filter(c => c.chainItems[c.chainItems.length - 1].status !== RFI_STATUS.APPROVED),
            history: chains.filter(c => c.chainItems[c.chainItems.length - 1].status === RFI_STATUS.APPROVED)
        };
    }, [rfis]);

    const currentJourneys = activeTab === 'active' ? journeys.active : journeys.history;

    // Filter by selected date + search
    const filteredJourneys = useMemo(() => {
        let result = showAll ? currentJourneys : currentJourneys.filter(j => j.rejectedDate === currentDate);
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            result = result.filter(j => {
                const root = j.chainItems[0];
                return (
                    String(root.serialNo).toLowerCase().includes(q) ||
                    (root.description || '').toLowerCase().includes(q)
                );
            });
        }
        return result;
    }, [currentJourneys, currentDate, showAll, searchQuery]);

    // For export: flatten the rejected RFIs for the visible list
    const exportRfis = useMemo(() => {
        return filteredJourneys.flatMap(j => j.chainItems.filter(r => r.status === RFI_STATUS.REJECTED));
    }, [filteredJourneys]);

    return (
        <div className="page-wrapper">
            <Header />
            <main className="rj-workspace">
                {/* Header */}
                <div className="sheet-header rj-page-header">
                    <div className="sheet-tabs-container">
                        <div 
                            className={`sheet-tab ${activeTab === 'active' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('active'); setShowAll(false); setSearchQuery(''); }}
                        >
                            <h2>Active Journeys</h2>
                            <span className="tab-count">{journeys.active.length}</span>
                        </div>
                        <div 
                            className={`sheet-tab ${activeTab === 'history' ? 'active' : ''}`}
                            onClick={() => { setActiveTab('history'); setShowAll(false); setSearchQuery(''); }}
                        >
                            <h2>History</h2>
                            <span className="tab-count" style={{ background: '#f1f5f9', color: '#64748b' }}>{journeys.history.length}</span>
                        </div>
                    </div>
                    <div className="rj-controls">
                        <div className="rj-search-wrap">
                            <Search size={15} className="rj-search-icon" />
                            <input
                                type="text"
                                className="rj-search-input"
                                placeholder="Search RFI # or description..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        {exportRfis.length > 0 && (
                            <div className="rj-export-btns">
                                <button
                                    className="btn btn-sm"
                                    style={{ backgroundColor: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', padding: '0.4rem 0.75rem' }}
                                    onClick={() => exportToPDF(exportRfis, `Rejected_RFIs_${showAll ? 'All' : currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template)}
                                    title="Export to PDF"
                                >
                                    <FileDown size={17} /> PDF
                                </button>
                                <button
                                    className="btn btn-sm"
                                    style={{ backgroundColor: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', padding: '0.4rem 0.75rem' }}
                                    onClick={() => exportToExcel(exportRfis, `Rejected_RFIs_${showAll ? 'All' : currentDate}`, orderedTableColumns, columnWidthMap, activeProject?.export_template)}
                                    title="Export to Excel"
                                >
                                    <Table size={17} /> Excel
                                </button>
                            </div>
                        )}
                        <button
                            className={`btn btn-sm rj-all-btn ${showAll ? 'active' : ''}`}
                            onClick={() => setShowAll(prev => !prev)}
                            title={showAll ? 'Show date-filtered' : 'Show all rejected RFIs'}
                        >
                            All RFI
                        </button>
                        {!showAll && <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} showArrows={true} />}
                    </div>
                </div>
                <p className="rj-subtitle">{filteredJourneys.length} of {currentJourneys.length} journeys{showAll ? '' : ` on this date`}</p>

                {/* Cards List */}
                <div className="rj-list">
                    {filteredJourneys.map(chain => (
                        <JourneyCard key={chain.id} chain={chain} resolveName={resolveName} />
                    ))}
                </div>

                {filteredJourneys.length === 0 && (
                    <div className="rj-empty">
                        <GitBranch size={48} />
                        <h3>No Journeys for {formatDateDisplay(currentDate)}</h3>
                        <p>No RFIs were marked rejected on this date. Try navigating to another date.</p>
                    </div>
                )}
            </main>

            <style>{`
                .rj-workspace {
                    padding: 1.5rem 2rem;
                    background: var(--clr-bg);
                    min-height: calc(100vh - 80px);
                }
                .rj-page-header {
                    margin-bottom: 0.5rem;
                }
                .rj-controls {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    flex-wrap: wrap;
                }
                .rj-search-wrap {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                .rj-search-icon {
                    position: absolute;
                    left: 0.6rem;
                    color: var(--clr-text-muted);
                    pointer-events: none;
                }
                .rj-search-input {
                    padding: 0.4rem 0.75rem 0.4rem 2rem;
                    border: 1px solid var(--clr-border);
                    border-radius: 0.6rem;
                    font-size: 0.8rem;
                    font-weight: 500;
                    color: var(--clr-text-main);
                    background: var(--clr-bg-elevated);
                    width: 200px;
                    outline: none;
                    transition: border-color 0.2s;
                }
                .rj-search-input:focus {
                    border-color: var(--clr-brand-primary);
                }
                .rj-search-input::placeholder {
                    color: var(--clr-text-muted);
                }
                .rj-all-btn {
                    background: var(--clr-bg-elevated);
                    color: var(--clr-text-main);
                    border: 1px solid var(--clr-border);
                    border-radius: 0.6rem;
                    font-weight: 600;
                    font-size: 0.85rem;
                    padding: 0.4rem 0.75rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    line-height: 1.5;
                }
                .rj-all-btn.active {
                    background: var(--clr-brand-primary);
                    color: #fff;
                    border-color: var(--clr-brand-primary);
                }
                .rj-export-btns {
                    display: flex;
                    gap: 0.5rem;
                }
                .rj-subtitle {
                    font-size: 0.85rem;
                    color: var(--clr-text-secondary);
                    margin: 0 0 1.5rem;
                    font-weight: 500;
                }

                /* Card List */
                .rj-list {
                    columns: 4;
                    column-gap: 1rem;
                    display: block;
                }
                @media (max-width: 1200px) { .rj-list { columns: 3; } }
                @media (max-width: 900px) { .rj-list { columns: 2; } }
                @media (max-width: 600px) { .rj-list { columns: 1; } }

                /* Card */
                .rj-card {
                    background: var(--clr-bg-elevated);
                    border: 1px solid var(--clr-border);
                    border-radius: 16px;
                    padding: 1.25rem 1.5rem;
                    transition: all 0.2s ease;
                    position: relative;
                    break-inside: avoid;
                    margin-bottom: 1rem;
                    display: inline-block;
                    width: 100%;
                    color: var(--clr-text-main);
                }
                .rj-card:hover {
                    border-color: var(--clr-brand-primary);
                    box-shadow: var(--shadow-md);
                }

                .rj-card-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.75rem;
                }
                .rj-badge {
                    display: flex;
                    align-items: center;
                    gap: 0.3rem;
                    font-weight: 800;
                    font-size: 0.9rem;
                    color: var(--clr-text-main);
                }
                .rj-pill {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    font-size: 0.7rem;
                    font-weight: 700;
                    padding: 0.25rem 0.6rem;
                    border-radius: 8px;
                    border: 1px solid;
                    text-transform: capitalize;
                }

                .rj-desc {
                    font-size: 0.85rem;
                    color: var(--clr-text-secondary);
                    margin: 0 0 0.75rem;
                    line-height: 1.5;
                    font-weight: 500;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .rj-info-row {
                    display: flex;
                    gap: 1.5rem;
                    margin-bottom: 1rem;
                    flex-wrap: wrap;
                }
                .rj-info {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    font-size: 0.75rem;
                    font-weight: 600;
                    color: var(--clr-text-muted);
                }

                /* Mini Progress */
                .rj-progress-track {
                    position: relative;
                    display: flex;
                    align-items: center;
                    gap: 0;
                    justify-content: space-between;
                    padding: 0.5rem 0;
                    margin-bottom: 0.25rem;
                }
                .rj-progress-line {
                    position: absolute;
                    top: 50%;
                    left: 6px;
                    right: 6px;
                    height: 2px;
                    background: var(--clr-border);
                    z-index: 0;
                    transform: translateY(-50%);
                }
                .rj-progress-dot {
                    position: relative;
                    z-index: 1;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    border: 2px solid var(--clr-bg-elevated);
                    box-shadow: 0 0 0 1px rgba(0,0,0,0.08);
                    transition: transform 0.2s ease;
                    cursor: default;
                }
                .rj-progress-dot:hover {
                    transform: scale(1.4);
                }
                .rj-progress-dot:hover .rj-progress-tip {
                    opacity: 1;
                    transform: translateX(-50%) translateY(-4px);
                }
                .rj-progress-tip {
                    position: absolute;
                    bottom: calc(100% + 4px);
                    left: 50%;
                    transform: translateX(-50%) translateY(2px);
                    background: var(--clr-text-main);
                    color: var(--clr-bg);
                    font-size: 0.6rem;
                    font-weight: 700;
                    padding: 0.2rem 0.45rem;
                    border-radius: 4px;
                    white-space: nowrap;
                    opacity: 0;
                    pointer-events: none;
                    transition: all 0.15s ease;
                }

                /* Expand Hint */
                .rj-expand-hint {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    color: var(--clr-brand-primary);
                    font-size: 0.8rem;
                    font-weight: 700;
                    margin-top: 1rem;
                    cursor: pointer;
                    width: fit-content;
                    padding: 0.3rem 0.6rem;
                    border-radius: 8px;
                    background: var(--clr-bg-hover);
                    transition: all 0.2s;
                }
                .rj-expand-hint:hover {
                    background: var(--clr-border);
                }
                .rj-expand-hint.expanded {
                    color: var(--clr-text-secondary);
                    background: var(--clr-bg-hover);
                }
                .rj-expand-hint.expanded:hover {
                    background: var(--clr-border);
                }
                .rj-expand-hint svg { transition: transform 0.2s; }
                .rj-expand-hint svg.rotated { transform: rotate(90deg); }

                /* Expanded Timeline */
                .rj-timeline {
                    margin-top: 1.25rem;
                    padding-top: 1.25rem;
                    border-top: 1px dashed var(--clr-border);
                    animation: rjSlide 0.25s ease-out;
                }
                @keyframes rjSlide {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .rj-step {
                    display: flex;
                    gap: 0.75rem;
                    position: relative;
                    padding-bottom: 1.5rem;
                }
                .rj-step:last-of-type { padding-bottom: 0.5rem; }

                .rj-step-node {
                    position: relative;
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    border: 2px solid;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 1;
                    transition: all 0.2s;
                }
                .rj-step.active .rj-step-node {
                    box-shadow: 0 0 0 4px var(--clr-bg-hover);
                }
                .rj-step-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                }
                .rj-step-line {
                    position: absolute;
                    left: 9px;
                    top: 22px;
                    bottom: 0;
                    width: 2px;
                }
                .rj-step-content {
                    display: flex;
                    flex-direction: column;
                    gap: 0.15rem;
                    padding-top: 1px;
                }
                .rj-step-label {
                    font-size: 0.8rem;
                    font-weight: 700;
                }
                .rj-step-date {
                    font-size: 0.7rem;
                    color: var(--clr-text-secondary);
                    font-weight: 600;
                }
                .rj-step-actor {
                    display: flex;
                    align-items: center;
                    gap: 0.25rem;
                    font-size: 0.65rem;
                    color: var(--clr-text-muted);
                    font-weight: 600;
                }

                .rj-view-btn {
                    display: flex;
                    align-items: center;
                    gap: 0.35rem;
                    margin-top: 1rem;
                    margin-left: 2rem;
                    background: none;
                    border: none;
                    color: var(--clr-brand-primary);
                    font-size: 0.8rem;
                    font-weight: 700;
                    cursor: pointer;
                    padding: 0.4rem 0;
                    transition: gap 0.2s;
                }
                .rj-view-btn:hover { gap: 0.6rem; }

                /* Empty State */
                .rj-empty {
                    text-align: center;
                    padding: 6rem 2rem;
                    color: var(--clr-text-muted);
                }
                .rj-empty h3 { color: var(--clr-text-main); margin: 1rem 0 0.25rem; }
                .rj-empty p { font-size: 0.85rem; }

                /* Responsive */
                @media (max-width: 768px) {
                    .rj-workspace { padding: 1rem; }
                    .rj-card { padding: 1rem; }
                    .rj-card, .btn, .rj-all-btn {
                        -webkit-tap-highlight-color: transparent;
                        outline: none !important;
                    }
                    .rj-search-input { width: 100%; }
                    .rj-search-wrap { width: 100%; }
                    .rj-info-row { flex-direction: column; gap: 0.5rem; }
                }
            `}</style>
        </div>
    );
}
