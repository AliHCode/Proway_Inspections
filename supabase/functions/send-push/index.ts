// @ts-nocheck

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

if (!vapidPublicKey || !vapidPrivateKey) {
  throw new Error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY');
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');

    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { userId, title, message, rfiId = null, url = '/' } = await req.json();

    if (!userId || !title || !message) {
      return new Response(JSON.stringify({ error: 'userId, title and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, subscription, device_install_id, updated_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false });

    if (subscriptionsError) {
      throw subscriptionsError;
    }

    const latestByInstall = new Map<string, typeof subscriptions[number]>();
    for (const record of subscriptions || []) {
      const installId = record.device_install_id || record.endpoint;
      if (!latestByInstall.has(installId)) {
        latestByInstall.set(installId, record);
      }
    }

    const dedupedSubscriptions = Array.from(latestByInstall.values());

    if (dedupedSubscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, removed: 0, reason: 'no-subscriptions' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload = JSON.stringify({
      title,
      body: message,
      message,
      rfiId,
      url,
      tag: rfiId ? `rfi-${rfiId}` : 'proway-notification',
    });

    const invalidIds: string[] = [];
    let sent = 0;

    for (const record of dedupedSubscriptions) {
      try {
        await webpush.sendNotification(record.subscription, payload);
        sent += 1;
      } catch (error: unknown) {
        const pushError = error as {
          statusCode?: number;
          status?: number;
          body?: string;
          message?: string;
        };
        const statusCode = pushError.statusCode ?? pushError.status ?? 0;
        console.error('Push delivery failed:', record.endpoint, statusCode, pushError.body || pushError.message || error);

        if (statusCode === 404 || statusCode === 410) {
          invalidIds.push(record.id);
        }
      }
    }

    if (invalidIds.length > 0) {
      const { error: cleanupError } = await supabase
        .from('push_subscriptions')
        .delete()
        .in('id', invalidIds);

      if (cleanupError) {
        console.error('Failed to clean invalid push subscriptions:', cleanupError);
      }
    }

    return new Response(JSON.stringify({ sent, removed: invalidIds.length }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const requestError = error as { message?: string };
    console.error('send-push failed:', error);
    return new Response(JSON.stringify({ error: requestError.message || 'Unexpected error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
