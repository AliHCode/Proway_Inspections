import { User } from 'lucide-react';

export default function UserAvatar({ name, avatarUrl, size = 40, className = '' }) {
    // Generate initials from name
    const getInitials = (nameStr) => {
        if (!nameStr) return '?';
        const parts = nameStr.split(' ');
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return nameStr.substring(0, 2).toUpperCase();
    };

    // Calculate a deterministic background color based on name
    const getBgColor = (nameStr) => {
        if (!nameStr) return 'var(--clr-border-dark)';

        let hash = 0;
        for (let i = 0; i < nameStr.length; i++) {
            hash = nameStr.charCodeAt(i) + ((hash << 5) - hash);
        }

        const hue = Math.abs(hash % 360);
        return `hsl(${hue}, 65%, 45%)`;
    };

    const style = {
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: avatarUrl ? 'transparent' : getBgColor(name),
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: '600',
        flexShrink: 0,
        overflow: 'hidden'
    };

    return (
        <div className={`user-avatar ${className}`} style={style} title={name}>
            {avatarUrl ? (
                <img 
                    src={avatarUrl} 
                    alt={name} 
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                />
            ) : (
                name ? getInitials(name) : <User size={size * 0.5} />
            )}
        </div>
    );
}
