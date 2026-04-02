import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, MessageSquare, Building2, Lock, Clock } from 'lucide-react';
import Header from '../components/Header';
import { useEffect } from 'react';

export default function SubscriptionBlocked() {
    const { user } = useAuth();
    const { activeProject, checkProjectAccess } = useProject();
    const navigate = useNavigate();
    const access = checkProjectAccess();

    useEffect(() => {
        if (user?.role === 'admin' || access.allowed) {
            const home = user?.role === 'admin' ? '/admin' : 
                        user?.role === 'contractor' ? '/contractor' : 
                        user?.role === 'consultant' ? '/consultant' : '/';
            navigate(home, { replace: true });
        }
    }, [access.allowed, navigate, user?.role]);

    const isLocked = access.reason === 'locked';

    return (
        <div className="restriction-page">
            <Header transparent hideNavigation />
            
            <main className="restriction-card">
                {/* Icon Wrapper */}
                <div className={`restriction-icon-wrapper ${isLocked ? 'locked' : 'expired'}`}>
                    {isLocked ? <Lock size={40} strokeWidth={1.5} /> : <ShieldAlert size={40} strokeWidth={1.5} />}
                </div>

                {/* Title */}
                <h1 className="restriction-title">
                    {isLocked ? 'Project Locked' : 'Access Restricted'}
                </h1>

                {/* Project Identification */}
                <div className="restriction-project-tag">
                    <Building2 size={18} />
                    <span>{activeProject?.name || 'Assigned Project'}</span>
                </div>

                {/* Status Indicator */}
                <div>
                    <div className={`restriction-status-pill ${isLocked ? 'locked' : 'expired'}`}>
                        {isLocked ? <Lock size={14} /> : <Clock size={14} />}
                        {isLocked ? 'Maintenance Lock' : 'Subscription Expired'}
                    </div>
                </div>

                {/* Narrative */}
                <p className="restriction-description">
                    {access.message || 'Access to this project has been restricted. This typically occurs during maintenance or when a subscription cycle completes.'}
                </p>

                {/* Primary Action */}
                <button
                    className="restriction-action-btn"
                    onClick={() => navigate('/support')}
                >
                    <MessageSquare size={20} />
                    Contact Administrator
                </button>

                {/* Footer Attribution */}
                <p className="restriction-footer">
                    ProWay Inspection Management &copy; {new Date().getFullYear()}
                </p>
            </main>
        </div>
    );
}
