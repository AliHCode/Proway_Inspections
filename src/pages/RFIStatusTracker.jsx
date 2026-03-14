import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import { getToday } from '../utils/rfiLogic';
import { RFI_STATUS } from '../utils/constants';
import Header from '../components/Header';
import DateNavigator from '../components/DateNavigator';
import StatusBadge from '../components/StatusBadge';
import RFIDetailModal from '../components/RFIDetailModal';
import { MessageSquare, FileText } from 'lucide-react';

const TRACKER_STATUS_OPTIONS = [
    { key: RFI_STATUS.PENDING, label: 'Pending' },
    { key: RFI_STATUS.APPROVED, label: 'Approved' },
    { key: RFI_STATUS.REJECTED, label: 'Rejected' },
];

const TRACKER_SCOPE_OPTIONS = [
    { key: 'all_dates', label: 'All Dates' },
    { key: 'today_reviewed', label: 'Today Reviewed' },
    { key: 'last_7_days', label: 'Last 7 Days' },
];

export default function RFIStatusTracker() {
    const { user } = useAuth();
    const { rfis } = useRFI();
    const navigate = useNavigate();

    const [currentDate, setCurrentDate] = useState(getToday());
    const [trackerStatus, setTrackerStatus] = useState(RFI_STATUS.PENDING);
    const [trackerScope, setTrackerScope] = useState('all_dates');
    const [detailTarget, setDetailTarget] = useState(null);

    const myTrackerRfis = useMemo(() => {
        if (!rfis || !user?.id) return [];

        const now = new Date(`${currentDate}T00:00:00`);
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 6);

        const inScope = (rfi) => {
            if (trackerScope === 'all_dates') return true;

            const reviewedDate = rfi.reviewedAt ? rfi.reviewedAt.slice(0, 10) : null;
            const referenceDate = reviewedDate || rfi.filedDate;
            if (!referenceDate) return false;

            if (trackerScope === 'today_reviewed') {
                if (rfi.status === RFI_STATUS.PENDING) {
                    return rfi.filedDate === currentDate;
                }
                return reviewedDate === currentDate;
            }

            if (trackerScope === 'last_7_days') {
                const ref = new Date(`${referenceDate}T00:00:00`);
                return ref >= weekAgo && ref <= now;
            }

            return true;
        };

        return rfis
            .filter((r) => r.filedBy === user.id)
            .filter((r) => r.status === trackerStatus)
            .filter(inScope)
            .sort((a, b) => {
                const aDate = a.reviewedAt || a.filedDate || '';
                const bDate = b.reviewedAt || b.filedDate || '';
                if (aDate !== bDate) return bDate.localeCompare(aDate);
                return (b.serialNo || 0) - (a.serialNo || 0);
            });
    }, [rfis, user?.id, trackerStatus, trackerScope, currentDate]);

    useEffect(() => {
        const isModalOpen = !!detailTarget;
        if (isModalOpen) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
        return () => document.body.classList.remove('no-scroll');
    }, [detailTarget]);

    const openInDailySheet = (rfiId) => {
        navigate(`/contractor/rfi-sheet?rfi=${rfiId}&source=status-tracker`);
    };

    return (
        <div className="page-wrapper">
            <Header />
            <main className="rfi-sheet-page">
                <div className="sheet-header">
                    <div>
                        <h1>📍 RFI Status Tracker</h1>
                        <p className="subtitle" style={{ marginTop: '0.2rem' }}>
                            Track your RFIs by status and time scope.
                        </p>
                    </div>
                    <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
                </div>

                <div className="sheet-section" style={{ overflow: 'hidden' }}>
                    <div className="section-header" style={{ gap: '0.8rem', flexWrap: 'wrap' }}>
                        <h2 style={{ margin: 0 }}>My Tracker</h2>
                        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                            {TRACKER_STATUS_OPTIONS.map((option) => (
                                <button
                                    key={option.key}
                                    type="button"
                                    className="btn btn-sm"
                                    onClick={() => setTrackerStatus(option.key)}
                                    style={{
                                        backgroundColor: trackerStatus === option.key ? 'var(--clr-brand-secondary)' : '#fff',
                                        color: trackerStatus === option.key ? '#fff' : 'var(--clr-text-main)',
                                        border: '1px solid var(--clr-border-dark)',
                                    }}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ padding: '0.9rem 1rem 0.35rem', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        {TRACKER_SCOPE_OPTIONS.map((scope) => (
                            <button
                                key={scope.key}
                                type="button"
                                className="btn btn-sm"
                                onClick={() => setTrackerScope(scope.key)}
                                style={{
                                    backgroundColor: trackerScope === scope.key ? '#0f172a' : '#fff',
                                    color: trackerScope === scope.key ? '#fff' : '#0f172a',
                                    border: '1px solid #cbd5e1',
                                }}
                            >
                                {scope.label}
                            </button>
                        ))}
                    </div>

                    {myTrackerRfis.length === 0 ? (
                        <div className="empty-state" style={{ margin: '0 1rem 1rem', padding: '1rem 1.1rem' }}>
                            <p style={{ margin: 0 }}>No RFIs match this status and scope.</p>
                        </div>
                    ) : (
                        <div className="rfi-table-wrapper" style={{ marginTop: '0.3rem' }}>
                            <table className="rfi-table editable" style={{ minWidth: '640px' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '84px' }}>#</th>
                                        <th>Description</th>
                                        <th>Location</th>
                                        <th style={{ width: '135px' }}>Status</th>
                                        <th style={{ width: '140px' }}>Last Update</th>
                                        <th style={{ width: '230px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myTrackerRfis.map((rfi) => (
                                        <tr key={`tracker_${rfi.id}`}>
                                            <td data-label="#">#{rfi.serialNo}</td>
                                            <td data-label="Description">{rfi.description}</td>
                                            <td data-label="Location">{rfi.location}</td>
                                            <td data-label="Status"><StatusBadge status={rfi.status} /></td>
                                            <td data-label="Last Update">{(rfi.reviewedAt || rfi.filedDate || '').slice(0, 10) || '—'}</td>
                                            <td data-label="Actions">
                                                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <button className="btn btn-sm btn-ghost" onClick={() => setDetailTarget(rfi)} title="Open Discussion">
                                                        <MessageSquare size={14} /> Open Discussion
                                                    </button>
                                                    <button className="btn btn-sm" onClick={() => openInDailySheet(rfi.id)} title="Open in Daily RFI Sheet">
                                                        <FileText size={14} /> Open in Daily Sheet
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {detailTarget && (
                    <RFIDetailModal
                        key={detailTarget.id}
                        rfi={detailTarget}
                        onClose={() => setDetailTarget(null)}
                    />
                )}
            </main>
        </div>
    );
}
