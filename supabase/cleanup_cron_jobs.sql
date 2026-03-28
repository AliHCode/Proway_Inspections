-- =====================================================================
-- CLEANUP PATCH — ClearLine Inspections
-- 1. Enable pg_cron and pg_net (if not already enabled)
-- 2. Purge old push_dispatch_log rows (10 days old)
-- 3. Purge old user notifications from the tray (10 days old)
-- 4. Purge processed storage_deletion_queue rows (already cleaned up)
-- 5. Schedule Edge Function to process remaining storage deletions
-- =====================================================================

-- ─── 1. ENABLE EXTENSIONS ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ─── 2. Schedule daily cleanup of push_dispatch_log (server logs) ────
SELECT cron.schedule(
    'cleanup-push-dispatch-log-10d',       
    '0 3 * * *',                           
    $$
        DELETE FROM public.push_dispatch_log
        WHERE created_at < NOW() - INTERVAL '10 days';
    $$
);


-- ─── 3. Schedule daily cleanup of actual user notifications (10 days) 
-- This removes notifications like "RFI submitted" from the user's tray 
-- automatically once they are 10 days old.
SELECT cron.schedule(
    'cleanup-user-notifications-10d',       
    '0 3 * * *',                           
    $$
        DELETE FROM public.notifications
        WHERE created_at < NOW() - INTERVAL '10 days';
    $$
);


-- ─── 4. Schedule daily cleanup of processed storage_deletion_queue rows
SELECT cron.schedule(
    'cleanup-storage-deletion-queue-processed',   
    '0 3 * * *',                                  
    $$
        DELETE FROM public.storage_deletion_queue
        WHERE processed = true
          AND processed_at < NOW() - INTERVAL '7 days';
    $$
);


-- ─── 5. Schedule Edge Function to actually delete orphaned images ────
-- Replace YOUR_SERVICE_ROLE_KEY below with your actual service_role key
-- (Find it in Supabase Dashboard → Project Settings → API)

SELECT cron.schedule(
    'process-storage-deletions-daily',
    '30 3 * * *',     
    $$
        SELECT net.http_post(
            url     := 'https://reference.supabase.co/functions/v1/process-storage-deletions',
            headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
            ),
            body    := '{}'::jsonb
        );
    $$
);
