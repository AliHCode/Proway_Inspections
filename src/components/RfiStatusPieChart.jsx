import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
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

    const total = data.reduce((sum, entry) => sum + entry.value, 0);

    return (
        <div className="premium-card chart-container" style={{ 
            width: '100%', 
            height: '100%', 
            minHeight: 320,
            borderRadius: '24px',
            padding: '2rem',
            background: '#ffffff',
            boxShadow: '0 4px 20px -5px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <h3 style={{ fontSize: '1.1rem', color: 'var(--clr-text-main)', fontWeight: 700, marginBottom: '1.5rem' }}>Inspection Status</h3>
            
            <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: '1rem' }}>
                <div style={{ flex: 1, position: 'relative', height: '220px' }}>
                    <ResponsiveContainer width="100%" height="100%">
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
                            >
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    borderRadius: '16px',
                                    border: 'none',
                                    background: '#0f172a',
                                    color: '#fff',
                                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
                                    fontSize: '13px'
                                }}
                                itemStyle={{ color: '#fff' }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                    
                    {/* Centered Total Text */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        textAlign: 'center',
                        pointerEvents: 'none'
                    }}>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--clr-slate-dark)', lineHeight: 1 }}>{total}</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--clr-text-muted)', textTransform: 'uppercase', marginTop: '2px' }}>Total</div>
                    </div>
                </div>

                {/* Grid Legend (matching Photo 1) */}
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem 1rem' }}>
                    {data.filter(d => d.value > 0).map((item, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: item.color }}></div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>{item.name}</span>
                            </div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#334155', paddingLeft: '14px' }}>{item.value}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
