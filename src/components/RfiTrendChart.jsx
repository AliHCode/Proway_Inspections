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
            <h3 className="chart-title" style={{ fontSize: '1rem', color: 'var(--clr-text-secondary)', fontWeight: 600, marginBottom: '2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Weekly RFI Activity</h3>
            <ResponsiveContainer width="100%" height={280}>
                <BarChart
                    data={data}
                    margin={{
                        top: 20,
                        right: 20,
                        left: -20,
                        bottom: 0,
                    }}
                    barGap={0}
                >
                    <defs>
                        <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                            <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.6} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                        dy={12}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#64748b', fontWeight: 500 }}
                    />
                    <Tooltip
                        cursor={{ fill: '#f8fafc' }}
                        contentStyle={{
                            borderRadius: '16px',
                            border: 'none',
                            background: '#0f172a',
                            color: 'white',
                            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
                            fontSize: '13px',
                            padding: '12px 16px'
                        }}
                        itemStyle={{ color: '#3b82f6', fontWeight: 700 }}
                    />
                    <Bar
                        dataKey="value"
                        name="RFIs Filed"
                        fill="url(#barGradient)"
                        radius={[10, 10, 0, 0]}
                        barSize={32}
                        animationDuration={2000}
                    />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
