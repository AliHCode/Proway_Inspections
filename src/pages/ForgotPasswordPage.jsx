import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        if (!email.trim()) {
            setError('Please enter your email address.');
            return;
        }
        setLoading(true);
        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/reset-password`,
            });
            if (resetError) throw resetError;
            setSent(true);
        } catch (err) {
            // Don't reveal whether the email exists — always show success for security
            // but log the real error for debugging
            console.error('Password reset error:', err.message);
            setSent(true); // Show success regardless to prevent email enumeration
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
                            Reset Your <span className="text-gradient">Password.</span>
                        </h1>
                        <p className="auth-hero-description">
                            Enter the email address linked to your account. We'll send you a secure link to get back in.
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
                    {sent ? (
                        /* ── Success State ── */
                        <div style={{ textAlign: 'center' }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                marginBottom: '1.5rem'
                            }}>
                                <div style={{
                                    padding: '1.5rem',
                                    borderRadius: '50%',
                                    background: 'var(--clr-success-bg)',
                                    color: 'var(--clr-success)',
                                }}>
                                    <CheckCircle size={52} strokeWidth={1.5} />
                                </div>
                            </div>
                            <h2 className="auth-form-title" style={{ marginBottom: '0.75rem' }}>
                                Check Your Email
                            </h2>
                            <p className="auth-form-subtitle" style={{ marginBottom: '2rem' }}>
                                If an account exists for <strong>{email}</strong>, a password reset link has been sent.
                                Check your inbox (and spam folder) and follow the link within 1 hour.
                            </p>
                            <button
                                className="auth-submit-btn modern"
                                onClick={() => navigate('/')}
                                style={{ width: '100%' }}
                            >
                                Back to Login
                            </button>
                        </div>
                    ) : (
                        /* ── Form State ── */
                        <>
                            <div className="auth-form-header">
                                <button
                                    type="button"
                                    className="auth-forgot-link"
                                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1.5rem', fontSize: '0.85rem' }}
                                    onClick={() => navigate('/')}
                                >
                                    <ArrowLeft size={14} /> Back to Login
                                </button>
                                <h2 className="auth-form-title">Forgot Password?</h2>
                                <p className="auth-form-subtitle">
                                    Enter your work email and we'll send a reset link.
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="auth-form-premium">
                                <div className="auth-input-group">
                                    <label htmlFor="reset-email">Work Email</label>
                                    <div className="auth-input-wrapper">
                                        <Mail className="auth-input-icon" size={20} />
                                        <input
                                            id="reset-email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => { setEmail(e.target.value); setError(''); }}
                                            placeholder="name@company.com"
                                            autoComplete="email"
                                            required
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {error && <div className="auth-alert error">{error}</div>}

                                <button
                                    type="submit"
                                    className="auth-submit-btn modern"
                                    disabled={loading}
                                >
                                    {loading ? 'Sending...' : 'Send Reset Link'}
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
