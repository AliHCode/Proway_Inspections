import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Loader2 } from 'lucide-react';

const ACTION_ICONS = {
    created: '📋',
    approved: '✅',
    rejected: '❌',
    info_requested: '⚠️',
    resubmitted: '🔄',
    assigned: '📌',
    commented: '💬',
    updated: '✏️',
};

export default function AuditLog({ rfiId }) {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchAuditLog = useCallback(async () => {
        if (!rfiId) return;
        try {
            const { data, error } = await supabase
                .from('audit_log')
                .select(`
                    id,
                    action,
                    details,
                    created_at,
                    user_id,
                    profiles (name, role)
                `)
                .eq('rfi_id', rfiId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setEntries(data || []);
        } catch (err) {
            console.error('Error fetching audit log:', err);
        } finally {
            setLoading(false);
        }
    }, [rfiId]);

    useEffect(() => {
        fetchAuditLog();
    }, [fetchAuditLog]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <Loader2 className="spinner" size={24} color="var(--clr-brand)" />
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="audit-log">
                <p style={{ textAlign: 'center', color: 'var(--clr-text-muted)', padding: '1rem' }}>
                    No audit history yet.
                </p>
            </div>
        );
    }

    return (
        <div className="audit-log">
            {entries.map(entry => (
                <div key={entry.id} className="audit-entry">
                    <div className="audit-icon">
                        {ACTION_ICONS[entry.action] || '📝'}
                    </div>
                    <div className="audit-body">
                        <div className="audit-action">
                            {entry.profiles?.name || 'System'} — {formatAction(entry.action)}
                        </div>
                        {entry.details?.remarks && (
                            <div className="audit-details">"{entry.details.remarks}"</div>
                        )}
                        {entry.details?.assignee && (
                            <div className="audit-details">Assigned to: {entry.details.assignee}</div>
                        )}
                        <div className="audit-time">
                            {new Date(entry.created_at).toLocaleString()}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function formatAction(action) {
    const labels = {
        created: 'Created this RFI',
        approved: 'Approved this RFI',
        rejected: 'Rejected this RFI',
        info_requested: 'Returned for rework',
        resubmitted: 'Resubmitted this RFI',
        assigned: 'Assigned this RFI',
        commented: 'Added a comment',
        updated: 'Updated this RFI',
    };
    return labels[action] || action;
}
