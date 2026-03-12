import { useState, useEffect, useRef } from 'react';
import { useRFI } from '../context/RFIContext';
import { Bell, Check, X, BellDot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { buildNotificationOpenPath } from '../utils/notificationLinks';

export default function NotificationCenter() {
    const { notifications, markNotificationRead, markAllNotificationsRead, unreadCount } = useRFI();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleNotificationClick = (notification) => {
        markNotificationRead(notification.id);
        setIsOpen(false);
        navigate(buildNotificationOpenPath(notification.rfi_id));
    };

    return (
        <div className="notification-center" ref={dropdownRef}>
            <button
                className={`notification-bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Notifications"
            >
                {unreadCount > 0 ? (
                    <>
                        <BellDot size={20} className="bell-icon active" />
                        <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    </>
                ) : (
                    <Bell size={20} className="bell-icon" />
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                className="btn-mark-all"
                                onClick={markAllNotificationsRead}
                            >
                                <Check size={14} /> Mark all read
                            </button>
                        )}
                    </div>

                    <div className="notification-list">
                        {notifications.length === 0 ? (
                            <div className="notification-empty">
                                <Bell size={32} />
                                <p>You're all caught up!</p>
                            </div>
                        ) : (
                            notifications.map(notif => (
                                <div
                                    key={notif.id}
                                    className={`notification-item ${!notif.is_read ? 'unread' : ''}`}
                                    onClick={() => handleNotificationClick(notif)}
                                >
                                    <div className="notification-content">
                                        <div className="notification-title">{notif.title}</div>
                                        <div className="notification-message">{notif.message}</div>
                                        <div className="notification-time">
                                            {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                    {!notif.is_read && <div className="unread-dot"></div>}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
