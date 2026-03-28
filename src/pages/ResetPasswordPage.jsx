import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { Lock, Eye, EyeOff, CheckCircle, AlertTriangle } from 'lucide-react';

function getPasswordStrength(password) {
    if (!password) return { score: 0, label: '', color: '' };
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 1) return { score, label: 'Very weak', color: '#ef4444' };
    if (score === 2) return { score, label: 'Weak', color: '#f97316' };
    if (score === 3) return { score, label: 'Fair', color: '#eab308' };
    if (score === 4) return { score, label: 'Strong', color: '#22c55e' };
    return { score, label: 'Very strong', color: '#16a34a' };
}

export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');
    const [sessionReady, setSessionReady] = useState(false);

    const strength = getPasswordStrength(password);

    // Supabase injects the recovery token into the URL hash.
    // onAuthStateChange fires with event='PASSWORD_RECOVERY' when ready.
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setSessionReady(true);
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');

        if (password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (password !== confirm) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) throw updateError;
            setDone(true);
            // Auto-redirect to login after 3 seconds
            setTimeout(() => navigate('/'), 3000);
        } catch (err) {
            setError(err.message || 'Failed to update password. The reset link may have expired.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-container">
            {/* Branding Side */}
            <div className="auth-branding-section">
                <div className="auth-branding-content">
                    <div className="auth-logo-wrapper">
                        <img src="/dashboardlogo.png" alt="ClearLine Logo" className="auth-logo-large" />
                    </div>
                    <div className="auth-hero-text">
                        <h1 className="auth-hero-title">
                            Set a New <span className="text-gradient">Password.</span>
                        </h1>
                        <p className="auth-hero-description">
                            Choose a strong password to keep your account secure.
                        </p>
                    </div>
                </div>
                <video autoPlay loop muted playsInline className="auth-branding-video">
                    <source src="/authpage.mp4" type="video/mp4" />
                </video>
            </div>

            {/* Form Side */}
            <div className="auth-form-section">
                <div className="auth-logo-top">
                    <img src="/dashboardlogo.png" alt="ClearLine Logo" />
                </div>

                <div className="auth-form-wrapper">
                    {done ? (
                        /* ── Success State ── */
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                                <div style={{
                                    padding: '1.5rem', borderRadius: '50%',
                                    background: 'var(--clr-success-bg)', color: 'var(--clr-success)'
                                }}>
                                    <CheckCircle size={52} strokeWidth={1.5} />
                                </div>
                            </div>
                            <h2 className="auth-form-title">Password Updated!</h2>
                            <p className="auth-form-subtitle" style={{ marginBottom: '2rem' }}>
                                Your password has been changed successfully. Redirecting you to login…
                            </p>
                            <button className="auth-submit-btn modern" onClick={() => navigate('/')} style={{ width: '100%' }}>
                                Go to Login
                            </button>
                        </div>
                    ) : !sessionReady ? (
                        /* ── Waiting for Supabase recovery token ── */
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                                <div style={{
                                    padding: '1.5rem', borderRadius: '50%',
                                    background: 'rgba(234,179,8,0.1)', color: '#eab308'
                                }}>
                                    <AlertTriangle size={52} strokeWidth={1.5} />
                                </div>
                            </div>
                            <h2 className="auth-form-title">Verifying Reset Link…</h2>
                            <p className="auth-form-subtitle" style={{ marginBottom: '2rem' }}>
                                Please wait while we verify your reset link. If this takes too long, the link may have expired —{' '}
                                <button className="auth-forgot-link" onClick={() => navigate('/forgot-password')}>
                                    request a new one
                                </button>.
                            </p>
                        </div>
                    ) : (
                        /* ── Password Form ── */
                        <>
                            <div className="auth-form-header">
                                <h2 className="auth-form-title">Create New Password</h2>
                                <p className="auth-form-subtitle">
                                    Your reset link is valid. Enter your new password below.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="auth-form-premium">
                                <div className="auth-input-group">
                                    <div className="auth-label-row">
                                        <label htmlFor="new-password">New Password</label>
                                        {password && (
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: strength.color }}>
                                                {strength.label}
                                            </span>
                                        )}
                                    </div>
                                    <div className="auth-input-wrapper">
                                        <Lock className="auth-input-icon" size={20} />
                                        <input
                                            id="new-password"
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => { setPassword(e.target.value); setError(''); }}
                                            placeholder="Min. 8 characters"
                                            autoComplete="new-password"
                                            required
                                            autoFocus
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
                                    {/* Strength bar */}
                                    {password && (
                                        <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                                            {[1, 2, 3, 4, 5].map((i) => (
                                                <div key={i} style={{
                                                    flex: 1, height: '3px', borderRadius: '99px',
                                                    background: i <= strength.score ? strength.color : 'var(--clr-border)',
                                                    transition: 'background 0.2s',
                                                }} />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="auth-input-group">
                                    <label htmlFor="confirm-password">Confirm Password</label>
                                    <div className="auth-input-wrapper">
                                        <Lock className="auth-input-icon" size={20} />
                                        <input
                                            id="confirm-password"
                                            type={showPassword ? 'text' : 'password'}
                                            value={confirm}
                                            onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                                            placeholder="Re-enter your password"
                                            autoComplete="new-password"
                                            required
                                        />
                                    </div>
                                    {confirm && password !== confirm && (
                                        <p style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: '4px' }}>
                                            Passwords do not match
                                        </p>
                                    )}
                                </div>

                                {error && <div className="auth-alert error">{error}</div>}

                                <button
                                    type="submit"
                                    className="auth-submit-btn modern"
                                    disabled={loading || password !== confirm || password.length < 8}
                                >
                                    {loading ? 'Updating…' : 'Update Password'}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
