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
        setLoadingProjects(true);
        try {
            const { data, error } = await supabase.from('projects').select('*').order('name');
            if (error) throw error;

            setProjects(data || []);

            if (user.current_project_id) {
                const saved = data.find(p => p.id === user.current_project_id);
                if (saved) setActiveProject(saved);
                else if (data.length > 0) setActiveProject(data[0]);
            } else if (data.length > 0) {
                setActiveProject(data[0]);
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
        setLoadingFields(true);
        try {
            const { data, error } = await supabase
                .from('project_fields')
                .select('*')
                .eq('project_id', projectId)
                .order('sort_order');
            if (error) throw error;
            setProjectFields(data || []);
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
                // Seed 3 default fields for the new project
                const defaultFields = [
                    { project_id: data[0].id, field_name: 'Description', field_key: 'description', field_type: 'text', is_required: true, sort_order: 1 },
                    { project_id: data[0].id, field_name: 'Location', field_key: 'location', field_type: 'text', is_required: true, sort_order: 2 },
                    { project_id: data[0].id, field_name: 'Inspection Type', field_key: 'inspection_type', field_type: 'select', is_required: true, sort_order: 3, options: ["Structural","MEP","Electrical","Plumbing","Finishing","Landscaping","Civil","HVAC","Fire Safety","Other"] },
                ];
                await supabase.from('project_fields').insert(defaultFields);

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
