import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRFI } from '../context/RFIContext';
import UserAvatar from './UserAvatar';
import { Send, Loader2 } from 'lucide-react';

export default function ThreadedComments({ rfiId, onCommentAdded, scrollTrigger }) {
    const { user } = useAuth();
    const { fetchComments, addComment } = useRFI();
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [newComment, setNewComment] = useState('');
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
            // Gentle delay for layout stability
            const timer = setTimeout(() => {
                scrollToBottom();
            }, 100);
            return () => clearTimeout(timer);
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
                                    <div className="comment-content">{c.content}</div>
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
