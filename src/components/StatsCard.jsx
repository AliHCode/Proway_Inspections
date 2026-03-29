export default function StatsCard({ icon, label, value, subtitle, trend, trendValue, color }) {
    return (
        <div 
            className="premium-card data-metric" 
            style={{ 
                borderLeft: `5px solid ${color}`,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                cursor: 'default'
            }}
            onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
            }}
        >
            <div className="data-metric-header">
                {icon && <span className="data-metric-icon" style={{ 
                    backgroundColor: `${color}15`, // 15% opacity tint
                    color: color,
                    padding: '8px',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '8px'
                }}>{icon}</span>}
                <span className="data-metric-label" style={{ fontWeight: 600, color: 'var(--clr-text-secondary)', fontSize: '0.85rem' }}>{label}</span>
            </div>
            <div className="data-metric-value" style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-brand-primary)', margin: '4px 0' }}>{value}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                {subtitle && <div className="data-metric-subtitle" style={{ fontSize: '0.75rem', opacity: 0.7 }}>{subtitle}</div>}
                {trend && (
                    <div className={`metric-trend ${trend}`} style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: 800, 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '99px',
                        backgroundColor: trend === 'up' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: trend === 'up' ? '#059669' : '#dc2626'
                    }}>
                        <span>{trend === 'up' ? '▲' : '▼'}</span>
                        <span>{trendValue}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
