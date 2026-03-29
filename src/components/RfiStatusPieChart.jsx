import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend
} from 'recharts';

export default function RfiStatusPieChart({ data }) {
    const pieRenderKey = (data || []).map((d) => `${d.name}:${d.value}`).join('|');

    if (!data || data.length === 0 || data.every(d => d.value === 0)) {
        return (
            <div className="premium-card empty-chart">
                <p>No status data available.</p>
            </div>
        );
    }

    return (
        <div className="premium-card chart-container" style={{ width: '100%', height: '100%', minHeight: 320 }}>
            <h3 className="chart-title" style={{ fontSize: '1rem', color: 'var(--clr-text-secondary)', fontWeight: 600, marginBottom: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inspection Status</h3>
            <ResponsiveContainer width="100%" height={220}>
                <PieChart key={pieRenderKey}>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                        isAnimationActive={true}
                        animationDuration={1200}
                        cornerRadius={4}
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            borderRadius: '16px',
                            border: '1px solid rgba(226, 232, 240, 0.8)',
                            background: 'rgba(255, 255, 255, 0.95)',
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                            fontSize: '13px'
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>
            <div style={{ 
                marginTop: '1.5rem', 
                display: 'grid', 
                gridTemplateColumns: 'repeat(2, 1fr)', 
                gap: '12px',
                padding: '0 10px'
            }}>
                {data.map((item, i) => (
                    <div key={i} style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: '#f8fafc',
                        borderRadius: '10px',
                        border: '1px solid #f1f5f9'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color }}></div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-text-secondary)' }}>{item.name}</span>
                        </div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--clr-brand-primary)' }}>{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
