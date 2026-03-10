import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
    const { user } = useAuth();
    const [projects, setProjects] = useState([]);
    const [activeProject, setActiveProject] = useState(null);
    const [loadingProjects, setLoadingProjects] = useState(true);

    // Custom fields for active project
    const [projectFields, setProjectFields] = useState([]);
    const [loadingFields, setLoadingFields] = useState(false);

    // Project members
    const [projectMembers, setProjectMembers] = useState([]);

    // ─── Fetch Projects ───
    const fetchProjects = useCallback(async () => {
        if (!user) return;
        
        // Only show global loader if we have no projects yet
        setProjects(prev => {
            if (prev.length === 0) setLoadingProjects(true);
            return prev;
        });

        try {
            const { data, error } = await supabase.from('projects').select('*').order('name');
            if (error) throw error;
            const fetchedProjects = data || [];
            setProjects(fetchedProjects);

            if (user.current_project_id) {
                const saved = fetchedProjects.find(p => p.id === user.current_project_id);
                if (saved) setActiveProject(saved);
                else if (fetchedProjects.length > 0) setActiveProject(fetchedProjects[0]);
            } else if (fetchedProjects.length > 0) {
                setActiveProject(fetchedProjects[0]);
            }
        } catch (err) {
            console.error("Error loading projects:", err);
        } finally {
            setLoadingProjects(false);
        }
    }, [user]);

    useEffect(() => {
        if (!user) {
            setProjects([]);
            setActiveProject(null);
            setLoadingProjects(false);
            return;
        }
        fetchProjects();
    }, [user, fetchProjects]);

    // ─── Fetch project fields when active project changes ───
    const fetchProjectFields = useCallback(async (projectId) => {
        if (!projectId) { setProjectFields([]); return; }
        // These keys are already rendered as hardcoded table columns everywhere —
        // keep them out of projectFields so they don't appear twice.
        const BUILTIN_KEYS = new Set(['description', 'location', 'inspection_type']);
        setLoadingFields(true);
        try {
            const { data, error } = await supabase
                .from('project_fields')
                .select('*')
                .eq('project_id', projectId)
                .order('sort_order');
            if (error) throw error;
            setProjectFields((data || []).filter(f => !BUILTIN_KEYS.has(f.field_key)));
        } catch (err) {
            console.error("Error loading project fields:", err);
            setProjectFields([]);
        } finally {
            setLoadingFields(false);
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
    }, [activeProject, fetchProjectFields, fetchProjectMembers]);

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
            const { data, error } = await supabase
                .from('project_members')
                .upsert({ project_id: projectId, user_id: userId, role }, { onConflict: 'project_id,user_id' })
                .select('*, profiles:user_id(id, name, company, role, is_active)');
            if (error) throw error;

            // Also update the user's profile role from pending to their assigned role
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
            projects, activeProject, loadingProjects, projectFields, loadingFields, projectMembers,
            fetchProjects, changeActiveProject, createProject, deleteProject,
            addProjectField, updateProjectField, deleteProjectField,
            assignUserToProject, removeUserFromProject, fetchProjectMembers,
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
