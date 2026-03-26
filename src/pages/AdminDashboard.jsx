import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { USER_ROLES } from '../utils/constants';
import Header from '../components/Header';
import UserAvatar from '../components/UserAvatar';
import { buildColumnWidthMap, getDefaultColumnWidth, sanitizeColumnWidth } from '../utils/tableLayout';
import {
    Users, Shield, UserX, UserCheck, RefreshCw,
    FolderPlus, Trash2, Plus, GripVertical, ArrowUp, ArrowDown, Save,
    Building, Columns3, UserPlus, X, AlertCircle, Clock, Globe, Briefcase,
    Search, ChevronDown, LifeBuoy, MessageSquare, Send, ArrowRight, Tag, Paperclip
} from 'lucide-react';

const FIELD_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'select', label: 'Dropdown' },
    { value: 'date', label: 'Date' },
    { value: 'textarea', label: 'Long Text' },
];

const ALL_TIMEZONES = Intl.supportedValuesOf('timeZone').map(tz => {
    const parts = tz.split('/');
    const city = parts[parts.length - 1].replace(/_/g, ' ');
    
    // Get time offset in GMT format
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        timeZoneName: 'shortOffset'
    });
    
    const parts_tz = formatter.formatToParts(now);
    const offsetPart = parts_tz.find(p => p.type === 'timeZoneName').value;
    
    // Convert to standard format: (UTC+04:00)
    let offsetLabel = 'UTC+0:00';
    let offsetMinutes = 0;
    
    if (offsetPart !== 'GMT') {
        const sign = offsetPart.includes('+') ? '+' : '-';
        const [hours, minutes] = offsetPart.replace('GMT', '').replace(/[+-]/, '').split(':').map(Number);
        const paddedHours = String(hours || 0).padStart(2, '0');
        const paddedMinutes = String(minutes || 0).padStart(2, '0');
        offsetLabel = `UTC${sign}${paddedHours}:${paddedMinutes}`;
        offsetMinutes = (sign === '+' ? 1 : -1) * ((hours || 0) * 60 + (minutes || 0));
    }
    
    return {
        value: tz,
        label: `(${offsetLabel}) ${city}`,
        offsetMinutes
    };
}).filter((tz, index, self) => 
    index === self.findIndex((t) => t.label === tz.label)
).sort((a, b) => {
    if (a.offsetMinutes !== b.offsetMinutes) return a.offsetMinutes - b.offsetMinutes;
    return a.label.localeCompare(b.label);
});

