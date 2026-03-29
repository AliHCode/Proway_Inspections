import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Cell,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

export default function RfiTrendChart({ data }) {
    if (!data || data.length === 0) {
        return (
            <div className="premium-card empty-chart">
                <p>Not enough data to show trends.</p>
            </div>
        );
    }

    // Custom shape for Rounded Bars (Pill-style)
    const RoundedBar = (props) => {
        const { x, y, width, height, fill } = props;
        const radius = Math.min(width, 20) / 2;
        return (
            <g>
                <rect x={x} y={y} width={width} height={height} rx={radius} fill={fill} />
            </g>
        );
    };

    return (
        <div className="premium-card chart-container" style={{ 
            width: '100%', 
            height: '100%', 
            minHeight: 320,
            borderRadius: '24px',
            padding: '2rem',
            background: 'var(--clr-bg-card)',
            boxShadow: '0 4px 20px -5px rgba(0,0,0,0.05)'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--clr-text-main)', fontWeight: 700 }}>Weekly RFI Activity</h3>
                <div style={{ padding: '6px 12px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>
                    Last 7 Days
                </div>
            </div>
            
            <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                        dy={12}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#cbd5e1' }}
                    />
                    <Tooltip
                        cursor={{ fill: '#f1f5f9', opacity: 0.5 }}
                        contentStyle={{
                            borderRadius: '16px',
                            border: 'none',
                            background: '#0f172a',
                            color: '#fff',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
                            fontSize: '13px',
                            padding: '10px 14px'
                        }}
                        itemStyle={{ color: '#fff' }}
                        labelStyle={{ color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}
                    />
                    <Bar 
                        dataKey="value" 
                        shape={<RoundedBar />} 
                        barSize={32}
                    >
                        {data.map((entry, index) => (
                            <Cell 
                                key={`cell-${index}`} 
                                // Highlight the last bar (Today) or peak? User photo shows "Sep" (latest) highlighted.
                                fill={index === data.length - 1 ? 'var(--clr-slate-dark)' : 'var(--clr-sage)'} 
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
