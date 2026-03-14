import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { getToday } from '../utils/rfiLogic';
import Header from '../components/Header';
import StatsCard from '../components/StatsCard';
import RfiTrendChart from '../components/RfiTrendChart';
import RfiStatusPieChart from '../components/RfiStatusPieChart';
import ActivityTimeline from '../components/ActivityTimeline';
import {
    FileSearch,
    CheckCircle,
    XCircle,
    Clock,
    ClipboardCheck,
    AlertTriangle,
    Users,
    Download,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

export default function ConsultantDashboard() {
    const { user } = useAuth();
    const { rfis, getStats, getReviewQueue } = useRFI();
    const navigate = useNavigate();
    const today = getToday();
    const stats = getStats(today);
    const queue = getReviewQueue(today);

    // --- Chart Data Preparation ---
    const pieData = [
        { name: 'Approved', value: stats.todayApproved, color: 'var(--clr-success)' },
        { name: 'Pending', value: stats.todayPending, color: 'var(--clr-warning)' },
        { name: 'Rejected', value: stats.todayRejected, color: 'var(--clr-danger)' },
        { name: 'Info Req.', value: stats.todayInfoRequested || 0, color: 'var(--clr-brand-secondary)' },
    ];

    // Group all RFIs by date for the area chart (last 7 days of activity)
    const trendMap = {};
    rfis.forEach(r => {
        const d = r.filedDate;
        trendMap[d] = (trendMap[d] || 0) + 1;
    });

    // Convert to array, sort chronologically, and take last 7
    const trendData = Object.keys(trendMap)
        .sort()
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
                        <h1>Welcome, {user?.name || 'Consultant'}</h1>
                        <p className="subtitle">{user?.company || 'ProWay'} — Consultant Dashboard</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="btn btn-primary" onClick={() => navigate('/consultant/review')}>
                            <FileSearch size={18} /> Review RFIs
                        </button>
                    </div>
                </div>

                {queue.all.length > 0 && (
                    <div className="carryover-alert">
                        <ClipboardCheck size={20} />
                        <span>
                            <strong>{queue.all.length} RFI{queue.all.length > 1 ? 's' : ''}</strong> awaiting your review
                            {queue.carriedOver.length > 0 && (
                                <> — including <strong>{queue.carriedOver.length} rejected carryover{queue.carriedOver.length > 1 ? 's' : ''}</strong></>
                            )}
                        </span>
                        <button className="btn btn-sm btn-primary" onClick={() => navigate('/consultant/review')}>
                            Review Now
                        </button>
                    </div>
                )}

                {/* --- ANALYTICS CHARTS SECTION --- */}
                <div className="dashboard-section charts-section" style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2rem', background: 'transparent', border: 'none', boxShadow: 'none' }}>
                    <div className="chart-card" style={{ flex: '1 1 300px', minWidth: 0, background: 'var(--clr-bg-secondary)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--clr-border)' }}>
                        <RfiTrendChart data={trendData} />
                    </div>
                    <div className="chart-card" style={{ flex: '1 1 300px', minWidth: 0, background: 'var(--clr-bg-secondary)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--clr-border)' }}>
                        <RfiStatusPieChart data={pieData} />
                    </div>
                </div>

                {/* --- ACTIVITY TIMELINE & QUEUE SUMMARY SECTION --- */}
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

                    {/* Activity Timeline (Feed) */}
                    <div className="dashboard-section" style={{ flex: '1 1 300px', minWidth: 0, margin: 0, maxWidth: '100%' }}>
                        <div className="section-header">
                            <h2><Clock size={20} /> Recent Activity</h2>
                        </div>
                        <div style={{ padding: '1.5rem' }}>
                            <ActivityTimeline rfis={rfis.filter(r => r.filedDate === today)} limit={5} />
                        </div>
                    </div>

                    {/* Review Queue Summary */}
                    <div className="dashboard-section" style={{ flex: '1 1 300px', minWidth: 0, margin: 0, maxWidth: '100%' }}>
                        <div className="section-header">
                            <h2><AlertTriangle size={20} /> Review Queue Summary</h2>
                        </div>

                        {queue.all.length === 0 ? (
                            <div className="empty-state">
                                <CheckCircle size={48} />
                                <h3>All Caught Up!</h3>
                                <p>No RFIs are waiting for review right now.</p>
                            </div>
                        ) : (
                            <div className="review-summary">
                                {queue.carriedOver.length > 0 && (
                                    <div className="summary-item rejected">
                                        <XCircle size={20} />
                                        <span>{queue.carriedOver.length} rejected carryover{queue.carriedOver.length > 1 ? 's' : ''} need re-review</span>
                                    </div>
                                )}
                                {queue.pending.length > 0 && (
                                    <div className="summary-item pending">
                                        <Clock size={20} />
                                        <span>{queue.pending.length} new RFI{queue.pending.length > 1 ? 's' : ''} pending first review</span>
                                    </div>
                                )}
                                <button className="btn btn-primary" onClick={() => navigate('/consultant/review')} style={{ marginTop: '1rem' }}>
                                    <FileSearch size={18} /> Open Review Queue
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
