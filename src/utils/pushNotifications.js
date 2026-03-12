import { supabase } from './supabaseClient';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

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
    const payload = subscription.toJSON();
    const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
            user_id: userId,
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

async function deleteStoredSubscription(userId, endpoint) {
    if (!endpoint) return;

    const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', endpoint);

    if (error) throw error;
}

export async function syncPushSubscriptionForUser(userId) {
    if (!userId) return { status: 'missing-user' };
    if (!isPushSupported()) return { status: 'unsupported' };

    const registration = await navigator.serviceWorker.ready;

    if (Notification.permission === 'denied') {
        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
            const endpoint = existingSubscription.endpoint;
            try {
                await existingSubscription.unsubscribe();
            } catch {
                // Ignore local unsubscribe failures; still remove server record.
            }
            await deleteStoredSubscription(userId, endpoint);
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

    const endpoint = existingSubscription.endpoint;

    try {
        await existingSubscription.unsubscribe();
    } catch {
        // Ignore local unsubscribe failures; still remove server record.
    }

    await deleteStoredSubscription(userId, endpoint);
    return { status: 'removed' };
}

export function pushSupportStatus() {
    if (!isPushSupported()) return 'unsupported';
    if (!VAPID_PUBLIC_KEY) return 'missing-vapid-key';
    return 'supported';
}
