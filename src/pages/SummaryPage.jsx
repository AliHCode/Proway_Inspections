import { useState, useMemo } from 'react';
import { useRFI } from '../context/RFIContext';
import { useProject } from '../context/ProjectContext';
import { getToday, formatDateDisplay } from '../utils/rfiLogic';
import { exportToExcel, exportToPDF, generateDailyReport } from '../utils/exportUtils';
import Header from '../components/Header';
import StatusBadge from '../components/StatusBadge';
import {
    ChevronLeft, ChevronRight, FileText, Table,
    CheckCircle, XCircle, Clock, AlertTriangle, BarChart2, Ban
} from 'lucide-react';

// ─── Date Utilities ────────────────────────────────────────────────────────────

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function daysInMonth(yr, mo) { return new Date(yr, mo + 1, 0).getDate(); }
function firstDayOfMonth(yr, mo) { return new Date(yr, mo, 1).getDay(); }
function pad(n) { return String(n).padStart(2, '0'); }
function buildKey(yr, mo, day) { return `${yr}-${pad(mo + 1)}-${pad(day)}`; }

function shiftMonth(yr, mo, delta) {
    let m = mo + delta, y = yr;
    while (m > 11) { m -= 12; y++; }
    while (m < 0) { m += 12; y--; }
    return [y, m];
}

function dayOffset(base, delta) {
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
}

// ─── Single Month Panel ────────────────────────────────────────────────────────

