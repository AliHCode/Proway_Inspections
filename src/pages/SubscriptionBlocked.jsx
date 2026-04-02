import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Mail, Building2, Lock, Clock } from 'lucide-react';
import Header from '../components/Header';
import { useEffect } from 'react';

export default function SubscriptionBlocked() {
    const { user } = useAuth();
    const { activeProject, checkProjectAccess } = useProject();
    const navigate = useNavigate();
    const access = checkProjectAccess();

    useEffect(() => {
        // Admins should never see this page even if a project is locked/expired
        if (user?.role === 'admin' || access.allowed) {
            const home = user?.role === 'admin' ? '/admin' : 
                        user?.role === 'contractor' ? '/contractor' : 
                        user?.role === 'consultant' ? '/consultant' : '/';
            navigate(home, { replace: true });
        }
    }, [access.allowed, navigate, user?.role]);

    const isLocked = access.reason === 'locked';
    const isExpired = access.reason === 'expired';

    return (
        <div className="page-wrapper premium-dashboard" style={{ minHeight: '100vh' }}>
            <Header />
            <main className="dashboard-page project-blocked-page">
                <section className="project-blocked-shell">
                    <div className={`project-blocked-orb ${isLocked ? 'locked' : 'expired'}`}>
                        {isLocked ? <Lock size={34} /> : <ShieldAlert size={34} />}
                    </div>

                    <p className="project-blocked-eyebrow">
                        {isLocked ? 'Project access paused' : 'Project subscription inactive'}
                    </p>

                    <h1 className="project-blocked-title">
                        {isLocked ? 'Project Locked' : 'Access Restricted'}
                    </h1>

                    <div className="project-blocked-project-line">
                        <Building2 size={16} />
                        <span>{activeProject?.name || 'Unknown Project'}</span>
                    </div>

                    <div className="project-blocked-divider" />

                    <p className="project-blocked-description">
                        {access.message || 'Access to this project has been restricted by the administrator. This may be due to an expired subscription or a maintenance lock.'}
                    </p>

                    <div className={`project-blocked-status ${isLocked ? 'locked' : 'expired'}`}>
                        {isLocked ? <Lock size={14} /> : <Clock size={14} />}
                        <span>{isLocked ? 'Manually Locked' : 'Subscription Expired'}</span>
                    </div>

                    <button
                        onClick={() => navigate('/support')}
                        className="project-blocked-support-btn"
                    >
                        <Mail size={17} /> Contact Administrator
                    </button>

                    <p className="project-blocked-footer">
                        ProWay Inspection Management &copy; {new Date().getFullYear()}
                    </p>
                </section>
            </main>
        </div>
    );
}
