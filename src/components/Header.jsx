import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import {
    Menu, X, Briefcase, UserCircle,
    LayoutGrid, ScrollText, ListChecks, Activity, ChevronDown,
    Building2, Database, FileSpreadsheet, Archive,
    BarChart3, Settings2, LifeBuoy, Edit2,
    ShieldCheck, Power, GitBranch, Smartphone, FileSearch
} from 'lucide-react';
import { useRFI } from '../context/RFIContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';
import MFAEnrollmentModal from './MFAEnrollmentModal';
import { toast } from 'react-hot-toast';
import { syncPushSubscriptionForUser, unregisterCurrentPushSubscription } from '../utils/pushNotifications';

let desktopSidebarShouldStayOpen = false;
const DESKTOP_OVERLAY_SELECTORS = [
    '.modal-overlay',
    '.action-sheet-overlay.open',
    '.dm-modal-overlay',
    '.notif-overlay-v2',
    '.markup-studio-overlay',
    '.filter-sidebar-overlay.open',
    '.rfi-archive-preview-backdrop',
    '.rfi-archive-bulk-overlay',
].join(', ');

export default function Header() {
    const { user, logout, mfaFactors } = useAuth();
    const { projects, activeProject, changeActiveProject, contractorPermissions, checkProjectAccess } = useProject();
    const { notifications } = useRFI() || { notifications: [] };
    const navigate = useNavigate();
    const location = useLocation();

    const [menuOpen, setMenuOpen] = useState(false);
    const [projectMenuOpen, setProjectMenuOpen] = useState(false);
    const [notifMenuOpen, setNotifMenuOpen] = useState(false);
    const [mfaModalOpen, setMfaModalOpen] = useState(false);
    const [notifPermission, setNotifPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
    const [pushBadge, setPushBadge] = useState({ state: 'checking', label: 'Push: Checking' });
    const [desktopSidebarExpanded, setDesktopSidebarExpanded] = useState(desktopSidebarShouldStayOpen);
    const [desktopOverlayActive, setDesktopOverlayActive] = useState(false);

    const projectRef = useRef(null);
    const menuRef = useRef(null);
    const notifRef = useRef(null);

    if (!user) return null;

    const isContractor = user.role === 'contractor';
    const isAdmin = user.role === 'admin';
    const isConsultant = user.role === 'consultant';
    const isMFAEnabled = mfaFactors.some((factor) => factor.status === 'verified');
    const dashPath = isAdmin ? '/admin' : isContractor ? '/contractor' : '/consultant';
    const roleLabel = isAdmin ? 'Admin' : isContractor ? 'Contractor' : 'Consultant';
    const projectAccess = checkProjectAccess();
    const supportOnlyAccess = !isAdmin && !projectAccess.allowed && (projectAccess.reason === 'locked' || projectAccess.reason === 'expired');
    const nameInitials = user.name
        ? user.name
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0].toUpperCase())
            .join('')
        : 'U';

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
        document.body.classList.remove('no-scroll');
    }, [location.pathname]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

        const syncDesktopOverlayState = () => {
            const hasActiveOverlay = Array.from(document.querySelectorAll(DESKTOP_OVERLAY_SELECTORS)).some((element) => {
                const style = window.getComputedStyle(element);
                return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
            });
            setDesktopOverlayActive(hasActiveOverlay);
        };

        syncDesktopOverlayState();

        const observer = new MutationObserver(syncDesktopOverlayState);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style'],
        });

        window.addEventListener('resize', syncDesktopOverlayState);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', syncDesktopOverlayState);
        };
    }, [location.pathname]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (projectMenuOpen && projectRef.current && !projectRef.current.contains(event.target)) {
                setProjectMenuOpen(false);
            }
            if (menuOpen && menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
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

        if (pushBadge.state === 'subscribed') {
            try {
                if (user?.id) {
                    const res = await unregisterCurrentPushSubscription(user.id);
                    if (res.status === 'removed') toast.success('Push notifications disabled.');
                }
            } catch (err) {
                console.error('Error unsubscribing:', err);
                toast.error('Failed to disable push notifications.');
            }
            await refreshPushBadge();
            return;
        }

        if (Notification.permission === 'granted') {
            setNotifPermission('granted');
            if (user?.id) {
                try {
                    const res = await syncPushSubscriptionForUser(user.id);
                    if (res.status === 'missing-vapid-key') toast.error('System Error: Missing VAPID Key.');
                    else if (res.status === 'registered') toast.success('Push notifications enabled!');
                    else toast.error(`Failed to subscribe: ${res.status}`);
                } catch (error) {
                    console.error('Error syncing push subscription:', error);
                    toast.error(`Failed to sync: ${error.message || error.statusText || 'Unknown error'}`);
                }
            }
            await refreshPushBadge();
            return;
        }

        const result = await Notification.requestPermission();
        setNotifPermission(result);
        if (result === 'granted' && user?.id) {
            try {
                const res = await syncPushSubscriptionForUser(user.id);
                if (res.status === 'missing-vapid-key') toast.error('System Error: Missing VAPID Key.');
                else if (res.status === 'registered') toast.success('Push notifications enabled!');
                else toast.error(`Failed to subscribe: ${res.status}`);
            } catch (error) {
                console.error('Error syncing push subscription:', error);
                toast.error(`Failed to subscribe: ${error.message || error.statusText || 'Unknown error'}`);
            }
        } else if (result === 'denied') {
            toast.error('Permission denied. Please enable notifications in your browser settings.');
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

    const navSections = useMemo(() => {
        const sections = [
            {
                label: 'Overview',
                items: [
                    {
                        label: 'Dashboard',
                        path: dashPath,
                        icon: LayoutGrid,
                        active: location.pathname === dashPath,
                    },
                ],
            },
        ];

        if (isContractor) {
            sections.push({
                label: 'Workspace',
                items: [
                    {
                        label: 'Daily RFI Sheet',
                        path: '/contractor/rfi-sheet',
                        icon: ScrollText,
                        active: location.pathname.includes('rfi-sheet'),
                    },
                    ...(contractorPermissions.canManageContractorPermissions
                        ? [{
                            label: 'Team Access',
                            path: '/contractor/team',
                            icon: Briefcase,
                            active: location.pathname.includes('/contractor/team'),
                        }]
                        : []),
                    {
                        label: 'Summary',
                        path: '/contractor/summary',
                        icon: BarChart3,
                        active: location.pathname.includes('/contractor/summary'),
                    },
                    {
                        label: 'RFI Archive',
                        path: '/contractor/archive',
                        icon: Archive,
                        active: location.pathname.includes('/contractor/archive'),
                    },
                ],
            });
        }

        if (isConsultant) {
            sections.push({
                label: 'Review',
                items: [
                    {
                        label: 'Review RFI',
                        path: '/consultant/review',
                        icon: FileSearch,
                        active: location.pathname.includes('/consultant/review'),
                    },
                    {
                        label: 'Rejection Journey',
                        path: '/consultant/rejection-journey',
                        icon: GitBranch,
                        active: location.pathname.includes('/consultant/rejection-journey'),
                    },
                    {
                        label: 'Summary',
                        path: '/consultant/summary',
                        icon: BarChart3,
                        active: location.pathname.includes('/consultant/summary'),
                    },
                    {
                        label: 'RFI Archive',
                        path: '/consultant/archive',
                        icon: Archive,
                        active: location.pathname.includes('/consultant/archive'),
                    },
                ],
            });
        }

        if (isAdmin) {
            sections.push({
                label: 'Administration',
                items: [
                    {
                        label: 'Users',
                        path: '/admin/users',
                        icon: UserCircle,
                        active: location.pathname === '/admin/users',
                    },
                    {
                        label: 'Daily Summary PDF',
                        path: '/admin/export-format',
                        icon: FileSpreadsheet,
                        active: location.pathname === '/admin/export-format',
                    },
                    {
                        label: 'RFI Templates',
                        path: '/admin/rfi-templates',
                        icon: FileSpreadsheet,
                        active: location.pathname === '/admin/rfi-templates',
                    },
                    {
                        label: 'Devices',
                        path: '/admin/registered-devices',
                        icon: Smartphone,
                        active: location.pathname === '/admin/registered-devices',
                    },
                    {
                        label: 'Data Manager',
                        path: '/admin/data-manager',
                        icon: Database,
                        active: location.pathname === '/admin/data-manager',
                    },
                ],
            });
        }

        return sections;
    }, [contractorPermissions.canManageContractorPermissions, dashPath, isAdmin, isConsultant, isContractor, location.pathname]);

    const mobileNavItems = navSections.flatMap((section) => section.items);

    return (
        <>
            <aside
                className={`desktop-sidebar-nav desktop-only ${desktopSidebarExpanded ? 'expanded' : ''} ${desktopOverlayActive ? 'overlay-active' : ''}`}
                aria-label="Desktop navigation"
                onMouseEnter={() => {
                    desktopSidebarShouldStayOpen = true;
                    setDesktopSidebarExpanded(true);
                }}
                onMouseLeave={() => {
                    desktopSidebarShouldStayOpen = false;
                    setDesktopSidebarExpanded(false);
                }}
            >
                <button className="desktop-sidebar-brand" onClick={() => handleMenuNavigation(dashPath)}>
                    <img
                        src="/dashboardlogo.png"
                        alt="ProWay Logo"
                        className="desktop-sidebar-brand-logo"
                    />
                </button>

                <div className="desktop-sidebar-scroll">
                    {navSections.map((section) => (
                        <div key={section.label || 'default'} className="desktop-sidebar-section">
                            <div className="desktop-sidebar-section-items">
                                {section.items.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.path}
                                            onClick={() => handleMenuNavigation(item.path)}
                                            className={`desktop-sidebar-item ${item.active ? 'active' : ''}`}
                                        >
                                            <span className="desktop-sidebar-item-icon">
                                                <Icon size={18} strokeWidth={1.8} />
                                            </span>
                                            <span className="desktop-sidebar-item-label">{item.label}</span>
                                            <ChevronDown size={14} className="desktop-sidebar-item-caret" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </aside>

            <header className="app-header">
                <div className="header-left mobile-only">
                    <img
                        src="/dashboardlogo.png"
                        alt="ProWay Logo"
                        className="header-logo-img"
                        onClick={() => handleMenuNavigation(dashPath)}
                    />
                </div>

                <div className="header-right-group">
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
                                    {projects.map((project) => (
                                        <button
                                            key={project.id}
                                            className={`header-dropdown-item ${project.id === activeProject.id ? 'active' : ''}`}
                                            onClick={() => {
                                                changeActiveProject(project.id);
                                                setProjectMenuOpen(false);
                                            }}
                                        >
                                            <Building2 size={18} strokeWidth={2} />
                                            {project.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="header-user-info" ref={notifRef}>
                        <NotificationCenter
                            isOpen={notifMenuOpen}
                            onToggle={(value) => {
                                setNotifMenuOpen(value);
                                if (value) {
                                    setMenuOpen(false);
                                    setProjectMenuOpen(false);
                                }
                            }}
                        />
                    </div>

                    <div className="header-menu-wrap" ref={menuRef}>
                        <button
                            className="header-menu-btn mobile-only"
                            onClick={() => {
                                const nextState = !menuOpen;
                                setMenuOpen(nextState);
                                setProjectMenuOpen(false);
                                setNotifMenuOpen(false);
                            }}
                        >
                            {menuOpen ? <X size={22} strokeWidth={2} /> : <Menu size={22} strokeWidth={2} />}
                        </button>

                        <button
                            className="header-user-trigger desktop-only"
                            onClick={() => {
                                const nextState = !menuOpen;
                                setMenuOpen(nextState);
                                setProjectMenuOpen(false);
                                setNotifMenuOpen(false);
                            }}
                        >
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
                                        onClick={supportOnlyAccess ? undefined : () => handleMenuNavigation('/profile')}
                                        style={{ cursor: supportOnlyAccess ? 'default' : 'pointer', opacity: supportOnlyAccess ? 0.72 : 1 }}
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

                                <div className="menu-section mobile-nav-items">
                                    {mobileNavItems.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <button
                                                key={item.path}
                                                onClick={() => handleMenuNavigation(item.path)}
                                                className={`header-dropdown-item-premium ${item.active ? 'active' : ''}`}
                                            >
                                                <div className="menu-icon-box"><Icon size={18} strokeWidth={1.5} /></div>
                                                <span>{item.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="menu-divider"></div>

                                <div className="menu-section">
                                    <div className="premium-toggle-item" onClick={handleEnableNotifications} style={{ cursor: 'pointer' }}>
                                        <div className="premium-toggle-label">
                                            <div className="menu-icon-box"><Activity size={18} strokeWidth={1.5} /></div>
                                            <span>Push Notifications</span>
                                        </div>
                                        <label className="premium-switch" onClick={(event) => event.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={pushBadge.state === 'subscribed'}
                                                onChange={handleEnableNotifications}
                                            />
                                            <span className="premium-slider"></span>
                                        </label>
                                    </div>

                                    {!isAdmin && !supportOnlyAccess && (
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

                                    {!supportOnlyAccess && (
                                        <button
                                            onClick={() => handleMenuNavigation('/settings')}
                                            className={`header-dropdown-item-premium ${location.pathname === '/settings' ? 'active' : ''}`}
                                        >
                                            <div className="menu-icon-box"><Settings2 size={18} strokeWidth={1.5} /></div>
                                            <span>Settings</span>
                                        </button>
                                    )}
                                </div>

                                <div className="menu-divider"></div>

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
