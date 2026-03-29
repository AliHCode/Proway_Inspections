export default function StatsCard({ icon, label, value, subtitle, trend, trendValue, color }) {
    return (
        <div className="premium-card data-metric" style={{ 
            borderRadius: '24px', 
            borderLeft: `5px solid ${color}`,
            padding: '1.5rem',
            background: '#ffffff',
            boxShadow: '0 4px 20px -5px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            minHeight: '140px'
        }}>
            <div className="data-metric-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {icon && <span className="data-metric-icon" style={{ 
                    color, 
                    background: `${color}15`, 
                    padding: '8px', 
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>{icon}</span>}
                <span className="data-metric-label" style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: 600, 
                    color: 'var(--clr-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em'
                }}>{label}</span>
            </div>
            <div className="data-metric-value" style={{ 
                fontSize: '2rem', 
                fontWeight: 800, 
                color: 'var(--clr-slate-dark)',
                lineHeight: 1
            }}>{value}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                {subtitle && <div className="data-metric-subtitle" style={{ fontSize: '0.82rem', color: 'var(--clr-text-muted)' }}>{subtitle}</div>}
                {trend && (
                    <div className={`metric-trend ${trend}`} style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: 700, 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        padding: '4px 8px',
                        borderRadius: '99px',
                        background: trend === 'up' ? 'var(--clr-success-bg)' : 'var(--clr-danger-bg)',
                        color: trend === 'up' ? 'var(--clr-success)' : 'var(--clr-danger)'
                    }}>
                        <span>{trend === 'up' ? '▲' : '▼'}</span>
                        <span>{trendValue}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
