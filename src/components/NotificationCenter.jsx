import { useState, useEffect, useRef } from 'react';
import { useRFI } from '../context/RFIContext';
import { useAuth } from '../context/AuthContext';
import { Bell, Check, X, BellDot, CheckCircle2, XCircle, MessageCircle, UserPlus, FilePlus, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { buildNotificationOpenPath } from '../utils/notificationLinks';

export default function NotificationCenter({ isOpen, onToggle }) {
    const { rfis, notifications, markNotificationRead, markAllNotificationsRead, unreadCount } = useRFI();
    const { user } = useAuth();
    const isContractor = user?.role === 'contractor';
    const dropdownRef = useRef(null);
    const navigate = useNavigate();

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target) && isOpen) {
                onToggle(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen, onToggle]);

    const handleNotificationClick = (notification) => {
        markNotificationRead(notification.id);
        if (onToggle) onToggle(false);
        navigate(buildNotificationOpenPath(notification.rfi_id));
    };

    return (
        <div className="notification-center" ref={dropdownRef}>
            <button
                className={`notification-trigger ${unreadCount > 0 ? 'has-unread' : ''}`}
                onClick={() => onToggle(!isOpen)}
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
                                    displayMessage = remarks.replace(/^remarks:\s*/i, '');
                                    
                                    if (isContractor) {
                                        // Skip Remarks prefix for messages/mentions (Bell icon cases)
                                        const isMsg = displayTitle.toLowerCase().includes('message') || displayTitle.toLowerCase().includes('mention');
                                        if (!isMsg) {
                                            displayMessage = `Remarks: ${displayMessage}`;
                                        }
                                    }
                                } else {
                                    // Extract status if possible for the title rewrite
                                    const statusMatch = displayTitle.match(/(APPROVED|REJECTED|FILED|ASSIGNED|MESSAGE|MENTION|RESUBMITTED)/i);
                                    if (statusMatch) {
                                        const status = statusMatch[0].charAt(0).toUpperCase() + statusMatch[0].slice(1).toLowerCase();
                                        displayTitle = `RFI ${status}: ${displayRfiNo}`;
                                    }

                                    // Handle newer pattern or other cases to ensure "Remarks:" prefix
                                    if (isContractor && displayMessage && !displayMessage.toLowerCase().startsWith('remarks:') && 
                                        !displayMessage.toLowerCase().startsWith('location:') && 
                                        !displayMessage.toLowerCase().startsWith('message:')) {
                                        
                                        // Skip Remarks prefix for messages/mentions (Bell icon cases)
                                        const isMsg = displayTitle.toLowerCase().includes('message') || displayTitle.toLowerCase().includes('mention');
                                        if (!isMsg) {
                                            displayMessage = `Remarks: ${displayMessage}`;
                                        }
                                    }
                                }

                                const isApproval = displayTitle.toLowerCase().includes('approved');
                                const isRejection = displayTitle.toLowerCase().includes('rejected');
                                const isMention = displayTitle.toLowerCase().includes('mention') || displayTitle.toLowerCase().includes('message');
                                const isAssignment = displayTitle.toLowerCase().includes('assigned');
                                const isFiled = displayTitle.toLowerCase().includes('filed') || displayTitle.toLowerCase().includes('submitted');

                                const getIcon = () => {
                                    if (isContractor) {
                                        if (isApproval) return <Check size={16} />;
                                        if (isRejection) return <X size={16} />;
                                        if (isMention) return <Bell size={16} />;
                                        // Use same as consultant for filing/assignment but simpler if needed, 
                                        // following screenshot classic icons:
                                        if (isAssignment) return <UserPlus size={16} />;
                                        if (isFiled) return <FilePlus size={16} />;
                                    } else {
                                        if (isApproval) return <CheckCircle2 size={16} />;
                                        if (isRejection) return <XCircle size={16} />;
                                        if (isMention) return <MessageCircle size={16} />;
                                        if (isAssignment) return <UserPlus size={16} />;
                                        if (isFiled) return <FilePlus size={16} />;
                                    }
                                    return <Bell size={16} />;
                                };

                                const getIconClass = () => {
                                    if (isApproval) return 'success';
                                    if (isRejection) return 'danger';
                                    if (isMention) return 'mention';
                                    if (isAssignment) return 'assignment';
                                    if (isFiled) return 'filed';
                                    return 'info';
                                };

                                return (
                                    <div
                                        key={notif.id}
                                        className={`notification-item-premium ${isContractor ? 'contractor-view' : ''} ${!notif.is_read ? 'unread' : ''}`}
                                        onClick={() => handleNotificationClick(notif)}
                                    >
                                        <div className="notification-icon-wrapper">
                                            <div className={`notif-icon-circle ${getIconClass()}`}>
                                                {getIcon()}
                                            </div>
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
