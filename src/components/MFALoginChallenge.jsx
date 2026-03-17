import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, ArrowRight, Lock, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MFALoginChallenge({ factor, onVerify, onCancel }) {
    const { challengeMFA, verifyMFAChallenge } = useAuth();
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (code.length !== 6) return;

        setError('');
        setLoading(true);
        try {
            // 1. Create a challenge
            const challengeData = await challengeMFA(factor.id);
            
            // 2. Verify the challenge
            await verifyMFAChallenge(factor.id, challengeData.id, code);
            
            toast.success('Identity verified');
            onVerify();
        } catch (err) {
            console.error('MFA Verification error:', err);
            setError('Invalid code. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mfa-challenge-container" style={{ padding: '1rem' }}>
            <div className="text-center" style={{ marginBottom: '2rem' }}>
                <div className="icon-wrapper" style={{ 
                    width: '64px', 
                    height: '64px', 
                    borderRadius: '16px', 
                    background: 'var(--clr-bg-accent)', 
                    color: 'var(--clr-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1.5rem'
                }}>
                    <Lock size={32} />
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Two-Factor Authentication</h2>
                <p style={{ color: 'var(--clr-text-secondary)', fontSize: '0.9rem' }}>
                    Enter the code from your authenticator app to continue.
                </p>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="auth-field" style={{ marginBottom: '2rem' }}>
                    <input
                        type="text"
                        placeholder="000 000"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        autoFocus
                        style={{
                            fontSize: '2rem',
                            textAlign: 'center',
                            letterSpacing: '0.4rem',
                            fontWeight: 800,
                            width: '100%',
                            padding: '1rem',
                            borderRadius: '12px',
                            border: '2px solid var(--clr-border)',
                        }}
                    />
                </div>

                {error && (
                    <div className="auth-error" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <AlertCircle size={16} />
                        {error}
                    </div>
                )}

                <button type="submit" className="auth-submit" disabled={loading || code.length !== 6}>
                    {loading ? 'Verifying...' : 'Verify Identity'}
                    {!loading && <ArrowRight size={18} />}
                </button>

                <button type="button" className="btn btn-ghost" onClick={onCancel} style={{ width: '100%', marginTop: '1rem' }}>
                    Back to Login
                </button>
            </form>

            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--clr-text-secondary)' }}>
                    Lost access to your device? Contact your administrator.
                </p>
            </div>
        </div>
    );
}
