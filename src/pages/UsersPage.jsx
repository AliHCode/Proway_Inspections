import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import Header from '../components/Header';
import UserAvatar from '../components/UserAvatar';
import {
    Users, Search, RefreshCw, Trash2, UserX, UserCheck
} from 'lucide-react';

export default function UsersPage() {
    const { user } = useAuth();
    const { projects } = useProject();

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [projectFilter, setProjectFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [actionMessage, setActionMessage] = useState('');
    const [allMemberships, setAllMemberships] = useState([]);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .not('is_archived', 'eq', true)
                .order('name');
            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Error fetching users:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchAllMemberships = useCallback(async () => {
        const { data, error } = await supabase
            .from('project_members')
            .select('user_id, project_id, role');
        if (!error) setAllMemberships(data || []);
    }, []);

    useEffect(() => { fetchUsers(); fetchAllMemberships(); }, [fetchUsers, fetchAllMemberships]);

    function showMsg(msg) {
        setActionMessage(msg);
        setTimeout(() => setActionMessage(''), 3000);
    }

    async function toggleUserActive(userId, currentStatus) {
        const { error } = await supabase.from('profiles').update({ is_active: !currentStatus }).eq('id', userId);
        if (!error) { showMsg(!currentStatus ? 'User reactivated' : 'User deactivated'); fetchUsers(); }
        else showMsg('Error updating user');
    }

    async function changeUserRole(userId, newRole) {
        const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
        if (!error) { showMsg(`Role updated to ${newRole}`); fetchUsers(); }
        else showMsg('Error updating role');
    }

    async function archiveUser(userId, userName) {
        const { error } = await supabase.from('profiles').update({ is_archived: true }).eq('id', userId);
        if (!error) { showMsg(`${userName} removed`); fetchUsers(); }
        else showMsg('Error: ' + error.message);
    }

    // Computed
    const activeUsers = users.filter(u => !['pending', 'rejected'].includes(u.role));
    const assignedUserIds = new Set(allMemberships.map(m => m.user_id));

    function getUserProjects(userId) {
        return allMemberships
            .filter(m => m.user_id === userId)
            .map(m => projects.find(p => p.id === m.project_id))
            .filter(Boolean);
    }

    const filteredUsers = activeUsers.filter(u => {
        const matchesSearch = !searchTerm ||
            u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.company?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        const matchesStatus =
            statusFilter === 'all' ? true :
            statusFilter === 'active' ? u.is_active !== false :
            statusFilter === 'deactivated' ? u.is_active === false :
            statusFilter === 'unassigned' ? !assignedUserIds.has(u.id) :
            true;
        const matchesProject =
            projectFilter === 'all' ? true :
            projectFilter === 'none' ? !assignedUserIds.has(u.id) :
            allMemberships.some(m => m.user_id === u.id && m.project_id === projectFilter);
        return matchesSearch && matchesRole && matchesStatus && matchesProject;
    });

    const stats = {
        total: activeUsers.length,
        contractors: activeUsers.filter(u => u.role === 'contractor').length,
        consultants: activeUsers.filter(u => u.role === 'consultant').length,
        admins: activeUsers.filter(u => u.role === 'admin').length,
        inactive: activeUsers.filter(u => u.is_active === false).length,
        unassigned: activeUsers.filter(u => !assignedUserIds.has(u.id)).length,
    };

    return (
        <div className="page-wrapper">
            <Header />
            <main className="admin-page">
                <div className="sheet-header">
                    <div>
                        <h1><Users size={24} /> Users Directory</h1>
                        <p className="subtitle" style={{ marginTop: '0.25rem' }}>All approved members across projects</p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => { fetchUsers(); fetchAllMemberships(); }} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spinner' : ''} /> Refresh
                    </button>
                </div>

                {actionMessage && (
                    <div className={`submit-message ${actionMessage.startsWith('Error') ? 'warning' : 'success'}`}>
                        {actionMessage}
                    </div>
                )}

                {/* Stats */}
                <div className="users-stat-pills" style={{ marginBottom: '1rem' }}>
                    <span className="ustat-pill">{stats.total} Total</span>
                    <span className="ustat-pill">{stats.contractors} Contractors</span>
                    <span className="ustat-pill">{stats.consultants} Consultants</span>
                    {stats.admins > 0 && <span className="ustat-pill">{stats.admins} Admins</span>}
                    {stats.unassigned > 0 && <span className="ustat-pill">{stats.unassigned} Unassigned</span>}
                    {stats.inactive > 0 && <span className="ustat-pill">{stats.inactive} Deactivated</span>}
                </div>

                {/* Filters */}
                <div className="users-filters-bar">
                    <div className="admin-search" style={{ minWidth: 0, flex: 2 }}>
                        <Search size={15} />
                        <input type="text" placeholder="Search name or company…" value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)} />
                    </div>
                    <select className="users-role-select" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                        <option value="all">All roles</option>
                        <option value="contractor">Contractors</option>
                        <option value="consultant">Consultants</option>
                        <option value="admin">Admins</option>
                    </select>
                    <select className="users-role-select" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
                        <option value="all">All projects</option>
                        <option value="none">No project</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select className="users-role-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="all">All statuses</option>
                        <option value="active">Active</option>
                        <option value="deactivated">Deactivated</option>
                        <option value="unassigned">Unassigned</option>
                    </select>
                </div>

                {/* Users grid */}
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--clr-text-muted)' }}>Loading users…</div>
                ) : filteredUsers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--clr-text-muted)' }}>
                        {searchTerm || roleFilter !== 'all' || projectFilter !== 'all' || statusFilter !== 'all'
                            ? 'No users match your filters.'
                            : 'No active members yet.'}
                    </div>
                ) : (
                    <div className="users-grid">
                        {filteredUsers.map(u => {
                            const isSelf = u.id === user.id;
                            const isInactive = u.is_active === false;
                            const userProjects = getUserProjects(u.id);
                            return (
                                <div key={u.id} className={`user-card ${isInactive ? 'user-card-dim' : ''}`}>
                                    <div className="user-card-top">
                                        <UserAvatar name={u.name} avatarUrl={u.avatar_url} size={42} />
                                        <div className="user-card-info">
                                            <div className="user-card-name">
                                                {u.name}
                                                {isSelf && <span className="you-badge">You</span>}
                                            </div>
                                            <div className="user-card-company">{u.company || <em>No company</em>}</div>
                                        </div>
                                        <span className={`status-badge-admin ${isInactive ? 'inactive' : 'active'}`}>
                                            {isInactive ? 'Deactivated' : 'Active'}
                                        </span>
                                    </div>
                                    {/* Project tags */}
                                    <div className="user-card-projects">
                                        {userProjects.length > 0 ? (
                                            userProjects.map((p, i) => (
                                                <span key={i} className="user-project-tag">{p.name}</span>
                                            ))
                                        ) : (
                                            <span className="user-project-tag user-project-tag-none">No project</span>
                                        )}
                                    </div>
                                    <div className="user-card-bottom">
                                        <select
                                            className="users-role-select user-card-role-select"
                                            value={u.role}
                                            onChange={e => changeUserRole(u.id, e.target.value)}
                                            disabled={isSelf}
                                            title={isSelf ? 'Cannot change your own role' : 'Change role'}
                                        >
                                            <option value="contractor">Contractor</option>
                                            <option value="consultant">Consultant</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                        {!isSelf && (
                                            <div className="user-card-actions">
                                                <button
                                                    className={`btn btn-sm btn-ghost`}
                                                    style={{}}
                                                    onClick={() => toggleUserActive(u.id, u.is_active !== false)}
                                                    title={isInactive ? 'Reactivate user' : 'Deactivate user'}
                                                >
                                                    {isInactive ? <UserCheck size={14} /> : <UserX size={14} />}
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-ghost"
                                                    style={{ color: 'var(--clr-danger)' }}
                                                    onClick={() => archiveUser(u.id, u.name)}
                                                    title="Remove from dashboard"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
