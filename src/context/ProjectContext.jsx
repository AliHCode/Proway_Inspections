import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import { buildColumnWidthMap, getColumnWidthStyle } from '../utils/tableLayout';

const ProjectContext = createContext(null);
const PROJECT_CACHE_PREFIX = 'saa_project_cache_v1';
const PROJECT_FIELDS_CACHE_PREFIX = 'saa_project_fields_cache_v1';

function projectCacheKey(userId) {
    return `${PROJECT_CACHE_PREFIX}:${userId}`;
}

function projectFieldsCacheKey(projectId) {
    return `${PROJECT_FIELDS_CACHE_PREFIX}:${projectId}`;
}

export function ProjectProvider({ children }) {
    const { user } = useAuth();
    const [projects, setProjects] = useState([]);
    const [activeProject, setActiveProject] = useState(null);
    const [loadingProjects, setLoadingProjects] = useState(true);
    const [projectsResolved, setProjectsResolved] = useState(false);

    // Custom fields for active project
    const [projectFields, setProjectFields] = useState([]);
    const [orderedTableColumns, setOrderedTableColumns] = useState([]);
    const [columnWidthMap, setColumnWidthMap] = useState({});
    const [columnStylesMap, setColumnStylesMap] = useState({});
    const [loadingFields, setLoadingFields] = useState(false);
    const [fieldsResolvedProjectId, setFieldsResolvedProjectId] = useState(null);

    // Project members
    const [projectMembers, setProjectMembers] = useState([]);
    const fetchingFieldsRef = useRef(null);
    const fetchingMembersRef = useRef(null);

    const restoreProjectCache = useCallback((userId) => {
        if (!userId) return false;
        try {
            const membershipDefaults = {
                can_file_rfis: true,
                can_discuss_rfis: true,
                can_manage_contractor_permissions: false,
            };
            const raw = localStorage.getItem(projectCacheKey(userId));
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            const cachedProjects = Array.isArray(parsed.projects) ? parsed.projects : [];
            setProjects(cachedProjects);

            if (cachedProjects.length > 0) {
                const preferredId = parsed.activeProjectId || null;
                const nextActive = cachedProjects.find((p) => p.id === preferredId)
                    || cachedProjects.find((p) => p.id === user.current_project_id)
                    || cachedProjects[0];
                setActiveProject(nextActive || null);
            } else {
                setActiveProject(null);
            }

            return true;
        } catch {
            return false;
        }
    }, [user?.current_project_id]);

    const persistProjectCache = useCallback((userId, fetchedProjects, activeProjectId = null) => {
        if (!userId) return;
        try {
            localStorage.setItem(projectCacheKey(userId), JSON.stringify({
                projects: fetchedProjects || [],
                activeProjectId,
                cachedAt: new Date().toISOString(),
            }));
        } catch {
            // Ignore storage quota/private mode issues.
        }
    }, []);

    // ─── Fetch Projects ───
    const fetchProjects = useCallback(async () => {
        if (!user) return;

        // Only reset projectsResolved if it's not already true (cache-restored).
        // If the cache path already set projectsResolved=true, we silently
        // refresh in the background without flashing the global spinner again.
        setProjectsResolved(prev => {
            if (!prev) return false;   // already false, keep it
            return prev;               // already true from cache — leave it
        });
        
        // Only show global loader if we have no projects yet
        setProjects(prev => {
            if (prev.length === 0) setLoadingProjects(true);
            return prev;
        });

        try {
            let fetchedProjects = [];
            if (user.role === 'admin') {
                // Admins see every project
                const { data, error } = await supabase.from('projects').select('*').order('name');
                if (error) throw error;
                fetchedProjects = data || [];
            } else {
                // Non-admins only see projects they are assigned to
                const { data, error } = await supabase
                    .from('project_members')
                    .select('project:project_id(*)')
                    .eq('user_id', user.id);
                if (error) throw error;
                fetchedProjects = (data || [])
                    .map(m => m.project)
                    .filter(Boolean)
                    .sort((a, b) => a.name.localeCompare(b.name));
            }
            setProjects(fetchedProjects);

            let nextActive = null;
            if (user.current_project_id) {
                const saved = fetchedProjects.find(p => p.id === user.current_project_id);
                if (saved) nextActive = saved;
                else if (fetchedProjects.length > 0) nextActive = fetchedProjects[0];
            } else if (fetchedProjects.length > 0) {
                nextActive = fetchedProjects[0];
            }

            setActiveProject(nextActive || null);
            persistProjectCache(user.id, fetchedProjects, nextActive?.id || null);
        } catch (err) {
            console.error("Error loading projects:", err);
            const restored = restoreProjectCache(user.id);
            if (restored) {
                setLoadingProjects(false);
                return;
            }
        } finally {
            setLoadingProjects(false);
            setProjectsResolved(true);
        }
    }, [user, persistProjectCache, restoreProjectCache]);

    const lastProjectUserId = useRef(null);

    useEffect(() => {
        if (!user) {
            lastProjectUserId.current = null;
            setProjects([]);
            setActiveProject(null);
            setLoadingProjects(false);
            setProjectsResolved(true);
            return;
        }

        // Only do a full reset + cache restore cycle when the actual user
        // identity changes (login / switch). If the same user's profile object
        // is simply being refreshed by fetchProfile (e.g. email added), skip
        // the reset to avoid a second spinner flash.
        if (lastProjectUserId.current === user.id) return;
        lastProjectUserId.current = user.id;

        // Reset states when user changes to avoid leakage from previous session
        setLoadingProjects(true);
        setProjectsResolved(false);

        const restored = restoreProjectCache(user.id);
        if (restored) {
            setLoadingProjects(false);
            // We can consider it "resolved" if we have valid cache to prevent excessive flickering
            // The fetchProjects will refresh it soon anyway.
            setProjectsResolved(true);
        }
        fetchProjects();
    }, [user, fetchProjects, restoreProjectCache]);

    // ─── Fetch project fields when active project changes ───
    const fetchProjectFields = useCallback(async (projectId) => {
        if (!projectId) {
            setProjectFields([]);
            setFieldsResolvedProjectId(null);
            return;
        }
        if (fetchingFieldsRef.current === projectId) return;
        fetchingFieldsRef.current = projectId;
        // These keys are already rendered as hardcoded table columns everywhere —
        // keep them out of projectFields so they don't appear twice.
        // Reset state immediately for the new project to prevent stale fields from previous project
        setProjectFields([]);
        setLoadingFields(true);
        setFieldsResolvedProjectId(null);
        try {
            const { data, error } = await supabase
                .from('project_fields')
                .select('*')
                .eq('project_id', projectId)
                .order('sort_order');
            if (error) throw error;
            setProjectFields(data || []);
            try {
                localStorage.setItem(projectFieldsCacheKey(projectId), JSON.stringify(data || []));
            } catch {
                // Ignore storage failures.
            }
        } catch (err) {
            console.error("Error loading project fields:", err);
            try {
                const cached = localStorage.getItem(projectFieldsCacheKey(projectId));
                if (cached) {
                    setProjectFields(JSON.parse(cached));
                } else {
                    setProjectFields([]);
                }
            } catch {
                setProjectFields([]);
            }
        } finally {
            if (fetchingFieldsRef.current === projectId) {
                fetchingFieldsRef.current = null;
            }
            setLoadingFields(false);
            setFieldsResolvedProjectId(projectId);
        }
    }, []);

    // ─── Fetch project members ───
    const fetchProjectMembers = useCallback(async (projectId) => {
        if (!projectId) { setProjectMembers([]); return; }
        if (fetchingMembersRef.current === projectId) return;
        fetchingMembersRef.current = projectId;
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('*, profiles:user_id(id, name, company, role, is_active, avatar_url)')
                .eq('project_id', projectId);
            if (error) throw error;
            setProjectMembers(data || []);
        } catch (err) {
            console.error("Error loading members:", err);
            setProjectMembers([]);
        } finally {
            if (fetchingMembersRef.current === projectId) {
                fetchingMembersRef.current = null;
            }
        }
    }, []);

    useEffect(() => {
        if (activeProject?.id) {
            fetchProjectFields(activeProject.id);
            fetchProjectMembers(activeProject.id);
        }
    }, [activeProject?.id, fetchProjectFields, fetchProjectMembers]);

    // Build the ordered table columns anytime fields or active project changes
    useEffect(() => {
        const order = activeProject?.column_order || [
            'serial', 'rfi_no', 'status', 'actions'
        ];
        
        const BUILT_IN_COLUMNS = [
            { id: 'builtin_serial', field_key: 'serial', field_name: 'Sr#', is_builtin: true },
            { id: 'builtin_rfi_no', field_key: 'rfi_no', field_name: 'RFI #', is_builtin: true },
            { id: 'builtin_status', field_key: 'status', field_name: 'Status', is_builtin: true },
            { id: 'builtin_actions', field_key: 'actions', field_name: 'Actions', is_builtin: true },
        ];

        const validProjectFields = (projectFields || []).filter(f => !f.project_id || f.project_id === activeProject?.id);

        const allFields = [
            ...BUILT_IN_COLUMNS,
            ...validProjectFields.map(f => ({ ...f, is_builtin: false }))
        ];

        const mappedFields = order.map(key => allFields.find(f => f.field_key === key)).filter(Boolean);
        
        // Add any missing custom fields that might accidentally be missing in column_order
        allFields.forEach(f => {
            if (!mappedFields.some(mf => mf.field_key === f.field_key)) {
                mappedFields.push(f);
            }
        });

        setOrderedTableColumns(mappedFields);
        setColumnWidthMap(buildColumnWidthMap(mappedFields, activeProject?.column_widths || {}));
        setColumnStylesMap(activeProject?.column_styles || {});
    }, [projectFields, activeProject]);

    function getTableColumnStyle(fieldKey) {
        const widthStyle = getColumnWidthStyle(fieldKey, columnWidthMap);
        const customStyle = columnStylesMap[fieldKey] || {};
        return {
            ...widthStyle,
            ...(customStyle.align && { textAlign: customStyle.align }),
            ...(customStyle.color && customStyle.color !== 'inherit' && { color: customStyle.color })
        };
    }

    // ─── Project Accessibility ───
    const checkProjectAccess = useCallback((project = activeProject) => {
        if (!project) return { allowed: false, reason: 'no_project' };
        
        // Admins always have access to everything
        if (user?.role === 'admin') return { allowed: true };

        if (project.is_locked) {
            return { allowed: false, reason: 'locked', message: 'This project has been manually locked by the administrator.' };
        }

        if (project.subscription_status === 'expired') {
            return { allowed: false, reason: 'expired', message: 'The subscription for this project has expired.' };
        }

        if (project.subscription_end) {
            const end = new Date(project.subscription_end);
            if (end < new Date()) {
                return { allowed: false, reason: 'expired', message: 'The subscription for this project has expired.' };
            }
        }

        return { allowed: true };
    }, [activeProject, user?.role]);

    // ─── Change active project ───
    async function changeActiveProject(projectId) {
        const selected = projects.find(p => p.id === projectId);
        if (!selected) return;
        setActiveProject(selected);
        if (user) {
            try {
                await supabase.from('profiles').update({ current_project_id: projectId }).eq('id', user.id);
            } catch (e) {
                console.error("Failed to save project preference", e);
            }
        }
    }

    // ─── Create project (admin) ───
    async function createProject(name, code = '', description = '', timezone = 'UTC', additionalFields = {}) {
        try {
            const { data, error } = await supabase.from('projects').insert([{ 
                name, code, description, timezone, ...additionalFields 
            }]).select();
            if (error) throw error;
            if (data && data[0]) {
                setProjects(prev => [...prev, data[0]]);
                changeActiveProject(data[0].id);
                return { success: true, project: data[0] };
            }
        } catch (error) {
            console.error("Error creating project:", error);
            return { success: false, error: error.message };
        }
    }

    // ─── Update project (admin) ───
    async function updateProject(projectId, updates) {
        try {
            const { data, error } = await supabase
                .from('projects')
                .update(updates)
                .eq('id', projectId)
                .select();
            if (error) throw error;
            if (data?.[0]) {
                const updatedProjects = projects.map(p => p.id === projectId ? data[0] : p);
                setProjects(updatedProjects);
                if (user?.id) persistProjectCache(user.id, updatedProjects, activeProject?.id);
                if (activeProject?.id === projectId) setActiveProject(data[0]);
                return { success: true, project: data[0] };
            }
        } catch (error) {
            console.error("Error updating project:", error);
            return { success: false, error: error.message };
        }
    }

    // ─── Delete project (admin) ───
    async function deleteProject(projectId) {
        try {
            const { error } = await supabase.from('projects').delete().eq('id', projectId);
            if (error) throw error;
            setProjects(prev => prev.filter(p => p.id !== projectId));
            if (activeProject?.id === projectId) {
                const remaining = projects.filter(p => p.id !== projectId);
                setActiveProject(remaining[0] || null);
            }
            return { success: true };
        } catch (error) {
            console.error("Error deleting project:", error);
            return { success: false, error: error.message };
        }
    }

    // ─── Project export template (admin) ───
    async function saveProjectExportTemplate(template) {
        if (!activeProject?.id) {
            return { success: false, error: 'No active project selected' };
        }

        try {
            const { data, error } = await supabase
                .from('projects')
                .update({ export_template: template })
                .eq('id', activeProject.id)
                .select('*')
                .single();

            if (error) throw error;

            setProjects((prev) => prev.map((p) => (p.id === activeProject.id ? data : p)));
            setActiveProject(data);
            return { success: true, template: data?.export_template || template };
        } catch (error) {
            console.error('Error saving project export template:', error);
            return { success: false, error: error.message };
        }
    }

    // ─── Custom field CRUD (admin) ───
    async function addProjectField(projectId, field) {
        try {
            const { data, error } = await supabase
                .from('project_fields')
                .insert([{ project_id: projectId, ...field }])
                .select();
            if (error) throw error;
            if (data?.[0]) setProjectFields(prev => [...prev, data[0]]);
            return { success: true, field: data?.[0] };
        } catch (error) {
            console.error("Error adding field:", error);
            if (error.code === '23505') {
                return { success: false, error: 'A field with this name or key already exists in this project.' };
            }
            return { success: false, error: error.message };
        }
    }

    async function updateProjectField(fieldId, updates) {
        try {
            const { error } = await supabase
                .from('project_fields')
                .update(updates)
                .eq('id', fieldId);
            if (error) throw error;
            setProjectFields(prev => prev.map(f => f.id === fieldId ? { ...f, ...updates } : f));
            return { success: true };
        } catch (error) {
            console.error("Error updating field:", error);
            return { success: false, error: error.message };
        }
    }

    async function deleteProjectField(fieldId) {
        try {
            const { error } = await supabase
                .from('project_fields')
                .delete()
                .eq('id', fieldId);
            if (error) throw error;
            setProjectFields(prev => prev.filter(f => f.id !== fieldId));
            return { success: true };
        } catch (error) {
            console.error("Error deleting field:", error);
            return { success: false, error: error.message };
        }
    }

    // ─── Project member management (admin) ───
    async function assignUserToProject(projectId, userId, role) {
        try {
            const membershipDefaults = {
                can_file_rfis: true,
                can_discuss_rfis: true,
                can_manage_contractor_permissions: false,
            };
            // Check if the user is already a member — avoids unique constraint errors
            const { data: existing } = await supabase
                .from('project_members')
                .select('id')
                .eq('project_id', projectId)
                .eq('user_id', userId)
                .maybeSingle();

            if (existing) {
                // Already a member: update their role only
                const { error } = await supabase
                    .from('project_members')
                    .update({ role, ...membershipDefaults })
                    .eq('project_id', projectId)
                    .eq('user_id', userId);
                if (error) throw error;
            } else {
                // New member: insert
                const { error } = await supabase
                    .from('project_members')
                    .insert({ project_id: projectId, user_id: userId, role, ...membershipDefaults });
                if (error) throw error;
            }

            // Sync the user's global profile role and their active project
            await supabase.from('profiles').update({ role, current_project_id: projectId }).eq('id', userId);

            await fetchProjectMembers(projectId);
            return { success: true };
        } catch (error) {
            console.error("Error assigning user:", error);
            return { success: false, error: error.message };
        }
    }

    async function removeUserFromProject(projectId, userId) {
        try {
            const { error } = await supabase
                .from('project_members')
                .delete()
                .eq('project_id', projectId)
                .eq('user_id', userId);
            if (error) throw error;
            setProjectMembers(prev => prev.filter(m => !(m.project_id === projectId && m.user_id === userId)));
            return { success: true };
        } catch (error) {
            console.error("Error removing member:", error);
            return { success: false, error: error.message };
        }
    }

    // ─── Assignment mode convenience getter ───
    async function updateProjectMember(projectId, userId, updates) {
        try {
            const { error } = await supabase
                .from('project_members')
                .update(updates)
                .eq('project_id', projectId)
                .eq('user_id', userId);
            if (error) throw error;
            await fetchProjectMembers(projectId);
            return { success: true };
        } catch (error) {
            console.error("Error updating project member:", error);
            return { success: false, error: error.message };
        }
    }

    async function updateContractorPermissions(projectId, userId, updates) {
        try {
            const { error } = await supabase.rpc('update_project_contractor_permissions', {
                target_project_id: projectId,
                target_user_id: userId,
                next_can_file_rfis: updates.can_file_rfis,
                next_can_discuss_rfis: updates.can_discuss_rfis,
            });
            if (error) throw error;
            await fetchProjectMembers(projectId);
            return { success: true };
        } catch (error) {
            console.error("Error updating contractor permissions:", error);
            return { success: false, error: error.message };
        }
    }

    const activeProjectMembership = useMemo(() => {
        if (!activeProject?.id || !user?.id) return null;
        return projectMembers.find((member) => member.project_id === activeProject.id && member.user_id === user.id) || null;
    }, [activeProject?.id, projectMembers, user?.id]);

    const contractorPermissions = useMemo(() => {
        if (user?.role !== 'contractor') {
            return {
                canFileRfis: true,
                canDiscussRfis: true,
                canManageContractorPermissions: false,
            };
        }

        return {
            canFileRfis: activeProjectMembership?.can_file_rfis !== false,
            canDiscussRfis: activeProjectMembership?.can_discuss_rfis !== false,
            canManageContractorPermissions: activeProjectMembership?.can_manage_contractor_permissions === true,
        };
    }, [activeProjectMembership, user?.role]);

    const assignmentMode = activeProject?.assignment_mode || 'direct';

    // ─── Review table display toggles (admin-configurable) ───
    const showFilerInfo = activeProject?.show_filer_info !== false; // default true
    const showEscalatedBadge = activeProject?.show_escalated_badge !== false; // default true

    return (
        <ProjectContext.Provider value={{
            projects, activeProject, loadingProjects, projectsResolved, projectFields, orderedTableColumns, columnWidthMap, columnStylesMap, getTableColumnStyle, loadingFields, fieldsResolvedProjectId, projectMembers, activeProjectMembership, contractorPermissions, assignmentMode, showFilerInfo, showEscalatedBadge,
            fetchProjects, changeActiveProject, createProject, deleteProject, updateProject,
            addProjectField, updateProjectField, deleteProjectField,
            assignUserToProject, removeUserFromProject, updateProjectMember, updateContractorPermissions, fetchProjectMembers,
            saveProjectExportTemplate, checkProjectAccess,
        }}>
            {children}
            {columnStylesMap?.HEADER_ROW?.backgroundColor && (
                <style>
                    {`
                        .rfi-table th, .preview-th, .designer-table th {
                            background-color: ${columnStylesMap.HEADER_ROW.backgroundColor} !important;
                            color: ${columnStylesMap.HEADER_ROW.color || '#ffffff'} !important;
                        }
                    `}
                </style>
            )}
        </ProjectContext.Provider>
    );
}

export function useProject() {
    const ctx = useContext(ProjectContext);
    if (!ctx) throw new Error('useProject must be used within ProjectProvider');
    return ctx;
}
