import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import {
    Shield, Calendar, Building2, Clock, Zap, Users,
    CheckCircle, Lock, AlertTriangle, Sparkles,
    CircleCheck, FileText, BarChart3, Globe, Layers, LifeBuoy, Send
} from 'lucide-react';

export default function SubscriptionPage() {
    const { user } = useAuth();
    const { activeProject } = useProject();
    const navigate = useNavigate();

    if (!user || !activeProject) return null;

    const status = activeProject.subscription_status || 'trial';
    const isLocked = activeProject.is_locked;
    const expiryDate = activeProject.subscription_end
        ? new Date(activeProject.subscription_end)
        : null;

    // Calculate days remaining
    const now = new Date();
    const daysRemaining = expiryDate
        ? Math.max(0, Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24)))
        : null;

    // Status-driven theming
    const statusConfig = {
        trial: {
            label: 'Trial',
            color: '#d97706',
            bg: '#fffbeb',
            border: '#fde68a',
            accent: '#f59e0b',
            icon: <Clock size={18} />,
            planName: 'ProWay Trial',
            description: 'You are currently on a trial period. Full features are available during this time.',
        },
        active: {
            label: 'Active',
            color: '#059669',
            bg: '#ecfdf5',
            border: '#a7f3d0',
            accent: '#10b981',
            icon: <CheckCircle size={18} />,
            planName: 'ProWay Professional',
            description: 'Your subscription is active. All features are fully available.',
        },
        expired: {
            label: 'Expired',
            color: '#dc2626',
            bg: '#fef2f2',
            border: '#fecaca',
            accent: '#ef4444',
            icon: <AlertTriangle size={18} />,
            planName: 'ProWay — Expired',
            description: 'Your subscription has expired. Contact your administrator to renew access.',
        },
    };

    const config = statusConfig[status] || statusConfig.trial;

    const roleFeatures = user.role === 'consultant'
        ? [
            { icon: <FileText size={16} />, text: 'Review & approve RFIs' },
            { icon: <BarChart3 size={16} />, text: 'Analytics & trend reports' },
            { icon: <Users size={16} />, text: 'Multi-project collaboration' },
            { icon: <Layers size={16} />, text: 'Rejection journey tracking' },
            { icon: <Globe size={16} />, text: 'Export to PDF & Excel' },
            { icon: <Zap size={16} />, text: 'Real-time push notifications' },
        ]
        : [
            { icon: <FileText size={16} />, text: 'Unlimited RFI filing' },
            { icon: <BarChart3 size={16} />, text: 'Daily inspection sheets' },
            { icon: <Users size={16} />, text: 'Multi-project collaboration' },
            { icon: <Layers size={16} />, text: 'Custom field templates' },
            { icon: <Globe size={16} />, text: 'Export to PDF & Excel' },
            { icon: <Zap size={16} />, text: 'Real-time push notifications' },
        ];

    return (
        <div className="page-wrapper premium-dashboard">
            <Header />
            <main className="dashboard-page" style={{ maxWidth: '860px', margin: '0 auto' }}>
                {/* Page Header */}
                <header className="premium-header" style={{ marginBottom: '1.5rem' }}>
                    <div className="welcome-monochrome-container">
                        <span className="welcome-label-mono">Account</span>
                        <h1 className="welcome-user-mono" style={{ fontSize: '1.6rem' }}>Subscription</h1>
                    </div>
                </header>

                {/* Lock Warning Banner */}
                {isLocked && (
                    <div style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '12px',
                        padding: '1rem 1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        marginBottom: '1.25rem',
                        fontSize: '0.85rem',
                        color: '#dc2626',
                        fontWeight: 600
                    }}>
                        <Lock size={18} />
                        <span>This project is currently locked by the administrator. Some features may be restricted.</span>
                    </div>
                )}

                {/* Main Status Card */}
                <div className="premium-card" style={{
                    border: `1px solid ${config.border}`,
                    background: `linear-gradient(135deg, #ffffff 0%, ${config.bg} 100%)`,
                    marginBottom: '1.25rem',
                    padding: '1.75rem',
                }}>
                    {/* Status Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.4rem' }}>
                                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                                    {config.planName}
                                </span>
                                <span style={{
                                    background: config.accent,
                                    color: '#fff',
                                    fontSize: '0.65rem',
                                    fontWeight: 800,
                                    padding: '0.2rem 0.55rem',
                                    borderRadius: '6px',
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                }}>
                                    {config.icon} {config.label}
                                </span>
                            </div>
                            <p style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 500, margin: 0, lineHeight: 1.5 }}>
                                {config.description}
                            </p>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        {/* Project */}
                        <div style={{
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '0.85rem 1rem',
                        }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Building2 size={12} /> Project
                            </div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                                {activeProject.name}
                            </div>
                            {activeProject.code && (
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500, marginTop: '2px' }}>
                                    Code: {activeProject.code}
                                </div>
                            )}
                        </div>

                        {/* Status */}
                        <div style={{
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '0.85rem 1rem',
                        }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Shield size={12} /> Status
                            </div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: config.color, textTransform: 'capitalize' }}>
                                {status}
                            </div>
                        </div>

                        {/* Expiry */}
                        <div style={{
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '0.85rem 1rem',
                        }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Calendar size={12} /> {status === 'active' ? 'Renewal' : 'Expiry'}
                            </div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                                {expiryDate ? expiryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No expiry set'}
                            </div>
                        </div>

                        {/* Days Remaining */}
                        <div style={{
                            background: daysRemaining !== null && daysRemaining <= 7 ? config.bg : '#f8fafc',
                            border: `1px solid ${daysRemaining !== null && daysRemaining <= 7 ? config.border : '#e2e8f0'}`,
                            borderRadius: '10px',
                            padding: '0.85rem 1rem',
                        }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Clock size={12} /> Remaining
                            </div>
                            <div style={{
                                fontSize: '0.95rem',
                                fontWeight: 700,
                                color: daysRemaining !== null && daysRemaining <= 7 ? config.color : '#0f172a',
                            }}>
                                {daysRemaining !== null ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}` : '∞ Unlimited'}
                            </div>
                        </div>
                    </div>

                    {/* Contact Admin CTA */}
                    {status === 'expired' && (
                        <button
                            onClick={() => navigate('/support')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                width: '100%',
                                padding: '0.85rem',
                                borderRadius: '10px',
                                border: 'none',
                                background: '#0f172a',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                letterSpacing: '0.01em',
                                transition: 'all 0.2s',
                            }}
                        >
                            <Send size={16} /> Contact Support to Renew
                        </button>
                    )}
                </div>

                {/* Features & Support Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                    {/* Features Card */}
                    <div className="premium-card" style={{ padding: '1.5rem' }}>
                        <h3 style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            marginBottom: '1.25rem',
                            letterSpacing: '-0.01em',
                        }}>
                            <Sparkles size={18} color={config.accent} /> Plan Features
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            {roleFeatures.map((feature, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.65rem',
                                    color: status === 'expired' ? '#94a3b8' : '#475569',
                                    fontWeight: 500,
                                    fontSize: '0.85rem',
                                    textDecoration: status === 'expired' ? 'line-through' : 'none',
                                    opacity: status === 'expired' ? 0.6 : 1,
                                }}>
                                    <CircleCheck size={16} color={status === 'expired' ? '#cbd5e1' : '#10b981'} />
                                    {feature.text}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Support Card */}
                    <div className="premium-card" style={{ padding: '1.5rem', background: '#f8fafc' }}>
                        <h3 style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            marginBottom: '0.75rem',
                            letterSpacing: '-0.01em',
                        }}>
                            <Shield size={18} color="#64748b" /> Managed by Admin
                        </h3>
                        <p style={{
                            color: '#64748b',
                            fontSize: '0.85rem',
                            lineHeight: 1.6,
                            marginBottom: '1.25rem',
                        }}>
                            Your subscription is managed by your project administrator.
                            For plan changes, renewals, or access issues, please contact your admin directly.
                        </p>

                        <div style={{
                            background: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '10px',
                            padding: '0.85rem 1rem',
                            marginBottom: '1rem',
                        }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>
                                Your Role
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', textTransform: 'capitalize' }}>
                                {user.role}
                            </div>
                        </div>

                        <button
                            onClick={() => navigate('/support')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                width: '100%',
                                padding: '0.7rem',
                                borderRadius: '10px',
                                border: '1px solid #e2e8f0',
                                background: '#fff',
                                color: '#334155',
                                fontWeight: 600,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                transition: 'all 0.2s',
                            }}
                        >
                            <LifeBuoy size={16} /> Contact Support
                        </button>
                    </div>
                </div>

                <p style={{
                    textAlign: 'center',
                    marginTop: '2rem',
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
