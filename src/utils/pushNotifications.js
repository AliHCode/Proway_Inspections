import { supabase } from './supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const DEVICE_INSTALL_KEY = 'proway_device_install_id_v1';

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function getDeviceLabel() {
    const ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
    return 'Browser Device';
}

function isPushSupported() {
    return (
        typeof window !== 'undefined' &&
        'Notification' in window &&
        'serviceWorker' in navigator &&
        'PushManager' in window
    );
}

async function upsertSubscription(userId, subscription) {
    const installId = getOrCreateDeviceInstallId();
    const payload = subscription.toJSON();

    // Ensure this install has at most one active subscription row.
    const { error: cleanupError } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('device_install_id', installId)
        .neq('endpoint', subscription.endpoint);

    if (cleanupError) throw cleanupError;

    const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
            user_id: userId,
            device_install_id: installId,
            endpoint: subscription.endpoint,
            p256dh: payload.keys?.p256dh || null,
            auth: payload.keys?.auth || null,
            subscription: payload,
            user_agent: navigator.userAgent || null,
            device_label: getDeviceLabel(),
            is_active: true,
            last_seen_at: new Date().toISOString(),
        }, { onConflict: 'endpoint' });

    if (error) throw error;
}

async function deleteStoredSubscription(userId) {
    const installId = getOrCreateDeviceInstallId();

    const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('device_install_id', installId);

    if (error) throw error;
}

function createInstallId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `install_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function getOrCreateDeviceInstallId() {
    try {
        const existing = localStorage.getItem(DEVICE_INSTALL_KEY);
        if (existing) return existing;

        const generated = createInstallId();
        localStorage.setItem(DEVICE_INSTALL_KEY, generated);
        return generated;
    } catch {
        return createInstallId();
    }
}

export async function syncPushSubscriptionForUser(userId) {
    if (!userId) return { status: 'missing-user' };
    if (!isPushSupported()) return { status: 'unsupported' };

    const registration = await navigator.serviceWorker.ready;

    if (Notification.permission === 'denied') {
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
            try {
                await existingSubscription.unsubscribe();
            } catch {
                // Ignore local unsubscribe failures; still remove server record.
            }
            await deleteStoredSubscription(userId);
        }
        return { status: 'denied' };
    }

    if (Notification.permission !== 'granted') {
        return { status: 'permission-required' };
    }

    if (!VAPID_PUBLIC_KEY) {
        console.warn('VITE_VAPID_PUBLIC_KEY is missing. Push subscription skipped.');
        return { status: 'missing-vapid-key' };
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
    }

    await upsertSubscription(userId, subscription);
    return { status: 'registered', endpoint: subscription.endpoint };
}

export async function unregisterCurrentPushSubscription(userId) {
    if (!userId || !isPushSupported()) return { status: 'unsupported' };

    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();

    if (!existingSubscription) {
        return { status: 'not-found' };
    }

    try {
        await existingSubscription.unsubscribe();
    } catch {
        // Ignore local unsubscribe failures; still remove server record.
    }

    await deleteStoredSubscription(userId);
    return { status: 'removed' };
}

export function pushSupportStatus() {
    if (!isPushSupported()) return 'unsupported';
    if (!VAPID_PUBLIC_KEY) return 'missing-vapid-key';
    return 'supported';
}
