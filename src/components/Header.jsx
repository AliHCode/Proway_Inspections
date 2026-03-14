import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { LogOut, Menu, X, Building, Shield, User, Briefcase, UserCircle, LayoutDashboard, FileText, ClipboardList, Bell, Smartphone, GitBranch, ListChecks } from 'lucide-react';
import { BarChart2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';
import { syncPushSubscriptionForUser } from '../utils/pushNotifications';

export default function Header() {
    const { user, logout } = useAuth();
    const { projects, activeProject, changeActiveProject } = useProject();
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [projectMenuOpen, setProjectMenuOpen] = useState(false);
    const [notifPermission, setNotifPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
    const [pushBadge, setPushBadge] = useState({ state: 'checking', label: 'Push: Checking' });

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
        <header className="app-header">
            <div className="header-left" onClick={() => navigate(dashPath)} style={{ padding: '0.25rem 0' }}>
                <img src="/dashboardlogo.png" alt="ProWay Logo" className="header-logo-img" style={{ height: '50px', objectFit: 'contain' }} />
            </div>

            {/* Project Selector */}
            {activeProject && (
                <div className="header-project-area">
                    <div className="header-project-selector">
                        <Building size={16} color="var(--clr-text-muted)" />
                        <select
                            value={activeProject.id}
                            onChange={(e) => changeActiveProject(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.9rem', fontWeight: '500', color: 'var(--clr-text-main)', outline: 'none', cursor: 'pointer' }}
                        >
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        className="header-project-icon-btn"
                        onClick={() => {
                            setProjectMenuOpen(!projectMenuOpen);
                            setMenuOpen(false);
                        }}
                        aria-label="Switch project"
                    >
                        <Building size={18} />
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

            <div className="header-user-info">
                <span className={`push-status-chip ${pushBadge.state}`}>{pushBadge.label}</span>
                <NotificationCenter />
            </div>

            <div className="header-divider"></div>

            <button className="header-menu-btn" onClick={() => { setMenuOpen(!menuOpen); setProjectMenuOpen(false); }}>
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
                            onClick={() => { navigate('/contractor/rfi-status-tracker'); setMenuOpen(false); }}
                            className={`header-dropdown-item ${location.pathname.includes('/contractor/rfi-status-tracker') ? 'active' : ''}`}
                        >
                            <ListChecks size={16} /> RFI Status Tracker
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
                    {canManageNotifications && (
                        <>
                            <button
                                onClick={handleEnableNotifications}
                                className={`header-dropdown-item notify ${notifPermission === 'granted' ? 'active' : ''}`}
                                disabled={notifPermission === 'unsupported' || notifPermission === 'denied'}
                            >
                                <Bell size={16} /> {getNotificationButtonLabel()}
                            </button>
                            {notifPermission === 'denied' && (
                                <div className="notif-blocked-hint">
                                    To re-enable: click the <strong>lock / info icon</strong> in your browser address bar → <em>Notifications</em> → Allow, then reload.
                                </div>
                            )}
                        </>
                    )}
                    <button onClick={() => { logout(); navigate('/'); }} className="header-dropdown-item logout">
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            )}
        </header>
    );
}
