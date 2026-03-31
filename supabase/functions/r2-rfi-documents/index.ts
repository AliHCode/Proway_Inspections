// @ts-nocheck

import { createClient } from 'npm:@supabase/supabase-js@2';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3.917.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.917.0';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const r2AccountId = Deno.env.get('R2_ACCOUNT_ID') ?? '';
const r2AccessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') ?? '';
const r2SecretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') ?? '';
const r2Bucket = Deno.env.get('R2_RFI_BUCKET') ?? '';

const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', serviceRoleKey || 'placeholder', {
  auth: { persistSession: false, autoRefreshToken: false },
});

const r2 = new S3Client({
  region: 'auto',
  endpoint: r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : 'https://example.invalid',
  credentials: {
    accessKeyId: r2AccessKeyId,
    secretAccessKey: r2SecretAccessKey,
  },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function sanitizeFileName(name = 'document.pdf') {
  const trimmed = name.trim() || 'document.pdf';
  const cleaned = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return cleaned.slice(0, 120) || 'document.pdf';
}

function contentDisposition(fileName: string, mode: 'inline' | 'attachment') {
  const safeName = sanitizeFileName(fileName).replace(/"/g, '');
  return `${mode}; filename="${safeName}"`;
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) {
    throw new Error('Missing authorization token.');
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !authData?.user) {
    throw new Error('Invalid authorization token.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile) {
    throw new Error('User profile not found.');
  }

  return profile;
}

async function getProjectMembership(projectId: string, userId: string) {
  const { data, error } = await supabase
    .from('project_members')
    .select('role, can_manage_contractor_permissions')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function assertProjectAccess(projectId: string, user: { id: string; role: string }) {
  if (user.role === 'admin') {
    return { role: 'admin', can_manage_contractor_permissions: true };
  }

  const membership = await getProjectMembership(projectId, user.id);
  if (!membership) {
    throw new Error('You do not have access to this project.');
  }

  return membership;
}

function isUploadReadyStatus(status = '') {
  return status === 'approved' || status === 'conditional_approve';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !serviceRoleKey || !r2AccountId || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
      return json({ error: 'R2 or Supabase environment variables are missing.' }, 503);
    }

    const user = await requireUser(req);
    const body = await req.json();
    const action = body?.action;

    if (!action) {
      return json({ error: 'Action is required.' }, 400);
    }

    if (action === 'sign-upload') {
      const rfiId = String(body?.rfiId || '');
      const originalFileName = sanitizeFileName(String(body?.fileName || 'document.pdf'));
      const contentType = String(body?.contentType || 'application/pdf');

      if (!rfiId) return json({ error: 'rfiId is required.' }, 400);
      if (!contentType.includes('pdf')) return json({ error: 'Only PDF uploads are allowed on this page.' }, 400);

      const { data: rfi, error: rfiError } = await supabase
        .from('rfis')
        .select('id, project_id, status, filed_by')
        .eq('id', rfiId)
        .single();

      if (rfiError || !rfi) return json({ error: 'RFI not found.' }, 404);

      const membership = await assertProjectAccess(rfi.project_id, user);

      if (user.role !== 'admin') {
        if (membership.role !== 'contractor') {
          return json({ error: 'Only contractors can upload scanned RFI copies.' }, 403);
        }
        const canManageAll = membership.can_manage_contractor_permissions === true;
        if (!canManageAll && rfi.filed_by !== user.id) {
          return json({ error: 'You can only upload scanned copies for RFIs you filed.' }, 403);
        }
      }

      if (!isUploadReadyStatus(rfi.status)) {
        return json({ error: 'Scanned copies can be uploaded only after consultant approval.' }, 409);
      }

      const now = new Date();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const objectKey = `rfi-scans/${rfi.project_id}/${now.getUTCFullYear()}/${month}/${rfi.id}/${crypto.randomUUID()}-${originalFileName}`;

      const command = new PutObjectCommand({
        Bucket: r2Bucket,
        Key: objectKey,
        ContentType: contentType,
        ContentDisposition: contentDisposition(originalFileName, 'inline'),
      });

      const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });
      return json({
        uploadUrl,
        objectKey,
        expiresIn: 600,
        method: 'PUT',
        headers: { 'Content-Type': contentType },
      });
    }

    if (action === 'sign-read') {
      const documentId = String(body?.documentId || '');
      const mode = body?.mode === 'download' ? 'download' : 'preview';
      if (!documentId) return json({ error: 'documentId is required.' }, 400);

      const { data: docRow, error: docError } = await supabase
        .from('rfi_scanned_documents')
        .select('id, project_id, original_file_name, mime_type, r2_object_key')
        .eq('id', documentId)
        .single();

      if (docError || !docRow) return json({ error: 'Document not found.' }, 404);

      await assertProjectAccess(docRow.project_id, user);

      const command = new GetObjectCommand({
        Bucket: r2Bucket,
        Key: docRow.r2_object_key,
        ResponseContentType: docRow.mime_type || 'application/pdf',
        ResponseContentDisposition: contentDisposition(docRow.original_file_name, mode === 'download' ? 'attachment' : 'inline'),
      });

      const url = await getSignedUrl(r2, command, { expiresIn: 600 });
      return json({
        url,
        expiresIn: 600,
        originalFileName: docRow.original_file_name,
      });
    }

    if (action === 'delete') {
      const documentId = String(body?.documentId || '');
      if (!documentId) return json({ error: 'documentId is required.' }, 400);

      const { data: docRow, error: docError } = await supabase
        .from('rfi_scanned_documents')
        .select('id, project_id, rfi_id, r2_object_key')
        .eq('id', documentId)
        .single();

      if (docError || !docRow) return json({ error: 'Document not found.' }, 404);

      const { data: rfi, error: rfiError } = await supabase
        .from('rfis')
        .select('id, filed_by')
        .eq('id', docRow.rfi_id)
        .single();

      if (rfiError || !rfi) return json({ error: 'Related RFI not found.' }, 404);

      const membership = await assertProjectAccess(docRow.project_id, user);

      if (user.role !== 'admin') {
        if (membership.role !== 'contractor') {
          return json({ error: 'Only contractors can remove scanned copies.' }, 403);
        }
        const canManageAll = membership.can_manage_contractor_permissions === true;
        if (!canManageAll && rfi.filed_by !== user.id) {
          return json({ error: 'You can only remove scanned copies for RFIs you filed.' }, 403);
        }
      }

      await r2.send(new DeleteObjectCommand({
        Bucket: r2Bucket,
        Key: docRow.r2_object_key,
      }));

      const { error: deleteRowError } = await supabase
        .from('rfi_scanned_documents')
        .delete()
        .eq('id', documentId);

      if (deleteRowError) {
        throw deleteRowError;
      }

      return json({ success: true });
    }

    return json({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    console.error('r2-rfi-documents error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
});
