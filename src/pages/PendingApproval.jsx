import { useAuth } from '../context/AuthContext';
import { Clock, ShieldX, LogOut } from 'lucide-react';

export default function PendingApproval() {
    const { user, logout } = useAuth();
    const isRejected = user?.role === 'rejected';
    const statusLabel = isRejected ? 'Access Restricted' : 'Verification Pending';
    const title = isRejected ? 'Manual Clearance Required' : 'Verifying Identity';
    const description = isRejected
        ? 'For security reasons, this workspace requires administrator clearance before access can be granted.'
        : 'Your registration has been received and is now awaiting administrator approval. You will be notified by email once access is active.';

    return (
        <div className="auth-container">
            <div className="auth-form-section">
                <div className="auth-logo-top">
                    <img src="/dashboardlogo.png" alt="ClearLine Logo" />
                </div>

                <div className="auth-form-wrapper auth-status-wrapper">
                    <div className={`auth-status-shell ${isRejected ? 'rejected' : 'pending'}`}>
                        <span className={`auth-status-kicker ${isRejected ? 'rejected' : 'pending'}`}>
                            {statusLabel}
                        </span>

                        <div className={`auth-status-icon ${isRejected ? 'rejected' : 'pending'}`} aria-hidden="true">
                            {isRejected ? <ShieldX size={44} strokeWidth={1.7} /> : <Clock size={44} strokeWidth={1.7} />}
                        </div>

                        <div className="auth-status-copy">
                            <h1 className="auth-form-title auth-status-title">{title}</h1>
                            <p className="auth-form-subtitle auth-status-subtitle">{description}</p>
                        </div>

                        <button className={`auth-submit-btn modern auth-status-logout ${isRejected ? 'rejected' : ''}`} onClick={logout}>
                            <LogOut size={20} />
                            Terminate Session
                        </button>
                    </div>
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