function MonthPanel({ yr, mo, fromDate, toDate, hoverDate, pickStep, onDay, onHover }) {
    const today = getToday();
    const fd = firstDayOfMonth(yr, mo);
    const total = daysInMonth(yr, mo);

    const cells = [];
    for (let i = 0; i < fd; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    function getCls(day) {
        if (!day) return 'cal-day cal-day--blank';
        const k = buildKey(yr, mo, day);
        const cls = ['cal-day'];

        if (k === today) cls.push('cal-day--today');

        const effEnd = (pickStep === 'to' && hoverDate && hoverDate > fromDate)
            ? hoverDate
            : toDate;

        if (!fromDate) return cls.join(' ');

        if (k === fromDate && (!effEnd || k === effEnd)) {
            cls.push('cal-day--single');
        } else if (k === fromDate) {
            cls.push('cal-day--range-start');
        } else if (effEnd && k === effEnd) {
            cls.push(effEnd === toDate ? 'cal-day--range-end' : 'cal-day--range-hover-end');
        } else if (effEnd && k > fromDate && k < effEnd) {
            cls.push('cal-day--in-range');
            if (effEnd !== toDate) cls.push('cal-day--hover-range');
        }

        return cls.join(' ');
    }

    return (
        <div className="summ-cal-month">
            <div className="summ-cal-mname">{MONTH_NAMES[mo]} {yr}</div>
            <div className="summ-cal-grid">
                {DAY_SHORT.map(d => (
                    <div key={d} className="summ-cal-wd">{d}</div>
                ))}
                {cells.map((day, i) => (
                    <div
                        key={i}
                        className={getCls(day)}
                        onClick={() => day && onDay(buildKey(yr, mo, day))}
                        onMouseEnter={() => day && onHover(buildKey(yr, mo, day))}
                        onMouseLeave={() => onHover(null)}
                        role={day ? 'button' : undefined}
                        tabIndex={day ? 0 : -1}
                        aria-label={day ? `${MONTH_NAMES[mo]} ${day} ${yr}` : undefined}
                    >
                        <span className="cal-day-num">{day || ''}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Date Range Picker ─────────────────────────────────────────────────────────

function DateRangePicker({ fromDate, toDate, onChange }) {
    const today = getToday();
    const [ty, tm] = today.split('-').map(Number);
    const [view, setView] = useState([ty, tm - 1]);
    const [pickStep, setPickStep] = useState('from');
    const [hoverDate, setHoverDate] = useState(null);

    const [nxtY, nxtM] = shiftMonth(view[0], view[1], 1);

    function handleDay(dateStr) {
        if (pickStep === 'from' || dateStr < fromDate) {
            onChange(dateStr, dateStr);
            setPickStep('to');
        } else if (dateStr === fromDate) {
            onChange(dateStr, dateStr);
            setPickStep('from');
        } else {
            onChange(fromDate, dateStr);
            setPickStep('from');
        }
    }

    // Inline preset computation
    const [pm1y, pm1m] = shiftMonth(ty, tm - 1, -1);
    const presets = [
        { label: 'Today',        from: today,               to: today },
        { label: 'Yesterday',    from: dayOffset(today, -1), to: dayOffset(today, -1) },
        { label: 'Last 7 Days',  from: dayOffset(today, -6), to: today },
        { label: 'Last 30 Days', from: dayOffset(today,-29), to: today },
        {
            label: 'This Week',
            from: (() => {
                const d = new Date(today + 'T00:00:00');
                d.setDate(d.getDate() - d.getDay());
                return d.toISOString().slice(0, 10);
            })(),
            to: today,
        },
        { label: 'This Month',  from: `${today.slice(0, 7)}-01`, to: today },
        {
            label: 'Last Month',
            from: buildKey(pm1y, pm1m, 1),
            to: buildKey(pm1y, pm1m, daysInMonth(pm1y, pm1m)),
        },
    ];

    const hint = pickStep === 'from'
        ? 'Select start date'
        : `From ${formatDateDisplay(fromDate)} · now select end date`;

    return (
        <div className="summ-picker-card">
            {/* Quick Presets */}
            <div className="summ-presets">
                {presets.map(p => (
                    <button
                        key={p.label}
                        className={`summ-preset${fromDate === p.from && toDate === p.to ? ' active' : ''}`}
                        onClick={() => { onChange(p.from, p.to); setPickStep('from'); }}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {/* Step hint */}
            <div className="summ-pick-hint">
                <span className={`summ-hint-dot ${pickStep === 'from' ? 'step1' : 'step2'}`} />
                {hint}
            </div>

            {/* Two-month calendar */}
            <div className="summ-cal-wrap">
                <button
                    className="summ-cal-nav"
                    onClick={() => setView(v => shiftMonth(v[0], v[1], -1))}
                    aria-label="Previous month"
                >
                    <ChevronLeft size={18} />
                </button>

                <MonthPanel
                    yr={view[0]} mo={view[1]}
                    fromDate={fromDate} toDate={toDate}
                    hoverDate={hoverDate} pickStep={pickStep}
                    onDay={handleDay} onHover={setHoverDate}
                />

                <div className="summ-cal-divider" />

                <MonthPanel
                    yr={nxtY} mo={nxtM}
                    fromDate={fromDate} toDate={toDate}
                    hoverDate={hoverDate} pickStep={pickStep}
                    onDay={handleDay} onHover={setHoverDate}
                />

                <button
                    className="summ-cal-nav"
                    onClick={() => setView(v => shiftMonth(v[0], v[1], 1))}
                    aria-label="Next month"
                >
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
    );
}

// ─── Cell value renderer ───────────────────────────────────────────────────────

function renderCell(rfi, fieldKey, index) {
    switch (fieldKey) {
        case 'serial':          return index + 1;
        case 'description':     
        case 'location':        
        case 'inspection_type': 
            return rfi[fieldKey] || rfi.inspectionType || rfi.customFields?.[fieldKey] || '—';
        case 'status':          return <StatusBadge status={rfi.status} />;
        case 'remarks':         return rfi.remarks || rfi.customFields?.remarks || '—';
        case 'attachments':     return (rfi.images?.length || rfi.customFields?.attachments?.length) ? `${rfi.images?.length || rfi.customFields?.attachments?.length} file(s)` : '—';
        case 'filed_date':      return formatDateDisplay(rfi.originalFiledDate || rfi.filedDate);
        case 'review_date':     return rfi.reviewedAt
            ? formatDateDisplay(rfi.reviewedAt.split('T')[0])
            : <span style={{ color: 'var(--clr-text-muted)' }}>Pending</span>;
        default:                return rfi.customFields?.[fieldKey] ?? '—';
    }
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SummaryPage() {
    const { rfis, loadingRfis } = useRFI();
    const { activeProject, orderedTableColumns, columnWidthMap, getTableColumnStyle } = useProject();
    const today = getToday();
    const projectName = activeProject?.name || 'ProWay Project';

    const [fromDate, setFromDate] = useState(today);
    const [toDate, setToDate] = useState(today);
    const [statusFilter, setStatusFilter] = useState('all');
    const [exporting, setExporting] = useState(false);

    function handleChange(from, to) {
        setFromDate(from);
        setToDate(to);
    }

    const dateFiltered = useMemo(() => {
        // Pre-compute a Set of superseded parent IDs for O(1) lookup
        const supersededIds = new Set(rfis.map(child => child.parentId).filter(Boolean));

        return rfis.filter(r => {
            // Filter out superseded RFIs
            const isSuperseded = supersededIds.has(r.id);
            if (isSuperseded) return false;

            const fDate = r.filedDate;
            const rDate = r.reviewedAt ? r.reviewedAt.split('T')[0] : null;
            
            const filedInRange = fDate >= fromDate && fDate <= toDate;
            const reviewedInRange = rDate && (rDate >= fromDate && rDate <= toDate);
            
            return filedInRange || reviewedInRange;
        }).sort((a, b) => {
            // Sort by the most relevant date for the period (reviewedAt if it matches, else filedDate)
            const aDate = (a.reviewedAt && a.reviewedAt.split('T')[0] >= fromDate) ? a.reviewedAt.split('T')[0] : a.filedDate;
            const bDate = (b.reviewedAt && b.reviewedAt.split('T')[0] >= fromDate) ? b.reviewedAt.split('T')[0] : b.filedDate;
            return bDate.localeCompare(aDate) || (b.serialNo - a.serialNo);
        });
    }, [rfis, fromDate, toDate]);

    const filtered = useMemo(() =>
        dateFiltered.filter(r => {
            if (statusFilter === 'all') return true;
            if (statusFilter === 'approved') return r.status === 'approved' || r.status === 'conditional_approve';
            return r.status === statusFilter;
        }),
        [dateFiltered, statusFilter]
    );

    const stats = useMemo(() => ({
        total:    dateFiltered.length,
        approved: dateFiltered.filter(r => r.status === 'approved' || r.status === 'conditional_approve').length,
        rejected: dateFiltered.filter(r => r.status === 'rejected').length,
        pending:  dateFiltered.filter(r => r.status === 'pending').length,
        info:     dateFiltered.filter(r => r.status === 'info_requested').length,
        cancelled: dateFiltered.filter(r => r.status === 'cancelled').length,
    }), [dateFiltered]);

    const defaultCols = [
        { field_key: 'serial',          field_name: '#' },
        { field_key: 'rfi_no',          field_name: 'RFI #' },
        { field_key: 'description',     field_name: 'Description' },
        { field_key: 'location',        field_name: 'Location' },
        { field_key: 'inspection_type', field_name: 'Type' },
        { field_key: 'status',          field_name: 'Status' },
        { field_key: 'filed_date',      field_name: 'Filed Date' },
    ];

    const cols = useMemo(() =>
        (orderedTableColumns.length ? orderedTableColumns : defaultCols)
            .filter(c => c.field_key !== 'actions'),
        [orderedTableColumns]
    );

    const isSingleDay = fromDate === toDate;
    const rangeLabel = isSingleDay
        ? formatDateDisplay(fromDate)
        : `${formatDateDisplay(fromDate)}  →  ${formatDateDisplay(toDate)}`;
    const exportName = isSingleDay
        ? `ProWay_Summary_${fromDate}`
        : `ProWay_Summary_${fromDate}_to_${toDate}`;

    async function handlePDF() {
        if (!filtered.length) return;
        setExporting(true);
        try {
            if (isSingleDay) {
                await generateDailyReport(filtered, fromDate, projectName, orderedTableColumns, columnWidthMap, activeProject?.export_template);
            } else {
                await exportToPDF(filtered, exportName, orderedTableColumns, columnWidthMap, activeProject?.export_template);
            }
        } finally {
            setExporting(false);
        }
    }

    function handleExcel() {
        if (!filtered.length) return;
        exportToExcel(filtered, exportName, orderedTableColumns, columnWidthMap, activeProject?.export_template);
    }

    return (
        <div className="page-wrapper">
            <Header />
            <main className="dashboard-page">

                <div className="dashboard-header">
                    <div>
                        <h1>RFI Summary</h1>
                        <p className="subtitle">{projectName} — Date Range Report</p>
                    </div>
                </div>

                {/* Date range picker */}
                <DateRangePicker
                    fromDate={fromDate}
                    toDate={toDate}
                    onChange={handleChange}
                />

                {/* Period info + stats + export */}
                <div className="summ-period-bar">
                    <div className="summ-period-info">
                        <span className="summ-period-range">{rangeLabel}</span>
                        <span className="summ-period-count">
                            {stats.total} RFI{stats.total !== 1 ? 's' : ''}
                        </span>
                    </div>

                    <div className="summ-stat-pills" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button 
                            className={`summ-pill approved ${statusFilter === 'approved' ? 'active-pill' : ''}`}
                            onClick={() => setStatusFilter(prev => prev === 'approved' ? 'all' : 'approved')}
                            style={{ cursor: 'pointer', border: 'none', transition: 'transform 0.1s' }}
                        >
                            <CheckCircle size={13} /> {stats.approved} Approved
                        </button>
                        <button 
                            className={`summ-pill rejected ${statusFilter === 'rejected' ? 'active-pill' : ''}`}
                            onClick={() => setStatusFilter(prev => prev === 'rejected' ? 'all' : 'rejected')}
                            style={{ cursor: 'pointer', border: 'none', transition: 'transform 0.1s' }}
                        >
                            <XCircle size={13} /> {stats.rejected} Rejected
                        </button>
                        <button 
                            className={`summ-pill pending ${statusFilter === 'pending' ? 'active-pill' : ''}`}
                            onClick={() => setStatusFilter(prev => prev === 'pending' ? 'all' : 'pending')}
                            style={{ cursor: 'pointer', border: 'none', transition: 'transform 0.1s' }}
                        >
                            <Clock size={13} /> {stats.pending} Pending
                        </button>
                        {stats.info > 0 && (
                            <button 
                                className={`summ-pill info ${statusFilter === 'info_requested' ? 'active-pill' : ''}`}
                                onClick={() => setStatusFilter(prev => prev === 'info_requested' ? 'all' : 'info_requested')}
                                style={{ cursor: 'pointer', border: 'none', transition: 'transform 0.11s' }}
                            >
                                <AlertTriangle size={13} /> {stats.info} Info Req.
                            </button>
                        )}
                        {stats.cancelled > 0 && (
                            <button 
                                className={`summ-pill cancelled ${statusFilter === 'cancelled' ? 'active-pill' : ''}`}
                                onClick={() => setStatusFilter(prev => prev === 'cancelled' ? 'all' : 'cancelled')}
                                style={{ 
                                    cursor: 'pointer', 
                                    border: 'none', 
                                    transition: 'transform 0.11s', 
                                    background: statusFilter === 'cancelled' ? 'var(--clr-text-main)' : 'var(--clr-bg-hover)', 
                                    color: statusFilter === 'cancelled' ? 'var(--clr-bg)' : 'var(--clr-text-main)' 
                                }}
                            >
                                <Ban size={13} /> {stats.cancelled} Cancelled
                            </button>
                        )}
                    </div>

                    <div className="summ-export-group">
                        <button
                            className="btn btn-secondary"
                            onClick={handleExcel}
                            disabled={!filtered.length || exporting}
                        >
                            <Table size={16} /> Excel
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handlePDF}
                            disabled={!filtered.length || exporting}
                        >
                            <FileText size={16} /> {exporting ? 'Exporting…' : 'PDF'}
                        </button>
                    </div>
                </div>

                {/* RFI data table */}
                <div className="summ-table-card">
                    {loadingRfis ? (
                        <div className="summ-empty">
                            <p>Loading RFI data…</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="summ-empty">
                            <BarChart2 size={44} strokeWidth={1.2} />
                            <p>No RFIs found for the selected period.</p>
                            <span className="summ-empty-hint">Try selecting a different date range above.</span>
                        </div>
                    ) : (
                        <div className="summ-scroll">
                            <table className="rfi-table">
                                <thead>
                                    <tr>
                                        {cols.map(c => (
                                            <th key={c.field_key} style={getTableColumnStyle(c.field_key)}>{c.field_name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((rfi, index) => (
                                        <tr key={rfi.id}>
                                            {cols.map(c => (
                                                <td key={c.field_key} style={getTableColumnStyle(c.field_key)}>
                                                    {renderCell(rfi, c.field_key, index)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

            </main>
        </div>
    );
}
