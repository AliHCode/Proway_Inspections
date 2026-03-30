import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
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

    return (
        <div className="premium-card chart-container" style={{ width: '100%', height: '100%', minHeight: 400 }}>
            <h3 className="chart-title" style={{ fontSize: '0.85rem', color: '#94a3b8', fontWeight: 700, marginBottom: '2.5rem', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Weekly RFI Activity</h3>
            <ResponsiveContainer width="100%" height={260}>
                <BarChart
                    data={data}
                    margin={{
                        top: 0,
                        right: 20,
                        left: -25,
                        bottom: 0,
                    }}
                >
                    <defs>
                        <linearGradient id="navyBarGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#1e293b" stopOpacity={1} />
                            <stop offset="100%" stopColor="#334155" stopOpacity={0.9} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="#f1f5f9" />
                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                        dy={15}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    />
                    <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)',
                            fontSize: '12px',
                            padding: '10px 14px'
                        }}
                    />
                    <Bar
                        dataKey="value"
                        name="RFIs Filed"
                        fill="url(#navyBarGrad)"
                        radius={[4, 4, 0, 0]}
                        barSize={48}
                        animationDuration={1500}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
