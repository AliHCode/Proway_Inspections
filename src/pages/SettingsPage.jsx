import { useState, useCallback, useEffect } from 'react';
import { ChevronLeft, Shield, Bell, Check, Smartphone, Info, Wifi, WifiOff } from 'lucide-react';
import { syncPushSubscriptionForUser } from '../utils/pushNotifications';
import MFAEnrollmentModal from '../components/MFAEnrollmentModal';
import Header from '../components/Header';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';

export default function SettingsPage() {
    const { user, mfaFactors } = useAuth();
    const { notifications, isOffline, lastSyncTime } = useRFI() || { notifications: [], isOffline: false, lastSyncTime: null };
    const navigate = useNavigate();
    const [mfaModalOpen, setMfaModalOpen] = useState(false);
    const isMFAEnabled = mfaFactors.some(f => f.status === 'verified');
    
    const [notifPermission, setNotifPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
    const [pushBadge, setPushBadge] = useState({ state: 'checking', label: 'Push: Checking' });

    const refreshPushBadge = useCallback(async () => {
        if (typeof window === 'undefined') return;
        if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            setPushBadge({ state: 'unsupported', label: 'Push: Unsupported' });
            return;
        }

        const permission = Notification.permission;
        if (permission === 'denied') {
            setPushBadge({ state: 'blocked', label: 'Push: Blocked' });
            return;
        }
        if (permission !== 'granted') {
            setPushBadge({ state: 'off', label: 'Push: Off' });
            return;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();
            setPushBadge(
                subscription
                     ? { state: 'subscribed', label: 'Push: Subscribed' }
                    : { state: 'granted-no-sub', label: 'Push: Granted (Not Subscribed)' }
            );
        } catch {
            setPushBadge({ state: 'error', label: 'Push: Unknown' });
        }
    }, []);

    useEffect(() => {
        refreshPushBadge();
    }, [refreshPushBadge]);

    const handleEnableNotifications = async () => {
        if (typeof Notification === 'undefined') return;
        if (Notification.permission === 'denied') return;

        if (Notification.permission === 'granted') {
            if (user?.id) {
                await syncPushSubscriptionForUser(user.id).catch(console.error);
            }
            await refreshPushBadge();
            return;
        }

        const result = await Notification.requestPermission();
        setNotifPermission(result);
        if (result === 'granted' && user?.id) {
            await syncPushSubscriptionForUser(user.id).catch(console.error);
        }
        await refreshPushBadge();
    };

    if (!user) return null;

    const dashPath = user.role === 'admin' ? '/admin' : user.role === 'contractor' ? '/contractor' : '/consultant';

    return (
        <>
            <Header />
            <div className="settings-container">
                <div className="settings-breadcrumb" onClick={() => navigate(dashPath)}>
                    <ChevronLeft size={16} />
                    <span>Back to Dashboard</span>
                </div>

                <div className="settings-header-enterprise">
                    <h1>Account Settings</h1>
                    <p>Manage your professional profile and security preferences.</p>
                </div>

                {/* Profile Section */}
                <section className="settings-section-enterprise">
                    <h2 className="settings-section-title">Personal Profile</h2>
                    <div className="settings-card-enterprise">
                        <div className="profile-summary-enterprise">
                            <div className="profile-avatar-enterprise">
                                {user.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                            </div>
                            <div className="profile-details-enterprise">
                                <h2>{user.name}</h2>
                                <span className="role-tag">{user.role}</span>
                            </div>
                        </div>
                        <div className="settings-item-enterprise">
                            <div className="settings-item-info">
                                <label>Email Address</label>
                                <p>{user.email}</p>
                            </div>
                            <button className="btn-enterprise-outline">Update Email</button>
                        </div>
                        <div className="settings-item-enterprise">
                            <div className="settings-item-info">
                                <label>Company Name</label>
                                <p>{user.company || 'ClearLine Inc.'}</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Security Section */}
                <section className="settings-section-enterprise">
                    <h2 className="settings-section-title">Security & Privacy</h2>
                    <div className="settings-card-enterprise">
                        <div className="settings-item-enterprise">
                            <div className="settings-item-info">
                                <p>Multi-Factor Authentication (MFA)</p>
                                <p className="item-desc">Secure your account with an extra layer of protection using an authenticator app.</p>
                                <div className={`security-status-badge ${!isMFAEnabled ? 'off' : ''}`}>
                                    {isMFAEnabled ? <Check size={12} /> : null}
                                    <span>{isMFAEnabled ? 'Protected' : 'Not Enabled'}</span>
                                </div>
                            </div>
                            <button className="btn-enterprise-outline" onClick={() => setMfaModalOpen(true)}>
                                {isMFAEnabled ? 'Manage MFA' : 'Set Up MFA'}
                            </button>
                        </div>
                        <div className="settings-item-enterprise">
                            <div className="settings-item-info">
                                <p>Account Password</p>
                                <p className="item-desc">Update your password to keep your account secure.</p>
                            </div>
                            <button className="btn-enterprise-outline">Change Password</button>
                        </div>
                    </div>
                </section>

                {/* Platform Section */}
                <section className="settings-section-enterprise">
                    <h2 className="settings-section-title">Platform Information</h2>
                    <div className="settings-card-enterprise">
                        <div className="settings-item-enterprise">
                            <div className="settings-item-info">
                                <p>App Version</p>
                                <p className="item-desc">ProWay Inspection Management System</p>
                            </div>
                            <p style={{ fontWeight: 700, color: '#64748b' }}>v1.4.0-shipping</p>
                        </div>
                        <div className="settings-item-enterprise">
                            <div className="settings-item-info">
                                <p>Cloud Sync</p>
                                <p className="item-desc">{isOffline ? 'Offline - Changes saved locally' : `Last synced: ${lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Just now'}`}</p>
                                <div className={`security-status-badge ${isOffline ? 'off' : ''}`} style={{ color: isOffline ? 'var(--clr-danger)' : 'var(--clr-success)', background: isOffline ? 'var(--clr-danger-bg)' : 'var(--clr-success-bg)' }}>
                                    {isOffline ? <WifiOff size={12} /> : <Wifi size={12} />}
                                    <span>{isOffline ? 'Connection Issue' : 'Active & Secure'}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <MFAEnrollmentModal isOpen={mfaModalOpen} onClose={() => setMfaModalOpen(false)} />
        </>
    );
}
