import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { LogOut, Menu, X, Building, Shield, User, Briefcase, UserCircle, LayoutDashboard, FileText, ClipboardList, Bell, Smartphone, GitBranch, ListChecks, ChevronDown, Wifi, WifiOff, BarChart2 } from 'lucide-react';
import { useRFI } from '../context/RFIContext';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';
import MFAEnrollmentModal from './MFAEnrollmentModal';
import { syncPushSubscriptionForUser } from '../utils/pushNotifications';

export default function Header() {
    const { user, logout } = useAuth();
    const { projects, activeProject, changeActiveProject } = useProject();
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [projectMenuOpen, setProjectMenuOpen] = useState(false);
    const [notifMenuOpen, setNotifMenuOpen] = useState(false);
    const [mfaModalOpen, setMfaModalOpen] = useState(false);
    const { mfaFactors } = useAuth();
    const isMFAEnabled = mfaFactors.some(f => f.status === 'verified');
    const [notifPermission, setNotifPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
    const { isOffline, lastSyncTime } = useRFI() || { isOffline: false, lastSyncTime: null };
    const [pushBadge, setPushBadge] = useState({ state: 'checking', label: 'Push: Checking' });
    
    // Refs for click-away detection
    const projectRef = useRef(null);
    const menuRef = useRef(null);
    const notifRef = useRef(null);

    if (!user) return null;

    const isContractor = user.role === 'contractor';
    const isAdmin = user.role === 'admin';
    const canManageNotifications = isContractor || user.role === 'consultant';
    const dashPath = isAdmin ? '/admin' : isContractor ? '/contractor' : '/consultant';
    const roleLabel = isAdmin ? 'Admin' : isContractor ? 'Contractor' : 'Consultant';
    const nameInitials = user.name
        ? user.name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0].toUpperCase())
            .join('')
        : 'U';

    const getNotificationButtonLabel = () => {
        if (notifPermission === 'granted') return 'Notifications Enabled';
        if (notifPermission === 'denied') return 'Notifications Blocked (Browser)';
        if (notifPermission === 'unsupported') return 'Notifications Not Supported';
        return 'Enable Notifications';
    };

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
        const safeRefresh = async () => {
            await refreshPushBadge();
        };

        safeRefresh();
        window.addEventListener('focus', safeRefresh);
        window.addEventListener('visibilitychange', safeRefresh);

        return () => {
            window.removeEventListener('focus', safeRefresh);
            window.removeEventListener('visibilitychange', safeRefresh);
        };
    }, [user?.id, refreshPushBadge]);

    useEffect(() => {
        // Defensive reset in case a modal/page left the body scroll lock behind.
        document.body.classList.remove('no-scroll');
    }, [location.pathname]);

    // Click-away listener for all header dropdowns
    useEffect(() => {
        const handleClickOutside = (event) => {
            // Close Project Menu if clicked outside
            if (projectMenuOpen && projectRef.current && !projectRef.current.contains(event.target)) {
                setProjectMenuOpen(false);
            }
            // Close User Menu if clicked outside
            if (menuOpen && menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
            // Close Notification Tray if clicked outside
            if (notifMenuOpen && notifRef.current && !notifRef.current.contains(event.target)) {
                setNotifMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [projectMenuOpen, menuOpen, notifMenuOpen]);

    const handleEnableNotifications = async () => {
        if (typeof Notification === 'undefined') {
            setNotifPermission('unsupported');
            return;
        }

        if (Notification.permission === 'denied') {
            setNotifPermission('denied');
            return;
        }

        if (Notification.permission === 'granted') {
            setNotifPermission('granted');
            if (user?.id) {
                await syncPushSubscriptionForUser(user.id).catch((error) => {
                    console.error('Error syncing push subscription:', error);
                });
            }
            await refreshPushBadge();
            return;
        }

        const result = await Notification.requestPermission();
        setNotifPermission(result);
        if (result === 'granted' && user?.id) {
            await syncPushSubscriptionForUser(user.id).catch((error) => {
                console.error('Error syncing push subscription:', error);
            });
            await refreshPushBadge();
            return;
        }

        await refreshPushBadge();
    };

    return (
        <>
            <header className="app-header">
                <div className="header-left" onClick={() => navigate(dashPath)} style={{ padding: '0.25rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <img src="/dashboardlogo.png" alt="ProWay Logo" className="header-logo-img" style={{ height: '38px', objectFit: 'contain' }} />
                    
                    {/* Connection Status Indicator */}
                    <div className={`network-status-indicator ${isOffline ? 'offline' : 'online'}`} title={isOffline ? 'Sync issue: Supabase unreachable' : `Connected. Last sync: ${lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Just now'}`}>
                        {isOffline ? (
                            <>
                                <WifiOff size={16} color="var(--clr-error)" />
                                <span style={{ fontSize: '0.7rem', color: 'var(--clr-error)', fontWeight: 600 }}>Sync Issue</span>
                            </>
                        ) : (
                            <Wifi size={16} color="var(--clr-success)" style={{ opacity: 0.6 }} />
                        )}
                    </div>
                </div>

                {/* Project Selector */}
                {activeProject && (
                    <div className="header-project-area" ref={projectRef}>
                        <button 
                            className="header-project-selector-pill"
                            onClick={() => {
                                setProjectMenuOpen(!projectMenuOpen);
                                setMenuOpen(false);
                                setNotifMenuOpen(false);
                            }}
                        >
                            <Building size={16} className="project-icon" />
                            <span className="project-name">{activeProject.name}</span>
                            <ChevronDown size={14} className={`chevron-icon ${projectMenuOpen ? 'open' : ''}`} />
                        </button>

                        {projectMenuOpen && (
                            <div className="header-project-dropdown">
                                <div className="header-project-dropdown-title">Select Project</div>
                                {projects.map((p) => (
                                    <button
                                        key={p.id}
                                        className={`header-dropdown-item ${p.id === activeProject.id ? 'active' : ''}`}
                                        onClick={() => {
                                            changeActiveProject(p.id);
                                            setProjectMenuOpen(false);
                                        }}
                                    >
                                        <Building size={16} />
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="header-user-info" ref={notifRef}>
                    <NotificationCenter 
                        isOpen={notifMenuOpen} 
                        onToggle={(val) => {
                            setNotifMenuOpen(val);
                            if (val) {
                                setMenuOpen(false);
                                setProjectMenuOpen(false);
                            }
                        }} 
                    />
                </div>

                <div className="header-divider"></div>

                <div className="header-menu-wrap" ref={menuRef}>
                    <button className="header-menu-btn" onClick={() => { 
                        const newState = !menuOpen;
                        setMenuOpen(newState); 
                        setProjectMenuOpen(false); 
                        setNotifMenuOpen(false);
                    }}>
                        {menuOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>

                    {menuOpen && (
                        <div className="header-dropdown">
                            <div className="header-dropdown-info">
                                <div className="header-identity-card">
                                    <div className="header-identity-avatar" aria-hidden="true">
                                        {nameInitials}
                                    </div>
                                    <div className="header-identity-meta">
                                        <div className="header-identity-name">{user.name}</div>
                                        <div className="header-identity-details">
                                            <div className="header-identity-detail">
                                                <Briefcase size={12} />
                                                <span>{user.company || 'ClearLine Inc.'}</span>
                                            </div>
                                            <div className="header-identity-detail">
                                                <User size={12} />
                                                <span className="header-identity-designation">{roleLabel}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        <button
                            onClick={() => { navigate(dashPath); setMenuOpen(false); }}
                            className={`header-dropdown-item ${location.pathname === dashPath ? 'active' : ''}`}
                        >
                            <LayoutDashboard size={16} /> Dashboard
                        </button>
                        {isContractor && (
                            <button
                                onClick={() => { navigate('/contractor/rfi-sheet'); setMenuOpen(false); }}
                                className={`header-dropdown-item ${location.pathname.includes('rfi-sheet') ? 'active' : ''}`}
                            >
                                <FileText size={16} /> Daily RFI Sheet
                            </button>
                        )}

                            {isContractor && (
                                <button
                                    onClick={() => { navigate('/contractor/summary'); setMenuOpen(false); }}
                                    className={`header-dropdown-item ${location.pathname.includes('/contractor/summary') ? 'active' : ''}`}
                                >
                                    <BarChart2 size={16} /> Summary
                                </button>
                            )}
                        {user.role === 'consultant' && (
                            <>
                                <button
                                    onClick={() => { navigate('/consultant/review'); setMenuOpen(false); }}
                                    className={`header-dropdown-item ${location.pathname.includes('review') ? 'active' : ''}`}
                                >
                                    <ClipboardList size={16} /> Review Queue
                                </button>
                                <button
                                    onClick={() => { navigate('/consultant/rejection-journey'); setMenuOpen(false); }}
                                    className={`header-dropdown-item ${location.pathname.includes('/consultant/rejection-journey') ? 'active' : ''}`}
                                >
                                    <GitBranch size={16} /> Rejection Journey
                                </button>
                                    <button
                                        onClick={() => { navigate('/consultant/summary'); setMenuOpen(false); }}
                                        className={`header-dropdown-item ${location.pathname.includes('/consultant/summary') ? 'active' : ''}`}
                                    >
                                        <BarChart2 size={16} /> Summary
                                    </button>
                            </>
                        )}
                        {isAdmin && (
                            <>
                                <button
                                    onClick={() => { navigate('/admin/users'); setMenuOpen(false); }}
                                    className={`header-dropdown-item ${location.pathname === '/admin/users' ? 'active' : ''}`}
                                >
                                    <UserCircle size={16} /> Users
                                </button>
                                <button
                                    onClick={() => { navigate('/admin/export-format'); setMenuOpen(false); }}
                                    className={`header-dropdown-item ${location.pathname === '/admin/export-format' ? 'active' : ''}`}
                                >
                                    <Shield size={16} /> Project Export Format
                                </button>
                                <button
                                    onClick={() => { navigate('/admin/registered-devices'); setMenuOpen(false); }}
                                    className={`header-dropdown-item ${location.pathname === '/admin/registered-devices' ? 'active' : ''}`}
                                >
                                    <Smartphone size={16} /> Registered Devices
                                </button>
                            </>
                        )}
                        <div className="header-dropdown-divider" style={{ height: '1px', background: 'var(--clr-border)', margin: '0.25rem 0' }}></div>
                        <button
                            onClick={() => { setMfaModalOpen(true); setMenuOpen(false); }}
                            className="header-dropdown-item"
                        >
                            <Shield size={16} /> 
                            <span>Security & MFA</span>
                            {isMFAEnabled && (
                                <span style={{ 
                                    marginLeft: 'auto', 
                                    background: 'var(--clr-success)', 
                                    color: '#fff', 
                                    fontSize: '0.65rem', 
                                    padding: '2px 6px', 
                                    borderRadius: '10px',
                                    fontWeight: 700
                                }}>ON</span>
                            )}
                        </button>

                        {canManageNotifications && (
                            <div className="menu-alert-section">
                                <div 
                                    className={`menu-alert-row ${pushBadge.state === 'blocked' ? 'blocked' : ''}`} 
                                    onClick={handleEnableNotifications}
                                >
                                    <div className="menu-alert-info">
                                        <Bell size={18} />
                                        <span>{pushBadge.state === 'blocked' ? 'Notifications Blocked' : 'Real-time Alerts'}</span>
                                    </div>
                                    {pushBadge.state === 'blocked' ? (
                                        <span className="menu-fix-link">Fix</span>
                                    ) : (
                                        <div className={`menu-alert-toggle ${pushBadge.state === 'subscribed' ? 'subscribed' : ''}`}>
                                            <div className="toggle-handle"></div>
                                        </div>
                                    )}
                                </div>
                                {pushBadge.state === 'blocked' && (
                                    <div className="notif-blocked-hint">
                                        To re-enable: click the <strong>lock icon</strong> in your address bar → <em>Notifications</em> → Allow.
                                    </div>
                                )}
                            </div>
                        )}
                        <button onClick={() => { logout(); navigate('/'); }} className="header-dropdown-item logout">
                            <LogOut size={16} /> Sign Out
                        </button>
                    </div>
                )}
                </div>
            </header>
            <MFAEnrollmentModal isOpen={mfaModalOpen} onClose={() => setMfaModalOpen(false)} />
        </>
    );
}
