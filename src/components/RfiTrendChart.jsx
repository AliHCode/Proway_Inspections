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
            <h3 className="chart-title" style={{ fontSize: '1.25rem', color: 'var(--clr-text-main)', fontWeight: 700, marginBottom: '1.5rem' }}>Weekly RFI Activity</h3>
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
                            <stop offset="5%" stopColor="var(--clr-brand-primary)" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="var(--clr-brand-primary)" stopOpacity={0} />
                        </linearGradient>
                        {/* Glow Filter */}
                        <filter id="shadow" height="200%">
                            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                            <feOffset dx="0" dy="4" result="offsetblur" />
                            <feComponentTransfer>
                                <feFuncA type="linear" slope="0.3" />
                            </feComponentTransfer>
                            <feMerge>
                                <feMergeNode />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                        dy={15}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }}
                        width={30}
                    />
                    <Tooltip
                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1, strokeDasharray: '4 4' }}
                        contentStyle={{
                            borderRadius: '16px',
                            border: '1px solid rgba(226, 232, 240, 0.8)',
                            background: 'rgba(255, 255, 255, 0.9)',
                            backdropFilter: 'blur(8px)',
                            color: 'var(--clr-text-main)',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                            fontSize: '13px',
                            padding: '10px 14px'
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        name="RFIs"
                        stroke="var(--clr-brand-primary)"
                        strokeWidth={4}
                        fillOpacity={1}
                        fill="url(#colorValue)"
                        filter="url(#shadow)"
                        dot={{ r: 5, fill: 'var(--clr-brand-primary)', stroke: '#fff', strokeWidth: 2, fillOpacity: 1 }}
                        activeDot={{ r: 7, fill: 'var(--clr-brand-primary)', stroke: '#fff', strokeWidth: 3 }}
                        animationDuration={1500}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
