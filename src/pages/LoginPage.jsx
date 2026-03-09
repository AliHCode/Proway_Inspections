import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { USER_ROLES } from '../utils/constants';
import { Eye, EyeOff, HardHat, UserCheck, ArrowRight, Shield } from 'lucide-react';

export default function LoginPage() {
    const { login, register } = useAuth();
    const navigate = useNavigate();
    const [isRegister, setIsRegister] = useState(false);
    const [role, setRole] = useState(USER_ROLES.CONTRACTOR);
    const [form, setForm] = useState({ name: '', email: '', password: '', company: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

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
                const result = await register(form.name, form.email, form.password, role, form.company);
                if (result.success) {
                    navigate(role === USER_ROLES.CONTRACTOR ? '/contractor' : '/consultant');
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

    return (
        <div className="auth-page">
            {/* Background decoration */}
            <div className="auth-bg-pattern"></div>

            <div className="auth-wrapper">
                {/* Branding Hero */}
                <div className="auth-hero">
                    <div className="auth-logo-img">
                        <img src="/dashboardlogo.png" alt="ClearLine Logo" style={{ height: '64px', marginBottom: '1.5rem' }} />
                    </div>
                    <h1 className="hero-title">Build with <span className="text-accent">Confidence.</span></h1>
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
                            onClick={() => { setIsRegister(true); setError(''); }}
                        >
                            Create Account
                        </button>
                    </div>

                    {/* Role Selector (Register only) */}
                    {isRegister && (
                        <div className="auth-role-selector">
                            <p className="auth-role-label">I am a...</p>
                            <div className="auth-roles">
                                <button
                                    className={`auth-role-card ${role === USER_ROLES.CONTRACTOR ? 'active' : ''}`}
                                    onClick={() => setRole(USER_ROLES.CONTRACTOR)}
                                    type="button"
                                >
                                    <HardHat size={28} />
                                    <div className="auth-role-info">
                                        <span className="auth-role-name">Contractor</span>
                                        <span className="auth-role-desc">File & track RFIs</span>
                                    </div>
                                </button>
                                <button
                                    className={`auth-role-card ${role === USER_ROLES.CONSULTANT ? 'active' : ''}`}
                                    onClick={() => setRole(USER_ROLES.CONSULTANT)}
                                    type="button"
                                >
                                    <UserCheck size={28} />
                                    <div className="auth-role-info">
                                        <span className="auth-role-name">Consultant</span>
                                        <span className="auth-role-desc">Review & approve</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Form */}
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
                </div>

                {/* Footer */}
                <p className="auth-footer">
                    Enterprise-grade inspection management for construction teams.
                </p>
            </div>
        </div>
    );
}
