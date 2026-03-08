import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
    const { user } = useAuth();
    const [projects, setProjects] = useState([]);
    const [activeProject, setActiveProject] = useState(null);
    const [loadingProjects, setLoadingProjects] = useState(true);

    useEffect(() => {
        if (!user) {
            setProjects([]);
            setActiveProject(null);
            setLoadingProjects(false);
            return;
        }

        async function fetchProjects() {
            if (projects.length === 0) setLoadingProjects(true);
            try {
                // In a full app, you might only fetch projects the user is assigned to
                const { data, error } = await supabase.from('projects').select('*').order('name');
                if (error) throw error;

                setProjects(data || []);

                // If user has a last active project, use it. Otherwise default to first available.
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
        }

        fetchProjects();
    }, [user]);

    async function changeActiveProject(projectId) {
        const selected = projects.find(p => p.id === projectId);
        if (!selected) return;

        setActiveProject(selected);

        // Save preference to user profile
        if (user) {
            try {
                await supabase.from('profiles').update({ current_project_id: projectId }).eq('id', user.id);
            } catch (e) {
                console.error("Failed to save project preference", e);
            }
        }
    }

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

    async function inviteUser(email, role, projectId) {
        try {
            // In a real app, this would send an email and create a pending invite
            // For this demo, we'll just create a notification for the admin to handle it
            const { error } = await supabase.from('notifications').insert([{
                user_id: user.id, // Notification to self (admin) for tracking
                title: 'User Invitation Requested',
                message: `Invite sent to ${email} as ${role} for project ${projectId}.`
            }]);
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error("Error inviting user:", error);
            return { success: false, error: error.message };
        }
    }

    return (
        <ProjectContext.Provider value={{ projects, activeProject, loadingProjects, changeActiveProject, createProject, inviteUser }}>
            {children}
        </ProjectContext.Provider>
    );
}

export function useProject() {
    const ctx = useContext(ProjectContext);
    if (!ctx) throw new Error('useProject must be used within ProjectProvider');
    return ctx;
}
