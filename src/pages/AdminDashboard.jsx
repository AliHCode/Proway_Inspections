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
    Search, ChevronDown, LifeBuoy, MessageSquare, Send, ArrowRight, Tag, Paperclip, Paintbrush, Eye
} from 'lucide-react';

const STYLE_COLORS = [
    { label: 'Default', value: 'inherit' },
    { label: 'Info Blue', value: '#0ea5e9' },
    { label: 'Success Green', value: '#10b981' },
    { label: 'Warning Yellow', value: '#f59e0b' },
    { label: 'Danger Red', value: '#f43f5e' },
    { label: 'Neutral Slate', value: '#64748b' }
];

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

// --- ProjectEditOverlay Component (Portal-based) ---
function ProjectEditOverlay({ 
    project, 
    onClose, 
    onSave,
    editState, // { code, timezone, startNumber, subscriptionStatus, subscriptionEnd, isLocked, paymentRemarks, assignmentMode, showFilerInfo, showEscalatedBadge }
    setEditState
}) {
    if (!project) return null;

    return createPortal(
        <div className="action-sheet-overlay open" onClick={onClose}>
            <div className="action-sheet-panel project-edit-panel open" onClick={e => e.stopPropagation()}>
                <div className="sheet-handle"></div>
                
                <div className="action-sheet-header project-edit-header">
                    <div className="header-content">
                        <div className="title-group">
                            <h3 className="action-sheet-title">Project Settings</h3>
                            <p className="action-sheet-subtitle">{project.name}</p>
                        </div>
                        <button className="btn-close-hex" onClick={onClose}>
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="action-sheet-body project-edit-body">
                    <div className="overlay-form-container">
                        {/* Section: Site Config */}
                        <div className="overlay-section">
                            <h4 className="overlay-section-title"><Globe size={16} /> Site Configuration</h4>
                            <div className="form-row">
                                <div className="form-group flex-1">
                                    <label>Project Code</label>
                                    <input 
                                        type="text" 
                                        className="premium-input"
                                        value={editState.code}
                                        onChange={e => setEditState(prev => ({ ...prev, code: e.target.value }))}
                                        placeholder="e.g. RR007"
                                    />
                                </div>
                                <div className="form-group flex-1">
                                    <label>RFI Start #</label>
                                    <input 
                                        type="number" 
                                        className="premium-input"
                                        min="1"
                                        value={editState.startNumber}
                                        onChange={e => setEditState(prev => ({ ...prev, startNumber: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Site Timezone</label>
                                <SearchableSelect 
                                    options={ALL_TIMEZONES}
                                    value={editState.timezone}
                                    onChange={val => setEditState(prev => ({ ...prev, timezone: val }))}
                                />
                            </div>
                        </div>

                        {/* Section: Access & Subscription */}
                        <div className="overlay-section">
                            <h4 className="overlay-section-title"><Shield size={16} /> Access & Subscription</h4>
                            <div className="form-row">
                                <div className="form-group flex-1">
                                    <label>Status</label>
                                    <select 
                                        className="premium-select"
                                        value={editState.subscriptionStatus}
                                        onChange={e => setEditState(prev => ({ ...prev, subscriptionStatus: e.target.value }))}
                                    >
                                        <option value="trial">Trial</option>
                                        <option value="active">Active</option>
                                        <option value="expired">Expired</option>
                                    </select>
                                </div>
                                <div className="form-group flex-1">
                                    <label>Expiry Date</label>
                                    <input 
                                        type="date" 
                                        className="premium-input"
                                        value={editState.subscriptionEnd ? editState.subscriptionEnd.split('T')[0] : ''}
                                        onChange={e => setEditState(prev => ({ ...prev, subscriptionEnd: e.target.value }))}
                                    />
                                </div>
                            </div>
                            <div className="form-group">
                                <div className="modern-lock-card">
                                    <label className="checkbox-label-modern">
                                        <input 
                                            type="checkbox"
                                            checked={editState.isLocked}
                                            onChange={e => setEditState(prev => ({ ...prev, isLocked: e.target.checked }))}
                                        />
                                        <div className="checkbox-meta">
                                            <strong>Restrict Access (Manual Lock)</strong>
                                            <p>When locked, no new RFIs can be filed by contractors.</p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                            <div className="form-group">
                                <label>RFI Assignment Mode</label>
                                <div className="assignment-segmented-control">
                                    {[
                                        { value: 'direct', label: 'Direct', desc: 'Contractor assigns consultant' },
                                        { value: 'open', label: 'Open Queue', desc: 'First to act wins' },
                                        { value: 'claim', label: 'Claim', desc: 'Consultants claim RFIs' }
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={`segment-btn ${editState.assignmentMode === opt.value ? 'active' : ''}`}
                                            onClick={() => setEditState(prev => ({ ...prev, assignmentMode: opt.value }))}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Internal Payment Remarks</label>
                                <textarea 
                                    className="premium-textarea"
                                    value={editState.paymentRemarks}
                                    onChange={e => setEditState(prev => ({ ...prev, paymentRemarks: e.target.value }))}
                                    placeholder="Internal notes about billing or scope..."
                                    rows={3}
                                />
                            </div>
                        </div>

                        {/* Section: Display Prefs */}
                        <div className="overlay-section">
                            <h4 className="overlay-section-title"><Eye size={16} /> Dashboard Display Preferences</h4>
                            <div className="form-row">
                                <label className="checkbox-label-modern flex-1">
                                    <input 
                                        type="checkbox"
                                        checked={editState.showFilerInfo}
                                        onChange={e => setEditState(prev => ({ ...prev, showFilerInfo: e.target.checked }))}
                                    />
                                    <div className="checkbox-meta">
                                        <strong>Contractor Info</strong>
                                        <p>Show Avatars in table</p>
                                    </div>
                                </label>
                                <label className="checkbox-label-modern flex-1">
                                    <input 
                                        type="checkbox"
                                        checked={editState.showEscalatedBadge}
                                        onChange={e => setEditState(prev => ({ ...prev, showEscalatedBadge: e.target.checked }))}
                                    />
                                    <div className="checkbox-meta">
                                        <strong>Escalated Badges</strong>
                                        <p>Highlight aging RFIs</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="action-sheet-footer project-edit-footer">
                    <button className="btn btn-premium-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-premium-save" onClick={onSave}>
                        <Save size={18} /> <span>Save All Changes</span>
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default function AdminDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const {
        projects, activeProject, fetchProjects, createProject, updateProject, deleteProject, changeActiveProject,
        projectFields, addProjectField, updateProjectField, deleteProjectField,
        assignUserToProject, removeUserFromProject, fetchProjectMembers,
        loadingFields, fieldsResolvedProjectId,
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
    const [editAssignmentMode, setEditAssignmentMode] = useState('direct');
    const [editShowFilerInfo, setEditShowFilerInfo] = useState(true);
    const [editShowEscalatedBadge, setEditShowEscalatedBadge] = useState(true);

    // Field creation form
    const [showNewField, setShowNewField] = useState(false);
    const [newField, setNewField] = useState({ field_name: '', field_key: '', field_type: 'text', is_required: false, options: '' });
    
    // Field ordering state
    const [orderedFields, setOrderedFields] = useState([]);
    const [isReordering, setIsReordering] = useState(false);
    const [columnWidthsDraft, setColumnWidthsDraft] = useState({});
    const [columnStylesDraft, setColumnStylesDraft] = useState({});
    const [activeStyleColumn, setActiveStyleColumn] = useState(null);
    const [resizeState, setResizeState] = useState(null);

    const BUILT_IN_COLUMNS = [
        { id: 'builtin_serial', field_key: 'serial', field_name: 'Sr#', field_type: 'Built-in', is_builtin: true },
        { id: 'builtin_rfi_no', field_key: 'rfi_no', field_name: 'RFI #', field_type: 'Built-in', is_builtin: true },
        { id: 'builtin_status', field_key: 'status', field_name: 'Status', field_type: 'Built-in', is_builtin: true },
        { id: 'builtin_actions', field_key: 'actions', field_name: 'Actions', field_type: 'Built-in', is_builtin: true },
    ];

    useEffect(() => {
        const order = activeProject?.column_order || [
            'serial', 'rfi_no', 'status', 'actions'
        ];
        
        const validProjectFields = (projectFields || []).filter(f => !f.project_id || f.project_id === activeProject?.id);

        const allFields = [
            ...BUILT_IN_COLUMNS,
            ...validProjectFields.map(f => ({ ...f, is_builtin: false }))
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
        setColumnStylesDraft(activeProject?.column_styles || {});
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
            rfi_start_number: parseInt(editStartNumber, 10) || 1,
            assignment_mode: editAssignmentMode,
            show_filer_info: editShowFilerInfo,
            show_escalated_badge: editShowEscalatedBadge
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
            setEditAssignmentMode('direct');
            setEditShowFilerInfo(true);
            setEditShowEscalatedBadge(true);
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
                    column_styles: columnStylesDraft,
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
                            <Building size={16} /> <span className="tab-label">Projects</span>
                        </button>
                        <button className={`admin-tab-btn ${activeTab === 'fields' ? 'active' : ''}`} onClick={() => setActiveTab('fields')}>
                            <Columns3 size={16} /> <span className="tab-label">RFI Table Fields</span>
                        </button>
                        <button className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
                            <Users size={16} /> <span className="tab-label">Users &amp; Assignments</span>
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
                                    
                                    {p.id !== '00000000-0000-0000-0000-000000000000' && (
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
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <h3>{p.name}</h3>
                                                    {activeProject?.id === p.id && <span className="active-tag-condensed">ACTIVE</span>}
                                                </div>
                                                <span className={`subscription-pill ${p.subscription_status || 'trial'}`}>
                                                    {p.subscription_status || 'trial'}
                                                </span>
                                            </div>
                                            <p className="project-desc">{p.description || 'No description provided.'}</p>
                                        </div>
                                    </div>

                                    <div className="project-card-bento">
                                        <div className="bento-box">
                                            <span className="bento-label">CODE</span>
                                            <span className="bento-value">{p.code || '—'}</span>
                                        </div>
                                        <div className="bento-box">
                                            <span className="bento-label">TIMEZONE</span>
                                            <span className="bento-value" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <Globe size={12} /> {p.timezone?.split('/').pop().replace(/_/g, ' ') || 'UTC'}
                                            </span>
                                        </div>
                                        <div className="bento-box">
                                            <span className="bento-label">RFI START #</span>
                                            <span className="bento-value">{p.rfi_start_number || 1000}</span>
                                        </div>
                                    </div>

                                    <button 
                                        className="btn-edit-project-overlay" 
                                        onClick={(e) => { 
                                            e.stopPropagation();
                                            setEditingProject(p);
                                            setEditCode(p.code || ''); 
                                            setEditTimezone(p.timezone || 'UTC');
                                            setEditSubscriptionStatus(p.subscription_status || 'trial');
                                            setEditSubscriptionEnd(p.subscription_end || '');
                                            setEditIsLocked(p.is_locked || false);
                                            setEditPaymentRemarks(p.payment_remarks || '');
                                            setEditStartNumber(p.rfi_start_number || 1);
                                            setEditAssignmentMode(p.assignment_mode || 'direct');
                                            setEditShowFilerInfo(p.show_filer_info !== false);
                                            setEditShowEscalatedBadge(p.show_escalated_badge !== false);
                                        }}
                                    >
                                        Edit Project Details
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* Project Edit Overlay */}
                        {editingProject && (
                            <ProjectEditOverlay 
                                project={editingProject}
                                onClose={() => setEditingProject(null)}
                                onSave={() => handleUpdateProjectDetails(editingProject.id)}
                                editState={{
                                    code: editCode,
                                    timezone: editTimezone,
                                    startNumber: editStartNumber,
                                    subscriptionStatus: editSubscriptionStatus,
                                    subscriptionEnd: editSubscriptionEnd,
                                    isLocked: editIsLocked,
                                    paymentRemarks: editPaymentRemarks,
                                    assignmentMode: editAssignmentMode,
                                    showFilerInfo: editShowFilerInfo,
                                    showEscalatedBadge: editShowEscalatedBadge
                                }}
                                setEditState={(update) => {
                                    if (typeof update === 'function') {
                                        const next = update({
                                            code: editCode, timezone: editTimezone, startNumber: editStartNumber,
                                            subscriptionStatus: editSubscriptionStatus, subscriptionEnd: editSubscriptionEnd,
                                            isLocked: editIsLocked, paymentRemarks: editPaymentRemarks,
                                            assignmentMode: editAssignmentMode, showFilerInfo: editShowFilerInfo,
                                            showEscalatedBadge: editShowEscalatedBadge
                                        });
                                        setEditCode(next.code);
                                        setEditTimezone(next.timezone);
                                        setEditStartNumber(next.startNumber);
                                        setEditSubscriptionStatus(next.subscriptionStatus);
                                        setEditSubscriptionEnd(next.subscriptionEnd);
                                        setEditIsLocked(next.isLocked);
                                        setEditPaymentRemarks(next.paymentRemarks);
                                        setEditAssignmentMode(next.assignmentMode);
                                        setEditShowFilerInfo(next.showFilerInfo);
                                        setEditShowEscalatedBadge(next.showEscalatedBadge);
                                    }
                                }}
                            />
                        )}
                    </div>
                )}

                {/* ═══════════ TAB: RFI FIELDS ═══════════ */}
                {activeTab === 'fields' && (
                    <div className="admin-section">
                        <div className="admin-section-header" style={{ justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    Header Background
                                    <input 
                                        type="color" 
                                        value={columnStylesDraft?.HEADER_ROW?.backgroundColor || '#f8fafc'}
                                        onChange={e => {
                                            setColumnStylesDraft(prev => ({ ...prev, HEADER_ROW: { ...(prev.HEADER_ROW || {}), backgroundColor: e.target.value } }));
                                            setIsReordering(true);
                                        }}
                                        style={{ width: '30px', height: '30px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    />
                                </label>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    Text Color
                                    <input 
                                        type="color" 
                                        value={columnStylesDraft?.HEADER_ROW?.color || '#334155'}
                                        onChange={e => {
                                            setColumnStylesDraft(prev => ({ ...prev, HEADER_ROW: { ...(prev.HEADER_ROW || {}), color: e.target.value } }));
                                            setIsReordering(true);
                                        }}
                                        style={{ width: '30px', height: '30px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                    />
                                </label>
                            </div>
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

                        {/* Stale/Loading State Protection */}
                        {(loadingFields || fieldsResolvedProjectId !== activeProject?.id) ? (
                            <div className="admin-loading-placeholder" style={{ 
                                padding: '4rem', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '2px dashed #e2e8f0', color: '#64748b'
                            }}>
                                <RefreshCw size={32} className="spinner" style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                <p style={{ fontWeight: 500 }}>Syncing fields for {activeProject?.name}...</p>
                                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>This prevents accidentally modifying columns from the previous project.</p>
                            </div>
                        ) : (
                            <>
                                <p className="admin-help-text" style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1.5rem', fontStyle: 'italic' }}>
                                    Drag the right edge of each header below to resize columns visually.
                                </p>

                                <div className="admin-field-designer-wrapper">
                                    <div className="table-preview-interactive">
                                        <div className="preview-header-row">
                                            {orderedFields.map((f, i) => (
                                                <div 
                                                    key={f.field_key} 
                                                    className="preview-th"
                                                    style={{ width: getDraftWidth(f.field_key) }}
                                                >
                                                    <div className="th-content" style={{ justifyContent: 'center' }}>
                                                        <span className="th-label" style={{ fontSize: '0.8rem', color: '#1e293b' }}>{f.field_name}</span>
                                                        {!f.is_builtin && <button className="btn-remove-preview" onClick={() => handleDeleteField(f.id)}>×</button>}
                                                    </div>
                                                    <div className="resizer-handle" onMouseDown={(e) => startResize(e, f.field_key)} />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="preview-data-row">
                                            {orderedFields.map((f) => (
                                                <div key={f.field_key} className="preview-td" style={{ width: getDraftWidth(f.field_key), textAlign: 'center', backgroundColor: '#f8fafc', color: '#6366f1', fontWeight: 600, borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem' }}>
                                                    {getDraftWidth(f.field_key)} PX
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="designer-table-container">
                                    <table className="designer-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: '90px' }}>ORDER</th>
                                                <th>COLUMN DETAIL</th>
                                                <th style={{ width: '120px' }}>TYPE</th>
                                                <th style={{ width: '130px' }}>WIDTH</th>
                                                <th style={{ width: '100px' }}>STYLE</th>
                                                <th>OPTIONS</th>
                                                <th style={{ width: '100px', textAlign: 'center' }}>REQUIRED</th>
                                                <th style={{ width: '100px', textAlign: 'center' }}>ACTIONS</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orderedFields.map((f, idx) => (
                                                <tr key={f.field_key} className={`designer-row ${f.is_builtin ? 'row-builtin' : ''}`}>
                                                    <td className="designer-td">
                                                        <div className="reorder-btns-modern">
                                                            <button className="btn-reorder-modern" onClick={() => moveField(idx, 'up')} disabled={idx === 0}><ArrowUp size={16} /></button>
                                                            <button className="btn-reorder-modern" onClick={() => moveField(idx, 'down')} disabled={idx === orderedFields.length - 1}><ArrowDown size={16} /></button>
                                                        </div>
                                                    </td>
                                                    <td className="designer-td">
                                                        <div className="designer-field-name">
                                                            <div className="designer-field-title">
                                                                {f.is_builtin ? <Shield size={14} color="#94a3b8" /> : <Tag size={14} color="#6366f1" />}
                                                                {f.field_name}
                                                            </div>
                                                            <span className="designer-field-key">{f.field_key}</span>
                                                        </div>
                                                    </td>
                                                    <td className="designer-td">
                                                        <span className={`badge-type ${f.field_type}`}>{f.field_type || 'Custom'}</span>
                                                    </td>
                                                    <td className="designer-td">
                                                        <div className="designer-input-wrapper">
                                                            <input 
                                                                type="number"
                                                                value={getDraftWidth(f.field_key)}
                                                                onChange={(e) => {
                                                                    const val = parseInt(e.target.value, 10) || 80;
                                                                    setColumnWidthsDraft(prev => ({ ...prev, [f.field_key]: val }));
                                                                    setIsReordering(true);
                                                                }}
                                                            />
                                                            <span className="designer-input-suffix">px</span>
                                                        </div>
                                                    </td>
                                                    <td className="designer-td" style={{ position: 'relative', overflow: 'visible' }}>
                                                        <button 
                                                            className="btn btn-ghost btn-sm" 
                                                            style={{ 
                                                                padding: '0.35rem 0.5rem', 
                                                                color: columnStylesDraft[f.field_key]?.color !== 'inherit' && columnStylesDraft[f.field_key]?.color ? columnStylesDraft[f.field_key].color : '#64748b',
                                                                backgroundColor: activeStyleColumn === f.field_key ? '#f1f5f9' : 'transparent',
                                                                display: 'flex', gap: '0.35rem', alignItems: 'center'
                                                            }} 
                                                            onClick={() => setActiveStyleColumn(activeStyleColumn === f.field_key ? null : f.field_key)}
                                                        >
                                                            <Paintbrush size={14} /> Style
                                                        </button>
                                                        {activeStyleColumn === f.field_key && (
                                                            <div style={{ position: 'absolute', top: '100%', left: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', zIndex: 9999, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', minWidth: '220px' }}>
                                                                <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Alignment</div>
                                                                <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1rem' }}>
                                                                    {['left', 'center', 'right'].map(align => (
                                                                        <button key={align} className="btn btn-sm" style={{ flex: 1, backgroundColor: columnStylesDraft[f.field_key]?.align === align ? '#3b82f6' : '#f8fafc', color: columnStylesDraft[f.field_key]?.align === align ? '#ffffff' : '#334155', border: '1px solid #e2e8f0' }} onClick={() => {
                                                                            setColumnStylesDraft(prev => ({ ...prev, [f.field_key]: { ...(prev[f.field_key] || {}), align } }));
                                                                            setIsReordering(true);
                                                                        }}>
                                                                            {align.charAt(0).toUpperCase()}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                                <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Text Color</div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                                    {STYLE_COLORS.map(color => (
                                                                        <button key={color.value} className="btn btn-sm" style={{ justifyContent: 'flex-start', background: '#fff', border: columnStylesDraft[f.field_key]?.color === color.value ? '2px solid ' + (color.value === 'inherit' ? '#94a3b8' : color.value) : '2px solid transparent' }} onClick={() => {
                                                                            setColumnStylesDraft(prev => ({ ...prev, [f.field_key]: { ...(prev[f.field_key] || {}), color: color.value } }));
                                                                            setIsReordering(true);
                                                                            setActiveStyleColumn(null);
                                                                        }}>
                                                                            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: color.value === 'inherit' ? '#94a3b8' : color.value, marginRight: '0.5rem' }}></div>
                                                                            {color.label}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="designer-td">
                                                        {f.options && Array.isArray(f.options) && f.options.length > 0 ? (
                                                            <div className="option-pills">
                                                                {f.options.map((o, i) => <span key={i} className="option-pill">{o}</span>)}
                                                            </div>
                                                        ) : <span className="text-muted" style={{ fontStyle: 'italic', fontSize: '0.85rem' }}>None</span>}
                                                    </td>
                                                    <td className="designer-td" style={{ textAlign: 'center' }}>
                                                        <label className="designer-toggle">
                                                            <input type="checkbox" checked={f.is_required} disabled={f.is_builtin}
                                                                onChange={() => handleToggleRequired(f)} />
                                                            <span className="designer-toggle-slider"></span>
                                                        </label>
                                                    </td>
                                                    <td className="designer-td" style={{ textAlign: 'center' }}>
                                                        {f.is_builtin ? (
                                                            <span className="badge-system">System</span>
                                                        ) : (
                                                            <button className="btn-delete-modern" onClick={() => handleDeleteField(f.id)}><Trash2 size={16} /></button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
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
            <style jsx>{`
                /* Bento Style Project Cards */
                .admin-project-grid-premium {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
                    gap: 1.5rem;
                    margin-top: 1rem;
                }
                .project-card-premium {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 20px;
                    padding: 1.5rem;
                    position: relative;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    gap: 1.25rem;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                }
                .project-card-premium:hover {
                    border-color: #6366f1;
                    transform: translateY(-4px);
                    box-shadow: 0 12px 20px -8px rgba(99, 102, 241, 0.15);
                }
                .project-card-premium.active {
                    border-color: #6366f1;
                    background: #f8fafc;
                }
                .project-card-main {
                    display: flex;
                    gap: 1rem;
                    align-items: flex-start;
                }
                .project-card-icon {
                    width: 44px;
                    height: 44px;
                    background: #f1f5f9;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #64748b;
                }
                .project-card-content {
                    flex: 1;
                }
                .project-card-header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.25rem;
                }
                .project-card-header-row h3 {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #0f172a;
                    margin: 0;
                }
                .project-desc {
                    font-size: 0.85rem;
                    color: #64748b;
                    margin: 0;
                    display: -webkit-box;
                    -webkit-line-clamp: 1;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .active-tag-condensed {
                    background: #0f172a;
                    color: #fff;
                    font-size: 0.65rem;
                    font-weight: 800;
                    padding: 2px 8px;
                    border-radius: 6px;
                    letter-spacing: 0.05em;
                }
                .subscription-pill {
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    padding: 2px 10px;
                    border-radius: 20px;
                }
                .subscription-pill.active { background: #dcfce7; color: #15803d; }
                .subscription-pill.trial { background: #fef9c3; color: #854d0e; }
                .subscription-pill.expired { background: #fee2e2; color: #b91c1c; }

                .project-card-bento {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0.75rem;
                    background: #f8fafc;
                    padding: 1rem;
                    border-radius: 16px;
                }
                .bento-box {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .bento-label {
                    font-size: 0.65rem;
                    font-weight: 700;
                    color: #94a3b8;
                    letter-spacing: 0.05em;
                }
                .bento-value {
                    font-size: 0.9rem;
                    font-weight: 600;
                    color: #334155;
                }
                .btn-edit-project-overlay {
                    background: #0f172a;
                    color: #fff;
                    border: none;
                    padding: 0.75rem;
                    border-radius: 12px;
                    font-weight: 700;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-edit-project-overlay:hover {
                    background: #1e293b;
                    transform: scale(1.02);
                }

                /* Overlay Styling */
                .overlay-form-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                    padding: 0.5rem;
                }
                .overlay-section {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                .overlay-section-title {
                    font-size: 0.75rem;
                    font-weight: 800;
                    color: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding-bottom: 0.5rem;
                    border-bottom: 1px solid #f1f5f9;
                }
                .checkbox-label-modern {
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 1rem;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .checkbox-label-modern:hover {
                    border-color: #6366f1;
                    background: #f5f3ff;
                }
                .checkbox-label-modern input {
                    margin-top: 4px;
                    width: 18px;
                    height: 18px;
                    accent-color: #6366f1;
                }
                .checkbox-meta strong {
                    display: block;
                    font-size: 0.9rem;
                    color: #1e293b;
                }
                .checkbox-meta p {
                    font-size: 0.75rem;
                    color: #64748b;
                    margin: 2px 0 0 0;
                }
                .project-edit-panel {
                    padding: 2rem !important;
                }

                @media (max-width: 640px) {
                    .tab-label {
                        display: none;
                    }
                    .admin-tab-btn {
                        padding: 0.6rem 0.8rem !important;
                        justify-content: center;
                    }
                }
                .admin-field-designer-wrapper,
                .designer-table-container {
                    overflow-x: auto;
                    -webkit-overflow-scrolling: touch;
                }

                /* Action Sheet Core Styles (Shared UI Pattern) */
                .action-sheet-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.4);
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    z-index: 10000;
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                .action-sheet-overlay.open {
                    opacity: 1;
                    visibility: visible;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                .action-sheet-panel {
                    position: relative;
                    background: #fff;
                    border-radius: 24px;
                    padding: 24px 20px calc(24px + env(safe-area-inset-bottom, 0px));
                    z-index: 10001;
                    transform: translateY(30px);
                    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                    width: 95%;
                    max-width: 850px;
                    max-height: 85vh;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    border-radius: 28px; /* Standard rounding for centeted modal */
                }
                .action-sheet-overlay.open .action-sheet-panel.open,
                .action-sheet-panel.open {
                    transform: translateY(0);
                }
                
                /* Mobile Overrides if needed, but for now we stick to centered for premium feel */
                @media (max-width: 640px) {
                    .action-sheet-overlay.open {
                        align-items: flex-end;
                        padding: 0;
                    }
                    .action-sheet-panel {
                        width: 100%;
                        max-width: none;
                        max-height: 92vh;
                        border-radius: 24px 24px 0 0;
                        transform: translateY(100%);
                    }
                    .action-sheet-overlay.open .action-sheet-panel.open {
                        transform: translateY(0);
                    }
                }

                .sheet-handle {
                    width: 40px;
                    height: 5px;
                    background: #e2e8f0;
                    border-radius: 5px;
                    margin: -10px auto 15px;
                    display: none;
                }
                @media (max-width: 640px) {
                   .sheet-handle { display: block; }
                }
                .action-sheet-header {
                    margin-bottom: 24px;
                }
                .action-sheet-title {
                    font-size: 1.1rem;
                    font-weight: 700;
                    color: #0f172a;
                    margin-bottom: 4px;
                }
                .action-sheet-subtitle {
                    font-size: 0.85rem;
                    color: #64748b;
                }
                .action-sheet-footer {
                    padding-bottom: env(safe-area-inset-bottom, 0px);
                }
                
                /* Close Button Hex Style */
                .btn-close-hex {
                    width: 36px;
                    height: 36px;
                    border-radius: 10px;
                    border: none;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #64748b;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .btn-close-hex:hover {
                    background: #e2e8f0 !important;
                    color: #0f172a;
                }

                /* Premium Overlay & Form Styles */
                .project-edit-panel {
                    box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.25) !important;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                /* Specific Desktop Rounding */
                @media (min-width: 641px) {
                    .project-edit-panel {
                        border-radius: 28px !important;
                        transform: translateY(20px) scale(0.98);
                    }
                    .action-sheet-overlay.open .project-edit-panel.open {
                        transform: translateY(0) scale(1);
                    }
                }
                .project-edit-header .header-content {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: 1rem;
                    border-bottom: 1px solid #f1f5f9;
                }
                .project-edit-header .title-group h3 {
                    font-size: 1.35rem;
                    font-weight: 800;
                    margin: 0;
                    color: #0f172a;
                }
                .project-edit-header .title-group p {
                    margin: 2px 0 0;
                    font-size: 0.9rem;
                    color: #64748b;
                }
                .project-edit-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 8px 0;
                    margin: 0 -4px; /* Slight offset for scrollbar padding if needed */
                }
                .overlay-form-container {
                    padding: 4px;
                }
                .overlay-section {
                    margin-bottom: 1rem;
                    background: #f8fafc;
                    padding: 1rem 1.25rem;
                    border-radius: 16px;
                    border: 1px solid #f1f5f9;
                }
                .overlay-section-title {
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: #64748b;
                    font-weight: 700;
                    margin-bottom: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .form-row {
                    display: flex;
                    gap: 1rem;
                    margin-bottom: 1rem;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    margin-bottom: 1rem;
                }
                .form-group:last-child { margin-bottom: 0; }
                .flex-1 { flex: 1; }
                .form-group label {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #334155;
                    margin-left: 4px;
                }
                .premium-input, .premium-select, .premium-textarea {
                    width: 100%;
                    padding: 10px 14px;
                    border-radius: 12px;
                    border: 1.5px solid #e2e8f0;
                    background: #fff;
                    font-size: 0.95rem;
                    color: #0f172a;
                    transition: all 0.2s;
                }
                .premium-input:focus, .premium-select:focus, .premium-textarea:focus {
                    outline: none;
                    border-color: #0f172a;
                    box-shadow: 0 0 0 4px rgba(15, 23, 42, 0.05);
                }
                .premium-textarea { resize: none; min-height: 80px; }
                
                .modern-lock-card {
                    background: rgba(255, 255, 255, 0.6);
                    border: 2px solid #fee2e2;
                    border-radius: 16px;
                    padding: 12px 16px;
                    transition: all 0.2s;
                }
                .modern-lock-card:has(input:checked) {
                    background: #fff;
                    border-color: #f43f5e;
                    box-shadow: 0 4px 12px rgba(244, 63, 94, 0.1);
                }
                .checkbox-label-modern {
                    display: flex;
                    gap: 12px;
                    align-items: flex-start;
                    cursor: pointer;
                }
                .checkbox-label-modern input[type="checkbox"] {
                    width: 20px;
                    height: 20px;
                    margin-top: 2px;
                    accent-color: #0f172a;
                }
                .checkbox-meta strong {
                    display: block;
                    font-size: 0.9rem;
                    color: #0f172a;
                }
                .checkbox-meta p {
                    font-size: 0.8rem;
                    color: #64748b;
                    margin: 2px 0 0;
                }

                .assignment-segmented-control {
                    display: flex;
                    background: #fff;
                    border: 1.5px solid #e2e8f0;
                    border-radius: 14px;
                    padding: 4px;
                }
                .segment-btn {
                    flex: 1;
                    padding: 8px;
                    border: none;
                    background: transparent;
                    border-radius: 10px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #64748b;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .segment-btn.active {
                    background: #0f172a;
                    color: #fff;
                    box-shadow: 0 4px 10px rgba(15, 23, 42, 0.2);
                }

                .project-edit-footer {
                    margin-top: 1rem;
                    padding: 1rem 0 0;
                    border-top: 1px solid #f1f5f9;
                    display: flex;
                    gap: 10px;
                }
                .btn-premium-secondary {
                    flex: 1;
                    height: 48px;
                    background: #f8fafc;
                    border: 1.5px solid #e2e8f0;
                    color: #64748b;
                    font-weight: 700;
                    border-radius: 14px;
                    transition: all 0.2s;
                }
                .btn-premium-secondary:hover { background: #e2e8f0; color: #0f172a; }
                .btn-premium-save {
                    flex: 2;
                    height: 48px;
                    background: #0f172a;
                    border: none;
                    color: #fff;
                    font-weight: 700;
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    transition: all 0.2s;
                    box-shadow: 0 8px 16px rgba(15, 23, 42, 0.2);
                }
                .btn-premium-save:hover { transform: translateY(-1px); box-shadow: 0 12px 24px rgba(15, 23, 42, 0.3); }
                .btn-premium-save:active { transform: translateY(0); }
            `}</style>
        </div>
    );
}
