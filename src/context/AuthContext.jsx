import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { USER_ROLES } from '../utils/constants';
import { unregisterCurrentPushSubscription } from '../utils/pushNotifications';

const AuthContext = createContext(null);

// Cache key for offline-resilient profile storage
const PROFILE_CACHE_KEY = 'saa_user_profile_cache';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const initialized = useRef(false);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;

        // Check active sessions and sets the user
        // getSession() reads from localStorage — works offline.
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) {
                fetchProfile(session.user.id);
            } else {
                setLoading(false);
            }
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

        // ignoreDuplicates: true — only inserts if no row exists, never overwrites an existing role
        const { error } = await supabase
            .from('profiles')
            .upsert(
                {
                    id: authUser.id,
                    name: fallbackName,
                    role: USER_ROLES.PENDING,
                    company: metadata.company || '',
                },
                { onConflict: 'id', ignoreDuplicates: true }
            );

        if (error) throw error;
    }

    async function fetchProfile(userId) {
        // ── Offline guard ────────────────────────────────────────────────────
        // getUser() and DB queries need the network. When offline, serve the
        // last-known profile from localStorage so the user stays logged in.
        if (!navigator.onLine) {
            try {
                const cached = localStorage.getItem(PROFILE_CACHE_KEY);
                if (cached) {
                    const profile = JSON.parse(cached);
                    if (profile.id === userId) {
                        setUser(profile);
                        setLoading(false);
                        return;
                    }
                }
            } catch { /* ignore parse errors */ }
            // No valid cache; leave loading=false without logging the user out
            setLoading(false);
            return;
        }

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
                    localStorage.removeItem(PROFILE_CACHE_KEY);
                    setUser(null);
                    setLoading(false);
                    return;
                }
                // Block archived accounts (card hidden by admin — treated same as deactivated)
                if (data.is_archived === true) {
                    await supabase.auth.signOut();
                    localStorage.removeItem(PROFILE_CACHE_KEY);
                    setUser(null);
                    setLoading(false);
                    return;
                }
                // Rejected users — keep them signed in so LoginPage shows rejection screen
                const fullUser = { ...data, email: authUser?.email || '' };
                // Cache the profile for offline resilience
                try {
                    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(fullUser));
                } catch { /* quota exceeded or private browsing */ }
                if (data.role === USER_ROLES.REJECTED) {
                    setUser(fullUser);
                    setLoading(false);
                    return;
                }
                // Ensure auth.user structure is combined with profile for easy usage
                setUser(fullUser);
            } else {
                setUser(null);
            }
        } catch (error) {
            console.error('Error fetching profile:', error.message);
            // Network error while online? Fallback to cache so we don't log user out
            try {
                const cached = localStorage.getItem(PROFILE_CACHE_KEY);
                if (cached) {
                    const profile = JSON.parse(cached);
                    if (profile.id === userId) {
                        setUser(profile);
                        setLoading(false);
                        return;
                    }
                }
            } catch { /* ignore */ }
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
        // Clear cached profile so offline mode doesn't keep a stale session
        localStorage.removeItem(PROFILE_CACHE_KEY);
        if (user?.id) {
            try {
                await unregisterCurrentPushSubscription(user.id);
            } catch (error) {
                console.error('Error removing push subscription during logout:', error);
            }
        }
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
