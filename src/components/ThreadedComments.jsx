import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import UserAvatar from './UserAvatar';
import { Send, Loader2, Paperclip, Brush, X, RotateCcw, Move, Trash2 } from 'lucide-react';

export default function ThreadedComments({ rfiId, onCommentAdded, scrollTrigger }) {
    const { user } = useAuth();
    const { fetchComments, addComment, updateComment, deleteComment, uploadImages, rfis, canUserDiscussRfi, canUserViewDiscussion } = useRFI();
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editingValue, setEditingValue] = useState('');
    const [composerOpen, setComposerOpen] = useState(false);
    const [composerImages, setComposerImages] = useState([]);
    const [composerCaption, setComposerCaption] = useState('');
    const [composerPreviewUrls, setComposerPreviewUrls] = useState([]);
    const [activeComposerIndex, setActiveComposerIndex] = useState(0);
    const [brushSize, setBrushSize] = useState(6);
    const [brushColor, setBrushColor] = useState('#ef4444');
    const [canvasReady, setCanvasReady] = useState(false);
    const [canvasDirty, setCanvasDirty] = useState(false);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [interactionMode, setInteractionMode] = useState('draw');
    const [isPanning, setIsPanning] = useState(false);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [composerMode, setComposerMode] = useState('create');
    const [composerEditCommentId, setComposerEditCommentId] = useState(null);
    const [deleteConfirmCommentId, setDeleteConfirmCommentId] = useState(null);
    const [discussionLocked, setDiscussionLocked] = useState(false);
    const prevCommentsLength = useRef(0);
    const messagesEndRef = useRef(null);
    const attachInputRef = useRef(null);
    const composerCanvasRef = useRef(null);
    const drawHistoryRef = useRef([]);
    const baseSnapshotRef = useRef(null);
    const drawingRef = useRef(false);
    const panDragRef = useRef({ active: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 });
    const pinchRef = useRef({ active: false, startDistance: 0, startZoom: 1 });

    useEffect(() => {
        if (composerImages.length === 0) {
            setComposerPreviewUrls([]);
            return;
        }

        const nextUrls = composerImages.map((file) => URL.createObjectURL(file));
        setComposerPreviewUrls(nextUrls);

        return () => nextUrls.forEach((url) => URL.revokeObjectURL(url));
    }, [composerImages]);

    useEffect(() => {
        if (!composerOpen || composerImages.length === 0 || !composerCanvasRef.current) return;

        let cancelled = false;

        const renderActiveImage = async () => {
            try {
                setCanvasReady(false);
                const canvas = composerCanvasRef.current;
                const ctx = canvas.getContext('2d');
                const activeFile = composerImages[activeComposerIndex];
                if (!ctx || !activeFile) return;

                const objectUrl = URL.createObjectURL(activeFile);
                const img = new Image();
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = objectUrl;
                });

                if (cancelled) {
                    URL.revokeObjectURL(objectUrl);
                    return;
                }

                ctx.fillStyle = '#0f172a';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const drawWidth = img.width * scale;
                const drawHeight = img.height * scale;
                const drawX = (canvas.width - drawWidth) / 2;
                const drawY = (canvas.height - drawHeight) / 2;

                ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

                const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
                baseSnapshotRef.current = snapshot;
                drawHistoryRef.current = [snapshot];
                setCanvasDirty(false);
                setCanvasReady(true);

                URL.revokeObjectURL(objectUrl);
            } catch (error) {
                console.error('Failed to render attachment preview:', error);
            }
        };

        renderActiveImage();

        return () => {
            cancelled = true;
        };
    }, [composerOpen, composerImages, activeComposerIndex]);

    useEffect(() => {
        loadComments();
        // Set up polling (5s)
        const interval = setInterval(loadComments, 5000);
        return () => clearInterval(interval);
    }, [rfiId, rfis, canUserDiscussRfi, canUserViewDiscussion]);

    useEffect(() => {
        // SCROLL ON TRIGGER (Button Click)
        if (scrollTrigger && messagesEndRef.current) {
            // Multiple attempts to ensure scroll reaches true bottom after layout settles
            const delays = [50, 200, 500];
            const timers = delays.map(ms =>
                setTimeout(() => scrollToBottom(), ms)
            );
            return () => timers.forEach(t => clearTimeout(t));
        }
    }, [scrollTrigger, loading]); // Fire on trigger OR when loading finishes if we had a trigger

    useEffect(() => {
        // Silent updates for background polling
        prevCommentsLength.current = comments.length;
    }, [comments]);

    const loadComments = async () => {
        const targetRfi = rfis.find((r) => r.id === rfiId);
        const canViewDiscussion = targetRfi ? canUserViewDiscussion(targetRfi) : true;
        const canDiscuss = targetRfi ? canUserDiscussRfi(targetRfi) : true;
        setDiscussionLocked(!canDiscuss);

        if (!canViewDiscussion) {
            setComments([]);
            setLoading(false);
            return;
        }

        const data = await fetchComments(rfiId);
        setComments(data);
        setLoading(false);
    };

    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = newComment.trim();
        if (!trimmed || submitting) return;

        setSubmitting(true);
        try {
            await addComment(rfiId, trimmed);
            setNewComment('');
            await loadComments();
            scrollToBottom(); // Manually scroll when the user themselves sends a message
            if (onCommentAdded) onCommentAdded();
        } catch (error) {
            console.error(error);
            toast.error(error?.message || 'Unable to send message.');
        } finally {
            setSubmitting(false);
        }
    };

    const startEdit = (comment) => {
        setEditingCommentId(comment.id);
        setEditingValue(comment.content);
    };

    const cancelEdit = () => {
        setEditingCommentId(null);
        setEditingValue('');
    };

    const handleEditSubmit = async (commentId) => {
        const trimmed = editingValue.trim();
        if (!trimmed || submitting) return;

        setSubmitting(true);
        try {
            await updateComment(commentId, trimmed);
            await loadComments();
            cancelEdit();
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(false);
        }
    };

    const openFilePicker = () => {
        if (discussionLocked) return;
        attachInputRef.current?.click();
    };

    const handleSelectAttachments = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setComposerMode('create');
        setComposerEditCommentId(null);
        setComposerImages(files);
        setActiveComposerIndex(0);
        setComposerCaption(newComment.trim());
        setZoomLevel(1);
        setInteractionMode('draw');
        setPanOffset({ x: 0, y: 0 });
        if (newComment.trim()) {
            setNewComment('');
        }
        setComposerOpen(true);

        e.target.value = '';
    };

    const closeComposer = () => {
        setComposerOpen(false);
        setComposerImages([]);
        setComposerCaption('');
        setActiveComposerIndex(0);
        setZoomLevel(1);
        setInteractionMode('draw');
        setIsPanning(false);
        setPanOffset({ x: 0, y: 0 });
        setComposerMode('create');
        setComposerEditCommentId(null);
        setCanvasReady(false);
        setCanvasDirty(false);
        drawHistoryRef.current = [];
        baseSnapshotRef.current = null;
        panDragRef.current = { active: false, startX: 0, startY: 0, startOffsetX: 0, startOffsetY: 0 };
        pinchRef.current = { active: false, startDistance: 0, startZoom: 1 };
    };

    const clampZoom = (value) => Math.max(1, Math.min(4, Number(value.toFixed(2))));

    const getTouchDistance = (touchA, touchB) => {
        const dx = touchA.clientX - touchB.clientX;
        const dy = touchA.clientY - touchB.clientY;
        return Math.hypot(dx, dy);
    };

    const startPanDrag = (clientX, clientY) => {
        if (zoomLevel <= 1) return;

        panDragRef.current = {
            active: true,
            startX: clientX,
            startY: clientY,
            startOffsetX: panOffset.x,
            startOffsetY: panOffset.y,
        };
        setIsPanning(true);
    };

    const updatePanDrag = (clientX, clientY) => {
        if (!panDragRef.current.active) return;

        const deltaX = clientX - panDragRef.current.startX;
        const deltaY = clientY - panDragRef.current.startY;
        setPanOffset({
            x: panDragRef.current.startOffsetX + deltaX,
            y: panDragRef.current.startOffsetY + deltaY,
        });
    };

    const stopPanDrag = () => {
        if (!panDragRef.current.active) return;
        panDragRef.current.active = false;
        setIsPanning(false);
    };

    const getCanvasPoint = (e) => {
        const canvas = composerCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    };

    const startDrawing = (e) => {
        if (!composerOpen || !canvasReady || !composerCanvasRef.current || submitting || interactionMode !== 'draw') return;
        e.preventDefault();

        const canvas = composerCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCanvasPoint(e);
        drawHistoryRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = brushColor;

        drawingRef.current = true;
        setCanvasDirty(true);
    };

    const drawOnCanvas = (e) => {
        if (!drawingRef.current || !composerCanvasRef.current) return;
        e.preventDefault();

        const canvas = composerCanvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { x, y } = getCanvasPoint(e);
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        const ctx = composerCanvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.beginPath();
        }
    };

    const resetCurrentMarkup = () => {
        const canvas = composerCanvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx || !baseSnapshotRef.current) return;

        ctx.putImageData(baseSnapshotRef.current, 0, 0);
        drawHistoryRef.current = [baseSnapshotRef.current];
        setCanvasDirty(false);
    };

    const commitActiveMarkup = async (sourceImages) => {
        const canvas = composerCanvasRef.current;
        if (!canvas || !canvasReady || !canvasDirty || sourceImages.length === 0) {
            return sourceImages;
        }

        const blob = await new Promise((resolve) => {
            canvas.toBlob(resolve, 'image/png', 0.95);
        });
        if (!blob) return sourceImages;

        const currentFile = sourceImages[activeComposerIndex];
        const baseName = currentFile?.name ? currentFile.name.replace(/\.[^.]+$/, '') : `attachment-${activeComposerIndex + 1}`;
        const markedFile = new File([blob], `${baseName}-marked.png`, { type: 'image/png' });
        const updated = sourceImages.map((img, i) => (i === activeComposerIndex ? markedFile : img));

        setComposerImages(updated);
        setCanvasDirty(false);
        return updated;
    };

    const handleSwitchComposerImage = async (index) => {
        if (index === activeComposerIndex || submitting) return;
        await commitActiveMarkup(composerImages);
        setActiveComposerIndex(index);
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
    };

    const handleZoomOut = () => {
        setZoomLevel((prev) => {
            const next = clampZoom(prev - 0.2);
            if (next === 1) setPanOffset({ x: 0, y: 0 });
            return next;
        });
    };

    const handleZoomIn = () => {
        setZoomLevel((prev) => clampZoom(prev + 0.2));
    };

    const handlePreviewPointerDown = (e) => {
        if (interactionMode !== 'pan' || zoomLevel <= 1 || submitting) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        startPanDrag(e.clientX, e.clientY);
    };

    const handlePreviewPointerMove = (e) => {
        if (interactionMode !== 'pan' || !panDragRef.current.active) return;
        e.preventDefault();
        updatePanDrag(e.clientX, e.clientY);
    };

    const handlePreviewPointerUp = () => {
        stopPanDrag();
    };

    const handlePreviewTouchStart = (e) => {
        if (e.touches.length === 2) {
            pinchRef.current = {
                active: true,
                startDistance: getTouchDistance(e.touches[0], e.touches[1]),
                startZoom: zoomLevel,
            };
            stopPanDrag();
            return;
        }

        if (interactionMode === 'pan' && e.touches.length === 1 && zoomLevel > 1) {
            startPanDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
    };

    const handlePreviewTouchMove = (e) => {
        if (pinchRef.current.active && e.touches.length === 2) {
            e.preventDefault();
            const distance = getTouchDistance(e.touches[0], e.touches[1]);
            const zoom = pinchRef.current.startZoom * (distance / Math.max(pinchRef.current.startDistance, 1));
            setZoomLevel(clampZoom(zoom));
            return;
        }

        if (interactionMode === 'pan' && panDragRef.current.active && e.touches.length === 1) {
            e.preventDefault();
            updatePanDrag(e.touches[0].clientX, e.touches[0].clientY);
        }
    };

    const handlePreviewTouchEnd = (e) => {
        if (e.touches.length < 2) {
            pinchRef.current.active = false;
        }
        if (e.touches.length === 0) {
            stopPanDrag();
        }
    };

    const handleComposerSend = async () => {
        if (discussionLocked) return;
        const trimmed = composerCaption.trim();
        if (composerImages.length === 0 || submitting) return;

        setSubmitting(true);
        try {
            const imagesToSend = await commitActiveMarkup(composerImages);
            if (composerMode === 'edit' && composerEditCommentId) {
                const fileAttachments = imagesToSend.filter((item) => item instanceof File);
                const existingUrls = imagesToSend.filter((item) => typeof item === 'string');
                const uploadedUrls = fileAttachments.length > 0 ? await uploadImages(fileAttachments) : [];
                const attachmentTokens = [...existingUrls, ...uploadedUrls].map((url) => `[img]${url}[/img]`);
                const finalContent = [trimmed, ...attachmentTokens].filter(Boolean).join('\n').trim();
                await updateComment(composerEditCommentId, finalContent);
            } else {
                await addComment(rfiId, trimmed, { attachments: imagesToSend });
            }
            closeComposer();
            await loadComments();
            scrollToBottom();
            if (onCommentAdded) onCommentAdded();
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(false);
        }
    };

    const parseCommentContent = (rawContent = '') => {
        const images = [];
        const text = rawContent.replace(/\[img\](.*?)\[\/img\]/gi, (_, url) => {
            if (url) images.push(url.trim());
            return '';
        }).trim();
        return { text, images };
    };

    const urlToFile = async (url, index = 0) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
        const blob = await response.blob();
        const ext = blob.type?.split('/')[1] || 'png';
        return new File([blob], `comment-image-${Date.now()}-${index}.${ext}`, { type: blob.type || 'image/png' });
    };

    const handleOpenEdit = async (comment, parsed) => {
        if (!parsed.images.length) {
            startEdit(comment);
            return;
        }

        setSubmitting(true);
        try {
            const imageFiles = await Promise.all(parsed.images.map((url, index) => urlToFile(url, index)));
            setComposerMode('edit');
            setComposerEditCommentId(comment.id);
            setComposerImages(imageFiles);
            setComposerCaption(parsed.text || '');
            setActiveComposerIndex(0);
            setZoomLevel(1);
            setPanOffset({ x: 0, y: 0 });
            setInteractionMode('draw');
            setComposerOpen(true);
        } catch (error) {
            console.error('Error preparing comment edit:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId) => {
        if (submitting || !commentId) return;
        setSubmitting(true);
        try {
            await deleteComment(commentId);
            await loadComments();
            toast.success('Message deleted');
            setDeleteConfirmCommentId(null);
        } catch (error) {
            console.error(error);
            toast.error(error?.message || 'Could not delete message.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader2 className="spinner" size={24} color="var(--clr-brand)" />
            </div>
        );
    }

    return (
        <div className="threaded-comments">
            <div className="comments-list">
                {comments.length === 0 ? (
                    <div className="empty-comments">
                        <div className="empty-comments-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                            </svg>
                        </div>
                        <p className="empty-comments-title">No comments yet</p>
                        <p className="empty-comments-sub">Be the first to start the discussion by<br />sending a message below.</p>
                    </div>
                ) : (
                    comments.map(c => {
                        const isMe = c.userId === user.id;
                        const parsed = parseCommentContent(c.content);
                        return (
                            <div key={c.id} className={`comment-bubble-wrapper ${isMe ? 'is-me' : ''}`}>
                                {!isMe && <UserAvatar name={c.userName} avatarUrl={c.userAvatarUrl} size={32} />}
                                <div className={`comment-bubble ${isMe ? 'is-me' : ''}`}>
                                    <div className="comment-header">
                                        <span className="comment-name">{c.userName}</span>
                                        {c.userRole && <span className="comment-role">({c.userRole})</span>}
                                        <span className="comment-time">
                                            {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    {editingCommentId === c.id ? (
                                        <div style={{ display: 'grid', gap: '0.45rem' }}>
                                            <input
                                                type="text"
                                                value={editingValue}
                                                onChange={(e) => setEditingValue(e.target.value)}
                                                className="comment-input"
                                                disabled={submitting}
                                            />
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-ghost"
                                                    onClick={cancelEdit}
                                                    disabled={submitting}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-action"
                                                    onClick={() => handleEditSubmit(c.id)}
                                                    disabled={submitting || !editingValue.trim()}
                                                >
                                                    Resend
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {parsed.text ? <div className="comment-content">{parsed.text}</div> : null}
                                            {parsed.images.length > 0 && (
                                                <div className="chat-image-grid">
                                                    {parsed.images.map((imgUrl, idx) => (
                                                        <a key={`${c.id}_img_${idx}`} href={imgUrl} target="_blank" rel="noopener noreferrer" className="chat-image-thumb">
                                                            <img src={imgUrl} alt={`Comment attachment ${idx + 1}`} />
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                            {isMe && (
                                                <div className="comment-action-icons">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-ghost comment-action-icon"
                                                        onClick={() => handleOpenEdit(c, parsed)}
                                                        title="Edit message"
                                                        disabled={submitting}
                                                    >
                                                        <Brush size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-ghost comment-action-icon danger"
                                                        onClick={() => setDeleteConfirmCommentId(c.id)}
                                                        title="Delete message"
                                                        disabled={submitting}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="comment-form">
                <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Type a message..."
                    className="comment-input"
                    disabled={submitting || discussionLocked}
                />
                <input
                    ref={attachInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={handleSelectAttachments}
                />
                <button
                    type="button"
                    className="btn btn-ghost comment-attach-btn"
                    onClick={openFilePicker}
                    disabled={submitting || discussionLocked}
                    title="Attach image"
                >
                    <Paperclip size={16} />
                </button>
                <button
                    type="submit"
                    className="btn btn-action comment-submit-btn"
                    disabled={!newComment.trim() || submitting || discussionLocked}
                    style={{ padding: '0.5rem', borderRadius: 'var(--radius-full)' }}
                >
                    {submitting ? <Loader2 className="spinner" size={18} /> : <Send size={18} />}
                </button>
            </form>

            {discussionLocked && (
                <div className="comment-chat-lock-notice">
                    You can view this discussion, but posting is disabled for your contractor access on this project.
                </div>
            )}

            {composerOpen && composerImages.length > 0 && (
                <div className="modal-overlay" onClick={closeComposer} style={{ zIndex: 1150 }}>
                    <div className="chat-attachment-composer" onClick={(e) => e.stopPropagation()}>
                        <div className="chat-attachment-header">
                            <h3>{composerMode === 'edit' ? 'Edit message' : 'Send attachment'}</h3>
                            <button className="btn-close" onClick={closeComposer} disabled={submitting}>
                                <X size={18} color="var(--clr-text-secondary)" />
                            </button>
                        </div>

                        <div className="chat-attachment-toolbar">
                            <div className="chat-attachment-brush">
                                <span>Size</span>
                                <input
                                    type="range"
                                    min="2"
                                    max="24"
                                    value={brushSize}
                                    onChange={(e) => setBrushSize(Number(e.target.value))}
                                    disabled={!canvasReady || submitting}
                                />
                            </div>
                            <div className="chat-attachment-colors">
                                {['#ef4444', '#22c55e', '#3b82f6', '#eab308', '#ffffff', '#000000'].map((color) => (
                                    <button
                                        key={color}
                                        type="button"
                                        className={`chat-attachment-color ${brushColor === color ? 'active' : ''}`}
                                        style={{ background: color }}
                                        onClick={() => setBrushColor(color)}
                                        disabled={!canvasReady || submitting}
                                        title="Brush color"
                                    />
                                ))}
                            </div>
                            <div className="chat-attachment-zoom-controls">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    onClick={handleZoomOut}
                                    disabled={zoomLevel <= 1 || submitting}
                                >
                                    -
                                </button>
                                <span>{Math.round(zoomLevel * 100)}%</span>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    onClick={handleZoomIn}
                                    disabled={zoomLevel >= 4 || submitting}
                                >
                                    +
                                </button>
                            </div>
                            <div className="chat-attachment-tools">
                                <button
                                    type="button"
                                    className={`btn btn-sm ${interactionMode === 'draw' ? 'btn-action' : 'btn-ghost'}`}
                                    onClick={() => {
                                        setInteractionMode('draw');
                                        stopPanDrag();
                                    }}
                                    disabled={submitting}
                                >
                                    <Brush size={14} /> Draw
                                </button>
                                <button
                                    type="button"
                                    className={`btn btn-sm ${interactionMode === 'pan' ? 'btn-action' : 'btn-ghost'}`}
                                    onClick={() => {
                                        setInteractionMode('pan');
                                        if (zoomLevel <= 1) {
                                            setZoomLevel(1.4);
                                        }
                                    }}
                                    disabled={submitting}
                                >
                                    <Move size={14} /> Pan
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-ghost"
                                    onClick={resetCurrentMarkup}
                                    disabled={!canvasReady || !canvasDirty || submitting}
                                >
                                    <RotateCcw size={14} /> Reset
                                </button>
                            </div>
                        </div>

                        <div
                            className={`chat-attachment-preview-wrap ${interactionMode === 'pan' ? 'pan-mode' : ''} ${isPanning ? 'is-panning' : ''}`}
                            onPointerDown={handlePreviewPointerDown}
                            onPointerMove={handlePreviewPointerMove}
                            onPointerUp={handlePreviewPointerUp}
                            onPointerCancel={handlePreviewPointerUp}
                            onTouchStart={handlePreviewTouchStart}
                            onTouchMove={handlePreviewTouchMove}
                            onTouchEnd={handlePreviewTouchEnd}
                            onTouchCancel={handlePreviewTouchEnd}
                        >
                            <canvas
                                ref={composerCanvasRef}
                                className="chat-attachment-canvas"
                                width={1100}
                                height={620}
                                style={{
                                    width: 'auto',
                                    height: '100%',
                                    transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                                    transformOrigin: 'center center',
                                }}
                                onPointerDown={startDrawing}
                                onPointerMove={drawOnCanvas}
                                onPointerUp={stopDrawing}
                                onPointerLeave={stopDrawing}
                                onPointerCancel={stopDrawing}
                            />
                        </div>

                        {composerImages.length > 1 && (
                            <div className="chat-attachment-thumbs">
                                {composerPreviewUrls.map((previewUrl, index) => (
                                    <button
                                        key={`${previewUrl}_${index}`}
                                        type="button"
                                        className={`chat-attachment-thumb ${index === activeComposerIndex ? 'active' : ''}`}
                                        onClick={() => handleSwitchComposerImage(index)}
                                        disabled={submitting}
                                    >
                                        <img src={previewUrl} alt={`Attachment ${index + 1}`} />
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="chat-attachment-footer">
                            <textarea
                                value={composerCaption}
                                onChange={(e) => setComposerCaption(e.target.value)}
                                placeholder="Add a caption (optional)"
                                className="chat-attachment-caption"
                                rows={2}
                                disabled={submitting}
                            />
                            <button
                                type="button"
                                className="btn btn-action chat-attachment-send"
                                onClick={handleComposerSend}
                                disabled={composerImages.length === 0 || submitting}
                            >
                                {submitting ? <Loader2 className="spinner" size={18} /> : <Send size={16} />}
                                <span>Send</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteConfirmCommentId && (
                <div className="modal-overlay" style={{ zIndex: 1160 }} onClick={() => !submitting && setDeleteConfirmCommentId(null)}>
                    <div className="delete-comment-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Delete message?</h3>
                        <p>This action cannot be undone.</p>
                        <div className="delete-comment-modal-actions">
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setDeleteConfirmCommentId(null)}
                                disabled={submitting}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => handleDeleteComment(deleteConfirmCommentId)}
                                disabled={submitting}
                            >
                                {submitting ? <Loader2 className="spinner" size={16} /> : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
