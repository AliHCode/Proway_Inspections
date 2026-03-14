import { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
    const [loadingFields, setLoadingFields] = useState(false);
    const [fieldsResolvedProjectId, setFieldsResolvedProjectId] = useState(null);

    // Project members
    const [projectMembers, setProjectMembers] = useState([]);

    const restoreProjectCache = useCallback((userId) => {
        if (!userId) return false;
        try {
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
        setProjectsResolved(false);
        
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

    useEffect(() => {
        if (!user) {
            setProjects([]);
            setActiveProject(null);
            setLoadingProjects(false);
            setProjectsResolved(true);
            return;
        }

        const restored = restoreProjectCache(user.id);
        if (restored) {
            setLoadingProjects(false);
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
        // These keys are already rendered as hardcoded table columns everywhere —
        // keep them out of projectFields so they don't appear twice.
        const BUILTIN_KEYS = new Set(['description', 'location', 'inspection_type']);
        setLoadingFields(true);
        setFieldsResolvedProjectId((prev) => (prev === projectId ? prev : null));
        try {
            const { data, error } = await supabase
                .from('project_fields')
                .select('*')
                .eq('project_id', projectId)
                .order('sort_order');
            if (error) throw error;
            const cleaned = (data || []).filter(f => !BUILTIN_KEYS.has(f.field_key));
            setProjectFields(cleaned);
            try {
                localStorage.setItem(projectFieldsCacheKey(projectId), JSON.stringify(cleaned));
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
            setLoadingFields(false);
            setFieldsResolvedProjectId(projectId);
        }
    }, []);

    // ─── Fetch project members ───
    const fetchProjectMembers = useCallback(async (projectId) => {
        if (!projectId) { setProjectMembers([]); return; }
        try {
            const { data, error } = await supabase
                .from('project_members')
                .select('*, profiles:user_id(id, name, company, role, is_active)')
                .eq('project_id', projectId);
            if (error) throw error;
            setProjectMembers(data || []);
        } catch (err) {
            console.error("Error loading members:", err);
            setProjectMembers([]);
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
            'serial', 'description', 'location', 'inspection_type',
            ...(projectFields || []).map(f => f.field_key),
            'status', 'remarks', 'attachments', 'actions'
        ];
        
        const BUILT_IN_COLUMNS = [
            { id: 'builtin_serial', field_key: 'serial', field_name: 'Sr#', is_builtin: true },
            { id: 'builtin_description', field_key: 'description', field_name: 'Description', is_builtin: true },
            { id: 'builtin_location', field_key: 'location', field_name: 'Location', is_builtin: true },
            { id: 'builtin_type', field_key: 'inspection_type', field_name: 'Type', is_builtin: true },
            { id: 'builtin_status', field_key: 'status', field_name: 'Status', is_builtin: true },
            { id: 'builtin_remarks', field_key: 'remarks', field_name: 'Remarks', is_builtin: true },
            { id: 'builtin_attachments', field_key: 'attachments', field_name: 'Attachments', is_builtin: true },
            { id: 'builtin_actions', field_key: 'actions', field_name: 'Actions', is_builtin: true },
        ];

        const allFields = [
            ...BUILT_IN_COLUMNS,
            ...(projectFields || []).map(f => ({ ...f, is_builtin: false }))
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
    }, [projectFields, activeProject]);

    function getTableColumnStyle(fieldKey) {
        return getColumnWidthStyle(fieldKey, columnWidthMap);
    }

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
    async function createProject(name, description = '') {
        try {
            const { data, error } = await supabase.from('projects').insert([{ name, description }]).select();
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
                    .update({ role })
                    .eq('project_id', projectId)
                    .eq('user_id', userId);
                if (error) throw error;
            } else {
                // New member: insert
                const { error } = await supabase
                    .from('project_members')
                    .insert({ project_id: projectId, user_id: userId, role });
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

    return (
        <ProjectContext.Provider value={{
            projects, activeProject, loadingProjects, projectsResolved, projectFields, orderedTableColumns, columnWidthMap, getTableColumnStyle, loadingFields, fieldsResolvedProjectId, projectMembers,
            fetchProjects, changeActiveProject, createProject, deleteProject,
            addProjectField, updateProjectField, deleteProjectField,
            assignUserToProject, removeUserFromProject, fetchProjectMembers,
            saveProjectExportTemplate,
        }}>
            {children}
        </ProjectContext.Provider>
    );
}

export function useProject() {
    const ctx = useContext(ProjectContext);
    if (!ctx) throw new Error('useProject must be used within ProjectProvider');
    return ctx;
}
