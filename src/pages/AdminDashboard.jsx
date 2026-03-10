import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { USER_ROLES } from '../utils/constants';
import Header from '../components/Header';
import UserAvatar from '../components/UserAvatar';
import { Users, Shield, UserX, UserCheck, ChevronDown, Search, RefreshCw } from 'lucide-react';

export default function AdminDashboard() {
    const { user } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [actionMessage, setActionMessage] = useState('');

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

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    async function toggleUserActive(userId, currentStatus) {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ is_active: !currentStatus })
                .eq('id', userId);

            if (error) throw error;
            setActionMessage(!currentStatus ? '✅ User reactivated' : '⛔ User deactivated');
            fetchUsers();
        } catch (err) {
            console.error('Error toggling user status:', err);
            setActionMessage('❌ Error updating user');
        }
        setTimeout(() => setActionMessage(''), 3000);
    }

    async function changeUserRole(userId, newRole) {
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId);

            if (error) throw error;
            setActionMessage(`✅ Role updated to ${newRole}`);
            fetchUsers();
        } catch (err) {
            console.error('Error changing role:', err);
            setActionMessage('❌ Error updating role');
        }
        setTimeout(() => setActionMessage(''), 3000);
    }

    const filteredUsers = users.filter(u => {
        const matchesSearch = u.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            u.company?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const stats = {
        total: users.length,
        contractors: users.filter(u => u.role === 'contractor').length,
        consultants: users.filter(u => u.role === 'consultant').length,
        admins: users.filter(u => u.role === 'admin').length,
        pending: users.filter(u => u.role === 'pending').length,
        inactive: users.filter(u => u.is_active === false).length,
    };

    return (
        <div className="page-wrapper">
            <Header />
            <main className="admin-page">
                <div className="sheet-header">
                    <div>
                        <h1><Shield size={24} /> Admin Panel</h1>
                        <p className="subtitle" style={{ marginTop: '0.25rem' }}>Manage users, roles, and system settings</p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={fetchUsers} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spinner' : ''} /> Refresh
                    </button>
                </div>

                {/* Stats */}
                <div className="admin-stats">
                    <div className="admin-stat-card">
                        <span className="admin-stat-value">{stats.total}</span>
                        <span className="admin-stat-label">Total Users</span>
                    </div>
                    <div className="admin-stat-card">
                        <span className="admin-stat-value">{stats.contractors}</span>
                        <span className="admin-stat-label">Contractors</span>
                    </div>
                    <div className="admin-stat-card">
                        <span className="admin-stat-value">{stats.consultants}</span>
                        <span className="admin-stat-label">Consultants</span>
                    </div>
                    <div className="admin-stat-card">
                        <span className="admin-stat-value">{stats.admins}</span>
                        <span className="admin-stat-label">Admins</span>
                    </div>
                    <div className="admin-stat-card warning">
                        <span className="admin-stat-value">{stats.pending}</span>
                        <span className="admin-stat-label">Pending</span>
                    </div>
                    <div className="admin-stat-card danger">
                        <span className="admin-stat-value">{stats.inactive}</span>
                        <span className="admin-stat-label">Deactivated</span>
                    </div>
                </div>

                {/* Filters */}
                <div className="admin-filters">
                    <div className="admin-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search by name or company..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
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

                {actionMessage && (
                    <div className={`submit-message ${actionMessage.includes('✅') ? 'success' : 'warning'}`}>
                        {actionMessage}
                    </div>
                )}

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
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                                            Loading users...
                                        </td>
                                    </tr>
                                ) : filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                                            No users match your search.
                                        </td>
                                    </tr>
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
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--clr-text-muted)' }}>
                                                                {u.id.substring(0, 8)}...
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>{u.company || '—'}</td>
                                                <td>
                                                    <select
                                                        className="cell-select admin-role-select"
                                                        value={u.role}
                                                        onChange={e => changeUserRole(u.id, e.target.value)}
                                                        disabled={isSelf}
                                                        title={isSelf ? 'Cannot change your own role' : 'Change role'}
                                                        style={{ 
                                                            backgroundColor: u.role === 'pending' ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                                            color: u.role === 'pending' ? '#d97706' : 'inherit',
                                                            fontWeight: u.role === 'pending' ? '600' : 'normal'
                                                        }}
                                                    >
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
                                                        <button
                                                            className={`btn btn-sm ${isInactive ? 'btn-success' : 'btn-danger'}`}
                                                            onClick={() => toggleUserActive(u.id, u.is_active !== false)}
                                                            title={isInactive ? 'Reactivate user' : 'Deactivate user'}
                                                        >
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
            </main>
        </div>
    );
}
