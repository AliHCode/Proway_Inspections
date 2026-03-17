import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { USER_ROLES } from '../utils/constants';
import { Eye, EyeOff, HardHat, UserCheck, ArrowRight, Shield, Lock } from 'lucide-react';
import MFALoginChallenge from '../components/MFALoginChallenge';
import { supabase } from '../utils/supabaseClient';

export default function LoginPage() {
    const { user, login, register, logout } = useAuth();
    const navigate = useNavigate();
    const [isRegister, setIsRegister] = useState(false);
    const [form, setForm] = useState({ name: '', email: '', password: '', company: '' });
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
                if (!form.name || !form.email || !form.password || !form.company) {
                    setError('All fields are required');
                    setLoading(false);
                    return;
                }
                const result = await register(form.name, form.email, form.password, form.company);
                if (result.success) {
                    setIsRegister(false); // Switch to login view which will show pending message
                    setSuccessMessage(`Welcome, ${form.name.split(' ')[0]}! Your account has been created. Please wait for admin approval. You will be notified by email.`);
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
            <div className="auth-page">
                <div className="auth-bg-pattern"></div>
                <div className="auth-wrapper">
                    <div className="auth-hero" style={{ textAlign: 'center' }}>
                        <div className="auth-logo-img">
                            <img src="/dashboardlogo.png" alt="ClearLine Logo" />
                        </div>
                        <h2 className="hero-title">Approval <span className="text-accent">Pending.</span></h2>
                        <p className="hero-subtitle">
                            Welcome, {user.name.split(' ')[0]}! Your account has been created.
                            <br /><br />
                            Please wait for admin approval. You will be notified by email.
                        </p>
                        <div style={{ marginTop: '2rem' }}>
                            <button className="auth-submit" onClick={logout} style={{ maxWidth: '200px', margin: '0 auto' }}>
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (user && user.role === USER_ROLES.REJECTED) {
        return (
            <div className="auth-page">
                <div className="auth-bg-pattern"></div>
                <div className="auth-wrapper">
                    <div className="auth-hero" style={{ textAlign: 'center' }}>
                        <div className="auth-logo-img">
                            <img src="/dashboardlogo.png" alt="ClearLine Logo" />
                        </div>
                        <h2 className="hero-title">Request <span className="text-accent" style={{ color: 'var(--clr-danger)' }}>Declined.</span></h2>
                        <p className="hero-subtitle">
                            Your account request was not approved by the administrator.
                            <br /><br />
                            Please contact your project manager if you believe this is an error.
                        </p>
                        <div style={{ marginTop: '2rem' }}>
                            <button className="auth-submit" onClick={logout} style={{ maxWidth: '200px', margin: '0 auto', background: 'var(--clr-danger)' }}>
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-page">
            {/* Background decoration */}
            <div className="auth-bg-pattern"></div>

            <div className="auth-wrapper">
                {/* Branding Hero */}
                <div className="auth-hero">
                    <div className="auth-logo-img">
                        <img src="/dashboardlogo.png" alt="ClearLine Logo" />
                    </div>
                    {/* Build with Confidence removed per user request */}
                    <p className="hero-subtitle">
                        The enterprise platform for streamlined RFIs, inspections, and QA/QC management.
                    </p>
                </div>

                {/* Card */}
                <div className="auth-card">
                    {/* Tabs */}
                    <div className="auth-tabs">
                        <button
                            className={`auth-tab ${!isRegister ? 'active' : ''}`}
                            onClick={() => { setIsRegister(false); setError(''); }}
                        >
                            Sign In
                        </button>
                        <button
                            className={`auth-tab ${isRegister ? 'active' : ''}`}
                            onClick={() => { setIsRegister(true); setError(''); setSuccessMessage(''); }}
                        >
                            Create Account
                        </button>
                    </div>


                    {/* MFA Challenge View */}
                    {mfaChallengeFactor ? (
                        <MFALoginChallenge 
                            factor={mfaChallengeFactor} 
                            onVerify={() => navigate('/')} 
                            onCancel={() => setMfaChallengeFactor(null)} 
                        />
                    ) : (
                        <form onSubmit={handleSubmit} className="auth-form">
                            {isRegister && (
                                <div className="auth-form-row">
                                    <div className="auth-field">
                                        <label htmlFor="name">Full Name</label>
                                        <input
                                            id="name"
                                            type="text"
                                            value={form.name}
                                            onChange={(e) => handleChange('name', e.target.value)}
                                            placeholder="John Doe"
                                            autoComplete="name"
                                        />
                                    </div>
                                    <div className="auth-field">
                                        <label htmlFor="company">Company</label>
                                        <input
                                            id="company"
                                            type="text"
                                            value={form.company}
                                            onChange={(e) => handleChange('company', e.target.value)}
                                            placeholder="ACME Construction"
                                            autoComplete="organization"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="auth-field">
                                <label htmlFor="email">Email Address</label>
                                <input
                                    id="email"
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => handleChange('email', e.target.value)}
                                    placeholder="you@company.com"
                                    autoComplete="email"
                                />
                            </div>

                            <div className="auth-field">
                                <label htmlFor="password">Password</label>
                                <div className="auth-password-wrapper">
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        value={form.password}
                                        onChange={(e) => handleChange('password', e.target.value)}
                                        placeholder="••••••••"
                                        autoComplete={isRegister ? 'new-password' : 'current-password'}
                                    />
                                    <button
                                        type="button"
                                        className="auth-password-toggle"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {successMessage && !isRegister && <div className="auth-success">{successMessage}</div>}
                            {error && <div className="auth-error">{error}</div>}

                            <button
                                type="submit"
                                className="auth-submit"
                                disabled={loading}
                            >
                                {loading ? (
                                    <span className="auth-submit-loading">Processing...</span>
                                ) : (
                                    <>
                                        {isRegister ? 'Create Account' : 'Sign In'}
                                        <ArrowRight size={18} />
                                    </>
                                )}
                            </button>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <p className="auth-footer">
                    Enterprise-grade inspection management for construction teams.
                </p>
            </div>
        </div>
    );
}
