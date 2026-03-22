import { useAuth } from '../context/AuthContext';
import { Clock, ShieldX, LogOut } from 'lucide-react';

export default function PendingApproval() {
    const { user, logout } = useAuth();
    const isRejected = user?.role === 'rejected';
    const firstName = user?.name?.split(' ')[0] || 'there';

    return (
        <div className="auth-container">
            <div className="auth-form-section">
                <div className="auth-logo-top">
                    <img src="/dashboardlogo.png" alt="ClearLine Logo" />
                </div>

                <div className="auth-form-wrapper" style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ padding: '2rem', borderRadius: '4px', background: isRejected ? 'rgba(239, 68, 68, 0.05)' : 'rgba(16, 185, 129, 0.05)', color: isRejected ? '#ef4444' : '#10b981' }}>
                            {isRejected ? <ShieldX size={64} strokeWidth={1.5} /> : <Clock size={64} strokeWidth={1.5} />}
                        </div>
                    </div>

                    <h1 className="auth-form-title">
                        {isRejected ? "Access Restricted" : "Verifying Identity"}
                    </h1>
                    
                    <p className="auth-form-subtitle" style={{ marginBottom: '3rem' }}>
                        {isRejected ? (
                            "For security purposes, access to this workspace requires manual administrator clearance. Please contact your supervisor."
                        ) : (
                            "Our administrative team has been notified of your registration. You will receive an email once your profile is active."
                        )}
                    </p>

                    <button className="auth-submit-btn modern" onClick={logout} style={{ background: isRejected ? '#ef4444' : '#111827' }}>
                        <LogOut size={20} />
                        Terminate Session
                    </button>
                </div>
            </div>

            <div className="auth-branding-section">
                <img 
                    src="https://images.unsplash.com/photo-1541888946425-d81bb19480c5?q=80&w=2070&auto=format&fit=crop" 
                    alt="Construction Site" 
                    className="auth-branding-image" 
                />
                <div className="auth-branding-content">
                    <h1 className="auth-hero-title">
                        {isRejected ? "Access Declined" : "Review in Progress"}
                    </h1>
                    <p className="auth-hero-description">
                        {isRejected 
                            ? "Your application for workspace access could not be approved at this time. Please check your email for details."
                            : `Welcome, ${firstName}. Your credentials have been received and are currently being verified by our team.`
                        }
                    </p>
                </div>
            </div>
        </div>
    );
}

// Inline styles removed in favor of global .auth-* classes in index.css



