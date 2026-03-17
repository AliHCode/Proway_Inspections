import { STATUS_COLORS } from '../utils/constants';

export default function StatusBadge({ status }) {
    const displayStatus = status === 'conditional_approve' 
        ? 'Cond. Approved' 
        : status === 'info_requested' 
            ? 'Info Req.' 
            : status === 'cancelled'
                ? 'Cancelled'
                : status.charAt(0).toUpperCase() + status.slice(1);

    return (
        <span
            className="status-badge"
            data-status={status}
        >
            {displayStatus}
        </span>
    );
}
