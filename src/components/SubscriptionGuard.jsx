import { Navigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from './LoadingSpinner';

/**
 * SubscriptionGuard checks if the current project is accessible based on its
 * subscription status and manual lock state.
 * Admins are always allowed through.
 */
export default function SubscriptionGuard({ children }) {
    const { user, loading: authLoading } = useAuth();
    const { activeProject, checkProjectAccess, loadingProjects, projectsResolved } = useProject();

    if (authLoading || loadingProjects || !projectsResolved) {
        return <LoadingSpinner />;
    }

    // Admins bypass the guard
    if (user?.role === 'admin') {
        return children;
    }

    const access = checkProjectAccess();

    if (!access.allowed && (access.reason === 'locked' || access.reason === 'expired')) {
        // Only redirect if explicitly locked or expired
        return <Navigate to="/project-blocked" replace />;
    }

    if (!activeProject && projectsResolved && user?.role !== 'admin') {
        // If we resolved projects but still don't have one, show a more neutral state or wait
        // This prevents the 'Access Restricted' blink if the project is still being set
        return <LoadingSpinner />;
    }

    return children;
}
