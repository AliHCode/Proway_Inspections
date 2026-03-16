import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
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
        <div className="premium-card chart-container" style={{ width: '100%', height: '100%', minHeight: 320 }}>
            <h3 className="chart-title" style={{ fontSize: '1.25rem', color: '#0f172a', fontWeight: 700, marginBottom: '1.5rem' }}>Weekly RFI Activity</h3>
            <ResponsiveContainer width="100%" height={240}>
                <AreaChart
                    data={data}
                    margin={{
                        top: 10,
                        right: 10,
                        left: 0,
                        bottom: 0,
                    }}
                >
                    <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1} />
                            <stop offset="95%" stopColor="#0f172a" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#94a3b8' }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#94a3b8' }}
                        width={30}
                    />
                    <Tooltip
                        cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                        contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                            fontSize: '14px',
                            padding: '8px 12px'
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        name="RFIs"
                        stroke="#0f172a"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="#0f172a"
                        dot={{ r: 4, fill: '#0f172a', stroke: '#fff', strokeWidth: 2, fillOpacity: 1 }}
                        activeDot={{ r: 5, fill: '#0f172a', stroke: '#fff', strokeWidth: 2 }}
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
