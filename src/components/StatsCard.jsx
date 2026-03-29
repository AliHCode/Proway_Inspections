export default function StatsCard({ icon, label, value, subtitle, trend, trendValue, color }) {
    return (
        <div className="premium-card data-metric">
            <div className="data-metric-header">
                {icon && <span className="data-metric-icon" style={{ color }}>{icon}</span>}
                <span className="data-metric-label">{label}</span>
            </div>
            <div className="data-metric-value">{value}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                {subtitle && <div className="data-metric-subtitle">{subtitle}</div>}
                {trend && (
                    <div className={`metric-trend ${trend}`} style={{ fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                        <span>{trend === 'up' ? '▲' : '▼'}</span>
                        <span>{trendValue}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