// --- SearchableSelect Component (Portal-based to escape overflow clipping) ---
function SearchableSelect({ options, value, onChange, placeholder = "Search..." }) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const triggerRef = useRef(null);
    const dropdownRef = useRef(null);

    // Calculate dropdown position on open
    const handleToggle = () => {
        if (!isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setDropdownPos({
                top: rect.bottom + window.scrollY + 8,
                left: rect.left + window.scrollX,
                width: Math.max(rect.width, 340),
            });
        }
        setIsOpen(prev => !prev);
    };

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen]);

    const selectedOption = options.find(opt => opt.value === value);
    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="searchable-select-container" ref={triggerRef}>
            <div className={`searchable-select-trigger ${isOpen ? 'active' : ''}`} onClick={handleToggle}>
                <span className="selected-value">{selectedOption ? selectedOption.label : placeholder}</span>
                <ChevronDown size={16} className={`chevron-icon ${isOpen ? 'rotate' : ''}`} />
            </div>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="searchable-select-dropdown"
                    style={{
                        position: 'fixed',
                        top: dropdownPos.top,
                        left: dropdownPos.left,
                        width: dropdownPos.width,
                        zIndex: 99999,
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="search-input-wrapper">
                        <Search size={14} className="search-icon" />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Type to find city..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div className="custom-options-list">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(opt => (
                                <div
                                    key={opt.value}
                                    className={`custom-option ${opt.value === value ? 'selected' : ''}`}
                                    onClick={() => {
                                        onChange(opt.value);
                                        setIsOpen(false);
                                        setSearch("");
                                    }}
                                >
                                    {opt.label}
                                </div>
                            ))
                        ) : (
                            <div className="no-results">No cities found</div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

export default function AdminDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const {
        projects, activeProject, fetchProjects, createProject, updateProject, deleteProject, changeActiveProject,
        projectFields, addProjectField, updateProjectField, deleteProjectField,
        assignUserToProject, removeUserFromProject, fetchProjectMembers,
    } = useProject();

    const [activeTab, setActiveTab] = useState('projects');
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionMessage, setActionMessage] = useState('');
    const [pendingApprove, setPendingApprove] = useState({});
    const [rejectedCollapsed, setRejectedCollapsed] = useState(false);

    // Support tickets state
    const [supportTickets, setSupportTickets] = useState([]);

    // Memberships & team management
    const [allMemberships, setAllMemberships] = useState([]);
    const [teamProjectId, setTeamProjectId] = useState('');
    const [assignProject, setAssignProject] = useState({});
    const [addMemberUserId, setAddMemberUserId] = useState('');
    const [addMemberRole, setAddMemberRole] = useState('contractor');

    // Project creation form
    const [showNewProject, setShowNewProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectCode, setNewProjectCode] = useState('');
    const [newProjectDesc, setNewProjectDesc] = useState('');
    const [newProjectTimezone, setNewProjectTimezone] = useState('UTC');
    const [newProjectStartNumber, setNewProjectStartNumber] = useState(1);
    
    const [editingProject, setEditingProject] = useState(null); // { id, name, code, description, timezone }
    const [editCode, setEditCode] = useState('');
    const [editTimezone, setEditTimezone] = useState('');
    const [editStartNumber, setEditStartNumber] = useState(1);
    const [editSubscriptionStatus, setEditSubscriptionStatus] = useState('trial');
    const [editSubscriptionEnd, setEditSubscriptionEnd] = useState('');
    const [editIsLocked, setEditIsLocked] = useState(false);
    const [editPaymentRemarks, setEditPaymentRemarks] = useState('');

    // Field creation form
    const [showNewField, setShowNewField] = useState(false);
    const [newField, setNewField] = useState({ field_name: '', field_key: '', field_type: 'text', is_required: false, options: '' });
    
    // Field ordering state
    const [orderedFields, setOrderedFields] = useState([]);
    const [isReordering, setIsReordering] = useState(false);
    const [columnWidthsDraft, setColumnWidthsDraft] = useState({});
    const [resizeState, setResizeState] = useState(null);

    const BUILT_IN_COLUMNS = [
        { id: 'builtin_serial', field_key: 'serial', field_name: 'Sr#', field_type: 'Built-in', is_builtin: true },
        { id: 'builtin_rfi_no', field_key: 'rfi_no', field_name: 'RFI #', field_type: 'Built-in', is_builtin: true },
        { id: 'builtin_description', field_key: 'description', field_name: 'Description', field_type: 'Built-in', is_builtin: true },
        { id: 'builtin_location', field_key: 'location', field_name: 'Location', field_type: 'Built-in', is_builtin: true },
        { id: 'builtin_inspection_type', field_key: 'inspection_type', field_name: 'Inspection Type', field_type: 'Built-in', is_builtin: true },
        { id: 'builtin_status', field_key: 'status', field_name: 'Status', field_type: 'Built-in', is_builtin: true },
        { id: 'builtin_actions', field_key: 'actions', field_name: 'Actions', field_type: 'Built-in', is_builtin: true },
    ];

    useEffect(() => {
        const order = activeProject?.column_order || [
            'serial', 'rfi_no', 'status', 'actions'
        ];
        
        const allFields = [
            ...BUILT_IN_COLUMNS,
            ...(projectFields || []).map(f => ({ ...f, is_builtin: false }))
        ];

        const mappedFields = order.map(key => allFields.find(f => f.field_key === key)).filter(Boolean);
        
        // Add any fields that aren't in the order string yet (new fields)
        allFields.forEach(f => {
            if (!mappedFields.some(mf => mf.field_key === f.field_key)) {
                mappedFields.push(f);
            }
        });

        setOrderedFields(mappedFields);
        setColumnWidthsDraft(buildColumnWidthMap(mappedFields, activeProject?.column_widths || {}));
    }, [projectFields, activeProject]);

    useEffect(() => {
        if (!resizeState) return;

        function onMouseMove(e) {
            const delta = e.clientX - resizeState.startX;
            const next = sanitizeColumnWidth(resizeState.startWidth + delta, resizeState.startWidth);
            setColumnWidthsDraft((prev) => ({ ...prev, [resizeState.fieldKey]: next }));
            setIsReordering(true);
        }

        function onMouseUp() {
            setResizeState(null);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [resizeState]);

    const getDraftWidth = (fieldKey) => {
        return sanitizeColumnWidth(columnWidthsDraft[fieldKey], getDefaultColumnWidth(fieldKey));
    };

    const startResize = (event, fieldKey) => {
        event.preventDefault();
        event.stopPropagation();
        setResizeState({
            fieldKey,
            startX: event.clientX,
            startWidth: getDraftWidth(fieldKey),
        });
    };

    // ─── Fetch all users ───
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

    // Fetch all project memberships across all projects
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

    // ─── User actions ───
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

    // Approve pending or re-approve rejected: sets role ONLY (no project yet)
    async function approveUser(userId, userName) {
        const pa = pendingApprove[userId] || {};
        const role = pa.role;
        if (!role) { showMsg('Select a role first'); return; }
        const { data, error } = await supabase.from('profiles').update({ role }).eq('id', userId).select();
        if (error) { showMsg('Error: ' + error.message); return; }
        if (!data || data.length === 0) { showMsg('Error: Update blocked — check RLS policies on profiles table'); return; }
        showMsg(`${userName} approved as ${role}`);
        setPendingApprove(prev => { const n = { ...prev }; delete n[userId]; return n; });
        await fetchUsers();
    }

    // Decline a pending user — moves them to Rejected section
    async function declineUser(userId) {
        const { error } = await supabase.from('profiles').update({ role: 'rejected' }).eq('id', userId);
        if (!error) { showMsg('Request declined'); fetchUsers(); }
        else showMsg('Error: ' + error.message);
    }

    // Archive = soft-delete: hides card from dashboard, user record stays in DB
    async function archiveUser(userId, userName) {
        const { error } = await supabase.from('profiles').update({ is_archived: true }).eq('id', userId);
        if (!error) { showMsg(`${userName} removed`); fetchUsers(); }
        else showMsg('Error: ' + error.message);
    }

    // Assign unassigned user to a project
    async function assignUnassignedUser(userId, userName) {
        const projectId = assignProject[userId];
        if (!projectId) { showMsg('Select a project first'); return; }
        const u = users.find(x => x.id === userId);
        const role = u?.role || 'contractor';
        const result = await assignUserToProject(projectId, userId, role);
        if (result?.success) {
            showMsg(`${userName} assigned to project`);
            setAssignProject(prev => { const n = { ...prev }; delete n[userId]; return n; });
            fetchAllMemberships();
        } else {
            showMsg('Error: ' + (result?.error || 'Assignment failed'));
        }
    }

    // Add a member to the currently viewed project team
    async function handleAddTeamMember() {
        if (!addMemberUserId || !effectiveTeamProjectId) return;
        const result = await assignUserToProject(effectiveTeamProjectId, addMemberUserId, addMemberRole);
        if (result?.success) {
            showMsg('Member added to project');
            setAddMemberUserId('');
            fetchAllMemberships();
            fetchUsers();
        } else {
            showMsg('Error: ' + (result?.error || 'Failed'));
        }
    }

    // Remove a member from the currently viewed project team
    async function handleRemoveTeamMember(userId) {
        if (!effectiveTeamProjectId || !window.confirm('Remove this member from the project?')) return;
        const result = await removeUserFromProject(effectiveTeamProjectId, userId);
        if (result?.success) {
            showMsg('Member removed from project');
            fetchAllMemberships();
        }
    }

    // ─── Project actions ───
    async function handleCreateProject(e) {
        e.preventDefault();
        if (!newProjectName.trim()) return;
        const result = await createProject(
            newProjectName.trim(), 
            newProjectCode.trim(), 
            newProjectDesc.trim(),
            newProjectTimezone,
            { rfi_start_number: parseInt(newProjectStartNumber, 10) || 1 }
        );
        if (result?.success) {
            showMsg('Project created');
            setNewProjectName('');
            setNewProjectCode('');
            setNewProjectDesc('');
            setNewProjectTimezone('UTC');
            setShowNewProject(false);
            fetchProjects();
        } else {
            showMsg('Error: ' + (result?.error || 'Failed to create project'));
        }
    }

    async function handleUpdateProjectDetails(projectId) {
        if (!editCode.trim()) return;
        const result = await updateProject(projectId, { 
            code: editCode.trim(),
            timezone: editTimezone,
            subscription_status: editSubscriptionStatus,
            subscription_end: editSubscriptionEnd || null,
            is_locked: editIsLocked,
            payment_remarks: editPaymentRemarks.trim(),
            rfi_start_number: parseInt(editStartNumber, 10) || 1
        });
        if (result?.success) {
            showMsg('Project details updated');
            setEditingProject(null);
            setEditCode('');
            setEditTimezone('');
            setEditSubscriptionStatus('trial');
            setEditSubscriptionEnd('');
            setEditIsLocked(false);
            setEditPaymentRemarks('');
        } else {
            showMsg('Error: ' + (result?.error || 'Update failed'));
        }
    }

    async function handleDeleteProject(projectId) {
        if (projectId === '00000000-0000-0000-0000-000000000000') {
            showMsg('Cannot delete the default project');
            return;
        }
        if (!window.confirm('Delete this project and all its RFI fields? This cannot be undone.')) return;
        const result = await deleteProject(projectId);
        if (result?.success) { showMsg('Project deleted'); fetchProjects(); }
        else showMsg('Error: ' + (result?.error || 'Delete failed'));
    }

    // ─── Field actions ───
    async function handleAddField(e) {
        e.preventDefault();
        if (!newField.field_name.trim() || !activeProject) return;
        const key = newField.field_key.trim() || newField.field_name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        
        // Client-side validation: prevent duplicates before calling API
        const isDuplicate = projectFields.some(f => f.field_key === key) || BUILT_IN_COLUMNS.some(f => f.field_key === key);
        if (isDuplicate) {
            showMsg('Error: A field with this name or key already exists in this project.');
            return;
        }

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
            showMsg('Field added');
            setNewField({ field_name: '', field_key: '', field_type: 'text', is_required: false, options: '' });
            setShowNewField(false);
        } else {
            showMsg('Error: ' + (result?.error || 'Failed'));
        }
    }

    const moveField = (index, direction) => {
        const newArray = [...orderedFields];
        if (direction === 'up' && index > 0) {
            [newArray[index - 1], newArray[index]] = [newArray[index], newArray[index - 1]];
        } else if (direction === 'down' && index < newArray.length - 1) {
            [newArray[index + 1], newArray[index]] = [newArray[index], newArray[index + 1]];
        }
        setOrderedFields(newArray);
        setIsReordering(true);
    };

    const saveFieldOrder = async () => {
        try {
            setLoading(true);
            const columnOrderKeys = orderedFields.map(f => f.field_key);
            const { error: updateProjectError } = await supabase
                .from('projects')
                .update({
                    column_order: columnOrderKeys,
                    column_widths: columnWidthsDraft,
                })
                .eq('id', activeProject.id);
            if (updateProjectError) {
                throw new Error(updateProjectError.message || 'Failed to save project column layout');
            }

            // Also update traditional sort_order for custom fields for backward compatibility
            let customIndex = 0;
            for (let i = 0; i < orderedFields.length; i++) {
                const field = orderedFields[i];
                if (!field.is_builtin) {
                    const { error: fieldOrderError } = await supabase
                        .from('project_fields')
                        .update({ sort_order: customIndex })
                        .eq('id', field.id);
                    if (fieldOrderError) {
                        throw new Error(fieldOrderError.message || `Failed to update field order for ${field.field_name}`);
                    }
                    customIndex++;
                }
            }

            showMsg('Column layout saved successfully. Refresh to see changes across tables.');
            setIsReordering(false);
            // Give time for context reload
            setTimeout(() => window.location.reload(), 1000);
        } catch (err) {
            showMsg('Error updating order: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    async function handleDeleteField(fieldId) {
        if (!window.confirm('Delete this RFI field?')) return;
        const result = await deleteProjectField(fieldId);
        if (result?.success) showMsg('Field removed');
        else showMsg('Error: ' + (result?.error || 'Failed'));
    }

    async function handleToggleRequired(field) {
        await updateProjectField(field.id, { is_required: !field.is_required });
    }

    // ─── Computed ───
    const pendingUsers = users.filter(u => u.role === 'pending');
    const rejectedUsers = users.filter(u => u.role === 'rejected');
    const activeUsers = users.filter(u => !['pending', 'rejected'].includes(u.role));

    // Users who have a role but aren't in ANY project
    const assignedUserIds = new Set(allMemberships.map(m => m.user_id));
    const unassignedUsers = activeUsers.filter(u => !assignedUserIds.has(u.id));

    // Project Teams computed
    const effectiveTeamProjectId = teamProjectId || activeProject?.id || '';
    const teamMemberships = allMemberships.filter(m => m.project_id === effectiveTeamProjectId);
    const teamUsers = teamMemberships.map(m => {
        const u = users.find(x => x.id === m.user_id);
        return u ? { ...u, memberRole: m.role } : null;
    }).filter(Boolean);
    // Users eligible to add to this project (active, not already in this project)
    const teamMemberIds = new Set(teamMemberships.map(m => m.user_id));
    const addableUsers = activeUsers.filter(u => !teamMemberIds.has(u.id) && u.id !== user.id);

    const stats = {
        pending: pendingUsers.length,
        unassigned: unassignedUsers.length,
    };

    return (
        <div className="page-wrapper">
            <Header />
            <main className="admin-page">
                {/* High-Density Navigation Bar */}
                <div className="admin-nav-bar" style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>
                    <div className="admin-tabs">
                        <button className={`admin-tab-btn ${activeTab === 'projects' ? 'active' : ''}`} onClick={() => setActiveTab('projects')}>
                            <Building size={16} /> Projects
                        </button>
                        <button className={`admin-tab-btn ${activeTab === 'fields' ? 'active' : ''}`} onClick={() => setActiveTab('fields')}>
                            <Columns3 size={16} /> RFI Table Fields
                        </button>
                        <button className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                            <Users size={16} /> Users &amp; Assignments
                        </button>
                    </div>

                    <div className="admin-nav-actions">
                        {activeTab === 'users' && (
                            <div className="users-stat-pills">
                                {stats.pending > 0 && <span className="ustat-pill ustat-warning">⏳ {stats.pending} Pending</span>}
                                {stats.unassigned > 0 && <span className="ustat-pill ustat-info">🔔 {stats.unassigned} Unassigned</span>}
                            </div>
                        )}
                        <button className="btn btn-ghost btn-sm btn-refresh-global" 
                            onClick={() => { activeTab === 'users' ? fetchUsers() : fetchProjects(); }} 
                            disabled={loading}
                            title="Refresh Data"
                        >
                            <RefreshCw size={16} className={loading ? 'spinner' : ''} />
                        </button>
                    </div>
                </div>

                {actionMessage && (
                    <div className={`submit-message ${actionMessage.startsWith('Error') ? 'warning' : 'success'}`}>
                        {actionMessage}
                    </div>
                )}

                {/* ═══════════ TAB: PROJECTS ═══════════ */}
                {activeTab === 'projects' && (
                    <div className="admin-section">
                        <div className="admin-section-header" style={{ justifyContent: 'flex-end', marginBottom: '1rem' }}>
                            <button className="btn btn-sm" style={{ background: 'var(--clr-brand-secondary)', color: '#fff', border: 'none' }}
                                onClick={() => setShowNewProject(!showNewProject)}>
                                <FolderPlus size={16} /> New Project
                            </button>
                        </div>

                        {showNewProject && (
                            <form className="admin-inline-form premium-project-form" onSubmit={handleCreateProject}>
                                <div className="form-grid">
                                    <div className="form-group">
                                        <label>Project Name *</label>
                                        <input type="text" placeholder="e.g. Burj Khalifa Site" value={newProjectName}
                                            onChange={e => setNewProjectName(e.target.value)} required />
                                    </div>
                                    <div className="form-group">
                                        <label>Project Code</label>
                                        <input type="text" placeholder="e.g. BK-01" value={newProjectCode}
                                            onChange={e => setNewProjectCode(e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Site Timezone</label>
                                        <SearchableSelect 
                                            options={ALL_TIMEZONES}
                                            value={newProjectTimezone}
                                            onChange={setNewProjectTimezone}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>RFI Start #</label>
                                        <input type="number" min="1" value={newProjectStartNumber}
                                            onChange={e => setNewProjectStartNumber(e.target.value)} />
                                    </div>
                                    <div className="form-group full-width">
                                        <label>Description</label>
                                        <input type="text" placeholder="Short description of the project scope..." value={newProjectDesc}
                                            onChange={e => setNewProjectDesc(e.target.value)} />
                                    </div>
                                </div>
                                <div className="form-actions">
                                    <button type="button" className="btn btn-ghost" onClick={() => setShowNewProject(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary" style={{ minWidth: '160px' }}>
                                        <Plus size={16} /> Create Project
                                    </button>
                                </div>
                            </form>
                        )}

                        <div className="admin-project-grid-premium">
                            {projects.map(p => (
                                <div key={p.id} className={`project-card-premium ${activeProject?.id === p.id ? 'active' : ''}`}
                                    onClick={() => changeActiveProject(p.id)}>
                                    
                                    {p.id !== '00000000-0000-0000-0000-000000000000' && editingProject !== p.id && (
                                        <button 
                                            className="btn-delete-floating" 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteProject(p.id); }}
                                            title="Delete Project"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}

                                    <div className="project-card-main">
                                        <div className="project-card-icon">
                                            <Briefcase size={22} />
                                        </div>
                                        <div className="project-card-content">
                                            <div className="project-card-header-row">
                                                <h3>{p.name}</h3>
                                                {activeProject?.id === p.id && <span className="active-tag">Active</span>}
                                            </div>
                                            <p className="project-desc">{p.description || 'No description provided.'}</p>
                                        </div>
                                    </div>

                                    <div className="project-card-details">
                                        <div className="detail-item">
                                            <span className="detail-label">Code</span>
                                            {editingProject === p.id ? (
                                                <input 
                                                    className="detail-input"
                                                    value={editCode}
                                                    onChange={e => setEditCode(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            ) : (
                                                <span className="detail-value">{p.code || '—'}</span>
                                            )}
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">Timezone</span>
                                            {editingProject === p.id ? (
                                                <SearchableSelect 
                                                    options={ALL_TIMEZONES}
                                                    value={editTimezone}
                                                    onChange={setEditTimezone}
                                                />
                                            ) : (
                                                <span className="detail-value" title={p.timezone}>
                                                    <Globe size={12} /> {p.timezone || 'UTC'}
                                                </span>
                                            )}
                                        </div>
                                        <div className="detail-item">
                                            <span className="detail-label">RFI Start #</span>
                                            {editingProject === p.id ? (
                                                <input 
                                                    type="number"
                                                    min="1"
                                                    className="detail-input"
                                                    value={editStartNumber}
                                                    onChange={e => setEditStartNumber(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            ) : (
                                                <span className="detail-value">{p.rfi_start_number || 1}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="project-card-details" style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem', marginTop: '1rem' }}>
                                        <div className="detail-item" style={{ flex: '1 1 100%' }}>
                                            <span className="detail-label" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#475569', fontWeight: 700, marginBottom: '0.5rem' }}>
                                                <Shield size={14} /> Subscription & Access Management
                                            </span>
                                        </div>
                                        
                                        <div className="detail-item">
                                            <span className="detail-label">Status</span>
                                            {editingProject === p.id ? (
                                                <select 
                                                    className="detail-select"
                                                    value={editSubscriptionStatus}
                                                    onChange={e => setEditSubscriptionStatus(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                >
                                                    <option value="trial">Trial</option>
                                                    <option value="active">Active</option>
                                                    <option value="expired">Expired</option>
                                                </select>
                                            ) : (
                                                <span className={`detail-value status-pill ${p.subscription_status || 'trial'}`} style={{ 
                                                    padding: '0.2rem 0.6rem', 
                                                    borderRadius: '999px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    background: p.subscription_status === 'active' ? 'var(--clr-success-bg)' : p.subscription_status === 'expired' ? 'var(--clr-danger-bg)' : 'var(--clr-warning-bg)',
                                                    color: p.subscription_status === 'active' ? 'var(--clr-success)' : p.subscription_status === 'expired' ? 'var(--clr-danger)' : 'var(--clr-warning)'
                                                }}>
                                                    {p.subscription_status || 'trial'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="detail-item">
                                            <span className="detail-label">Expiry Date</span>
                                            {editingProject === p.id ? (
                                                <input 
                                                    type="date"
                                                    className="detail-input"
                                                    value={editSubscriptionEnd ? editSubscriptionEnd.split('T')[0] : ''}
                                                    onChange={e => setEditSubscriptionEnd(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            ) : (
                                                <span className="detail-value">
                                                    <Clock size={12} /> {p.subscription_end ? new Date(p.subscription_end).toLocaleDateString() : 'No expiry'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="detail-item">
                                            <span className="detail-label">Manual Lock</span>
                                            {editingProject === p.id ? (
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                    <input 
                                                        type="checkbox"
                                                        checked={editIsLocked}
                                                        onChange={e => setEditIsLocked(e.target.checked)}
                                                        onClick={e => e.stopPropagation()}
                                                    />
                                                    <span style={{ fontSize: '0.85rem' }}>Restrict Access</span>
                                                </label>
                                            ) : (
                                                <span className="detail-value" style={{ color: p.is_locked ? '#ef4444' : '#10b981' }}>
                                                    {p.is_locked ? 'Locked' : 'Open'}
                                                </span>
                                            )}
                                        </div>

                                        {editingProject === p.id && (
                                            <div className="detail-item" style={{ flex: '1 1 100%', marginTop: '0.5rem' }}>
                                                <span className="detail-label">Payment Remarks</span>
                                                <textarea 
                                                    className="detail-input"
                                                    style={{ height: '60px', resize: 'none' }}
                                                    placeholder="Internal notes about payment..."
                                                    value={editPaymentRemarks}
                                                    onChange={e => setEditPaymentRemarks(e.target.value)}
                                                    onClick={e => e.stopPropagation()}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    <div className="project-card-actions" onClick={e => e.stopPropagation()}>
                                        {editingProject === p.id ? (
                                            <>
                                                <button className="btn-save" onClick={() => handleUpdateProjectDetails(p.id)}><Save size={14} /> Save Changes</button>
                                                <button className="btn-cancel" onClick={() => setEditingProject(null)}><X size={14} /></button>
                                            </>
                                        ) : (
                                            <button className="btn-edit" onClick={() => { 
                                                setEditingProject(p.id); 
                                                setEditCode(p.code || ''); 
                                                setEditTimezone(p.timezone || 'UTC');
                                                setEditSubscriptionStatus(p.subscription_status || 'trial');
                                                setEditSubscriptionEnd(p.subscription_end || '');
                                                setEditIsLocked(p.is_locked || false);
                                                setEditPaymentRemarks(p.payment_remarks || '');
                                                setEditStartNumber(p.rfi_start_number || 1);
                                            }}>
                                                Edit Project Details
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══════════ TAB: RFI FIELDS ═══════════ */}
                {activeTab === 'fields' && (
                    <div className="admin-section">
                        <div className="admin-section-header" style={{ justifyContent: 'flex-end', marginBottom: '1rem' }}>
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

                        {isReordering && (
                            <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--clr-warning-bg)', border: '1px solid var(--clr-warning-border)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.9rem', color: 'var(--clr-warning)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <AlertCircle size={16} /> <strong>Unsaved layout changes:</strong> Order and width settings are pending save.
                                </span>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => {
                                            const reset = {};
                                            orderedFields.forEach((f) => {
                                                reset[f.field_key] = getDefaultColumnWidth(f.field_key);
                                            });
                                            setColumnWidthsDraft(reset);
                                            setIsReordering(true);
                                        }}
                                        className="btn btn-sm btn-ghost"
                                        style={{ border: '1px solid var(--clr-warning-border)', color: 'var(--clr-warning)' }}
                                    >
                                        Reset Widths
                                    </button>
                                    <button onClick={saveFieldOrder} className="btn btn-sm" style={{ backgroundColor: 'var(--clr-warning)', color: 'white', border: 'none', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                        <Save size={14} /> Save Layout
                                    </button>
                                </div>
                            </div>
                        )}

                        <div style={{ marginBottom: '1rem', border: '1px solid var(--clr-border)', borderRadius: '10px', overflow: 'hidden' }}>
                            <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-bg-secondary)', fontSize: '0.85rem', color: 'var(--clr-text-muted)' }}>
                                Drag the right edge of each header below to resize columns visually.
                            </div>
                            <div className="rfi-table-wrapper" style={{ margin: 0 }}>
                                <table className="rfi-table editable" style={{ tableLayout: 'fixed' }}>
                                    <thead>
                                        <tr>
                                            {orderedFields.map((f) => {
                                                const width = getDraftWidth(f.field_key);
                                                return (
                                                    <th
                                                        key={`preview_${f.field_key}`}
                                                        style={{
                                                            width: `${width}px`,
                                                            minWidth: `${width}px`,
                                                            position: 'relative',
                                                            userSelect: 'none',
                                                            wordBreak: 'break-word',
                                                            whiteSpace: 'normal',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem', flexWrap: 'wrap' }}>
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.field_name}</span>
                                                            <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 500 }}>{width}px</span>
                                                        </div>
                                                        <span
                                                            role="separator"
                                                            aria-orientation="vertical"
                                                            title="Drag to resize"
                                                            onMouseDown={(e) => startResize(e, f.field_key)}
                                                            onDoubleClick={() => {
                                                                const resetWidth = getDefaultColumnWidth(f.field_key);
                                                                setColumnWidthsDraft((prev) => ({ ...prev, [f.field_key]: resetWidth }));
                                                                setIsReordering(true);
                                                            }}
                                                            style={{
                                                                position: 'absolute',
                                                                top: 0,
                                                                right: -5,
                                                                width: '10px',
                                                                height: '100%',
                                                                cursor: 'col-resize',
                                                                zIndex: 2,
                                                            }}
                                                        >
                                                            <span
                                                                style={{
                                                                    position: 'absolute',
                                                                    top: '22%',
                                                                    bottom: '22%',
                                                                    left: '50%',
                                                                    width: '2px',
                                                                    transform: 'translateX(-50%)',
                                                                    background: resizeState?.fieldKey === f.field_key ? 'var(--clr-brand-secondary)' : '#cbd5e1',
                                                                    borderRadius: '2px',
                                                                }}
                                                            />
                                                        </span>
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            {orderedFields.map((f) => {
                                                const width = getDraftWidth(f.field_key);
                                                return (
                                                    <td
                                                        key={`preview_cell_${f.field_key}`}
                                                        style={{
                                                            width: `${width}px`,
                                                            minWidth: `${width}px`,
                                                            whiteSpace: 'nowrap',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                        }}
                                                    >
                                                        Sample {f.field_name}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="rfi-table-wrapper">
                            <table className="rfi-table editable">
                                <thead>
                                    <tr>
                                        <th style={{ width: '60px', textAlign: 'center' }}>Order</th>
                                        <th>Column Name</th>
                                        <th>Key</th>
                                        <th>Type</th>
                                        <th style={{ width: '110px', textAlign: 'center' }}>Width (px)</th>
                                        <th>Options</th>
                                        <th style={{ width: '80px', textAlign: 'center' }}>Required</th>
                                        <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {orderedFields.length === 0 ? (
                                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>No columns configured yet.</td></tr>
                                    ) : (
                                        orderedFields.map((f, i) => (
                                            <tr key={f.id || f.field_key} style={{ backgroundColor: f.is_builtin ? 'var(--clr-bg-secondary)' : 'var(--clr-bg-main)' }}>
                                                <td style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                                                    <button type="button" className="btn btn-sm btn-ghost" disabled={i === 0} onClick={() => moveField(i, 'up')} style={{ padding: '0.2rem', color: i === 0 ? '#cbd5e1' : '#64748b' }}>
                                                        <ArrowUp size={16} />
                                                    </button>
                                                    <button type="button" className="btn btn-sm btn-ghost" disabled={i === orderedFields.length - 1} onClick={() => moveField(i, 'down')} style={{ padding: '0.2rem', color: i === orderedFields.length - 1 ? '#cbd5e1' : '#64748b' }}>
                                                        <ArrowDown size={16} />
                                                    </button>
                                                </td>
                                                <td style={{ fontWeight: 600, color: f.is_builtin ? 'var(--clr-text-secondary)' : 'var(--clr-brand-primary)' }}>{f.field_name}</td>
                                                <td><code style={{ fontSize: '0.8rem', background: 'var(--clr-bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>{f.field_key}</code></td>
                                                <td>{f.is_builtin ? 'Built-in' : (FIELD_TYPES.find(t => t.value === f.field_type)?.label || f.field_type)}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <input
                                                        type="number"
                                                        min={80}
                                                        max={640}
                                                        value={columnWidthsDraft[f.field_key] ?? getDefaultColumnWidth(f.field_key)}
                                                        onChange={(e) => {
                                                            const nextWidth = sanitizeColumnWidth(e.target.value, getDefaultColumnWidth(f.field_key));
                                                            setColumnWidthsDraft((prev) => ({ ...prev, [f.field_key]: nextWidth }));
                                                            setIsReordering(true);
                                                        }}
                                                        style={{ width: '88px' }}
                                                    />
                                                </td>
                                                <td>
                                                    {!f.is_builtin && f.field_type === 'select' && Array.isArray(f.options) ? (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                                            {f.options.map((o, idx) => (
                                                                <span key={idx} style={{ background: 'var(--clr-bg-secondary)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>{o}</span>
                                                            ))}
                                                        </div>
                                                    ) : '—'}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <input type="checkbox" checked={f.is_required || f.is_builtin} disabled={f.is_builtin} onChange={() => !f.is_builtin && handleToggleRequired(f)} />
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {!f.is_builtin ? (
                                                        <button className="btn btn-sm btn-ghost" style={{ color: 'var(--clr-danger)' }}
                                                            onClick={() => handleDeleteField(f.id)} title="Delete custom field">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    ) : (
                                                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Fixed</span>
                                                    )}
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

                        {/* ── PENDING APPROVALS ── */}
                        {pendingUsers.length > 0 && (
                            <div className="ua-block">
                                <div className="ua-block-header">
                                    <div className="ua-block-label">
                                        <span className="ua-count">{pendingUsers.length}</span>
                                        Pending Approval{pendingUsers.length !== 1 ? 's' : ''}
                                    </div>
                                </div>
                                <p className="ua-hint">Approve new sign-ups by assigning a role. They'll move to Unassigned for project placement.</p>
                                <div className="ua-list">
                                    {pendingUsers.map(pu => {
                                        const pa = pendingApprove[pu.id] || {};
                                        return (
                                            <div key={pu.id} className="ua-row">
                                                <div className="ua-row-user">
                                                    <UserAvatar name={pu.name} avatarUrl={pu.avatar_url} size={36} />
                                                    <div>
                                                        <div className="ua-row-name">{pu.name}</div>
                                                        <div className="ua-row-meta">{pu.company || 'No company'}</div>
                                                    </div>
                                                </div>
                                                <div className="ua-row-actions">
                                                    <select className="ua-select"
                                                        value={pa.role || ''}
                                                        onChange={e => setPendingApprove(prev => ({ ...prev, [pu.id]: { ...pa, role: e.target.value } }))}>
                                                        <option value="" disabled>Role…</option>
                                                        <option value="contractor">Contractor</option>
                                                        <option value="consultant">Consultant</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                    <button className="ua-btn ua-btn-primary" onClick={() => approveUser(pu.id, pu.name)}>
                                                        <UserCheck size={14} /> Approve
                                                    </button>
                                                    <button className="ua-btn ua-btn-danger-ghost" onClick={() => declineUser(pu.id, pu.name)}>
                                                        <UserX size={14} /> Decline
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── REJECTED ── */}
                        {rejectedUsers.length > 0 && (
                            <div className="ua-block ua-block-muted">
                                <button className="ua-block-header ua-collapse-btn" onClick={() => setRejectedCollapsed(c => !c)}>
                                    <div className="ua-block-label">
                                        <span className="ua-count ua-count-muted">{rejectedUsers.length}</span>
                                        Rejected
                                    </div>
                                    <span className="ua-chevron">{rejectedCollapsed ? '›' : '‹'}</span>
                                </button>
                                {!rejectedCollapsed && (
                                    <div className="ua-list">
                                        {rejectedUsers.map(ru => {
                                            const pa = pendingApprove[ru.id] || {};
                                            return (
                                                <div key={ru.id} className="ua-row">
                                                    <div className="ua-row-user">
                                                        <UserAvatar name={ru.name} avatarUrl={ru.avatar_url} size={36} />
                                                        <div>
                                                            <div className="ua-row-name">{ru.name}</div>
                                                            <div className="ua-row-meta">{ru.company || 'No company'}</div>
                                                        </div>
                                                    </div>
                                                    <div className="ua-row-actions">
                                                        <select className="ua-select"
                                                            value={pa.role || ''}
                                                            onChange={e => setPendingApprove(prev => ({ ...prev, [ru.id]: { ...pa, role: e.target.value } }))}>
                                                            <option value="" disabled>Re-approve as…</option>
                                                            <option value="contractor">Contractor</option>
                                                            <option value="consultant">Consultant</option>
                                                            <option value="admin">Admin</option>
                                                        </select>
                                                        <button className="ua-btn ua-btn-primary" onClick={() => approveUser(ru.id, ru.name)}>
                                                            <UserCheck size={14} /> Approve
                                                        </button>
                                                        <button className="ua-btn ua-btn-danger-ghost" onClick={() => archiveUser(ru.id, ru.name)} title="Remove">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── UNASSIGNED USERS ── */}
                        {unassignedUsers.length > 0 && (
                            <div className="ua-block">
                                <div className="ua-block-header">
                                    <div className="ua-block-label">
                                        <span className="ua-count">{unassignedUsers.length}</span>
                                        Unassigned — Not in Any Project
                                    </div>
                                </div>
                                <p className="ua-hint">Approved users waiting to be added to a project.</p>
                                <div className="ua-list">
                                    {unassignedUsers.map(u => (
                                        <div key={u.id} className="ua-row">
                                            <div className="ua-row-user">
                                                <UserAvatar name={u.name} avatarUrl={u.avatar_url} size={36} />
                                                <div>
                                                    <div className="ua-row-name">{u.name}</div>
                                                    <div className="ua-row-meta">
                                                        {u.company || 'No company'} · <span className="ua-role-badge">{u.role}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="ua-row-actions">
                                                <select className="ua-select"
                                                    value={assignProject[u.id] || ''}
                                                    onChange={e => setAssignProject(prev => ({ ...prev, [u.id]: e.target.value }))}>
                                                    <option value="" disabled>Project…</option>
                                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                </select>
                                                <button className="ua-btn ua-btn-primary" onClick={() => assignUnassignedUser(u.id, u.name)}>
                                                    <FolderPlus size={14} /> Assign
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── PROJECT TEAMS ── */}
                        <div className="ua-block">
                            <div className="ua-block-header">
                                <div className="ua-block-label">Project Team</div>
                                <select className="ua-select ua-select-wide"
                                    value={effectiveTeamProjectId}
                                    onChange={e => setTeamProjectId(e.target.value)}>
                                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>

                            {teamUsers.length === 0 ? (
                                <p className="ua-hint" style={{ padding: '0.75rem 0 0.25rem' }}>No members in this project. Add someone below.</p>
                            ) : (
                                <div className="ua-team-list">
                                    {teamUsers.map(m => (
                                        <div key={m.id} className="ua-team-row">
                                            <UserAvatar name={m.name} avatarUrl={m.avatar_url} size={30} />
                                            <span className="ua-team-name">{m.name}</span>
                                            <span className="ua-role-badge">{m.memberRole}</span>
                                            <span className="ua-team-company">{m.company || ''}</span>
                                            {m.id !== user.id && (
                                                <button className="ua-btn ua-btn-icon" onClick={() => handleRemoveTeamMember(m.id)} title="Remove from project">
                                                    <X size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {addableUsers.length > 0 && (
                                <div className="ua-team-add">
                                    <select className="ua-select" style={{ flex: 2, minWidth: 0 }}
                                        value={addMemberUserId}
                                        onChange={e => setAddMemberUserId(e.target.value)}>
                                        <option value="">Add member…</option>
                                        {addableUsers.map(u => (
                                            <option key={u.id} value={u.id}>{u.name} — {u.role}</option>
                                        ))}
                                    </select>
                                    <select className="ua-select" value={addMemberRole}
                                        onChange={e => setAddMemberRole(e.target.value)}>
                                        <option value="contractor">Contractor</option>
                                        <option value="consultant">Consultant</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                    <button className="ua-btn ua-btn-primary" onClick={handleAddTeamMember}>
                                        <UserPlus size={14} /> Add
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Link to full Users directory */}
                        <div className="ua-link-row">
                            <button className="ua-btn ua-btn-outline" onClick={() => navigate('/admin/users')}>
                                <Users size={14} /> View All Members
                            </button>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
}
