import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { USER_ROLES } from '../utils/constants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

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

    async function ensureProfileExists(authUser) {
        const metadata = authUser?.user_metadata || {};
        const fallbackName =
            metadata.name ||
            metadata.full_name ||
            (authUser?.email ? authUser.email.split('@')[0] : 'New User');

        const { error } = await supabase
            .from('profiles')
            .upsert(
                {
                    id: authUser.id,
                    name: fallbackName,
                    role: USER_ROLES.PENDING,
                    company: metadata.company || '',
                },
                { onConflict: 'id' }
            );

        if (error) throw error;
    }

    async function fetchProfile(userId) {
        try {
            const { data: authData } = await supabase.auth.getUser();
            const authUser = authData?.user;

            let { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (error) throw error;
            if (!data && authUser?.id === userId) {
                // Self-heal users that were created in auth.users without a profile row.
                await ensureProfileExists(authUser);
                const retry = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .maybeSingle();

                if (retry.error) throw retry.error;
                data = retry.data;
            }

            if (data) {
                // Block deactivated accounts
                if (data.is_active === false) {
                    await supabase.auth.signOut();
                    setUser(null);
                    setLoading(false);
                    return;
                }
                // Ensure auth.user structure is combined with profile for easy usage
                setUser({ ...data, email: authUser?.email || '' });
            } else {
                setUser(null);
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

    async function register(name, email, password, company) {
        setLoading(true);
        try {
            // 1. Sign up user via GoTrue
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        name,
                        company,
                    },
                },
            });
            if (signUpError) throw signUpError;
            if (!data.user) throw new Error('Registration failed');

            // 2. Insert into profiles table
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert(
                    {
                        id: data.user.id,
                        name,
                        role: USER_ROLES.PENDING,
                        company,
                    },
                    { onConflict: 'id' }
                );

            if (profileError) {
                console.error("Profile creation error:", profileError);
                const isConflict = profileError?.code === '23505' || profileError?.status === 409;

                // If DB trigger created the row first, treat duplicate conflict as success.
                if (isConflict) {
                    const { data: existingProfile, error: existingProfileError } = await supabase
                        .from('profiles')
                        .select('id')
                        .eq('id', data.user.id)
                        .maybeSingle();

                    if (!existingProfileError && existingProfile) {
                        return { success: true };
                    }
                }

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
