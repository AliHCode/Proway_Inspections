import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { getToday } from '../utils/rfiLogic';
import Header from '../components/Header';
import StatsCard from '../components/StatsCard';
import StatusBadge from '../components/StatusBadge';
import RfiTrendChart from '../components/RfiTrendChart';
import RfiStatusPieChart from '../components/RfiStatusPieChart';
import ActivityTimeline from '../components/ActivityTimeline';
import {
    FileText,
    CheckCircle,
    XCircle,
    Clock,
    Plus,
    TrendingUp,
    AlertTriangle,
    FileDown,
    Table,
    ClipboardList
} from 'lucide-react';
import { exportToExcel, exportToPDF, generateDailyReport } from '../utils/exportUtils';
import { useProject } from '../context/ProjectContext';

export default function ContractorDashboard() {
    const { user } = useAuth();
    const { rfis, getStats } = useRFI();
    const { activeProject, projectFields, orderedTableColumns, columnWidthMap, getTableColumnStyle, showEscalatedBadge } = useProject();
    const activeProjectName = activeProject?.name || 'ProWay Project';
    const navigate = useNavigate();
    const today = getToday();
    const stats = getStats(today);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 17) return 'Good Afternoon';
        return 'Good Evening';
    };

    // Get all RFIs by this contractor (latest thread version only)
    const allMyRfis = useMemo(() => {
        const filtered = rfis.filter((r) => r.filedBy === user.id && !rfis.some(child => child.parentId === r.id));
        return filtered.sort((a, b) => {
            const aIsToday = a.filedDate === today || a.carryoverTo === today;
            const bIsToday = b.filedDate === today || b.carryoverTo === today;

            // Prioritize today/carryover scope for sorting
            if (aIsToday && !bIsToday) return -1;
            if (!aIsToday && bIsToday) return 1;

            // Standard descending date sort within groups
            return b.filedDate.localeCompare(a.filedDate);
        });
    }, [rfis, user.id, today]);

    // Get recent RFIs by this contractor for display
    const myRfis = allMyRfis.slice(0, 10);

    // Count rejected carryovers
    const carryoverCount = rfis.filter(
        (r) => r.status === 'rejected' && r.carryoverTo === today && r.filedBy === user.id
    ).length;

    // Action Required (Unresolved rejections assigned to me)
    const actionRequiredRfis = rfis.filter(
        (r) => r.status === 'rejected' && r.assignedTo === user.id && !rfis.some(child => child.parentId === r.id)
    );

    const reportRfis = allMyRfis.filter(r =>
        (r.status === 'approved' || r.status === 'rejected') &&
        ((r.reviewedAt && r.reviewedAt.startsWith(today)) || r.filedDate === today)
    );

    // --- Chart Data Preparation ---
    const pieData = [
        { name: 'Approved', value: stats.todayApproved, color: 'var(--clr-success)' },
        { name: 'Cond. Approved', value: stats.todayConditionallyApproved || 0, color: '#14b8a6' },
        { name: 'Pending', value: stats.todayPending, color: 'var(--clr-warning)' },
        { name: 'Rejected', value: stats.todayRejected, color: 'var(--clr-danger)' },
        { name: 'Info Req.', value: stats.todayInfoRequested || 0, color: 'var(--clr-brand-secondary)' },
        { name: 'Cancelled', value: stats.todayCancelled || 0, color: '#6b7280' },
    ];

    // Group RFIs by date for the area chart (last 7 days of activity)
    const trendMap = {};
    allMyRfis.forEach(r => {
        const d = r.filedDate;
        trendMap[d] = (trendMap[d] || 0) + 1;
    });

    // Convert to array, sort chronologically, and take last 7
    const trendData = Object.keys(trendMap)
        .sort() // simple string sort works for YYYY-MM-DD
        .map(date => ({
            date: date.substring(5), // Just MM-DD for cleaner X-axis
            value: trendMap[date]
        }))
        .slice(-7);

    const contractorVisibleColumns = orderedTableColumns.filter(c => c.field_key !== 'actions');

    function isEscalated(rfi) {
        if (rfi.status !== 'pending' && rfi.status !== 'info_requested') return false;
        const filingDate = new Date(rfi.originalFiledDate || rfi.filedDate);
        const now = new Date();
        const diffDays = (now - filingDate) / (1000 * 60 * 60 * 24);
        return diffDays >= 2;
    }

    function renderContractorCell(rfi, col, index) {
        if (col.field_key === 'serial') {
            const escalated = showEscalatedBadge && isEscalated(rfi);
            return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    #{index + 1}
                    {escalated && (
                        <span style={{
                            backgroundColor: 'var(--clr-danger-bg)', color: 'var(--clr-danger)', fontSize: '0.65rem',
                            fontWeight: 700, padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--clr-danger-border)'
                        }}>
                            ESCALATED
                        </span>
                    )}
                </div>
            );
        }
        
        if (col.field_key === 'description' || col.field_key === 'location' || col.field_key === 'inspection_type') {
            return rfi[col.field_key] || rfi.inspectionType || rfi.customFields?.[col.field_key] || '—';
        }

        if (col.field_key === 'status') return <StatusBadge status={rfi.status} />;
        if (col.field_key === 'remarks') return rfi.remarks || '—';
        if (col.field_key === 'attachments') return (rfi.images?.length || 0) > 0 ? `${rfi.images.length} file(s)` : '—';
        return rfi.customFields?.[col.field_key] || '—';
    }

    return (
        <div className="page-wrapper premium-dashboard">
            <Header />
            <main className="dashboard-page">
                <header className="premium-header">
                    <div className="welcome-monochrome-container">
                        <span className="welcome-label-mono">{getGreeting()}</span>
                        <h1 className="welcome-user-mono">{user?.name?.split(' ')[0] || 'Contractor'}</h1>
                    </div>
                    <button className="btn-command" onClick={() => navigate('/contractor/rfi-sheet')}>
                        <Plus size={18} strokeWidth={2.5} /> File RFIs
                    </button>
                </header>

                {actionRequiredRfis.length > 0 && (
                    <div style={{ marginBottom: '2rem', background: 'var(--clr-danger-bg)', border: '1px solid var(--clr-danger-border)', borderRadius: '12px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--clr-danger)' }}>
                            <AlertTriangle size={24} />
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Action Required</h2>
                        </div>
                        <p style={{ margin: 0, color: 'var(--clr-text-secondary)', fontWeight: 500, fontSize: '0.95rem' }}>
                            You have {actionRequiredRfis.length} inspection{actionRequiredRfis.length > 1 ? 's' : ''} assigned directly to you that require corrective action.
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                            {actionRequiredRfis.slice(0, 5).map(rfi => (
                                <button
                                    key={rfi.id}
                                    onClick={() => navigate(`/contractor/rfi-sheet?rfi=${rfi.id}`)}
                                    style={{
                                        background: 'var(--clr-bg-elevated)', border: '1px solid var(--clr-danger-border)', borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--clr-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--clr-danger-bg)'; e.currentTarget.style.borderColor = 'var(--clr-danger)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--clr-bg-elevated)'; e.currentTarget.style.borderColor = 'var(--clr-danger-border)'; }}
                                >
                                    RFI #{rfi.customFields?.rfi_no || rfi.serialNo} &rarr;
                                </button>
                            ))}
                            {actionRequiredRfis.length > 5 && (
                                <button
                                    onClick={() => navigate('/contractor/rfi-sheet')}
                                    style={{ background: 'transparent', border: 'none', color: 'var(--clr-danger)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                    View all {actionRequiredRfis.length}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                <div className="bento-grid">
                    {/* Stats Section */}
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<FileText size={20} />}
                            label="Total Filed"
                            value={stats.todayTotal}
                            subtitle="Today"
                            trend="up"
                            trendValue="+12%"
                            color="#3b82f6"
                        />
                    </div>
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<Clock size={20} />}
                            label="Awaiting"
                            value={stats.todayPending}
                            subtitle="Review queue"
                            trend="down"
                            trendValue="-5%"
                            color="#f59e0b"
                        />
                    </div>
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<CheckCircle size={20} />}
                            label="Approved"
                            value={stats.todayApproved}
                            subtitle="Daily Verified"
                            trend="up"
                            trendValue="+8%"
                            color="#10b981"
                        />
                    </div>
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<CheckCircle size={20} />}
                            label="Cond. App"
                            value={stats.todayConditionallyApproved || 0}
                            subtitle="With Comments"
                            trend="up"
                            trendValue="Daily"
                            color="#14b8a6"
                        />
                    </div>
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<XCircle size={20} />}
                            label="Rejected"
                            value={stats.todayRejected}
                            subtitle="Action required"
                            trend="up"
                            trendValue="+2%"
                            color="#ef4444"
                        />
                    </div>
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<AlertTriangle size={20} />}
                            label="Cancelled"
                            value={stats.todayCancelled || 0}
                            subtitle="Voided"
                            trend="down"
                            trendValue="Daily"
                            color="#6b7280"
                        />
                    </div>

                    {/* Chart Section */}
                    <div className="bento-span-8 bento-row-2">
                        <RfiTrendChart data={trendData} />
                    </div>
                    <div className="bento-span-4 bento-row-2">
                        <RfiStatusPieChart data={pieData} />
                    </div>

                    {/* Secondary Section */}
                    <div className="bento-span-8 premium-card">
                        <div className="section-header" style={{ border: 'none', padding: 0, marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}><TrendingUp size={18} style={{ marginRight: '0.5rem' }} /> Recent Activity</h2>
                            <button className="btn btn-ghost" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-brand-secondary)' }} onClick={() => navigate('/contractor/summary')}>
                                View All History →
                            </button>
                        </div>
                        
                        {myRfis.length === 0 ? (
                            <div className="empty-state" style={{ padding: '2rem' }}>
                                <p>No recent activity detected.</p>
                            </div>
                        ) : (
                            <div className="rfi-table-wrapper" style={{ border: 'none' }}>
                                <table className="rfi-table">
                                    <thead>
                                        <tr>
                                            {contractorVisibleColumns.slice(0, 4).map((col) => (
                                                <th key={col.field_key} style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)', ...getTableColumnStyle(col.field_key) }}>{col.field_name}</th>
                                            ))}
                                            <th style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)' }}>Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {myRfis.slice(0, 5).map((rfi, index) => (
                                            <tr key={rfi.id} style={{ borderBottom: '1px solid var(--clr-border)' }}>
                                                {contractorVisibleColumns.slice(0, 4).map((col) => (
                                                    <td key={`${rfi.id}_${col.field_key}`} style={{ fontSize: '0.9rem', padding: '0.75rem 0.5rem', ...getTableColumnStyle(col.field_key) }}>
                                                        {renderContractorCell(rfi, col, index)}
                                                    </td>
                                                ))}
                                                <td style={{ fontSize: '0.9rem', padding: '0.75rem 0.5rem', color: 'var(--clr-text-secondary)' }}>{rfi.filedDate}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="bento-span-4 premium-card">
                        <div className="section-header" style={{ border: 'none', padding: 0, marginBottom: '1rem' }}>
                            <h2 style={{ fontSize: '0.9rem', fontWeight: 600 }}><Clock size={16} style={{ marginRight: '0.5rem' }} /> Event Log</h2>
                        </div>
                        <ActivityTimeline rfis={allMyRfis.filter(r => r.filedDate === today)} limit={4} />
                    </div>
                </div>
            </main>
        </div>
    );
}
