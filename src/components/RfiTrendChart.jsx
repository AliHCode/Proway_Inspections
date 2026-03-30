import { useState, useEffect } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
} from 'recharts';

export default function RfiTrendChart({ data }) {
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 640);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 640);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
                {isMobile ? (
                    /* Mobile: Bento Bar Style */
                    <BarChart
                        data={data}
                        margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
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
                            dy={10}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }} />
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
                            barSize={32}
                            animationDuration={1500}
                        />
                    </BarChart>
                ) : (
                    /* Tablet & PC: Linear Style (Line Chart) */
                    <AreaChart
                        data={data}
                        margin={{ top: 10, right: 20, left: -20, bottom: 25 }}
                    >
                        <defs>
                            <linearGradient id="linearShadow" x1="0" y1="0" x2="0" y2="1">
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
                            dy={10}
                        />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 500 }} />
                        <Tooltip
                            cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                            contentStyle={{
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                background: '#fff',
                                boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)',
                                fontSize: '13px',
                                padding: '10px 14px'
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            name="RFIs Filed"
                            stroke="#1e293b"
                            strokeWidth={2}
                            fill="url(#linearShadow)"
                            dot={{ r: 3, fill: '#fff', stroke: '#1e293b', strokeWidth: 2, fillOpacity: 1 }}
                            activeDot={{ r: 4, fill: '#fff', stroke: '#1e293b', strokeWidth: 2 }}
                            animationDuration={1500}
                        />
                    </AreaChart>
                )}
            </ResponsiveContainer>
        </div>
    );
}
