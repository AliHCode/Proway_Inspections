import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Mail, ArrowLeft, Building2, Lock, Clock } from 'lucide-react';
import Header from '../components/Header';
import { useEffect } from 'react';

export default function SubscriptionBlocked() {
    const { user } = useAuth();
    const { activeProject, checkProjectAccess } = useProject();
    const navigate = useNavigate();
    const access = checkProjectAccess();

    useEffect(() => {
        if (access.allowed) {
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
            <main className="dashboard-page" style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: '2rem',
                maxWidth: '520px',
                margin: '0 auto',
                marginTop: '3rem',
            }}>
                <div className="premium-card" style={{
                    width: '100%',
                    padding: '2.5rem 2rem',
                    textAlign: 'center',
                }}>
                    {/* Icon */}
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        background: isLocked ? '#fef3c7' : '#fef2f2',
                        color: isLocked ? '#d97706' : '#dc2626',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.5rem',
                    }}>
                        {isLocked ? <Lock size={32} /> : <ShieldAlert size={32} />}
                    </div>

                    {/* Title */}
                    <h1 style={{ 
                        fontSize: '1.5rem', 
                        fontWeight: 800, 
                        color: '#0f172a', 
                        marginBottom: '0.75rem',
                        letterSpacing: '-0.02em',
                    }}>
                        {isLocked ? 'Project Locked' : 'Access Restricted'}
                    </h1>

                    {/* Project Badge */}
                    <div style={{
                        background: '#f8fafc',
                        padding: '0.75rem 1rem',
                        borderRadius: '10px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '1.25rem',
                        border: '1px solid #e2e8f0',
                        fontSize: '0.85rem',
                    }}>
                        <Building2 size={16} style={{ color: '#64748b' }} />
                        <span style={{ fontWeight: 600, color: '#334155' }}>{activeProject?.name || 'Unknown Project'}</span>
                    </div>

                    {/* Description */}
                    <p style={{ 
                        color: '#64748b', 
                        lineHeight: 1.6, 
                        marginBottom: '1.75rem', 
                        fontSize: '0.85rem',
                        maxWidth: '380px',
                        margin: '0 auto 1.75rem',
                    }}>
                        {access.message || 'Access to this project has been restricted by the administrator. This may be due to an expired subscription or a maintenance lock.'}
                    </p>

                    {/* Reason Badge */}
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        background: isLocked ? '#fffbeb' : '#fef2f2',
                        color: isLocked ? '#d97706' : '#dc2626',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        marginBottom: '1.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                    }}>
                        {isLocked ? <Lock size={13} /> : <Clock size={13} />}
                        {isLocked ? 'Manually Locked' : 'Subscription Expired'}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <a 
                            href="mailto:admin@proway.com" 
                            style={{ 
                                width: '100%', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                gap: '0.5rem',
                                padding: '0.85rem',
                                borderRadius: '10px',
                                border: 'none',
                                background: '#0f172a',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                textDecoration: 'none',
                                transition: 'all 0.2s',
                            }}
                        >
                            <Mail size={16} /> Contact Administrator
                        </a>
                        
                        <button 
                            onClick={() => {
                                const home = user?.role === 'admin' ? '/admin' : 
                                            user?.role === 'contractor' ? '/contractor' : 
                                            user?.role === 'consultant' ? '/consultant' : '/';
                                navigate(home);
                            }} 
                            style={{ 
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                padding: '0.75rem',
                                borderRadius: '10px',
                                border: '1px solid #e2e8f0',
                                background: '#fff',
                                color: '#64748b',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            <ArrowLeft size={16} /> Back to Dashboard
                        </button>
                    </div>
                </div>

                <p style={{ 
                    marginTop: '1.5rem', 
                    color: '#94a3b8', 
                    fontSize: '0.75rem',
                    fontWeight: 500,
                }}>
                    ProWay Inspection Management &copy; {new Date().getFullYear()}
                </p>
            </main>
        </div>
    );
}
