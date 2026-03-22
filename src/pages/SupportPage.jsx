import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProject } from '../context/ProjectContext';
import { supabase } from '../utils/supabaseClient';
import Header from '../components/Header';
import { toast } from 'react-hot-toast';
import {
    Send, LifeBuoy, Clock, CheckCircle, AlertCircle,
    ChevronDown, MessageSquare, Sparkles, Tag,
    CircleDot, ArrowRight, Loader2, Paperclip, X, Download
} from 'lucide-react';

const STATUS_CONFIG = {
    open: { label: 'Open', color: '#3b82f6', bg: '#eff6ff', icon: <CircleDot size={13} /> },
    in_progress: { label: 'In Progress', color: '#d97706', bg: '#fffbeb', icon: <Clock size={13} /> },
    resolved: { label: 'Resolved', color: '#059669', bg: '#ecfdf5', icon: <CheckCircle size={13} /> },
    closed: { label: 'Closed', color: '#64748b', bg: '#f1f5f9', icon: <AlertCircle size={13} /> },
};

export default function SupportPage() {
    const { user } = useAuth();
    const { activeProject } = useProject();

    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [expandedTicket, setExpandedTicket] = useState(null);

    // Form state
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [attachment, setAttachment] = useState(null);
    const [showForm, setShowForm] = useState(false);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // 5MB limit
        if (file.size > 5 * 1024 * 1024) {
            toast.error('File size must be under 5MB');
            e.target.value = '';
            return;
        }
        setAttachment(file);
    };

    const fetchTickets = useCallback(async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('support_tickets')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setTickets(data || []);
        } catch (err) {
            console.error('Error fetching tickets:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchTickets();
    }, [fetchTickets]);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!subject.trim() || !message.trim()) {
            toast.error('Please fill in both subject and message.');
            return;
        }

        setSubmitting(true);
        try {
            let attachmentUrl = null;

            if (attachment) {
                const fileExt = attachment.name.split('.').pop();
                const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('support_attachments')
                    .upload(fileName, attachment);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('support_attachments')
                    .getPublicUrl(fileName);

                attachmentUrl = publicUrl;
            }

            const { error } = await supabase.from('support_tickets').insert([{
                user_id: user.id,
                user_name: user.name || '',
                user_email: user.email || '',
                user_role: user.role || '',
                project_id: activeProject?.id || null,
                project_name: activeProject?.name || '',
                subject: subject.trim(),
                message: message.trim(),
                attachment_url: attachmentUrl
            }]);

            if (error) throw error;

            toast.success('Support ticket submitted successfully!');
            setSubject('');
            setMessage('');
            setAttachment(null);
            setShowForm(false);
            await fetchTickets();
        } catch (err) {
            console.error('Error creating ticket:', err);
            toast.error('Failed to submit ticket: ' + err.message);
        } finally {
            setSubmitting(false);
        }
    }

    const openCount = tickets.filter(t => t.status === 'open' || t.status === 'in_progress').length;

    if (!user) return null;

    return (
        <div className="page-wrapper premium-dashboard">
            <Header />
            <main className="dashboard-page" style={{ maxWidth: '860px', margin: '0 auto' }}>
                {/* Page Header */}
                <header className="premium-header" style={{ marginBottom: '1.5rem' }}>
                    <div className="welcome-monochrome-container">
                        <span className="welcome-label-mono">Help Center</span>
                        <h1 className="welcome-user-mono" style={{ fontSize: '1.6rem' }}>Support</h1>
                    </div>
                    <button
                        className="btn-command"
                        onClick={() => setShowForm(!showForm)}
                    >
                        {showForm ? <AlertCircle size={18} /> : <Send size={18} />}
                        {showForm ? 'Cancel' : 'New Ticket'}
                    </button>
                </header>

                {/* New Ticket Form */}
                {showForm && (
                    <div className="premium-card" style={{
                        marginBottom: '1.25rem',
                        padding: '1.75rem',
                        border: '1px solid #e2e8f0',
                        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                    }}>
                        <h3 style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            marginBottom: '1.25rem',
                            letterSpacing: '-0.01em',
                        }}>
                            <Sparkles size={18} color="#3b82f6" /> Submit a Support Request
                        </h3>

                        <form onSubmit={handleSubmit}>
                            {/* Auto-attached Info */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                gap: '0.5rem',
                                marginBottom: '1.25rem',
                            }}>
                                <div style={{
                                    background: '#f1f5f9',
                                    borderRadius: '8px',
                                    padding: '0.6rem 0.75rem',
                                    fontSize: '0.75rem',
                                }}>
                                    <span style={{ color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem' }}>User</span>
                                    <div style={{ fontWeight: 600, color: '#334155', marginTop: '2px' }}>{user.name}</div>
                                </div>
                                <div style={{
                                    background: '#f1f5f9',
                                    borderRadius: '8px',
                                    padding: '0.6rem 0.75rem',
                                    fontSize: '0.75rem',
                                }}>
                                    <span style={{ color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem' }}>Role</span>
                                    <div style={{ fontWeight: 600, color: '#334155', marginTop: '2px', textTransform: 'capitalize' }}>{user.role}</div>
                                </div>
                                <div style={{
                                    background: '#f1f5f9',
                                    borderRadius: '8px',
                                    padding: '0.6rem 0.75rem',
                                    fontSize: '0.75rem',
                                }}>
                                    <span style={{ color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem' }}>Project</span>
                                    <div style={{ fontWeight: 600, color: '#334155', marginTop: '2px' }}>{activeProject?.name || 'None'}</div>
                                </div>
                            </div>

                            {/* Subject */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>
                                    Subject *
                                </label>
                                <input
                                    type="text"
                                    value={subject}
                                    onChange={e => setSubject(e.target.value)}
                                    placeholder="Brief summary of your issue..."
                                    required
                                    style={{
                                        width: '100%',
                                        padding: '0.7rem 0.85rem',
                                        borderRadius: '10px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '0.85rem',
                                        fontFamily: 'inherit',
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                        background: '#fff',
                                        boxSizing: 'border-box',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>

                            {/* Message */}
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>
                                    Message *
                                </label>
                                <textarea
                                    value={message}
                                    onChange={e => setMessage(e.target.value)}
                                    placeholder="Describe your issue in detail. Include any relevant steps, error messages, or screenshots..."
                                    required
                                    rows={5}
                                    style={{
                                        width: '100%',
                                        padding: '0.7rem 0.85rem',
                                        borderRadius: '10px',
                                        border: '1px solid #e2e8f0',
                                        fontSize: '0.85rem',
                                        fontFamily: 'inherit',
                                        resize: 'vertical',
                                        outline: 'none',
                                        transition: 'border-color 0.2s',
                                        background: '#fff',
                                        boxSizing: 'border-box',
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                    onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                                />
                            </div>

                            {/* Attachment */}
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.35rem' }}>
                                    Attachment <span style={{ fontWeight: 500, color: '#94a3b8' }}>(Optional, max 5MB)</span>
                                </label>
                                
                                {!attachment ? (
                                    <label style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                        width: '100%', padding: '0.8rem', borderRadius: '10px',
                                        border: '1px dashed #cbd5e1', background: '#f8fafc',
                                        color: '#64748b', fontSize: '0.85rem', fontWeight: 600,
                                        cursor: 'pointer', transition: 'all 0.2s'
                                    }}>
                                        <Paperclip size={16} /> Attach File (PDF, Word, Image)
                                        <input
                                            type="file"
                                            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                                            onChange={handleFileChange}
                                            style={{ display: 'none' }}
                                        />
                                    </label>
                                ) : (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '0.6rem 0.85rem', borderRadius: '8px',
                                        border: '1px solid #bfdbfe', background: '#eff6ff',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#1e40af', fontSize: '0.8rem', fontWeight: 600 }}>
                                            <Paperclip size={14} />
                                            <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {attachment.name}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: '#60a5fa' }}>
                                                ({(attachment.size / 1024 / 1024).toFixed(1)} MB)
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setAttachment(null)}
                                            style={{
                                                background: 'none', border: 'none', color: '#ef4444',
                                                cursor: 'pointer', padding: '4px', display: 'flex'
                                            }}
                                            title="Remove attachment"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={submitting}
                                style={{
                                    width: '100%',
                                    padding: '0.85rem',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: '#0f172a',
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    cursor: submitting ? 'not-allowed' : 'pointer',
                                    fontFamily: 'inherit',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    opacity: submitting ? 0.7 : 1,
                                    transition: 'opacity 0.2s',
                                }}
                            >
                                {submitting ? <Loader2 size={16} className="spinner" /> : <Send size={16} />}
                                {submitting ? 'Submitting...' : 'Submit Ticket'}
                            </button>
                        </form>
                    </div>
                )}

                {/* Tickets List */}
                <div className="premium-card" style={{ padding: '1.5rem' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '1.25rem',
                    }}>
                        <h3 style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            fontSize: '0.95rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            letterSpacing: '-0.01em',
                            margin: 0,
                        }}>
                            <MessageSquare size={18} color="#64748b" /> Your Tickets
                        </h3>
                        {openCount > 0 && (
                            <span style={{
                                background: '#eff6ff',
                                color: '#3b82f6',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '0.2rem 0.6rem',
                                borderRadius: '6px',
                            }}>
                                {openCount} Active
                            </span>
                        )}
                    </div>

                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                            <Loader2 size={24} className="spinner" style={{ margin: '0 auto 0.5rem' }} />
                            <p style={{ fontSize: '0.85rem' }}>Loading tickets...</p>
                        </div>
                    ) : tickets.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                            <LifeBuoy size={40} style={{ color: '#cbd5e1', margin: '0 auto 1rem' }} />
                            <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>No tickets yet</h4>
                            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1.25rem' }}>
                                Click "New Ticket" to submit your first support request.
                            </p>
                            <button
                                onClick={() => setShowForm(true)}
                                style={{
                                    padding: '0.65rem 1.25rem',
                                    borderRadius: '10px',
                                    border: '1px solid #e2e8f0',
                                    background: '#fff',
                                    color: '#334155',
                                    fontWeight: 600,
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    fontFamily: 'inherit',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.4rem',
                                }}
                            >
                                <Send size={14} /> Create Ticket
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {tickets.map(ticket => {
                                const statusCfg = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.open;
                                const isExpanded = expandedTicket === ticket.id;
                                const createdAt = new Date(ticket.created_at).toLocaleDateString('en-US', {
                                    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                                });

                                return (
                                    <div
                                        key={ticket.id}
                                        style={{
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '10px',
                                            overflow: 'hidden',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {/* Ticket Header Row */}
                                        <div
                                            onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.75rem',
                                                padding: '0.85rem 1rem',
                                                cursor: 'pointer',
                                                background: isExpanded ? '#f8fafc' : '#fff',
                                                transition: 'background 0.15s',
                                            }}
                                        >
                                            {/* Status Badge */}
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                background: statusCfg.bg,
                                                color: statusCfg.color,
                                                fontSize: '0.65rem',
                                                fontWeight: 700,
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '5px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em',
                                                whiteSpace: 'nowrap',
                                                flexShrink: 0,
                                            }}>
                                                {statusCfg.icon} {statusCfg.label}
                                            </span>

                                            {/* Subject */}
                                            <span style={{
                                                flex: 1,
                                                fontSize: '0.85rem',
                                                fontWeight: 600,
                                                color: '#0f172a',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {ticket.subject}
                                            </span>

                                            {/* Date */}
                                            <span style={{
                                                fontSize: '0.75rem',
                                                color: '#94a3b8',
                                                whiteSpace: 'nowrap',
                                                flexShrink: 0,
                                                display: 'none',
                                            }} className="ticket-date-desktop">
                                                {createdAt}
                                            </span>

                                            <ChevronDown
                                                size={16}
                                                style={{
                                                    color: '#94a3b8',
                                                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                                    transition: 'transform 0.2s',
                                                    flexShrink: 0,
                                                }}
                                            />
                                        </div>

                                        {/* Expanded Content */}
                                        {isExpanded && (
                                            <div style={{
                                                padding: '1rem',
                                                borderTop: '1px solid #e2e8f0',
                                                background: '#fafbfc',
                                            }}>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                                                    Submitted {createdAt} • Project: {ticket.project_name || 'N/A'}
                                                </div>
                                                <div style={{
                                                    background: '#fff',
                                                    border: '1px solid #e2e8f0',
                                                    borderRadius: '8px',
                                                    padding: '0.85rem',
                                                    fontSize: '0.85rem',
                                                    color: '#334155',
                                                    lineHeight: 1.6,
                                                    whiteSpace: 'pre-wrap',
                                                    marginBottom: (ticket.attachment_url || ticket.admin_reply) ? '0.75rem' : 0,
                                                }}>
                                                    {ticket.message}
                                                </div>

                                                {/* Attachment Link */}
                                                {ticket.attachment_url && (
                                                    <a
                                                        href={ticket.attachment_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                                            background: '#f1f5f9', border: '1px solid #e2e8f0',
                                                            borderRadius: '6px', padding: '0.4rem 0.75rem',
                                                            fontSize: '0.75rem', fontWeight: 600, color: '#334155',
                                                            textDecoration: 'none', marginBottom: ticket.admin_reply ? '0.75rem' : 0,
                                                        }}
                                                    >
                                                        <Paperclip size={14} color="#64748b" /> View Attachment
                                                    </a>
                                                )}

                                                {/* Admin Reply */}
                                                {ticket.admin_reply && (
                                                    <div style={{
                                                        background: '#eff6ff',
                                                        border: '1px solid #bfdbfe',
                                                        borderRadius: '8px',
                                                        padding: '0.85rem',
                                                    }}>
                                                        <div style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '0.4rem',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 700,
                                                            color: '#3b82f6',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.05em',
                                                            marginBottom: '0.4rem',
                                                        }}>
                                                            <ArrowRight size={12} /> Admin Response
                                                        </div>
                                                        <div style={{
                                                            fontSize: '0.85rem',
                                                            color: '#1e40af',
                                                            lineHeight: 1.6,
                                                            whiteSpace: 'pre-wrap',
                                                        }}>
                                                            {ticket.admin_reply}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <p style={{
                    textAlign: 'center',
                    marginTop: '2rem',
                    color: '#94a3b8',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                }}>
                    ProWay Inspection Management &copy; {new Date().getFullYear()}
                </p>
            </main>
        </div>
    );
}

