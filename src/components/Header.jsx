import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { LogOut, Menu, X, Building, Shield, User, Briefcase, UserCircle, LayoutDashboard, FileText, ClipboardList, Bell } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';

export default function Header() {
    const { user, logout } = useAuth();
    const { projects, activeProject, changeActiveProject } = useProject();
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [projectMenuOpen, setProjectMenuOpen] = useState(false);
    const [notifPermission, setNotifPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

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
            return;
        }

        const result = await Notification.requestPermission();
        setNotifPermission(result);
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
                    {user.role === 'consultant' && (
                        <>
                            <button
                                onClick={() => { navigate('/consultant/review'); setMenuOpen(false); }}
                                className={`header-dropdown-item ${location.pathname.includes('review') ? 'active' : ''}`}
                            >
                                <ClipboardList size={16} /> Review Queue
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
                        </>
                    )}
                    {canManageNotifications && (
                        <button
                            onClick={handleEnableNotifications}
                            className={`header-dropdown-item notify ${notifPermission === 'granted' ? 'active' : ''}`}
                            disabled={notifPermission === 'unsupported'}
                        >
                            <Bell size={16} /> {getNotificationButtonLabel()}
                        </button>
                    )}
                    <button onClick={() => { logout(); navigate('/'); }} className="header-dropdown-item logout">
                        <LogOut size={16} /> Sign Out
                    </button>
                </div>
            )}
        </header>
    );
}
