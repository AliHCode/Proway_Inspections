import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';
import { getNotificationDestinationForRole } from '../utils/notificationLinks';

export default function NotificationRedirect() {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <LoadingSpinner message="Opening notification..." />;
    }

    if (!user) {
        return <Navigate to="/" replace />;
    }

    if (user.role === 'pending' || user.role === 'rejected') {
        return <Navigate to="/" replace />;
    }

    return <Navigate to={getNotificationDestinationForRole(user.role, location.search)} replace />;
}
