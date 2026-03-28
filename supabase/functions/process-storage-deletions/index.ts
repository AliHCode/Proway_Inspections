import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * process-storage-deletions
 *
 * Called by pg_cron daily at 3:30 AM.
 * Reads unprocessed rows from storage_deletion_queue,
 * deletes the orphaned image files from Supabase Storage,
 * and marks each row as processed.
 *
 * ─── ZERO RFI DATA IS TOUCHED ────────────────────────────────────────
 * This function only cleans up image files from RFIs that no longer
 * exist in the database (the rfis row was already deleted by an admin).
 * Live RFI images — referenced in rfis.images[] — are NEVER touched.
 * ─────────────────────────────────────────────────────────────────────
 *
 * To deploy:
 *   supabase functions deploy process-storage-deletions --no-verify-jwt
 *
 * To test manually:
 *   curl -X POST https://YOUR_REF.supabase.co/functions/v1/process-storage-deletions \
 *     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
 */

Deno.serve(async (req: Request) => {
    // Only allow service role calls (cron or manual admin trigger)
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!serviceRoleKey || !authHeader.includes(serviceRoleKey)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Service role client — can bypass RLS to read the queue and call storage
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        serviceRoleKey
    );

    // ── Read pending deletions ─────────────────────────────────────────
    // Process max 100 per run so we never time out (10s edge function limit).
    // If more exist, the next scheduled run picks them up.
    const { data: queue, error: queueError } = await supabase
        .from('storage_deletion_queue')
        .select('id, file_path, bucket_id, deleted_at')
        .eq('processed', false)
        .order('deleted_at', { ascending: true })
        .limit(100);

    if (queueError) {
        console.error('Error reading storage_deletion_queue:', queueError);
        return new Response(JSON.stringify({ error: queueError.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    if (!queue || queue.length === 0) {
        return new Response(JSON.stringify({ message: 'Nothing to process.', processed: 0 }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // ── Group by bucket (in case you have multiple storage buckets) ────
    const grouped: Record<string, Array<{ id: number; file_path: string }>> = {};
    for (const row of queue) {
        const bucket = row.bucket_id || 'rfi-images';
        if (!grouped[bucket]) grouped[bucket] = [];
        grouped[bucket].push({ id: row.id, file_path: row.file_path });
    }

    const processedIds: number[] = [];
    const failedIds:    number[] = [];

    // ── Delete files from Supabase Storage ────────────────────────────
    for (const [bucketId, rows] of Object.entries(grouped)) {
        const filePaths = rows
            .map(r => {
                // Extract path from full URL if stored as URL
                // e.g. "https://xxx.supabase.co/storage/v1/object/public/rfi-images/proj/file.jpg"
                // → "proj/file.jpg"
                if (r.file_path.startsWith('http')) {
                    const marker = `/${bucketId}/`;
                    const idx = r.file_path.indexOf(marker);
                    return idx !== -1 ? r.file_path.substring(idx + marker.length) : r.file_path;
                }
                return r.file_path;
            })
            .filter(Boolean);

        const { error: deleteError } = await supabase.storage
            .from(bucketId)
            .remove(filePaths);

        if (deleteError) {
            // Log and continue — don't fail the whole batch for one error
            console.error(`Storage delete error [bucket: ${bucketId}]:`, deleteError.message);
            failedIds.push(...rows.map(r => r.id));
        } else {
            processedIds.push(...rows.map(r => r.id));
        }
    }

    // ── Mark successfully processed rows ──────────────────────────────
    if (processedIds.length > 0) {
        const { error: markError } = await supabase
            .from('storage_deletion_queue')
            .update({
                processed:    true,
                processed_at: new Date().toISOString(),
            })
            .in('id', processedIds);

        if (markError) {
            console.error('Error marking rows as processed:', markError.message);
        }
    }

    const result = {
        total:     queue.length,
        processed: processedIds.length,
        failed:    failedIds.length,
        message:   failedIds.length > 0
            ? `${failedIds.length} file(s) failed to delete — will retry next run.`
            : 'All files deleted successfully.',
    };

    console.log('Storage cleanup result:', result);

    return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' },
    });
});
