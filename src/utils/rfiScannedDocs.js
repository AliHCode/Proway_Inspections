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

export async function listRfiScannedDocumentsForRfis(rfiIds = []) {
    if (!Array.isArray(rfiIds) || rfiIds.length === 0) return [];

    const { data, error } = await supabase
        .from('rfi_scanned_documents')
        .select('id, rfi_id, project_id, original_file_name, mime_type, file_size_bytes, uploaded_at, uploaded_by')
        .in('rfi_id', rfiIds)
        .order('uploaded_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

function triggerBrowserDownload(blob, fileName) {
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
}

export async function uploadRfiScannedDocument(rfiId, file, projectId, uploadedBy, storedFileName = file.name) {
    const signed = await supabase.functions.invoke(EDGE_FN, {
        body: {
            action: 'sign-upload',
            rfiId,
            fileName: storedFileName,
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
            original_file_name: storedFileName,
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

export async function downloadRfiScannedDocument(documentId, fileName) {
    const data = await getRfiScannedDocumentUrl(documentId, 'download');
    const response = await fetch(data.url);

    if (!response.ok) {
        throw new Error(`Could not download file (${response.status}).`);
    }

    const blob = await response.blob();
    triggerBrowserDownload(blob, fileName || data.originalFileName || 'document.pdf');
}

export async function fetchRfiScannedDocumentBlob(documentId) {
    const data = await getRfiScannedDocumentUrl(documentId, 'download');
    const response = await fetch(data.url);

    if (!response.ok) {
        throw new Error(`Could not load file (${response.status}).`);
    }

    return {
        blob: await response.blob(),
        originalFileName: data.originalFileName || 'document.pdf',
    };
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
