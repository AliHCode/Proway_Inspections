import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { LogOut, Menu, X, Building, Shield } from 'lucide-react';
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

    if (!user) return null;

    const isContractor = user.role === 'contractor';
    const isAdmin = user.role === 'admin';
    const dashPath = isAdmin ? '/admin' : isContractor ? '/contractor' : '/consultant';
    const roleLabel = isAdmin ? 'Admin' : isContractor ? 'Contractor' : 'Consultant';

    return (
        <header className="app-header">
            <div className="header-left" onClick={() => navigate(dashPath)} style={{ padding: '0.25rem 0' }}>
                <img src="/dashboardlogo.png" alt="ProWay Logo" style={{ height: '40px', objectFit: 'contain' }} />
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
                        <strong>{user.name}</strong>
                        <span>{user.company}</span>
                        <span className="header-role-text" data-role={user.role}>
                            {roleLabel}
                        </span>
                    </div>
                    <hr />
                    <button
                        onClick={() => { navigate(dashPath); setMenuOpen(false); }}
                        className={`header-dropdown-item ${location.pathname === dashPath ? 'active' : ''}`}
                    >
                        Dashboard
                    </button>
                    {isContractor && (
                        <button
                            onClick={() => { navigate('/contractor/rfi-sheet'); setMenuOpen(false); }}
                            className={`header-dropdown-item ${location.pathname.includes('rfi-sheet') ? 'active' : ''}`}
                        >
                            Daily RFI Sheet
                        </button>
                    )}
                    {user.role === 'consultant' && (
                        <>
                            <button
                                onClick={() => { navigate('/consultant/review'); setMenuOpen(false); }}
                                className={`header-dropdown-item ${location.pathname.includes('review') ? 'active' : ''}`}
                            >
                                Review Queue
                            </button>
                        </>
                    )}
                    {isAdmin && (
                        <button
                            onClick={() => { navigate('/admin'); setMenuOpen(false); }}
                            className={`header-dropdown-item ${location.pathname === '/admin' ? 'active' : ''}`}
                        >
                            <Shield size={16} /> Admin Panel
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
