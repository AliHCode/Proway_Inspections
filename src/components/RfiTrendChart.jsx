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
            <div className="empty-chart">
                <p>Not enough data to show trends.</p>
            </div>
        );
    }

    return (
        <div className="chart-container" style={{ width: '100%', height: 320 }}>
            <h3 className="chart-title">Weekly RFI Volume</h3>
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <AreaChart
                    data={data}
                    margin={{
                        top: 20,
                        right: 20,
                        left: -20,
                        bottom: 0,
                    }}
                >
                    <defs>
                        <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--clr-brand-secondary)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="var(--clr-brand-secondary)" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--clr-border)" />
                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: 'var(--clr-text-muted)' }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: 'var(--clr-text-muted)' }}
                    />
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid var(--clr-border)',
                            boxShadow: 'var(--shadow-lg)',
                            fontWeight: 600,
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        name="RFIs Filed"
                        stroke="var(--clr-brand-secondary)"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorValue)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
