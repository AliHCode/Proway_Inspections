import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Smartphone, ArrowRight, CheckCircle2, X, AlertCircle, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MFAEnrollmentModal({ isOpen, onClose }) {
    const { enrollMFA, verifyMFAEnrollment } = useAuth();
    const [step, setStep] = useState(1); // 1: Info, 2: Secret/QR, 3: Verify, 4: Success
    const [enrollmentData, setEnrollmentData] = useState(null);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
            setStep(1);
            setEnrollmentData(null);
            setCode('');
        }
        return () => document.body.classList.remove('no-scroll');
    }, [isOpen]);

    const handleStartEnrollment = async () => {
        setLoading(true);
        try {
            const data = await enrollMFA();
            setEnrollmentData(data);
            setStep(2);
        } catch (error) {
            toast.error('Failed to start MFA enrollment: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyCode = async (e) => {
        e.preventDefault();
        if (code.length !== 6) return;
        
        setLoading(true);
        try {
            await verifyMFAEnrollment(enrollmentData.id, code);
            setStep(4);
            toast.success('MFA successfully enabled!');
        } catch (error) {
            toast.error('Verification failed. Please check the code.');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '480px' }}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div className="modal-header-icon" style={{ background: 'var(--clr-bg-accent)', color: 'var(--clr-accent)' }}>
                            <Shield size={20} />
                        </div>
                        <h2>2-Factor Authentication</h2>
                    </div>
                    <button className="modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="modal-body">
                    {step === 1 && (
                        <div className="mfa-step-content">
                            <p style={{ color: 'var(--clr-text-secondary)', marginBottom: '1.5rem' }}>
                                Add an extra layer of security to your account. You'll need an authenticator app (like Google Authenticator or Authy) to sign in.
                            </p>
                            <div className="mfa-feature-list">
                                <div className="mfa-feature">
                                    <Smartphone className="mfa-feature-icon" size={18} />
                                    <span>Standard TOTP Support</span>
                                </div>
                                <div className="mfa-feature">
                                    <CheckCircle2 className="mfa-feature-icon" size={18} />
                                    <span>Instant setup via QR code</span>
                                </div>
                            </div>
                            <button className="btn btn-primary" onClick={handleStartEnrollment} disabled={loading} style={{ width: '100%', marginTop: '2rem' }}>
                                {loading ? 'Initializing...' : 'Get Started'}
                                <ArrowRight size={18} />
                            </button>
                        </div>
                    )}

                    {step === 2 && enrollmentData && (
                        <div className="mfa-step-content text-center">
                            <p style={{ marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                Scan this QR code with your authenticator app:
                            </p>
                            
                            <div className="qr-container" style={{ 
                                background: '#fff', 
                                padding: '1rem', 
                                borderRadius: '12px', 
                                display: 'inline-block',
                                border: '1px solid var(--clr-border)',
                                marginBottom: '1.5rem'
                            }}>
                                <img 
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(enrollmentData.totp.uri)}`}
                                    alt="MFA QR Code"
                                    style={{ width: '180px', height: '180px' }}
                                />
                            </div>

                            <div className="secret-display" style={{ 
                                background: 'var(--clr-bg-secondary)', 
                                padding: '0.75rem', 
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '0.8rem',
                                color: 'var(--clr-text-secondary)',
                                marginBottom: '2rem'
                            }}>
                                <span style={{ flex: 1, textAlign: 'left', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                                    {enrollmentData.totp.secret}
                                </span>
                                <button className="btn-icon" onClick={() => copyToClipboard(enrollmentData.totp.secret)}>
                                    {copied ? <Check size={14} style={{ color: 'var(--clr-success)' }} /> : <Copy size={14} />}
                                </button>
                            </div>

                            <button className="btn btn-primary" onClick={() => setStep(3)} style={{ width: '100%' }}>
                                I've scanned the code
                                <ArrowRight size={18} />
                            </button>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="mfa-step-content">
                            <p style={{ marginBottom: '1.5rem' }}>
                                Enter the 6-digit code from your app to verify:
                            </p>
                            
                            <form onSubmit={handleVerifyCode}>
                                <input
                                    type="text"
                                    className="mfa-code-input"
                                    placeholder="000 000"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    autoFocus
                                    style={{
                                        fontSize: '2rem',
                                        textAlign: 'center',
                                        letterSpacing: '0.5rem',
                                        fontWeight: 800,
                                        width: '100%',
                                        padding: '1rem',
                                        borderRadius: '12px',
                                        border: '1px solid var(--clr-border)',
                                        marginBottom: '2rem'
                                    }}
                                />
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="button" className="btn btn-ghost" onClick={() => setStep(2)} style={{ flex: 1 }}>
                                        Back
                                    </button>
                                    <button type="submit" className="btn btn-primary" disabled={loading || code.length !== 6} style={{ flex: 2 }}>
                                        {loading ? 'Verifying...' : 'Finish Setup'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="mfa-step-content text-center" style={{ padding: '1rem 0' }}>
                            <div style={{ color: 'var(--clr-success)', marginBottom: '1.5rem' }}>
                                <CheckCircle2 size={64} style={{ margin: '0 auto' }} />
                            </div>
                            <h3 style={{ marginBottom: '0.5rem' }}>MFA is Enabled!</h3>
                            <p style={{ color: 'var(--clr-text-secondary)', marginBottom: '2rem' }}>
                                Your account is now protected with 2-Factor Authentication.
                            </p>
                            <button className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
