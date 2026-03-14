import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend
} from 'recharts';

export default function RfiStatusPieChart({ data }) {
    // Data format expected: [{ name: 'Approved', value: 10, color: '#059669' }, ...]
    const pieRenderKey = (data || []).map((d) => `${d.name}:${d.value}`).join('|');

    if (!data || data.length === 0 || data.every(d => d.value === 0)) {
        return (
            <div className="empty-chart">
                <p>No status data available.</p>
            </div>
        );
    }

    return (
        <div className="chart-container" style={{ width: '100%', height: 320 }}>
            <h3 className="chart-title">Inspection Status</h3>
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <PieChart key={pieRenderKey}>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                        isAnimationActive={false}
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <Tooltip
                        contentStyle={{
                            borderRadius: '8px',
                            border: '1px solid var(--clr-border)',
                            boxShadow: 'var(--shadow-md)',
                            fontWeight: 600,
                        }}
                    />
                    <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        wrapperStyle={{
                            fontSize: '12px',
                            paddingTop: '10px',
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent: 'center',
                            gap: '5px'
                        }}
                    />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}
