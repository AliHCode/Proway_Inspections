const DB_NAME = 'saa-offline-db';
const DB_VERSION = 1;
const STORE_PENDING_RFIS = 'pending-rfis';

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_PENDING_RFIS)) {
                const store = db.createObjectStore(STORE_PENDING_RFIS, {
                    keyPath: 'id',
                    autoIncrement: true,
                });
                store.createIndex('by_project', 'projectId', { unique: false });
                store.createIndex('by_created_at', 'createdAt', { unique: false });
            }
        };
    });
}

async function withStore(mode, fn) {
    const db = await openDb();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PENDING_RFIS, mode);
        const store = tx.objectStore(STORE_PENDING_RFIS);

        let requestResult;
        try {
            requestResult = fn(store);
        } catch (error) {
            reject(error);
            return;
        }

        tx.oncomplete = () => resolve(requestResult?.result);
        tx.onerror = () => reject(tx.error || requestResult?.error);
        tx.onabort = () => reject(tx.error || requestResult?.error);
    });
}

export async function enqueuePendingRFI(payload) {
    const entry = {
        ...payload,
        createdAt: payload.createdAt || new Date().toISOString(),
    };
    return withStore('readwrite', (store) => store.add(entry));
}

export async function listPendingRFIs(projectId = null) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PENDING_RFIS, 'readonly');
        const store = tx.objectStore(STORE_PENDING_RFIS);
        const req = store.getAll();

        req.onsuccess = () => {
            const all = req.result || [];
            const filtered = projectId ? all.filter((item) => item.projectId === projectId) : all;
            filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            resolve(filtered);
        };
        req.onerror = () => reject(req.error);
    });
}

export async function removePendingRFI(id) {
    return withStore('readwrite', (store) => store.delete(id));
}

export async function countPendingRFIs(projectId = null) {
    const all = await listPendingRFIs(projectId);
    return all.length;
}

export function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export function dataUrlToFile(dataUrl, filename = 'offline-image.png', mimeType = 'image/png') {
    const parts = dataUrl.split(',');
    const header = parts[0] || '';
    const body = parts[1] || '';
    const inferredMime = /data:(.*?);base64/.exec(header)?.[1] || mimeType;

    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new File([bytes], filename, { type: inferredMime });
}

export async function serializeImagesForQueue(images = []) {
    const serialized = [];

    for (const image of images) {
        if (typeof image === 'string') {
            serialized.push({ kind: 'url', value: image });
            continue;
        }

        if (image instanceof File) {
            const dataUrl = await fileToDataUrl(image);
            serialized.push({
                kind: 'file',
                value: dataUrl,
                name: image.name || 'offline-image.png',
                type: image.type || 'image/png',
            });
        }
    }

    return serialized;
}

export function deserializeQueuedImages(serializedImages = []) {
    return serializedImages.map((entry) => {
        if (entry.kind === 'url') return entry.value;
        if (entry.kind === 'file') {
            return dataUrlToFile(entry.value, entry.name, entry.type);
        }
        return null;
    }).filter(Boolean);
}
