import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { USER_ROLES } from '../utils/constants';
import { Eye, EyeOff, Clock, Shield, Lock, User, Mail, Building, ChevronRight } from 'lucide-react';
import MFALoginChallenge from '../components/MFALoginChallenge';
import { supabase } from '../utils/supabaseClient';

export default function LoginPage() {
    const { user, login, register, logout } = useAuth();
    const navigate = useNavigate();
    const [isRegister, setIsRegister] = useState(false);
    const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', company: '' });
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [mfaChallengeFactor, setMfaChallengeFactor] = useState(null);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (isRegister) {
                if (!form.firstName || !form.lastName || !form.email || !form.password || !form.company) {
                    setError('All fields are required');
                    setLoading(false);
                    return;
                }
                const fullName = `${form.firstName} ${form.lastName}`;
                const result = await register(fullName, form.email, form.password, form.company);
                if (result.success) {
                    setIsRegister(false); // Switch to login view which will show pending message
                    setSuccessMessage(`Welcome, ${form.firstName}! Your account has been created. Please wait for admin approval. You will be notified by email.`);
                    setForm((prev) => ({ ...prev, password: '' }));
                } else {
                    setError(result.error);
                }
            } else {
                if (!form.email || !form.password) {
                    setError('Email and password are required');
                    setLoading(false);
                    return;
                }
                const result = await login(form.email, form.password);
                if (result.success) {
                    // Check if MFA is required
                    const { data: { next, current }, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
                    
                    if (!aalError && next === 'aal2' && current !== 'aal2') {
                        // User has MFA enabled, need to challenge
                        const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
                        if (!factorsError && factors.all.length > 0) {
                            setMfaChallengeFactor(factors.all[0]);
                            setLoading(false);
                            return;
                        }
                    }

                    setTimeout(() => {
                        navigate('/');
                    }, 500);
                } else {
                    setError(result.error);
                }
            }
        } finally {
            setLoading(false);
        }
    }

    function handleChange(field, value) {
        setForm((prev) => ({ ...prev, [field]: value }));
        setError('');
    }

    if (user && user.role === USER_ROLES.PENDING) {
        return (
            <div className="auth-container">
                <div className="auth-branding-section">
                    <div className="auth-branding-content">
                        <div className="auth-logo-wrapper">
                            <img src="/dashboardlogo.png" alt="ClearLine Logo" className="auth-logo-large" />
                        </div>
                        <div className="auth-hero-text">
                            <h1 className="auth-hero-title">
                                Approval <span className="text-gradient">Pending.</span>
                            </h1>
                            <p className="auth-hero-description">
                                Welcome, {user.name.split(' ')[0]}! Your account is ready for review.
                                An administrator has been notified.
                            </p>
                        </div>
                    </div>
                    <video autoPlay loop muted playsInline className="auth-branding-video">
                        <source src="/authpage.mp4" type="video/mp4" />
                    </video>
                </div>

                <div className="auth-form-section">
                    <div className="auth-form-wrapper" style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ padding: '2rem', borderRadius: '50%', background: 'var(--clr-bg-hover)', color: 'var(--clr-brand-primary)' }}>
                                <Shield size={64} strokeWidth={1.5} />
                            </div>
                        </div>
                        <h2 className="auth-form-title">Verifying Identity</h2>
                        <p className="auth-form-subtitle" style={{ marginBottom: '2.5rem' }}>
                            Your request is currently being processed. You will receive an email confirmation once access is granted.
                        </p>
                        <button className="auth-submit-btn" onClick={logout} style={{ width: '100%' }}>
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (user && user.role === USER_ROLES.REJECTED) {
        return (
            <div className="auth-container">
                <div className="auth-branding-section">
                    <div className="auth-branding-content">
                        <div className="auth-logo-wrapper">
                            <img src="/dashboardlogo.png" alt="ClearLine Logo" className="auth-logo-large" />
                        </div>
                        <div className="auth-hero-text">
                            <h1 className="auth-hero-title">
                                Access <span className="text-gradient" style={{ opacity: 0.8 }}>Declined.</span>
                            </h1>
                            <p className="auth-hero-description">
                                Your application for access could not be approved at this time.
                            </p>
                        </div>
                    </div>
                    <video autoPlay loop muted playsInline className="auth-branding-video">
                        <source src="/authpage.mp4" type="video/mp4" />
                    </video>
                </div>

                <div className="auth-form-section">
                    <div className="auth-form-wrapper" style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ padding: '2rem', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.05)', color: '#ef4444' }}>
                                <Lock size={64} strokeWidth={1.5} />
                            </div>
                        </div>
                        <h2 className="auth-form-title">Not Authorized</h2>
                        <p className="auth-form-subtitle" style={{ marginBottom: '2.5rem' }}>
                            Please contact your supervisor or project administrator for further information regarding your access.
                        </p>
                        <button className="auth-submit-btn" onClick={logout} style={{ width: '100%', background: '#ef4444' }}>
                            Sign Out
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`auth-container ${isRegister ? 'signup-view' : ''}`}>
            {/* Form Section */}
            <div className="auth-form-section">
                <div className="auth-logo-top">
                    <img src="/dashboardlogo.png" alt="ClearLine Logo" />
                </div>

                <div className="auth-form-wrapper">
                    <div className="auth-form-header">
                        <p className="auth-form-subtitle">
                            Enter your credentials to access your account.
                        </p>
                    </div>


                    {mfaChallengeFactor ? (
                        <MFALoginChallenge 
                            factor={mfaChallengeFactor} 
                            onVerify={() => navigate('/')} 
                            onCancel={() => setMfaChallengeFactor(null)} 
                        />
                    ) : (
                        <form onSubmit={handleSubmit} className="auth-form-premium">
                            {isRegister && (
                                <>
                                    <div className="auth-form-grid">
                                        <div className="auth-input-group">
                                            <label htmlFor="firstName">First Name</label>
                                            <div className="auth-input-wrapper">
                                                <User className="auth-input-icon" size={20} />
                                                <input
                                                    id="firstName"
                                                    type="text"
                                                    value={form.firstName}
                                                    onChange={(e) => handleChange('firstName', e.target.value)}
                                                    placeholder="John"
                                                    required
                                                />
                                            </div>
                                        </div>
                                        <div className="auth-input-group">
                                            <label htmlFor="lastName">Last Name</label>
                                            <div className="auth-input-wrapper">
                                                <User className="auth-input-icon" size={20} />
                                                <input
                                                    id="lastName"
                                                    type="text"
                                                    value={form.lastName}
                                                    onChange={(e) => handleChange('lastName', e.target.value)}
                                                    placeholder="Doe"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="auth-input-group">
                                        <label htmlFor="company">Company Name</label>
                                        <div className="auth-input-wrapper">
                                            <Building className="auth-input-icon" size={20} />
                                            <input
                                                id="company"
                                                type="text"
                                                value={form.company}
                                                onChange={(e) => handleChange('company', e.target.value)}
                                                placeholder="Acme Construction"
                                                required
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            <div className="auth-input-group">
                                <label htmlFor="email">Work Email</label>
                                <div className="auth-input-wrapper">
                                    <Mail className="auth-input-icon" size={20} />
                                    <input
                                        id="email"
                                        type="email"
                                        value={form.email}
                                        onChange={(e) => handleChange('email', e.target.value)}
                                        placeholder="name@company.com"
                                        autoComplete="email"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="auth-input-group">
                                <div className="auth-label-row">
                                    <label htmlFor="password">Password</label>
                                    {!isRegister && (
                                        <button 
                                            type="button" 
                                            className="auth-inline-link auth-forgot-link"
                                            onClick={() => navigate('/forgot-password')}
                                        >
                                            Forgot?
                                        </button>
                                    )}
                                </div>
                                <div className="auth-input-wrapper">
                                    <Lock className="auth-input-icon" size={20} />
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={form.password}
                                        onChange={(e) => handleChange('password', e.target.value)}
                                        placeholder={isRegister ? "Min. 8 characters" : "••••••••"}
                                        autoComplete={isRegister ? 'new-password' : 'current-password'}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="auth-password-toggle-btn"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {isRegister && (
                                <div className="auth-checkbox-row">
                                    <input type="checkbox" id="terms" required />
                                    <label htmlFor="terms">By creating an account, you agree to our Terms of Service and Privacy Policy.</label>
                                </div>
                            )}

                            {successMessage && !isRegister && <div className="auth-alert success">{successMessage}</div>}
                            {error && <div className="auth-alert error">{error}</div>}

                            <button
                                type="submit"
                                className="auth-submit-btn modern"
                                disabled={loading}
                            >
                                {loading ? 'Processing...' : (
                                    <>
                                        {isRegister ? 'Create Account' : 'Log In'}
                                        <ChevronRight size={20} />
                                    </>
                                )}
                            </button>

                            <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem', color: '#64748b' }}>
                                {isRegister ? (
                                    <>Already have an account?{' '}
                                        <button type="button" className="auth-inline-link" onClick={() => { setIsRegister(false); setError(''); setSuccessMessage(''); }}>
                                            Log In
                                        </button>
                                    </>
                                ) : (
                                    <>Don&apos;t have an account?{' '}
                                        <button type="button" className="auth-inline-link" onClick={() => { setIsRegister(true); setError(''); setSuccessMessage(''); }}>
                                            Create Account
                                        </button>
                                    </>
                                )}
                            </div>

                        </form>
                    )}
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
