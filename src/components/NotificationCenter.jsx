import { useState, useEffect, useRef } from 'react';
import { useRFI } from '../context/RFIContext';
import { Bell, Check, X, BellDot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { buildNotificationOpenPath } from '../utils/notificationLinks';

export default function NotificationCenter() {
    const { rfis, notifications, markNotificationRead, markAllNotificationsRead, unreadCount } = useRFI();
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
                className={`notification-trigger ${unreadCount > 0 ? 'has-unread' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title="Notifications"
            >
                {unreadCount > 0 ? (
                    <>
                        <BellDot size={18} className="bell-icon active" />
                        <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    </>
                ) : (
                    <Bell size={18} className="bell-icon" />
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
                        ) : (() => {
                            // Deduplication Logic: Only show the latest notification per RFI and category
                            const seenRfis = new Map();
                            const deduplicatedNotifs = notifications.filter(notif => {
                                // 1. Identify "Category" (Status update vs Message/Mention)
                                const isMessage = notif.title.toLowerCase().includes('message') || notif.title.toLowerCase().includes('mention');
                                const category = isMessage ? 'message' : 'status';
                                
                                // 2. Create a unique key for lookup
                                const key = `${notif.rfi_id}-${category}`;
                                
                                // 3. Since notifications are usually fetched newest-first, we take the first one we see
                                if (seenRfis.has(key)) return false;
                                seenRfis.set(key, true);
                                return true;
                            });

                            return deduplicatedNotifs.map(notif => {
                                // Find the actual RFI to get the correct RFI # (not serial #)
                                const targetRfi = rfis.find(r => r.id === notif.rfi_id);
                                const correctRfiNo = targetRfi?.customFields?.rfi_no || targetRfi?.serialNo || '';
                                const displayRfiNo = correctRfiNo ? (correctRfiNo.toString().startsWith('#') ? correctRfiNo : `#${correctRfiNo}`) : '';

                                // Formatting Logic to "rewrite" text for a cleaner look
                                let displayTitle = notif.title;
                                let displayMessage = notif.message;

                                // 1. Remove emojis from title
                                displayTitle = displayTitle.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();

                                // 2. Handle old pattern: "Your RFI #number was [approved/rejected]. Remarks: content"
                                const oldPatternRegex = /Your RFI\s+(#\S+)\s+(?:for\s+.*?\s+)?was\s+(approved|rejected|resubmitted)\.?\s*(?:Remarks:\s*)?(.*)/i;
                                const match = displayMessage.match(oldPatternRegex);

                                if (match) {
                                    const status = match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase();
                                    const remarks = match[3]?.trim() || 'No remarks provided.';

                                    displayTitle = `RFI ${status}: ${displayRfiNo}`;
                                    displayMessage = remarks.toLowerCase().startsWith('remarks:') ? remarks : `Remarks: ${remarks}`;
                                } else {
                                    // Extract status if possible for the title rewrite
                                    const statusMatch = displayTitle.match(/(APPROVED|REJECTED|FILED|ASSIGNED|MESSAGE|MENTION|RESUBMITTED)/i);
                                    if (statusMatch) {
                                        const status = statusMatch[0].charAt(0).toUpperCase() + statusMatch[0].slice(1).toLowerCase();
                                        displayTitle = `RFI ${status}: ${displayRfiNo}`;
                                    }

                                    // Handle newer pattern or other cases to ensure "Remarks:" prefix
                                    if (displayMessage && !displayMessage.toLowerCase().startsWith('remarks:') && 
                                        !displayMessage.toLowerCase().startsWith('location:') && 
                                        !displayMessage.toLowerCase().startsWith('message:')) {
                                        displayMessage = `Remarks: ${displayMessage}`;
                                    }
                                }

                                const isApproval = displayTitle.toLowerCase().includes('approved');
                                const isRejection = displayTitle.toLowerCase().includes('rejected');
                                const isMention = displayTitle.toLowerCase().includes('mention') || displayTitle.toLowerCase().includes('message');

                                return (
                                    <div
                                        key={notif.id}
                                        className={`notification-item-premium ${!notif.is_read ? 'unread' : ''}`}
                                        onClick={() => handleNotificationClick(notif)}
                                    >
                                        <div className="notification-icon-wrapper">
                                            {isApproval ? (
                                                <div className="notif-icon-circle success"><Check size={14} /></div>
                                            ) : isRejection ? (
                                                <div className="notif-icon-circle danger"><X size={14} /></div>
                                            ) : (
                                                <div className="notif-icon-circle info"><Bell size={14} /></div>
                                            )}
                                        </div>
                                        <div className="notification-content">
                                            <div className="notif-header-row">
                                                <span className="notification-title">{displayTitle}</span>
                                                <span className="notification-time">
                                                    {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div className="notification-message">{displayMessage}</div>
                                        </div>
                                        {!notif.is_read && <div className="unread-indicator"></div>}
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
