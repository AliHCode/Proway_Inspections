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
                <video autoPlay loop muted playsInline className="auth-branding-video">
                    <source src="/authpage.mp4" type="video/mp4" />
                </video>
            </div>
        </div>
    );
}

// Inline styles removed in favor of global .auth-* classes in index.css



