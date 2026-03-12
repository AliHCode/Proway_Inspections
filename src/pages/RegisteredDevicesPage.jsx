import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Smartphone, ShieldCheck, Clock3 } from 'lucide-react';
import Header from '../components/Header';
import { supabase } from '../utils/supabaseClient';
import { pushSupportStatus } from '../utils/pushNotifications';

function maskEndpoint(endpoint = '') {
    if (!endpoint) return '—';
    if (endpoint.length <= 48) return endpoint;
    return `${endpoint.slice(0, 28)}...${endpoint.slice(-16)}`;
}

function formatLastSeen(value) {
    if (!value) return 'Never';
    return new Date(value).toLocaleString();
}

export default function RegisteredDevicesPage() {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [actionMessage, setActionMessage] = useState('');
    const [sendingUserId, setSendingUserId] = useState(null);
    const [currentDeviceStatus, setCurrentDeviceStatus] = useState({
        support: 'checking',
        permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
        displayMode: 'browser',
        platform: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
    });

    useEffect(() => {
        const isStandalone = typeof window !== 'undefined' && (
            window.matchMedia?.('(display-mode: standalone)').matches ||
            window.navigator.standalone === true
        );

        setCurrentDeviceStatus({
            support: pushSupportStatus(),
            permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
            displayMode: isStandalone ? 'standalone' : 'browser',
            platform: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
        });
    }, []);

    const fetchDevices = useCallback(async () => {
        setLoading(true);
        setErrorMessage('');

        try {
            const { data, error } = await supabase
                .from('push_subscriptions')
                .select(`
                    id,
                    user_id,
                    endpoint,
                    device_label,
                    user_agent,
                    is_active,
                    last_seen_at,
                    created_at,
                    profiles:user_id (
                        name,
                        company,
                        role
                    )
                `)
                .order('last_seen_at', { ascending: false });

            if (error) throw error;
            setDevices(data || []);
        } catch (error) {
            console.error('Error fetching registered devices:', error);
            setErrorMessage('Could not load registered devices. If this is a permissions error, run the updated push subscription SQL first.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDevices();
    }, [fetchDevices]);

    const filteredDevices = useMemo(() => {
        const needle = searchTerm.trim().toLowerCase();
        if (!needle) return devices;

        return devices.filter((device) => {
            const profile = device.profiles || {};
            return [
                profile.name,
                profile.company,
                profile.role,
                device.device_label,
                device.user_agent,
                device.endpoint,
            ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(needle));
        });
    }, [devices, searchTerm]);

    const stats = useMemo(() => {
        const uniqueUsers = new Set(filteredDevices.map((device) => device.user_id));
        const recentCutoff = Date.now() - (1000 * 60 * 60 * 24 * 7);

        return {
            totalDevices: filteredDevices.length,
            uniqueUsers: uniqueUsers.size,
            mobileDevices: filteredDevices.filter((device) => /iphone|ipad|android/i.test(device.user_agent || device.device_label || '')).length,
            activeThisWeek: filteredDevices.filter((device) => {
                if (!device.last_seen_at) return false;
                return new Date(device.last_seen_at).getTime() >= recentCutoff;
            }).length,
        };
    }, [filteredDevices]);

    function showActionMessage(message, isError = false) {
        setActionMessage(isError ? `Error: ${message}` : message);
        window.setTimeout(() => setActionMessage(''), 3500);
    }

    async function handleSendTestPush(targetUserId, targetName) {
        if (!targetUserId) return;
        setSendingUserId(targetUserId);

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData?.session?.access_token;

            const { data, error } = await supabase.functions.invoke('send-push', {
                body: {
                    userId: targetUserId,
                    title: 'ProWay Test Push 🔔',
                    message: 'This is a test notification from the Registered Devices admin panel.',
                    rfiId: null,
                    url: '/notification-open?source=test'
                },
                headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
            });

            if (error) throw error;

            const sentCount = Number(data?.sent || 0);
            if (sentCount > 0) {
                showActionMessage(`Test push sent to ${targetName || 'user'} (${sentCount} endpoint${sentCount > 1 ? 's' : ''}).`);
            } else {
                showActionMessage(`No active endpoints for ${targetName || 'this user'}.`, true);
            }
        } catch (error) {
            console.error('Error sending test push:', error);
            showActionMessage(error?.message || 'Unable to send test push.', true);
        } finally {
            setSendingUserId(null);
        }
    }

    return (
        <div className="page-wrapper">
            <Header />
            <main className="admin-page devices-page">
                <div className="sheet-header">
                    <div>
                        <h1><Smartphone size={24} /> Registered Devices</h1>
                        <p className="subtitle" style={{ marginTop: '0.25rem' }}>
                            Admin debug view for phones and browsers that successfully subscribed to push notifications.
                        </p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={fetchDevices} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'spinner' : ''} /> Refresh
                    </button>
                </div>

                {errorMessage && (
                    <div className="submit-message warning">{errorMessage}</div>
                )}
                {actionMessage && (
                    <div className={`submit-message ${actionMessage.startsWith('Error:') ? 'warning' : 'success'}`}>
                        {actionMessage}
                    </div>
                )}

                <div className="device-debug-banner">
                    <div>
                        <strong>Current device status:</strong>{' '}
                        Push support: <span className="device-role-pill">{currentDeviceStatus.support}</span>{' '}
                        Permission: <span className="device-role-pill">{currentDeviceStatus.permission}</span>{' '}
                        Mode: <span className="device-role-pill">{currentDeviceStatus.displayMode}</span>
                    </div>
                    {/iPhone|iPad/i.test(currentDeviceStatus.platform) && currentDeviceStatus.displayMode !== 'standalone' && (
                        <div className="device-debug-hint">
                            iPhone/iPad only receive closed-app web push from the installed Home Screen app, not from a normal Safari tab.
                        </div>
                    )}
                </div>

                <div className="device-stat-grid">
                    <div className="device-stat-card">
                        <div className="device-stat-icon"><Smartphone size={18} /></div>
                        <div className="device-stat-value">{stats.totalDevices}</div>
                        <div className="device-stat-label">Registered endpoints</div>
                    </div>
                    <div className="device-stat-card">
                        <div className="device-stat-icon"><ShieldCheck size={18} /></div>
                        <div className="device-stat-value">{stats.uniqueUsers}</div>
                        <div className="device-stat-label">Subscribed users</div>
                    </div>
                    <div className="device-stat-card">
                        <div className="device-stat-icon"><Smartphone size={18} /></div>
                        <div className="device-stat-value">{stats.mobileDevices}</div>
                        <div className="device-stat-label">Mobile devices</div>
                    </div>
                    <div className="device-stat-card">
                        <div className="device-stat-icon"><Clock3 size={18} /></div>
                        <div className="device-stat-value">{stats.activeThisWeek}</div>
                        <div className="device-stat-label">Seen in last 7 days</div>
                    </div>
                </div>

                <div className="users-filters-bar device-filter-bar">
                    <div className="admin-search" style={{ minWidth: 0, flex: 1 }}>
                        <Search size={15} />
                        <input
                            type="text"
                            placeholder="Search by user, company, device, user agent, or endpoint..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="device-table-card">
                    {loading ? (
                        <div className="device-empty-state">Loading registered devices...</div>
                    ) : filteredDevices.length === 0 ? (
                        <div className="device-empty-state">No registered devices found.</div>
                    ) : (
                        <div className="rfi-table-wrapper">
                            <table className="rfi-table device-table">
                                <thead>
                                    <tr>
                                        <th>User</th>
                                        <th>Role</th>
                                        <th>Company</th>
                                        <th>Device</th>
                                        <th>Last Seen</th>
                                        <th>Endpoint</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDevices.map((device) => {
                                        const profile = device.profiles || {};
                                        return (
                                            <tr key={device.id}>
                                                <td>
                                                    <div className="device-user-cell">
                                                        <strong>{profile.name || 'Unknown User'}</strong>
                                                        <span>{device.is_active ? 'Active subscription' : 'Inactive subscription'}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="device-role-pill">{profile.role || '—'}</span>
                                                </td>
                                                <td>{profile.company || '—'}</td>
                                                <td>
                                                    <div className="device-user-cell">
                                                        <strong>{device.device_label || 'Browser Device'}</strong>
                                                        <span>{device.user_agent || '—'}</span>
                                                    </div>
                                                </td>
                                                <td>{formatLastSeen(device.last_seen_at)}</td>
                                                <td>
                                                    <code className="device-endpoint">{maskEndpoint(device.endpoint)}</code>
                                                </td>
                                                <td>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => handleSendTestPush(device.user_id, profile.name)}
                                                        disabled={sendingUserId === device.user_id}
                                                    >
                                                        {sendingUserId === device.user_id ? 'Sending...' : 'Send Test Push'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
