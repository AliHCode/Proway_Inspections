import { useMemo } from 'react';
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
    GitBranch,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { exportToExcel, exportToPDF } from '../utils/exportUtils';

export default function ConsultantDashboard() {
    const { user } = useAuth();
    const { rfis, getStats, getReviewQueue } = useRFI();
    const navigate = useNavigate();
    const today = getToday();
    const queue = getReviewQueue(today);

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 17) return 'Good Afternoon';
        return 'Good Evening';
    };

    const statusBreakdown = useMemo(() => {
        const reviewedToday = rfis.filter((r) => r.reviewedAt && r.reviewedAt.startsWith(today));
        const approvedToday = reviewedToday.filter((r) => r.status === 'approved').length;
        const conditionallyApprovedToday = reviewedToday.filter((r) => r.status === 'conditional_approve').length;
        const rejectedToday = reviewedToday.filter((r) => r.status === 'rejected').length;
        const infoRequestedToday = reviewedToday.filter((r) => r.status === 'info_requested').length;
        const cancelledToday = reviewedToday.filter((r) => r.status === 'cancelled').length;
        const pendingQueue = queue.all.length;

        return [
            { name: 'Approved', value: approvedToday, color: '#10b981' }, // Emerald
            { name: 'Cond. App', value: conditionallyApprovedToday, color: '#fbbf24' }, // Amber
            { name: 'Pending', value: pendingQueue, color: '#3b82f6' }, // Blue
            { name: 'Rejected', value: rejectedToday, color: '#f87171' }, // Rose/Red
            { name: 'Info Req.', value: infoRequestedToday, color: '#94a3b8' }, // Slate
            { name: 'Cancelled', value: cancelledToday, color: '#cbd5e1' }, // Light Slate
        ];
    }, [rfis, today, queue.all.length]);

    // --- Chart Data Preparation ---
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
        <div className="page-wrapper premium-dashboard">
            <Header />
            <main className="dashboard-page" style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto' }}>
                <header className="premium-header" style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div className="welcome-block">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--clr-text-secondary)', fontSize: '0.9rem', fontWeight: 600, marginBottom: '4px' }}>
                            <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--clr-brand-primary)' }}></div>
                            {getGreeting()}
                        </div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--clr-slate-dark)', letterSpacing: '-0.03em' }}>
                            {user?.name?.split(' ')[0] || 'Consultant'}. <span style={{ color: '#cbd5e1' }}>👋</span>
                        </h1>
                    </div>
                    <div className="premium-actions" style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                            className="btn-command" 
                            onClick={() => navigate('/consultant/review')}
                            style={{ 
                                background: 'var(--clr-slate-dark)', 
                                color: '#fff', 
                                border: 'none', 
                                padding: '12px 24px', 
                                borderRadius: '14px', 
                                fontWeight: 700, 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                boxShadow: '0 10px 20px -5px rgba(15, 23, 42, 0.3)',
                                cursor: 'pointer'
                            }}
                        >
                            <FileSearch size={20} /> Review RFIs
                        </button>
                    </div>
                </header>

                <div className="bento-grid">
                    {/* Stats Section */}
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<Clock size={20} />}
                            label="Pending Review"
                            value={queue.all.length}
                            subtitle="In your queue"
                            trend={queue.all.length > 5 ? "up" : "down"}
                            trendValue={queue.all.length > 0 ? "Action Req" : "Clear"}
                            color="#f59e0b"
                        />
                    </div>
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<CheckCircle size={20} />}
                            label="Approved"
                            value={statusBreakdown.find(s => s.name === 'Approved')?.value || 0}
                            subtitle="Today"
                            trend="up"
                            trendValue="Daily"
                            color="#10b981"
                        />
                    </div>
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<CheckCircle size={20} />}
                            label="Cond. App"
                            value={statusBreakdown.find(s => s.name === 'Cond. Approved')?.value || 0}
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
                            value={statusBreakdown.find(s => s.name === 'Rejected')?.value || 0}
                            subtitle="Today"
                            trend="down"
                            trendValue="Daily"
                            color="#ef4444"
                        />
                    </div>
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<AlertTriangle size={20} />}
                            label="Cancelled"
                            value={statusBreakdown.find(s => s.name === 'Cancelled')?.value || 0}
                            subtitle="Voided"
                            trend="down"
                            trendValue="Daily"
                            color="#6b7280"
                        />
                    </div>
                    <div className="bento-span-2">
                        <StatsCard
                            icon={<ClipboardCheck size={20} />}
                            label="Total Reviewed"
                            value={
                                (statusBreakdown.find(s => s.name === 'Approved')?.value || 0) +
                                (statusBreakdown.find(s => s.name === 'Cond. Approved')?.value || 0) +
                                (statusBreakdown.find(s => s.name === 'Rejected')?.value || 0) +
                                (statusBreakdown.find(s => s.name === 'Cancelled')?.value || 0) +
                                (statusBreakdown.find(s => s.name === 'Info Req.')?.value || 0)
                            }
                            subtitle="Today's throughput"
                            trend="up"
                            trendValue="Verified"
                            color="#3b82f6"
                        />
                    </div>

                    {/* Chart Section */}
                    <div className="bento-span-8 bento-row-2">
                        <RfiTrendChart data={trendData} />
                    </div>
                    <div className="bento-span-4 bento-row-2">
                        <RfiStatusPieChart data={statusBreakdown} />
                    </div>

                    {/* Activity & Queue Section */}
                    <div className="bento-span-8 premium-card">
                        <div className="section-header" style={{ border: 'none', padding: 0, marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}><Clock size={18} style={{ marginRight: '0.5rem' }} /> Recent Activity</h2>
                        </div>
                        <div style={{ padding: '0 0.5rem' }}>
                            <ActivityTimeline rfis={rfis.filter(r => r.filedDate === today)} limit={5} />
                        </div>
                    </div>

                    <div className="bento-span-4 premium-card">
                        <div className="section-header" style={{ border: 'none', padding: 0, marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}><AlertTriangle size={18} style={{ marginRight: '0.5rem' }} /> Review Queue Summary</h2>
                        </div>

                        {queue.all.length === 0 ? (
                            <div className="empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
                                <CheckCircle size={40} style={{ color: 'var(--clr-success)', marginBottom: '1rem', opacity: 0.6 }} />
                                <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>All Caught Up!</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--clr-text-muted)' }}>No RFIs are waiting for review right now.</p>
                            </div>
                        ) : (
                            <div className="review-summary">
                                {queue.carriedOver.length > 0 && (
                                    <div className="summary-item rejected" style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.75rem', 
                                        padding: '1rem', 
                                        background: 'rgba(239, 68, 68, 0.05)', 
                                        borderRadius: '12px',
                                        marginBottom: '1rem',
                                        fontSize: '0.85rem',
                                        color: '#ef4444'
                                    }}>
                                        <XCircle size={18} />
                                        <span>{queue.carriedOver.length} rejected carryover{queue.carriedOver.length > 1 ? 's' : ''} need re-review</span>
                                    </div>
                                )}
                                {queue.pending.length > 0 && (
                                    <div className="summary-item pending" style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.75rem', 
                                        padding: '1rem', 
                                        background: 'rgba(245, 158, 11, 0.05)', 
                                        borderRadius: '12px',
                                        marginBottom: '1rem',
                                        fontSize: '0.85rem',
                                        color: '#f59e0b'
                                    }}>
                                        <Clock size={18} />
                                        <span>{queue.pending.length} new RFI{queue.pending.length > 1 ? 's' : ''} pending first review</span>
                                    </div>
                                )}
                                <button className="btn btn-primary" onClick={() => navigate('/consultant/review')} style={{ width: '100%', marginTop: '0.5rem', borderRadius: '12px', padding: '0.75rem' }}>
                                    <FileSearch size={18} style={{ marginRight: '0.5rem' }} /> Open Review Queue
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
