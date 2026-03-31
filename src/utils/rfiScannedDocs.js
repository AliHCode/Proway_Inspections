import { supabase } from './supabaseClient';

const EDGE_FN = 'r2-rfi-documents';

function ensureSuccess(response, fallbackMessage) {
    if (!response.error) return response.data;
    const message = response.error?.message || response.error?.context?.error || fallbackMessage;
    throw new Error(message);
}

export async function listRfiScannedDocuments(rfiId, page = 0, pageSize = 12) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await supabase
        .from('rfi_scanned_documents')
        .select('id, rfi_id, project_id, original_file_name, mime_type, file_size_bytes, uploaded_at, uploaded_by', { count: 'exact' })
        .eq('rfi_id', rfiId)
        .order('uploaded_at', { ascending: false })
        .range(from, to);

    if (error) throw error;
    return { rows: data || [], count: count || 0 };
}

export async function uploadRfiScannedDocument(rfiId, file, projectId, uploadedBy) {
    const signed = await supabase.functions.invoke(EDGE_FN, {
        body: {
            action: 'sign-upload',
            rfiId,
            fileName: file.name,
            contentType: file.type || 'application/pdf',
        },
    });

    const signedData = ensureSuccess(signed, 'Unable to prepare document upload.');

    const uploadResponse = await fetch(signedData.uploadUrl, {
        method: 'PUT',
        headers: signedData.headers || { 'Content-Type': file.type || 'application/pdf' },
        body: file,
    });

    if (!uploadResponse.ok) {
        throw new Error(`R2 upload failed with status ${uploadResponse.status}.`);
    }

    const { data, error } = await supabase
        .from('rfi_scanned_documents')
        .insert({
            project_id: projectId,
            rfi_id: rfiId,
            uploaded_by: uploadedBy,
            original_file_name: file.name,
            mime_type: file.type || 'application/pdf',
            file_size_bytes: file.size || 0,
            r2_object_key: signedData.objectKey,
        })
        .select('id')
        .single();

    if (error) throw error;
    return data;
}

export async function getRfiScannedDocumentUrl(documentId, mode = 'preview') {
    const signed = await supabase.functions.invoke(EDGE_FN, {
        body: {
            action: 'sign-read',
            documentId,
            mode,
        },
    });

    return ensureSuccess(signed, 'Unable to load document link.');
}

export async function deleteRfiScannedDocument(documentId) {
    const response = await supabase.functions.invoke(EDGE_FN, {
        body: {
            action: 'delete',
            documentId,
        },
    });

    return ensureSuccess(response, 'Unable to delete document.');
}
