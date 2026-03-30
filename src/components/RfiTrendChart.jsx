import {
    AreaChart,
    Area,
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
            <h3 className="chart-title" style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600, marginBottom: '2rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Weekly RFI Activity</h3>
            <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                    data={data}
                    margin={{
                        top: 10,
                        right: 20,
                        left: -20,
                        bottom: 0,
                    }}
                >
                    <defs>
                        <linearGradient id="areaShadow" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#1e293b" stopOpacity={0.05} />
                            <stop offset="95%" stopColor="#1e293b" stopOpacity={0.01} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#f1f5f9" />
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
                        tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                    />
                    <Tooltip
                        cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                        contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            background: '#fff',
                            color: '#1e293b',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)',
                            fontSize: '13px',
                            padding: '10px 14px'
                        }}
                        itemStyle={{ color: '#1e293b', fontWeight: 700 }}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        name="RFIs Filed"
                        stroke="#1e293b"
                        strokeWidth={2}
                        fill="url(#areaShadow)"
                        dot={{ r: 3, fill: '#fff', stroke: '#1e293b', strokeWidth: 2, fillOpacity: 1 }}
                        activeDot={{ r: 4, fill: '#fff', stroke: '#1e293b', strokeWidth: 2 }}
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
