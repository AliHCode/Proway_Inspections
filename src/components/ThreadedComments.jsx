import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import UserAvatar from './UserAvatar';
import { Send, Loader2 } from 'lucide-react';

export default function ThreadedComments({ rfiId, onCommentAdded, scrollTrigger }) {
    const { user } = useAuth();
    const { fetchComments, addComment, updateComment } = useRFI();
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [editingValue, setEditingValue] = useState('');
    const prevCommentsLength = useRef(0);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        loadComments();
        // Set up polling (5s)
        const interval = setInterval(loadComments, 5000);
        return () => clearInterval(interval);
    }, [rfiId]);

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
        if (!newComment.trim() || submitting) return;

        setSubmitting(true);
        try {
            await addComment(rfiId, newComment.trim());
            setNewComment('');
            await loadComments();
            scrollToBottom(); // Manually scroll when the user themselves sends a message
            if (onCommentAdded) onCommentAdded();
        } catch (error) {
            console.error(error);
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
                        <p>No comments yet. Start the discussion!</p>
                    </div>
                ) : (
                    comments.map(c => {
                        const isMe = c.userId === user.id;
                        return (
                            <div key={c.id} className={`comment-bubble-wrapper ${isMe ? 'is-me' : ''}`}>
                                {!isMe && <UserAvatar name={c.userName} size={32} />}
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
                                            <div className="comment-content">{c.content}</div>
                                            {isMe && (
                                                <div style={{ marginTop: '0.35rem', display: 'flex', justifyContent: 'flex-end' }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={() => startEdit(c)}
                                                        style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                                                    >
                                                        Edit
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
                    disabled={submitting}
                />
                <button
                    type="submit"
                    className="btn btn-action comment-submit-btn"
                    disabled={!newComment.trim() || submitting}
                    style={{ padding: '0.5rem', borderRadius: 'var(--radius-full)' }}
                >
                    {submitting ? <Loader2 className="spinner" size={18} /> : <Send size={18} />}
                </button>
            </form>
        </div>
    );
}
