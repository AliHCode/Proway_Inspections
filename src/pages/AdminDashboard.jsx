import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { USER_ROLES } from '../utils/constants';
import Header from '../components/Header';
import UserAvatar from '../components/UserAvatar';
import {
    Users, Shield, UserX, UserCheck, Search, RefreshCw,
    FolderPlus, Trash2, Plus, GripVertical, X, Settings2,
    Building, Columns3, UserPlus, ChevronRight
} from 'lucide-react';

const FIELD_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'select', label: 'Dropdown' },
    { value: 'date', label: 'Date' },
    { value: 'textarea', label: 'Long Text' },
];

export default function AdminDashboard() {
    const { user } = useAuth();
    const {
        projects, activeProject, fetchProjects, createProject, deleteProject, changeActiveProject,
        projectFields, addProjectField, updateProjectField, deleteProjectField,
        projectMembers, assignUserToProject, removeUserFromProject, fetchProjectMembers,
    } = useProject();

    const [activeTab, setActiveTab] = useState('projects');
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [actionMessage, setActionMessage] = useState('');

    // Project creation form
    const [showNewProject, setShowNewProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');

    // Field creation form
    const [showNewField, setShowNewField] = useState(false);
    const [newField, setNewField] = useState({ field_name: '', field_key: '', field_type: 'text', is_required: false, options: '' });

    // User assignment
    const [assignUserId, setAssignUserId] = useState('');
    const [assignRole, setAssignRole] = useState('contractor');
    const [selectedProjectForAssign, setSelectedProjectForAssign] = useState('');

    // ─── Fetch all users ───
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .order('name');
            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Error fetching users:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    function showMsg(msg) {
        setActionMessage(msg);
        setTimeout(() => setActionMessage(''), 3000);
    }

    // ─── User actions ───
    async function toggleUserActive(userId, currentStatus) {
        const { error } = await supabase.from('profiles').update({ is_active: !currentStatus }).eq('id', userId);
        if (!error) { showMsg(!currentStatus ? '✅ User reactivated' : '⛔ User deactivated'); fetchUsers(); }
        else showMsg('❌ Error updating user');
    }

    async function changeUserRole(userId, newRole) {
        const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
        if (!error) { showMsg(`✅ Role updated to ${newRole}`); fetchUsers(); }
        else showMsg('❌ Error updating role');
    }

    // ─── Project actions ───
    async function handleCreateProject(e) {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        const result = await createProject(newProjectName.trim(), newProjectDesc.trim());
        if (result?.success) {
            showMsg('✅ Project created');
            setNewProjectName('');
            setNewProjectDesc('');
            setShowNewProject(false);
            fetchProjects();
        } else {
            showMsg('❌ ' + (result?.error || 'Failed to create project'));
        }
    }

    async function handleDeleteProject(projectId) {
        if (projectId === '00000000-0000-0000-0000-000000000000') {
            showMsg('⚠️ Cannot delete the default project');
            return;
        }
        if (!window.confirm('Delete this project and all its RFI fields? This cannot be undone.')) return;
        const result = await deleteProject(projectId);
        if (result?.success) { showMsg('✅ Project deleted'); fetchProjects(); }
        else showMsg('❌ ' + (result?.error || 'Delete failed'));
    }

    // ─── Field actions ───
    async function handleAddField(e) {
        e.preventDefault();
        if (!newField.field_name.trim() || !activeProject) return;
        const key = newField.field_key.trim() || newField.field_name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const opts = newField.field_type === 'select' && newField.options
            ? newField.options.split(',').map(o => o.trim()).filter(Boolean)
            : [];

        const maxOrder = projectFields.reduce((m, f) => Math.max(m, f.sort_order || 0), 0);
        const result = await addProjectField(activeProject.id, {
            field_name: newField.field_name.trim(),
            field_key: key,
            field_type: newField.field_type,
            is_required: newField.is_required,
            sort_order: maxOrder + 1,
            options: opts,
        });
        if (result?.success) {
            showMsg('✅ Field added');
            setNewField({ field_name: '', field_key: '', field_type: 'text', is_required: false, options: '' });
            setShowNewField(false);
        } else {
            showMsg('❌ ' + (result?.error || 'Failed'));
        }
    }

    async function handleDeleteField(fieldId) {
        if (!window.confirm('Delete this RFI field?')) return;
        const result = await deleteProjectField(fieldId);
        if (result?.success) showMsg('✅ Field removed');
        else showMsg('❌ ' + (result?.error || 'Failed'));
    }

    async function handleToggleRequired(field) {
        await updateProjectField(field.id, { is_required: !field.is_required });
    }

    // ─── User assignment ───
    async function handleAssignUser(e) {
        e.preventDefault();
        const pid = selectedProjectForAssign || activeProject?.id;
        if (!assignUserId || !pid) return;
        const result = await assignUserToProject(pid, assignUserId, assignRole);
        if (result?.success) {
            showMsg('✅ User assigned to project');
            setAssignUserId('');
            fetchUsers();
        } else {
            showMsg('❌ ' + (result?.error || 'Assignment failed'));
        }
    }

    async function handleRemoveMember(userId) {
        if (!activeProject || !window.confirm('Remove this member from the project?')) return;
        const result = await removeUserFromProject(activeProject.id, userId);
        if (result?.success) showMsg('✅ Member removed');
    }

    // ─── Computed ───
    const filteredUsers = users.filter(u => {
        const matchesSearch = u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.company?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const pendingUsers = users.filter(u => u.role === 'pending');
    const stats = {
        total: users.length,
        contractors: users.filter(u => u.role === 'contractor').length,
        consultants: users.filter(u => u.role === 'consultant').length,
        admins: users.filter(u => u.role === 'admin').length,
        pending: pendingUsers.length,
        inactive: users.filter(u => u.is_active === false).length,
    };

    return (
        <div className="page-wrapper">
            <Header />
            <main className="admin-page">
                <div className="sheet-header">
                    <div>
                        <h1><Shield size={24} /> Admin Command Center</h1>
                        <p className="subtitle" style={{ marginTop: '0.25rem' }}>Manage projects, RFI fields, users &amp; assignments</p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => { fetchUsers(); fetchProjects(); }} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spinner' : ''} /> Refresh
                    </button>
                </div>

                {/* Tabs */}
                <div className="admin-tabs">
                    <button className={`admin-tab-btn ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => setActiveTab('projects')}>
                        <Building size={16} /> Projects
                    </button>
                    <button className={`admin-tab-btn ${activeTab === 'fields' ? 'active' : ''}`} onClick={() => setActiveTab('fields')}>
                        <Columns3 size={16} /> RFI Table Fields
                    </button>
                    <button className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                        <Users size={16} /> Users &amp; Assignments
                        {stats.pending > 0 && <span className="admin-tab-badge">{stats.pending}</span>}
                    </button>
                </div>

                {actionMessage && (
                    <div className={`submit-message ${actionMessage.includes('✅') ? 'success' : 'warning'}`}>
                        {actionMessage}
                    </div>
                )}

                {/* ═══════════ TAB: PROJECTS ═══════════ */}
                {activeTab === 'projects' && (
                    <div className="admin-section">
                        <div className="admin-section-header">
                            <h2><Building size={20} /> Projects</h2>
                            <button className="btn btn-sm" style={{ background: 'var(--clr-brand-secondary)', color: '#fff', border: 'none' }}
                                onClick={() => setShowNewProject(!showNewProject)}>
                                <FolderPlus size={16} /> New Project
                            </button>
                        </div>

                        {showNewProject && (
                            <form className="admin-inline-form" onSubmit={handleCreateProject}>
                                <input type="text" placeholder="Project name *" value={newProjectName}
                                    onChange={e => setNewProjectName(e.target.value)} required />
                                <input type="text" placeholder="Description (optional)" value={newProjectDesc}
                                    onChange={e => setNewProjectDesc(e.target.value)} />
                                <button type="submit" className="btn btn-sm" style={{ background: 'var(--clr-brand-secondary)', color: '#fff', border: 'none' }}>
                                    Create
                                </button>
                                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowNewProject(false)}>Cancel</button>
                            </form>
                        )}

                        <div className="admin-project-grid">
                            {projects.map(p => (
                                <div key={p.id} className={`admin-project-card ${activeProject?.id === p.id ? 'active' : ''}`}
                                    onClick={() => changeActiveProject(p.id)}>
                                    <div className="admin-project-card-header">
                                        <div>
                                            <h3>{p.name}</h3>
                                            {p.description && <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{p.description}</p>}
                                        </div>
                                        {p.id !== '00000000-0000-0000-0000-000000000000' && (
                                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--clr-danger)' }}
                                                onClick={e => { e.stopPropagation(); handleDeleteProject(p.id); }}
                                                title="Delete project">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                    {activeProject?.id === p.id && (
                                        <span className="admin-project-active-badge">Active</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══════════ TAB: RFI FIELDS ═══════════ */}
                {activeTab === 'fields' && (
                    <div className="admin-section">
                        <div className="admin-section-header">
                            <h2><Columns3 size={20} /> RFI Table Columns — {activeProject?.name || 'Select a project'}</h2>
                            <button className="btn btn-sm" style={{ background: 'var(--clr-brand-secondary)', color: '#fff', border: 'none' }}
                                onClick={() => setShowNewField(!showNewField)}>
                                <Plus size={16} /> Add Column
                            </button>
                        </div>

                        <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                            Define the columns that appear in the RFI table for <strong>{activeProject?.name}</strong>. 
                            The built-in columns (Sr#, Status, Attachments, Actions) are always shown. These custom fields control what data contractors fill in.
                        </p>

                        {showNewField && (
                            <form className="admin-inline-form" onSubmit={handleAddField}>
                                <input type="text" placeholder="Column name *" value={newField.field_name}
                                    onChange={e => setNewField(prev => ({ ...prev, field_name: e.target.value }))} required />
                                <input type="text" placeholder="Key (auto-generated)" value={newField.field_key}
                                    onChange={e => setNewField(prev => ({ ...prev, field_key: e.target.value }))} />
                                <select value={newField.field_type}
                                    onChange={e => setNewField(prev => ({ ...prev, field_type: e.target.value }))}>
                                    {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                                {newField.field_type === 'select' && (
                                    <input type="text" placeholder="Options (comma separated)" value={newField.options}
                                        onChange={e => setNewField(prev => ({ ...prev, options: e.target.value }))} />
                                )}
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                                    <input type="checkbox" checked={newField.is_required}
                                        onChange={e => setNewField(prev => ({ ...prev, is_required: e.target.checked }))} />
                                    Required
                                </label>
                                <button type="submit" className="btn btn-sm" style={{ background: 'var(--clr-brand-secondary)', color: '#fff', border: 'none' }}>Add</button>
                                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShowNewField(false)}>Cancel</button>
                            </form>
                        )}

                        <div className="rfi-table-wrapper">
                            <table className="rfi-table editable">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}>#</th>
                                        <th>Column Name</th>
                                        <th>Key</th>
                                        <th>Type</th>
                                        <th>Options</th>
                                        <th style={{ width: '80px' }}>Required</th>
                                        <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {projectFields.length === 0 ? (
                                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>No custom fields yet. Click "Add Column" to create RFI table headings.</td></tr>
                                    ) : (
                                        projectFields.map((f, i) => (
                                            <tr key={f.id}>
                                                <td>{i + 1}</td>
                                                <td style={{ fontWeight: 600 }}>{f.field_name}</td>
                                                <td><code style={{ fontSize: '0.8rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>{f.field_key}</code></td>
                                                <td>{FIELD_TYPES.find(t => t.value === f.field_type)?.label || f.field_type}</td>
                                                <td>
                                                    {f.field_type === 'select' && Array.isArray(f.options) ? (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                            {f.options.map((o, idx) => (
                                                                <span key={idx} style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>{o}</span>
                                                            ))}
                                                        </div>
                                                    ) : '—'}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <input type="checkbox" checked={f.is_required} onChange={() => handleToggleRequired(f)} />
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--clr-danger)' }}
                                                        onClick={() => handleDeleteField(f.id)} title="Delete field">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* ═══════════ TAB: USERS & ASSIGNMENTS ═══════════ */}
                {activeTab === 'users' && (
                    <div className="admin-section">
                        {/* Pending approvals banner */}
                        {pendingUsers.length > 0 && (
                            <div className="admin-pending-banner">
                                <h3>⏳ {pendingUsers.length} Pending Approval{pendingUsers.length > 1 ? 's' : ''}</h3>
                                <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>Assign these users to a project with a role to approve them.</p>
                                <div className="admin-pending-cards">
                                    {pendingUsers.map(pu => (
                                        <div key={pu.id} className="admin-pending-card">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <UserAvatar name={pu.name} size={40} />
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{pu.name}</div>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--clr-text-muted)' }}>{pu.company || 'No company'}</div>
                                                </div>
                                            </div>
                                            <div className="admin-pending-actions">
                                                <select value="" onChange={e => {
                                                    const pid = selectedProjectForAssign || activeProject?.id;
                                                    if (pid && e.target.value) {
                                                        assignUserToProject(pid, pu.id, e.target.value).then(r => {
                                                            if (r?.success) {
                                                                showMsg(`✅ ${pu.name} approved as ${e.target.value}`);
                                                                fetchUsers();
                                                            }
                                                        });
                                                    }
                                                }}>
                                                    <option value="">Approve as...</option>
                                                    <option value="contractor">Contractor</option>
                                                    <option value="consultant">Consultant</option>
                                                    <option value="admin">Admin</option>
                                                </select>
                                                <select
                                                    value={selectedProjectForAssign || activeProject?.id || ''}
                                                    onChange={e => setSelectedProjectForAssign(e.target.value)}
                                                    style={{ maxWidth: '180px' }}
                                                >
                                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Assign existing user form */}
                        <div className="admin-section-header" style={{ marginTop: '1.5rem' }}>
                            <h2><UserPlus size={20} /> Assign User to Project</h2>
                        </div>
                        <form className="admin-inline-form" onSubmit={handleAssignUser}>
                            <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)} required>
                                <option value="">Select user...</option>
                                {users.filter(u => u.role !== 'admin' && u.id !== user.id).map(u => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.role}) — {u.company || 'No company'}</option>
                                ))}
                            </select>
                            <select value={assignRole} onChange={e => setAssignRole(e.target.value)}>
                                <option value="contractor">Contractor</option>
                                <option value="consultant">Consultant</option>
                                <option value="admin">Admin</option>
                            </select>
                            <select value={selectedProjectForAssign || activeProject?.id || ''}
                                onChange={e => setSelectedProjectForAssign(e.target.value)}>
                                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <button type="submit" className="btn btn-sm" style={{ background: 'var(--clr-brand-secondary)', color: '#fff', border: 'none' }}>
                                <UserPlus size={14} /> Assign
                            </button>
                        </form>

                        {/* Current project members */}
                        {projectMembers.length > 0 && (
                            <div style={{ marginTop: '1.5rem' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>
                                    Members of <strong>{activeProject?.name}</strong>
                                </h3>
                                <div className="admin-members-grid">
                                    {projectMembers.map(m => (
                                        <div key={m.id} className="admin-member-card">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <UserAvatar name={m.profiles?.name || 'User'} size={36} />
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{m.profiles?.name || 'Unknown'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>{m.role} • {m.profiles?.company || ''}</div>
                                                </div>
                                            </div>
                                            <button className="btn btn-sm btn-ghost" style={{ color: 'var(--clr-danger)' }}
                                                onClick={() => handleRemoveMember(m.user_id)} title="Remove from project">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Stats */}
                        <div className="admin-stats" style={{ marginTop: '1.5rem' }}>
                            <div className="admin-stat-card"><span className="admin-stat-value">{stats.total}</span><span className="admin-stat-label">Total Users</span></div>
                            <div className="admin-stat-card"><span className="admin-stat-value">{stats.contractors}</span><span className="admin-stat-label">Contractors</span></div>
                            <div className="admin-stat-card"><span className="admin-stat-value">{stats.consultants}</span><span className="admin-stat-label">Consultants</span></div>
                            <div className="admin-stat-card"><span className="admin-stat-value">{stats.admins}</span><span className="admin-stat-label">Admins</span></div>
                            <div className="admin-stat-card warning"><span className="admin-stat-value">{stats.pending}</span><span className="admin-stat-label">Pending</span></div>
                            <div className="admin-stat-card danger"><span className="admin-stat-value">{stats.inactive}</span><span className="admin-stat-label">Deactivated</span></div>
                        </div>

                        {/* Filters */}
                        <div className="admin-filters">
                            <div className="admin-search">
                                <Search size={16} />
                                <input type="text" placeholder="Search by name or company..." value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                            <div className="admin-role-filter">
                                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                                    <option value="all">All Roles</option>
                                    <option value="contractor">Contractors</option>
                                    <option value="consultant">Consultants</option>
                                    <option value="admin">Admins</option>
                                    <option value="pending">Pending Approval</option>
                                </select>
                            </div>
                        </div>

                        {/* Users Table */}
                        <div className="sheet-section">
                            <div className="rfi-table-wrapper">
                                <table className="rfi-table editable">
                                    <thead>
                                        <tr>
                                            <th style={{ minWidth: '200px' }}>User</th>
                                            <th style={{ minWidth: '150px' }}>Company</th>
                                            <th style={{ minWidth: '130px' }}>Role</th>
                                            <th style={{ minWidth: '100px' }}>Status</th>
                                            <th style={{ minWidth: '120px', textAlign: 'center' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loading ? (
                                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>Loading users...</td></tr>
                                        ) : filteredUsers.length === 0 ? (
                                            <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>No users match your search.</td></tr>
                                        ) : (
                                            filteredUsers.map(u => {
                                                const isSelf = u.id === user.id;
                                                const isInactive = u.is_active === false;
                                                return (
                                                    <tr key={u.id} className={isInactive ? 'row-deactivated' : ''}>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                                <UserAvatar name={u.name} size={36} />
                                                                <div>
                                                                    <div style={{ fontWeight: 600 }}>
                                                                        {u.name} {isSelf && <span className="you-badge">You</span>}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>{u.id.substring(0, 8)}...</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>{u.company || '—'}</td>
                                                        <td>
                                                            <select className="cell-select admin-role-select" value={u.role}
                                                                onChange={e => changeUserRole(u.id, e.target.value)}
                                                                disabled={isSelf} title={isSelf ? 'Cannot change your own role' : 'Change role'}
                                                                style={{
                                                                    backgroundColor: u.role === 'pending' ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                                                    color: u.role === 'pending' ? '#d97706' : 'inherit',
                                                                    fontWeight: u.role === 'pending' ? '600' : 'normal'
                                                                }}>
                                                                <option value="pending">Pending</option>
                                                                <option value="contractor">Contractor</option>
                                                                <option value="consultant">Consultant</option>
                                                                <option value="admin">Admin</option>
                                                            </select>
                                                        </td>
                                                        <td>
                                                            <span className={`status-badge-admin ${isInactive ? 'inactive' : u.role === 'pending' ? 'warning' : 'active'}`}>
                                                                {isInactive ? 'Deactivated' : u.role === 'pending' ? 'Wait Approval' : 'Active'}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            {!isSelf && (
                                                                <button className={`btn btn-sm ${isInactive ? 'btn-success' : 'btn-danger'}`}
                                                                    onClick={() => toggleUserActive(u.id, u.is_active !== false)}
                                                                    title={isInactive ? 'Reactivate user' : 'Deactivate user'}>
                                                                    {isInactive ? <UserCheck size={14} /> : <UserX size={14} />}
                                                                    {isInactive ? ' Activate' : ' Deactivate'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
