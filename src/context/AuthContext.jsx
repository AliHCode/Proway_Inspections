import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { USER_ROLES } from '../utils/constants';
import { unregisterCurrentPushSubscription } from '../utils/pushNotifications';

const AuthContext = createContext(null);

// Cache key for offline-resilient profile storage
const PROFILE_CACHE_KEY = 'saa_user_profile_cache';
const MANUAL_LOGOUT_KEY = 'saa_manual_logout';
const INSTANCE_ID_KEY = 'saa_instance_id';
const LAST_VERIFIED_AT_KEY = 'saa_last_verified_at';
const LAST_VERIFIED_USER_KEY = 'saa_last_verified_user_id';
const AUTH_BOOT_TIMEOUT_MS = 8000;
const OFFLINE_AUTH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function getLocalInstanceId() {
    let id = localStorage.getItem(INSTANCE_ID_KEY);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(INSTANCE_ID_KEY, id);
    }
    return id;
}

function wasManualLogout() {
    return localStorage.getItem(MANUAL_LOGOUT_KEY) === '1';
}

function setManualLogoutFlag(value) {
    if (value) {
        localStorage.setItem(MANUAL_LOGOUT_KEY, '1');
    } else {
        localStorage.removeItem(MANUAL_LOGOUT_KEY);
    }
}

function setLastVerifiedAuth(userId) {
    if (!userId) return;
    localStorage.setItem(LAST_VERIFIED_AT_KEY, new Date().toISOString());
    localStorage.setItem(LAST_VERIFIED_USER_KEY, userId);
}

function clearLastVerifiedAuth() {
    localStorage.removeItem(LAST_VERIFIED_AT_KEY);
    localStorage.removeItem(LAST_VERIFIED_USER_KEY);
}

