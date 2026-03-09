import { useState } from 'react';
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
    const { activeProject } = useProject();
    const activeProjectName = activeProject?.name || 'ProWay Project';
    const navigate = useNavigate();
    const today = getToday();
    const stats = getStats(today);

    // Get all RFIs by this contractor
    const allMyRfis = rfis
        .filter((r) => r.filedBy === user.id)
        .sort((a, b) => b.filedDate.localeCompare(a.filedDate) || b.serialNo - a.serialNo);

    // Get recent RFIs by this contractor for display
    const myRfis = allMyRfis.slice(0, 10);

    // Count rejected carryovers
    const carryoverCount = rfis.filter(
        (r) => r.status === 'rejected' && r.carryoverTo === today && r.filedBy === user.id
    ).length;

    const reportRfis = allMyRfis.filter(r =>
        (r.status === 'approved' || r.status === 'rejected') &&
        ((r.reviewedAt && r.reviewedAt.startsWith(today)) || r.filedDate === today)
    );

    // --- Chart Data Preparation ---
    const pieData = [
        { name: 'Approved', value: stats.todayApproved, color: 'var(--clr-success)' },
        { name: 'Pending', value: stats.todayPending, color: 'var(--clr-warning)' },
        { name: 'Rejected', value: stats.todayRejected, color: 'var(--clr-danger)' },
        { name: 'Info Req.', value: stats.todayTotal - (stats.todayApproved + stats.todayPending + stats.todayRejected), color: 'var(--clr-brand-secondary)' },
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

    return (
        <div className="page-wrapper">
            <Header />
            <main className="dashboard-page">
                <div className="dashboard-header">
                    <div>
                        <h1>Welcome, {user.name}</h1>
                        <p className="subtitle">{user.company} — Contractor Dashboard</p>
                    </div>
                    <button className="btn btn-primary" onClick={() => navigate('/contractor/rfi-sheet')}>
                        <Plus size={18} /> File RFIs
                    </button>
                </div>

                {carryoverCount > 0 && (
                    <div className="carryover-alert">
                        <AlertTriangle size={20} />
                        <span>
                            <strong>{carryoverCount} rejected RFI{carryoverCount > 1 ? 's' : ''}</strong> carried over from previous days — please re-submit today.
                        </span>
                        <button className="btn btn-sm btn-warning" onClick={() => navigate('/contractor/rfi-sheet')}>
                            View Sheet
                        </button>
                    </div>
                )}

                <div className="stats-grid">
                    <StatsCard
                        icon={<FileText size={24} />}
                        label="Total Filed"
                        value={stats.todayTotal}
                        color="#6366f1"
                        subtitle="Today"
                    />
                    <StatsCard
                        icon={<Clock size={24} />}
                        label="Pending"
                        value={stats.todayPending}
                        color="#f59e0b"
                        subtitle="Awaiting review"
                    />
                    <StatsCard
                        icon={<CheckCircle size={24} />}
                        label="Approved"
                        value={stats.todayApproved}
                        color="#10b981"
                        subtitle="Daily"
                    />
                    <StatsCard
                        icon={<XCircle size={24} />}
                        label="Rejected"
                        value={stats.todayRejected}
                        color="#ef4444"
                        subtitle="Needs attention"
                    />
                </div>

                {/* --- ANALYTICS CHARTS SECTION --- */}
                <div className="dashboard-section charts-section" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2rem', background: 'transparent', border: 'none', boxShadow: 'none' }}>
                    <div className="chart-card" style={{ flex: '1 1 300px', minWidth: 0, background: 'var(--clr-bg-secondary)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--clr-border)' }}>
                        <RfiTrendChart data={trendData} />
                    </div>
                    <div className="chart-card" style={{ flex: '1 1 300px', minWidth: 0, background: 'var(--clr-bg-secondary)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--clr-border)' }}>
                        <RfiStatusPieChart data={pieData} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'stretch', flexWrap: 'wrap' }}>
                    <div className="dashboard-section" style={{ flex: '2 1 300px', minWidth: 0, margin: 0, maxWidth: '100%' }}>
                        <div className="section-header">
                            <h2><TrendingUp size={20} /> Recent RFIs</h2>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                {allMyRfis.length > 0 && (
                                    <div className="export-actions" style={{ display: 'flex', gap: '0.75rem', marginRight: '1rem', alignItems: 'center' }}>
                                        <button
                                            className="btn btn-sm"
                                            style={{ backgroundColor: 'transparent', color: 'var(--clr-brand-secondary)', border: '1px solid var(--clr-border-dark)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                            onClick={() => exportToPDF(allMyRfis, `ProWay_Contractor_Report`)}
                                            title="Export to PDF"
                                        >
                                            <FileDown size={16} /> PDF
                                        </button>
                                        <button
                                            className="btn btn-sm"
                                            style={{ backgroundColor: 'transparent', color: 'var(--clr-brand-secondary)', border: '1px solid var(--clr-border-dark)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                            onClick={() => exportToExcel(allMyRfis, `ProWay_Contractor_Report`)}
                                            title="Export to Excel"
                                        >
                                            <Table size={16} /> Excel
                                        </button>
                                        <button
                                            className="btn btn-sm"
                                            style={{ backgroundColor: 'var(--clr-brand-secondary)', color: 'white', border: '1px solid var(--clr-brand-secondary)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                                            onClick={() => generateDailyReport(reportRfis, today, activeProjectName)}
                                            title="Generate branded daily report"
                                        >
                                            <ClipboardList size={16} /> Daily Report
                                        </button>
                                    </div>
                                )}
                                <button className="btn btn-ghost" onClick={() => navigate('/contractor/rfi-sheet')}>
                                    View All →
                                </button>
                            </div>
                        </div>

                        {myRfis.length === 0 ? (
                            <div className="empty-state">
                                <FileText size={48} />
                                <h3>No RFIs Filed Yet</h3>
                                <p>Start by filing your first Request for Inspection</p>
                                <button className="btn btn-primary" onClick={() => navigate('/contractor/rfi-sheet')}>
                                    <Plus size={18} /> File RFIs
                                </button>
                            </div>
                        ) : (
                            <div className="rfi-table-wrapper">
                                <table className="rfi-table editable">
                                    <thead>
                                        <tr>
                                            <th className="col-serial">#</th>
                                            <th className="col-desc">Description</th>
                                            <th className="col-loc">Location</th>
                                            <th className="col-type">Type</th>
                                            <th>Date</th>
                                            <th className="col-status">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {myRfis.map((rfi) => (
                                            <tr key={rfi.id} className={rfi.carryoverCount > 0 ? 'carryover-row' : ''}>
                                                <td className="col-serial" data-label="#">{rfi.serialNo}</td>
                                                <td className="col-desc" data-label="Description">{rfi.description}</td>
                                                <td className="col-loc" data-label="Location">{rfi.location}</td>
                                                <td className="col-type" data-label="Type">{rfi.inspectionType}</td>
                                                <td data-label="Date">{rfi.filedDate}</td>
                                                <td className="col-status" data-label="Status"><StatusBadge status={rfi.status} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="dashboard-section" style={{ flex: '1 1 300px', minWidth: 0, margin: 0, maxWidth: '100%' }}>
                        <div className="section-header">
                            <h2><Clock size={20} /> Your Activity</h2>
                        </div>
                        <div style={{ padding: '1.5rem' }}>
                            <ActivityTimeline rfis={allMyRfis} limit={5} />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
