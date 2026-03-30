import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { 
    LogOut, Menu, X, Building, Shield, User, Briefcase, UserCircle, 
    LayoutGrid, ScrollText, ListChecks, BellRing, Smartphone, 
    GitBranch, BarChart3, Settings2, LifeBuoy, Edit2, 
    ShieldCheck, Power, Activity, ChevronDown, Info, Building2, Database
} from 'lucide-react';
import { useRFI } from '../context/RFIContext';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';
import MFAEnrollmentModal from './MFAEnrollmentModal';
import { toast } from 'react-hot-toast';
import { syncPushSubscriptionForUser, unregisterCurrentPushSubscription } from '../utils/pushNotifications';

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
    const { notifications } = useRFI() || { notifications: [] };
    const [pushBadge, setPushBadge] = useState({ state: 'checking', label: 'Push: Checking' });
    const [pushEnabled, setPushEnabled] = useState(true);
    
    // Refs for click-away detection
    const projectRef = useRef(null);
    const menuRef = useRef(null);
    const notifRef = useRef(null);

    if (!user) return null;

    const isContractor = user.role === 'contractor';
    const isAdmin = user.role === 'admin';
    const isConsultant = user.role === 'consultant';
    const canManageNotifications = isContractor || isConsultant;
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
        if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            toast.error("Push notifications are not supported on this browser. On iOS, try 'Add to Home Screen'.");
            setNotifPermission('unsupported');
            return;
        }

        // Handle Unsubscribe
        if (pushBadge.state === 'subscribed') {
            try {
                if (user?.id) {
                    const res = await unregisterCurrentPushSubscription(user.id);
                    if (res.status === 'removed') toast.success("Push notifications disabled.");
                }
            } catch (err) {
                console.error('Error unsubscribing:', err);
                toast.error("Failed to disable push notifications.");
            }
            await refreshPushBadge();
            return;
        }

        // Handle ALREADY granted OS permission but no active subscription
        if (Notification.permission === 'granted') {
            setNotifPermission('granted');
            if (user?.id) {
                try {
                    const res = await syncPushSubscriptionForUser(user.id);
                    if (res.status === 'missing-vapid-key') toast.error("System Error: Missing VAPID Key.");
                    else if (res.status === 'registered') toast.success("Push notifications enabled!");
                    else toast.error("Failed to subscribe: " + res.status);
                } catch (error) {
                    console.error('Error syncing push subscription:', error);
                    toast.error(`Failed to sync: ${error.message || error.statusText || 'Unknown error'}`);
                }
            }
            await refreshPushBadge();
            return;
        }

        // Handle requesting NEW permission
        const result = await Notification.requestPermission();
        setNotifPermission(result);
        if (result === 'granted' && user?.id) {
            try {
                const res = await syncPushSubscriptionForUser(user.id);
                if (res.status === 'missing-vapid-key') toast.error("System Error: Missing VAPID Key.");
                else if (res.status === 'registered') toast.success("Push notifications enabled!");
                else toast.error("Failed to subscribe: " + res.status);
            } catch (error) {
                console.error('Error syncing push subscription:', error);
                toast.error(`Failed to subscribe: ${error.message || error.statusText || 'Unknown error'}`);
            }
            await refreshPushBadge();
            return;
        } else if (result === 'denied') {
            toast.error("Permission denied. Please enable notifications in your browser settings.");
        }

        await refreshPushBadge();
    };

    const handleMenuNavigation = (targetPath) => {
        if (location.pathname === targetPath) {
            setMenuOpen(false);
            return;
        }

        navigate(targetPath);
        setMenuOpen(false);
    };

    return (
        <>
            <header className="app-header">
                <div className="header-left">
                    <img 
                        src="/dashboardlogo.png" 
                        alt="ProWay Logo" 
                        className="header-logo-img" 
                        onClick={() => handleMenuNavigation(dashPath)}
                    />
                    
                    {/* Desktop Horizontal Navigation */}
                    <nav className="header-desktop-nav">
                        <button
                            onClick={() => handleMenuNavigation(dashPath)}
                            className={`desktop-nav-link ${location.pathname === dashPath ? 'active' : ''}`}
                        >
                            Dashboard
                        </button>

                        {isContractor && (
                            <button
                                onClick={() => handleMenuNavigation('/contractor/rfi-sheet')}
                                className={`desktop-nav-link ${location.pathname.includes('rfi-sheet') ? 'active' : ''}`}
                            >
                                Daily RFI Sheet
                            </button>
                        )}

                        {isConsultant && (
                            <>
                                <button
                                    onClick={() => handleMenuNavigation('/consultant/review')}
                                    className={`desktop-nav-link ${location.pathname.includes('review') ? 'active' : ''}`}
                                >
                                    Review RFI
                                </button>
                                <button
                                    onClick={() => handleMenuNavigation('/consultant/rejection-journey')}
                                    className={`desktop-nav-link ${location.pathname.includes('rejection-journey') ? 'active' : ''}`}
                                >
                                    Rejection Journey
                                </button>
                            </>
                        )}

                        {(isConsultant || isContractor) && (
                            <button
                                onClick={() => { 
                                    const path = isContractor ? '/contractor/summary' : '/consultant/summary';
                                    handleMenuNavigation(path); 
                                }}
                                className={`desktop-nav-link ${location.pathname.includes('summary') ? 'active' : ''}`}
                            >
                                Summary
                            </button>
                        )}

                        {isAdmin && (
                            <>
                                <button
                                    onClick={() => handleMenuNavigation('/admin/users')}
                                    className={`desktop-nav-link ${location.pathname === '/admin/users' ? 'active' : ''}`}
                                >
                                    Users
                                </button>
                                <button
                                    onClick={() => handleMenuNavigation('/admin/export-format')}
                                    className={`desktop-nav-link ${location.pathname === '/admin/export-format' ? 'active' : ''}`}
                                >
                                    Export Format
                                </button>
                                <button
                                    onClick={() => handleMenuNavigation('/admin/registered-devices')}
                                    className={`desktop-nav-link ${location.pathname === '/admin/registered-devices' ? 'active' : ''}`}
                                >
                                    Devices
                                </button>
                                <button
                                    onClick={() => handleMenuNavigation('/admin/data-manager')}
                                    className={`desktop-nav-link ${location.pathname === '/admin/data-manager' ? 'active' : ''}`}
                                >
                                    Data Manager
                                </button>
                            </>
                        )}
                    </nav>
                </div>

                <div className="header-right-group">
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
                                <Building2 size={20} className="project-icon" strokeWidth={2} />
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
                                            <Building2 size={18} strokeWidth={2} />
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

                    <div className="header-menu-wrap" ref={menuRef}>
                        {/* Mobile Hamburger Button */}
                        <button className="header-menu-btn mobile-only" onClick={() => { 
                            const newState = !menuOpen;
                            setMenuOpen(newState); 
                            setProjectMenuOpen(false); 
                            setNotifMenuOpen(false);
                        }}>
                            {menuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
                        </button>

                        {/* Desktop User Identity Trigger (Avatar + Name) */}
                        <button className="header-user-trigger desktop-only" onClick={() => {
                            const newState = !menuOpen;
                            setMenuOpen(newState);
                            setProjectMenuOpen(false);
                            setNotifMenuOpen(false);
                        }}>
                            <div className="header-avatar-mini">
                                {user.avatar_url ? (
                                    <img src={user.avatar_url} alt={user.name} />
                                ) : (
                                    nameInitials
                                )}
                            </div>
                            <span className="header-user-name">{user.name || 'User'}</span>
                            <ChevronDown size={14} className={`chevron-icon ${menuOpen ? 'open' : ''}`} />
                        </button>

                        {menuOpen && (
                            <div className="header-dropdown premium-menu">
                            <div className="header-dropdown-info">
                                <div 
                                    className="header-identity-card-premium" 
                                    onClick={() => handleMenuNavigation('/profile')}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <div className="header-identity-avatar-premium" aria-hidden="true">
                                        {user.avatar_url ? (
                                            <img 
                                                src={user.avatar_url} 
                                                alt={user.name} 
                                                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} 
                                            />
                                        ) : (
                                            nameInitials
                                        )}
                                        <div className="avatar-edit-icon"><Edit2 size={10} /></div>
                                    </div>
                                    <div className="header-identity-meta-premium">
                                        <div className="header-identity-name-premium">{user.name}</div>
                                        <div className="header-identity-title-premium">{user.company || 'ClearLine Inc.'} • {roleLabel}</div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Section 1: Core Navigation (Mobile Only) */}
                            <div className="menu-section mobile-nav-items">
                                <button
                                    onClick={() => handleMenuNavigation(dashPath)}
                                    className={`header-dropdown-item-premium ${location.pathname === dashPath ? 'active' : ''}`}
                                >
                                    <div className="menu-icon-box"><LayoutGrid size={18} strokeWidth={1.5} /></div>
                                    <span>Dashboard</span>
                                </button>

                                {isContractor && (
                                    <button
                                        onClick={() => handleMenuNavigation('/contractor/rfi-sheet')}
                                        className={`header-dropdown-item-premium ${location.pathname.includes('rfi-sheet') ? 'active' : ''}`}
                                    >
                                        <div className="menu-icon-box"><ScrollText size={18} strokeWidth={1.5} /></div>
                                        <span>Daily RFI Sheet</span>
                                    </button>
                                )}

                                {isConsultant && (
                                    <button
                                        onClick={() => handleMenuNavigation('/consultant/review')}
                                        className={`header-dropdown-item-premium ${location.pathname.includes('review') ? 'active' : ''}`}
                                    >
                                        <div className="menu-icon-box"><ListChecks size={18} strokeWidth={1.5} /></div>
                                        <span>Review RFI</span>
                                    </button>
                                )}

                                {isConsultant && (
                                    <button
                                        onClick={() => handleMenuNavigation('/consultant/rejection-journey')}
                                        className={`header-dropdown-item-premium ${location.pathname.includes('/consultant/rejection-journey') ? 'active' : ''}`}
                                    >
                                        <div className="menu-icon-box"><GitBranch size={18} strokeWidth={1.5} /></div>
                                        <span>Rejection Journey</span>
                                    </button>
                                )}

                                {(isConsultant || isContractor) && (
                                    <button
                                        onClick={() => { 
                                            const path = isContractor ? '/contractor/summary' : '/consultant/summary';
                                            handleMenuNavigation(path); 
                                        }}
                                        className={`header-dropdown-item-premium ${location.pathname.includes('summary') ? 'active' : ''}`}
                                    >
                                        <div className="menu-icon-box"><BarChart3 size={18} strokeWidth={1.5} /></div>
                                        <span>Summary</span>
                                    </button>
                                )}

                                {isAdmin && (
                                    <>
                                        <button
                                            onClick={() => handleMenuNavigation('/admin/users')}
                                            className={`header-dropdown-item-premium ${location.pathname === '/admin/users' ? 'active' : ''}`}
                                        >
                                            <div className="menu-icon-box"><UserCircle size={18} strokeWidth={1.5} /></div>
                                            <span>Users</span>
                                        </button>
                                        <button
                                            onClick={() => handleMenuNavigation('/admin/export-format')}
                                            className={`header-dropdown-item-premium ${location.pathname === '/admin/export-format' ? 'active' : ''}`}
                                        >
                                            <div className="menu-icon-box"><Shield size={18} strokeWidth={1.5} /></div>
                                            <span>Project Export Format</span>
                                        </button>
                                        <button
                                            onClick={() => handleMenuNavigation('/admin/registered-devices')}
                                            className={`header-dropdown-item-premium ${location.pathname === '/admin/registered-devices' ? 'active' : ''}`}
                                        >
                                            <div className="menu-icon-box"><Smartphone size={18} strokeWidth={1.5} /></div>
                                            <span>Registered Devices</span>
                                        </button>
                                        <button
                                            onClick={() => handleMenuNavigation('/admin/data-manager')}
                                            className={`header-dropdown-item-premium ${location.pathname === '/admin/data-manager' ? 'active' : ''}`}
                                        >
                                            <div className="menu-icon-box"><Database size={18} strokeWidth={1.5} /></div>
                                            <span>Data Manager</span>
                                        </button>
                                    </>
                                )}
                            </div>

                            <div className="menu-divider"></div>

                            {/* Section 2: Account & Updates */}
                            <div className="menu-section">
                                <div className="premium-toggle-item" onClick={handleEnableNotifications} style={{ cursor: 'pointer' }}>
                                    <div className="premium-toggle-label">
                                        <div className="menu-icon-box"><Activity size={18} strokeWidth={1.5} /></div>
                                        <span>Push Notifications</span>
                                    </div>
                                    <label className="premium-switch" onClick={(e) => e.stopPropagation()}>
                                        <input 
                                            type="checkbox" 
                                            checked={pushBadge.state === 'subscribed'} 
                                            onChange={handleEnableNotifications} 
                                        />
                                        <span className="premium-slider"></span>
                                    </label>
                                </div>
                                
                                {!isAdmin && (
                                    <button
                                        onClick={() => handleMenuNavigation('/subscription')}
                                        className={`header-dropdown-item-premium ${location.pathname === '/subscription' ? 'active' : ''}`}
                                    >
                                        <div className="menu-icon-box"><ShieldCheck size={18} strokeWidth={1.5} /></div>
                                        <span>Subscription</span>
                                        <div className="menu-badge-group">
                                            <span className={`menu-badge-status ${activeProject?.subscription_status || 'trial'}`}>
                                                {activeProject?.subscription_status || 'trial'}
                                            </span>
                                        </div>
                                    </button>
                                )}

                                <button
                                    onClick={() => handleMenuNavigation('/settings')}
                                    className={`header-dropdown-item-premium ${location.pathname === '/settings' ? 'active' : ''}`}
                                >
                                    <div className="menu-icon-box"><Settings2 size={18} strokeWidth={1.5} /></div>
                                    <span>Settings</span>
                                </button>
                            </div>

                            <div className="menu-divider"></div>

                            {/* Section 3: Support & Leave */}
                            <div className="menu-section">
                                <button 
                                    onClick={() => handleMenuNavigation('/support')}
                                    className={`header-dropdown-item-premium ${location.pathname === '/support' ? 'active' : ''}`}
                                >
                                    <div className="menu-icon-box"><LifeBuoy size={18} strokeWidth={1.5} /></div>
                                    <span>{isAdmin ? 'Support' : 'Help & Support'}</span>
                                </button>

                                <button onClick={() => { logout(); navigate('/'); }} className="header-dropdown-item-premium logout">
                                    <div className="menu-icon-box"><Power size={18} strokeWidth={1.5} /></div>
                                    <span>Sign Out</span>
                                </button>
                        </div>
                    </div>
                )}
                </div>
            </div>
        </header>
            <div className="app-header-spacer"></div>
            <MFAEnrollmentModal isOpen={mfaModalOpen} onClose={() => setMfaModalOpen(false)} />
        </>
    );
}
