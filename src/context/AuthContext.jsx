import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) fetchProfile(session.user.id);
            else setLoading(false);
        });

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setUser(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    async function fetchProfile(userId) {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                // Ensure auth.user structure is combined with profile for easy usage
                setUser({ ...data, email: (await supabase.auth.getUser()).data.user?.email });
            }
        } catch (error) {
            console.error('Error fetching profile:', error.message);
        } finally {
            setLoading(false);
        }
    }

    async function login(email, password) {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;

            // fetchProfile will be called by the onAuthStateChange listener
            return { success: true };
        } catch (error) {
            console.error('Login error:', error.message);
            setLoading(false);
            return { success: false, error: 'Invalid email or password' };
        }
    }

    async function register(name, email, password, role, company) {
        setLoading(true);
        try {
            // 1. Sign up user via GoTrue
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
            });
            if (signUpError) throw signUpError;
            if (!data.user) throw new Error('Registration failed');

            // 2. Insert into profiles table
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    {
                        id: data.user.id,
                        name,
                        role,
                        company,
                    }
                ]);

            if (profileError) {
                console.error("Profile creation error:", profileError);
                // Rollback could be complex, but we notify the user
                throw new Error('Failed to create user profile in database.');
            }

            // Successfully registered and logged in (if auto-confirm is on)
            return { success: true };
        } catch (error) {
            console.error('Registration error:', error.message);
            setLoading(false);
            return { success: false, error: error.message || 'Registration failed' };
        }
    }

    async function logout() {
        setLoading(true);
        await supabase.auth.signOut();
        // Listener sets loading false and user null automatically
    }

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
