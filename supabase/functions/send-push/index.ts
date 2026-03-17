// @ts-nocheck

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';

let webpushConfigured = false;
try {
  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    webpushConfigured = true;
  }
} catch (e) {
  console.error("Failed to configure webpush on init:", e);
}

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', serviceRoleKey || 'placeholder', {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SENDER_LIMIT_PER_MIN = 30;
const RECIPIENT_LIMIT_PER_MIN = 10;
const EVENT_DEDUPE_SECONDS = 60;

function isoNowMinusSeconds(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

Deno.serve(async (req: Request) => {
  // CORS preflight must succeed BEFORE any configuration checks.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    // Return a clear 503 when VAPID keys are not set up instead of crashing.
    if (!supabaseUrl || !serviceRoleKey || !webpushConfigured) {
      console.error("send-push edge function is missing environment variables for initialization.");
      return new Response(JSON.stringify({ error: 'Server misconfiguration: missing push setup' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    let senderUserId: string | null = null;
    // Optional auth check: if a JWT is present, validate it for diagnostics.
    // Do not hard-fail when missing because some clients do not forward Authorization.
    if (jwt) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(jwt);

      if (authError || !user) {
        console.warn('send-push called with invalid Authorization token; proceeding without user context');
      } else {
        senderUserId = user.id;
      }
    }

    const { userId, title, message, rfiId = null, url = '/', eventKey = null } = await req.json();

    if (!userId || !title || !message) {
      return new Response(JSON.stringify({ error: 'userId, title and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const oneMinuteAgo = isoNowMinusSeconds(60);

    if (senderUserId) {
      const { count: senderCount, error: senderCountError } = await supabase
        .from('push_dispatch_log')
        .select('id', { count: 'exact', head: true })
        .eq('sender_user_id', senderUserId)
        .gte('created_at', oneMinuteAgo);

      if (senderCountError) throw senderCountError;

      if ((senderCount || 0) >= SENDER_LIMIT_PER_MIN) {
        return new Response(JSON.stringify({ error: 'sender-rate-limit', retryAfterSeconds: 60 }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { count: recipientCount, error: recipientCountError } = await supabase
      .from('push_dispatch_log')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', userId)
      .gte('created_at', oneMinuteAgo);

    if (recipientCountError) throw recipientCountError;

    if ((recipientCount || 0) >= RECIPIENT_LIMIT_PER_MIN) {
      return new Response(JSON.stringify({ error: 'recipient-rate-limit', retryAfterSeconds: 60 }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (eventKey) {
      const dedupeAfter = isoNowMinusSeconds(EVENT_DEDUPE_SECONDS);
      const { data: dedupeRows, error: dedupeError } = await supabase
        .from('push_dispatch_log')
        .select('id')
        .eq('recipient_user_id', userId)
        .eq('event_key', eventKey)
        .gte('created_at', dedupeAfter)
        .limit(1);

      if (dedupeError) throw dedupeError;

      if ((dedupeRows || []).length > 0) {
        return new Response(JSON.stringify({ sent: 0, removed: 0, deduped: true, eventKey }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
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
      await supabase.from('push_dispatch_log').insert([{
        sender_user_id: senderUserId,
        recipient_user_id: userId,
        event_key: eventKey,
        status: 'skipped',
        error_details: 'No active push subscriptions found for user.',
        sent_count: 0,
        removed_count: 0,
      }]);

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
    const failureDetails: string[] = [];
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
        const errorMsg = pushError.body || pushError.message || String(error);
        console.error('Push delivery failed:', record.endpoint, statusCode, errorMsg);
        failureDetails.push(`endpoint=${record.endpoint.slice(-20)} status=${statusCode} msg=${errorMsg}`);

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

    const finalStatus = sent > 0 ? 'sent' : 'failed';
    await supabase.from('push_dispatch_log').insert([{
      sender_user_id: senderUserId,
      recipient_user_id: userId,
      event_key: eventKey,
      status: finalStatus,
      error_details: failureDetails.length > 0 ? failureDetails.join(' | ') : null,
      sent_count: sent,
      removed_count: invalidIds.length,
    }]);

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
