import { Clock, CheckCircle, XCircle, FileText } from 'lucide-react';

export default function ActivityTimeline({ rfis, limit = 5 }) {
    // Generate a list of events from the RFI data
    const generateEvents = () => {
        const events = [];

        rfis.forEach(rfi => {
            // Filing event
            if (rfi.filedDate) {
                events.push({
                    id: `${rfi.id}-filed`,
                    type: 'filed',
                    title: `RFI #${rfi.customFields?.rfi_no || rfi.serialNo} Submitted`,
                    desc: `${rfi.inspectionType} inspection for ${rfi.location}`,
                    date: rfi.filedDate,
                    timestamp: new Date(rfi.originalFiledDate || rfi.filedDate).getTime(),
                    icon: <FileText size={16} />,
                    color: 'var(--clr-brand-primary)'
                });
            }

            // Review event
            if (rfi.reviewedAt) {
                const isApproved = rfi.status === 'approved';
                events.push({
                    id: `${rfi.id}-reviewed`,
                    type: rfi.status,
                    title: `RFI #${rfi.customFields?.rfi_no || rfi.serialNo} ${isApproved ? 'Approved' : 'Rejected'}`,
                    desc: rfi.remarks ? `Remarks: ${rfi.remarks}` : `Reviewed on ${rfi.reviewedAt.split('T')[0]}`,
                    date: rfi.reviewedAt.split('T')[0],
                    timestamp: new Date(rfi.reviewedAt).getTime(),
                    icon: isApproved ? <CheckCircle size={16} /> : <XCircle size={16} />,
                    color: isApproved ? 'var(--clr-success)' : 'var(--clr-danger)'
                });
            }
        });

        // Sort descending by timestamp
        return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
    };

    const events = generateEvents();

    if (events.length === 0) {
        return (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <Clock size={32} />
                <h4 style={{ margin: '0.5rem 0', fontWeight: 600 }}>No Activity Yet</h4>
                <p style={{ color: 'var(--clr-text-secondary)', fontSize: '0.85rem' }}>Recent events will appear here.</p>
            </div>
        );
    }

    return (
        <div className="activity-timeline">
            {events.map((event, index) => (
                <div key={event.id} className="timeline-item">
                    <div className="timeline-tail" style={{ display: index === events.length - 1 ? 'none' : 'block' }}></div>
                    <div className="timeline-icon" style={{ backgroundColor: event.color }}>
                        {event.icon}
                    </div>
                    <div className="timeline-content">
                        <div className="timeline-header">
                            <span className="timeline-title">{event.title}</span>
                            <span className="timeline-time">{event.date}</span>
                        </div>
                        <p className="timeline-desc">{event.desc}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}
