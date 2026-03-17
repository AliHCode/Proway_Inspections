import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Mail, ArrowLeft, Building2 } from 'lucide-react';
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

    return (
        <div className="page-wrapper" style={{ minHeight: '100vh', background: 'var(--clr-bg-secondary)' }}>
            <Header />
            <main className="blocked-page" style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center', 
                padding: '2rem',
                marginTop: '4rem'
            }}>
                <div className="blocked-card" style={{
                    maxWidth: '500px',
                    width: '100%',
                    background: '#fff',
                    borderRadius: '24px',
                    padding: '3rem 2rem',
                    textAlign: 'center',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: '1px solid rgba(0,0,0,0.05)'
                }}>
                    <div className="icon-wrapper" style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '20px',
                        background: '#fee2e2',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 2rem'
                    }}>
                        <ShieldAlert size={40} />
                    </div>

                    <h1 style={{ 
                        fontSize: '1.75rem', 
                        fontWeight: 800, 
                        color: '#0f172a', 
                        marginBottom: '1rem' 
                    }}>
                        Access Restricted
                    </h1>

                    <div style={{
                        background: '#f8fafc',
                        padding: '1rem',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        marginBottom: '1.5rem',
                        border: '1px solid #e2e8f0'
                    }}>
                        <Building2 size={20} style={{ color: '#64748b' }} />
                        <span style={{ fontWeight: 600, color: '#334155' }}>{activeProject?.name || 'Unknown Project'}</span>
                    </div>

                    <p style={{ color: '#64748b', lineHeight: 1.6, marginBottom: '2rem' }}>
                        {access.message || 'Access to this project has been restricted by the administrator. This is usually due to an expired subscription or a manual lock for maintenance.'}
                    </p>

                    <div className="blocked-actions" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <a href="mailto:admin@clearline.com" className="btn btn-primary" style={{ 
                            width: '100%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '0.5rem',
                            padding: '1rem'
                        }}>
                            <Mail size={18} /> Contact Administrator
                        </a>
                        
                        <button className="btn btn-ghost" onClick={() => navigate('/admin')} style={{ 
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem'
                        }}>
                            <ArrowLeft size={18} /> Back to Dashboard
                        </button>
                    </div>
                </div>

                <p style={{ marginTop: '2rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                    ClearLine Inspection Management &copy; 2026
                </p>
            </main>
        </div>
    );
}