function hasRecentOfflineVerification(userId) {
    try {
        const lastVerifiedAt = localStorage.getItem(LAST_VERIFIED_AT_KEY);
        const lastVerifiedUserId = localStorage.getItem(LAST_VERIFIED_USER_KEY);
        if (!lastVerifiedAt || !lastVerifiedUserId) return false;
        if (userId && lastVerifiedUserId !== userId) return false;
        const age = Date.now() - new Date(lastVerifiedAt).getTime();
        return Number.isFinite(age) && age >= 0 && age <= OFFLINE_AUTH_MAX_AGE_MS;
    } catch {
        return false;
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // authResolved = true as soon as we know the initial auth state (from cache or network).
    // This is what the global spinner gates on — so cache-restored sessions show the app instantly.
    const [authResolved, setAuthResolved] = useState(false);
    const [mfaFactors, setMfaFactors] = useState([]);
    const [mfaRequired, setMfaRequired] = useState(false);
    const [mfaResolved, setMfaResolved] = useState(false);
    const [mfaChallengeFactor, setMfaChallengeFactor] = useState(null);
    const initialized = useRef(false);
    const isFetchingProfileRef = useRef(null); // Tracks the ID being fetched
    const userRef = useRef(null); // Keep a ref to current user for event handlers
    const hiddenAtRef = useRef(null); // Tracks when the tab/app went to background

    // Keep userRef in sync
    useEffect(() => {
        userRef.current = user;
    }, [user]);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        let bootCancelled = false;
        let bootTimer = null;

        // Visibilitychange: track when the tab goes to background, and clear
        // any stuck loading states when it comes back. We do NOT re-fetch the
        // session here — Supabase's onAuthStateChange(TOKEN_REFRESHED) already
        // handles that, and our handler above processes it silently.
        function handleVisibilityChange() {
            if (document.visibilityState === 'hidden') {
                hiddenAtRef.current = Date.now();
                return;
            }
            // Tab/app became visible again — if we already have a user, just
            // make sure no loading spinner is stuck from a previous state.
            if (document.visibilityState === 'visible' && userRef.current) {
                setLoading(false);
                setAuthResolved(true);
            }
        }

        // Listen for changes on auth state (logged in, signed out, etc.)
        // This also handles the INITIAL_SESSION by default.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('[AUTH EVENT]', event, { hasCurrentUser: !!userRef.current, sessionUserId: session?.user?.id, currentUserId: userRef.current?.id });
            if (session?.user) {
                setManualLogoutFlag(false);

                // Same user already loaded: silent background refresh.
                // Supabase fires SIGNED_IN or TOKEN_REFRESHED on tab return,
                // app resume, mobile file-picker exit, etc.
                // If we already have the same user loaded, do NOT reset any
                // loading/resolved states (that causes the spinner flash).
                // Just silently refresh profile data in the background.
                if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && userRef.current?.id === session.user.id) {
                    isFetchingProfileRef.current = null;
                    fetchProfile(session.user.id, { allowRetry: false, authUser: session.user });
                    return;
                }

                setMfaResolved(false);

                // Fast-path: restore from cache immediately so the spinner disappears
                const restored = restoreCachedProfile(session.user.id);
                if (restored) {
                    setAuthResolved(true);
                }

                // Reset the guard so INITIAL_SESSION events aren't blocked
                if (event === 'INITIAL_SESSION') {
                    isFetchingProfileRef.current = null;
                }
                fetchProfile(session.user.id, { allowRetry: true, authUser: session.user });
            } else {
                const allowOfflineCache = event !== 'SIGNED_OUT' && !wasManualLogout();
                resolveSignedOutState({ allowOfflineCache, expectedUserId: userRef.current?.id || null });
            }
        });

        async function bootstrapAuth() {
            try {
                const sessionResult = await Promise.race([
                    supabase.auth.getSession(),
                    new Promise((_, reject) => {
                        bootTimer = window.setTimeout(() => reject(new Error('Auth bootstrap timed out')), AUTH_BOOT_TIMEOUT_MS);
                    }),
                ]);

                if (bootCancelled) return;

                const session = sessionResult?.data?.session || null;
                if (session?.user) {
                    setManualLogoutFlag(false);
                    setMfaResolved(false);
                    const restored = restoreCachedProfile(session.user.id);
                    if (restored) {
                        setLoading(false);
                        setAuthResolved(true);
                    }
                    isFetchingProfileRef.current = null;
                    fetchProfile(session.user.id, { allowRetry: true, authUser: session.user });
                } else {
                    resolveSignedOutState({ allowOfflineCache: true, expectedUserId: userRef.current?.id || null });
                }
            } catch (error) {
                if (bootCancelled) return;
                if (isOfflineLikeError(error)) {
                    console.warn('Initial auth bootstrap hit offline fallback, restoring cached account if available:', error);
                    resolveSignedOutState({ allowOfflineCache: true, expectedUserId: userRef.current?.id || null });
                    return;
                }

                console.warn('Initial auth bootstrap failed, clearing local session state:', error);
                await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
                resolveSignedOutState();
            } finally {
                if (bootTimer) {
                    window.clearTimeout(bootTimer);
                }
            }
        }

        bootstrapAuth();

        // ── Attach the visibilitychange listener ──
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            bootCancelled = true;
            if (bootTimer) {
                window.clearTimeout(bootTimer);
            }
            subscription.unsubscribe();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
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

    function restoreCachedProfile(expectedUserId = null, { requireRecentVerification = false, resolveMfa = requireRecentVerification } = {}) {
        if (wasManualLogout()) return false;
        try {
            const cached = localStorage.getItem(PROFILE_CACHE_KEY);
            if (!cached) return false;
            const parsed = JSON.parse(cached);
            const profile = parsed?.user && typeof parsed.user === 'object' ? parsed.user : parsed;
            if (!profile || typeof profile !== 'object' || !profile.id) {
                localStorage.removeItem(PROFILE_CACHE_KEY);
                return false;
            }
            if (expectedUserId && profile.id !== expectedUserId) return false;
            if (requireRecentVerification && !hasRecentOfflineVerification(expectedUserId || profile.id)) {
                return false;
            }
            setUser(profile);
            if (resolveMfa) {
                setMfaRequired(false);
                setMfaChallengeFactor(null);
                setMfaResolved(true);
            }
            return true;
        } catch {
            localStorage.removeItem(PROFILE_CACHE_KEY);
            return false;
        }
    }

    function resolveSignedOutState({ allowOfflineCache = false, expectedUserId = null } = {}) {
        const shouldUseOfflineCache = allowOfflineCache && !navigator.onLine && !wasManualLogout();
        if (shouldUseOfflineCache && restoreCachedProfile(expectedUserId, { requireRecentVerification: true })) {
            setLoading(false);
            setAuthResolved(true);
            return;
        }

        localStorage.removeItem(PROFILE_CACHE_KEY);
        clearLastVerifiedAuth();
        setUser(null);
        setMfaFactors([]);
        setMfaRequired(false);
        setMfaChallengeFactor(null);
        setLoading(false);
        setAuthResolved(true);
        setMfaResolved(true);
    }

    function isOfflineLikeError(error) {
        const message = (error?.message || '').toLowerCase();
        return !navigator.onLine
            || message.includes('timed out')
            || message.includes('timeout')
            || message.includes('network')
            || message.includes('failed to fetch')
            || message.includes('fetch');
    }

    async function syncMfaState(authUser = null) {
        if (!authUser?.id) {
            setMfaFactors([]);
            setMfaRequired(false);
            setMfaChallengeFactor(null);
            setMfaResolved(true);
            return;
        }

        if (!navigator.onLine) {
            if (hasRecentOfflineVerification(authUser.id)) {
                setMfaRequired(false);
                setMfaChallengeFactor(null);
            }
            setMfaResolved(true);
            return;
        }

        try {
            const { data: assuranceData, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (assuranceError) throw assuranceError;

            const { next, current } = assuranceData || {};
            const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
            if (factorsError) throw factorsError;

            const verifiedFactors = factorsData?.all?.filter((factor) => factor.status === 'verified') || [];
            setMfaFactors(factorsData?.all || []);

            const needsMfa = verifiedFactors.length > 0 && next === 'aal2' && current !== 'aal2';
            if (needsMfa) {
                setMfaRequired(true);
                setMfaChallengeFactor(verifiedFactors[0] || null);
                setMfaResolved(true);
                return;
            }

            setMfaRequired(false);
            setMfaChallengeFactor(null);
            setMfaResolved(true);
            setLastVerifiedAuth(authUser.id);
        } catch (error) {
            console.warn('Unable to resolve MFA state:', error);
            if (hasRecentOfflineVerification(authUser.id)) {
                setMfaRequired(false);
                setMfaChallengeFactor(null);
            }
            setMfaResolved(true);
        }
    }

    async function fetchProfile(userId, { allowRetry = true, authUser: paramAuthUser = null } = {}) {
        if (!userId) return;
        if (isFetchingProfileRef.current === userId) return;
        isFetchingProfileRef.current = userId;
        let resolvedAuthUser = paramAuthUser;

        // ── Offline guard ────────────────────────────────────────────────────
        // getUser() and DB queries need the network. When offline, serve the
        // last-known profile from localStorage so the user stays logged in.
        if (!navigator.onLine) {
            if (restoreCachedProfile(userId, { requireRecentVerification: true })) {
                setLoading(false);
                setAuthResolved(true);
                return;
            }
            localStorage.removeItem(PROFILE_CACHE_KEY);
            setUser(null);
            setMfaRequired(false);
            setMfaChallengeFactor(null);
            setLoading(false);
            setAuthResolved(true);
            setMfaResolved(true);
            return;
        }

        try {
            let authUser = resolvedAuthUser;
            if (!authUser) {
                const { data: authData } = await supabase.auth.getUser();
                authUser = authData?.user;
            }
            resolvedAuthUser = authUser;

            async function loadProfile() {
                return supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .maybeSingle();
            }

            let { data, error } = await loadProfile();

            // Only retry if the first attempt genuinely returned nothing or errored
            if ((!data || error) && allowRetry && navigator.onLine) {
                const retry = await loadProfile();
                data = retry.data;
                error = retry.error;
            }

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
                    setManualLogoutFlag(true);
                    await supabase.auth.signOut();
                    localStorage.removeItem(PROFILE_CACHE_KEY);
                    clearLastVerifiedAuth();
                    setUser(null);
                    setLoading(false);
                    setAuthResolved(true);
                    return;
                }
                // Block archived accounts (card hidden by admin — treated same as deactivated)
                if (data.is_archived === true) {
                    setManualLogoutFlag(true);
                    await supabase.auth.signOut();
                    localStorage.removeItem(PROFILE_CACHE_KEY);
                    clearLastVerifiedAuth();
                    setUser(null);
                    setLoading(false);
                    setAuthResolved(true);
                    return;
                }
                // Rejected users — keep them signed in so LoginPage shows rejection screen
                const fullUser = { ...data, email: authUser?.email || '' };
                setManualLogoutFlag(false);
                // Cache the profile for offline resilience
                try {
                    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
                        user: fullUser,
                        cachedAt: new Date().toISOString(),
                    }));
                } catch { /* quota exceeded or private browsing */ }
                if (data.role === USER_ROLES.REJECTED) {
                    setUser(fullUser);
                    setLoading(false);
                    setAuthResolved(true);
                    return;
                }
                // Fire-and-forget: update session_id for record-keeping (no longer used to force logout)
                const localId = getLocalInstanceId();
                if (data.current_session_id !== localId) {
                    supabase
                        .from('profiles')
                        .update({ current_session_id: localId })
                        .eq('id', userId)
                        .then(() => {/* intentionally non-blocking */})
                        .catch((e) => console.warn('session_id update failed silently:', e));
                }

                setUser(fullUser);
            } else {
                if (!restoreCachedProfile(userId, { requireRecentVerification: true })) {
                    setUser(null);
                }
            }
        } catch (error) {
            console.error('Error fetching profile:', error.message);
            // If this is a genuine auth error (401/403), the session is dead.
            // Don't restore from cache — that would leave the user stuck with
            // a stale profile and a dead Supabase token (infinite loading).
            const status = error?.status || error?.statusCode;
            const msg = (error?.message || '').toLowerCase();
            const isAuthError = status === 401 || status === 403
                || msg.includes('jwt expired') || msg.includes('invalid jwt')
                || msg.includes('not authenticated') || msg.includes('refresh_token');

            if (isAuthError) {
                console.warn('Session token is dead — forcing clean logout');
                localStorage.removeItem(PROFILE_CACHE_KEY);
                clearLastVerifiedAuth();
                setUser(null);
                setLoading(false);
                setAuthResolved(true);
                return;
            }

            // Network error while online? Fallback to cache so we don't log user out
            if (restoreCachedProfile(userId, { requireRecentVerification: true })) {
                setLoading(false);
                setAuthResolved(true);
                return;
            }
        } finally {
            if (isFetchingProfileRef.current === userId) {
                isFetchingProfileRef.current = null;
            }
            setLoading(false);
            setAuthResolved(true);
            if (userId) {
                await syncMfaState(resolvedAuthUser);
            }
        }
    }

    async function login(email, password) {
        setLoading(true);
        // Reset authResolved so AppRoutes shows the spinner cleanly
        // instead of briefly flashing the dashboard from a stale cache
        setAuthResolved(false);
        setMfaResolved(false);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) throw error;
            setManualLogoutFlag(false);

            // fetchProfile will be called by the onAuthStateChange listener
            return { success: true };
        } catch (error) {
            console.error('Login error:', error.message);
            setLoading(false);
            setAuthResolved(true);
            setMfaRequired(false);
            setMfaChallengeFactor(null);
            setMfaResolved(true);
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
            setManualLogoutFlag(false);
            setMfaResolved(false);
            return { success: true };
        } catch (error) {
            console.error('Registration error:', error.message);
            setLoading(false);
            return { success: false, error: error.message || 'Registration failed' };
        }
    }

    async function logout() {
        // Immediately clear the user and authResolved so the UI shows the
        // spinner / login page RIGHT NOW — no dashboard flash.
        setUser(null);
        setAuthResolved(false);
        setMfaResolved(false);
        setLoading(true);
        setManualLogoutFlag(true);
        // Clear cached profile so offline mode doesn't keep a stale session
        localStorage.removeItem(PROFILE_CACHE_KEY);
        clearLastVerifiedAuth();
        if (user?.id) {
            try {
                await unregisterCurrentPushSubscription(user.id);
            } catch (error) {
                console.error('Error removing push subscription during logout:', error);
            }
        }
        await supabase.auth.signOut();
        setMfaFactors([]);
        // onAuthStateChange SIGNED_OUT will confirm user=null, loading=false, authResolved=true
    }

    // --- MFA HELPERS ---

    async function enrollMFA() {
        const { data, error } = await supabase.auth.mfa.enroll({
            factorType: 'totp'
        });
        if (error) throw error;
        return data; // { id, type, totp: { qr_code, secret, uri } }
    }

    async function verifyMFAEnrollment(factorId, code) {
        const { data, error } = await supabase.auth.mfa.challengeAndVerify({
            factorId,
            code
        });
        if (error) throw error;
        
        // Refresh factors
        const { data: listData } = await supabase.auth.mfa.listFactors();
        setMfaFactors(listData?.all || []);
        if (user?.id) {
            setLastVerifiedAuth(user.id);
        }
        setMfaRequired(false);
        setMfaChallengeFactor(null);
        setMfaResolved(true);
        
        return data;
    }

    async function unenrollMFA(factorId) {
        const { data, error } = await supabase.auth.mfa.unenroll({
            factorId
        });
        if (error) throw error;
        
        // Refresh factors
        const { data: listData } = await supabase.auth.mfa.listFactors();
        setMfaFactors(listData?.all || []);
        if (user?.id) {
            setLastVerifiedAuth(user.id);
        }
        setMfaRequired(false);
        setMfaChallengeFactor(null);
        setMfaResolved(true);
        
        return data;
    }

    async function challengeMFA(factorId) {
        const { data, error } = await supabase.auth.mfa.challenge({
            factorId
        });
        if (error) throw error;
        return data; // { id, type, challenge }
    }

    async function verifyMFAChallenge(factorId, challengeId, code) {
        const { data, error } = await supabase.auth.mfa.verify({
            factorId,
            challengeId,
            code
        });
        if (error) throw error;
        if (user?.id) {
            setLastVerifiedAuth(user.id);
        }
        setMfaRequired(false);
        setMfaChallengeFactor(null);
        setMfaResolved(true);
        return data;
    }

    async function updateProfile(updates) {
        if (!user?.id) return { success: false, error: 'User not logged in' };
        const SAFE_SELF_PROFILE_FIELDS = ['name', 'company', 'avatar_url', 'current_project_id'];
        const sanitizedUpdates = Object.fromEntries(
            Object.entries(updates || {}).filter(([key]) => SAFE_SELF_PROFILE_FIELDS.includes(key))
        );

        if (Object.keys(sanitizedUpdates).length === 0) {
            return { success: false, error: 'No editable profile fields provided' };
        }
        
        try {
            const { data, error } = await supabase
                .from('profiles')
                .update(sanitizedUpdates)
                .eq('id', user.id)
                .select()
                .single();

            if (error) throw error;

            const fullUser = { ...data, email: user.email };
            setUser(fullUser);
            
            // Update cache
            try {
                localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
                    user: fullUser,
                    cachedAt: new Date().toISOString(),
                }));
            } catch (e) {
                console.warn('Failed to update profile cache:', e);
            }

            return { success: true, data: fullUser };
        } catch (error) {
            console.error('Update profile error:', error.message);
            return { success: false, error: error.message };
        }
    }

    return (
        <AuthContext.Provider value={{ 
            user, 
            loading,
            authResolved,
            mfaRequired,
            mfaResolved,
            mfaChallengeFactor,
            login, 
            register, 
            logout,
            updateProfile,
            mfaFactors,
            enrollMFA,
            verifyMFAEnrollment,
            unenrollMFA,
            challengeMFA,
            verifyMFAChallenge
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
