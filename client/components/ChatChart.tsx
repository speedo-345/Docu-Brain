'use client';

import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface ChartDataset {
  label: string;
  data: number[];
}

export interface ChartPayload {
  chart_type: 'bar' | 'pie' | 'line';
  title: string;
  labels: string[];
  datasets: ChartDataset[];
}

const COLORS = [
  '#818cf8', '#34d399', '#f472b6', '#fbbf24', '#60a5fa',
  '#a78bfa', '#fb923c', '#2dd4bf', '#e879f9', '#4ade80'
];

export default function ChatChart({ data }: { data: ChartPayload }) {
  // Transform the data into Recharts format
  const chartData = data.labels.map((label, i) => {
    const point: any = { name: label };
    data.datasets.forEach((ds) => {
      point[ds.label] = ds.data[i] ?? 0;
    });
    return point;
  });

  const renderChart = () => {
    switch (data.chart_type) {
      case 'pie': {
        const pieData = data.labels.map((label, i) => ({
          name: label,
          value: data.datasets[0]?.data[i] ?? 0,
        }));
        return (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={4}
                dataKey="value"
                animationBegin={0}
                animationDuration={800}
                animationEasing="ease-out"
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'rgba(17,17,17,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#f0f0f0',
                  fontSize: '12px',
                }}
              />
              <Legend
                wrapperStyle={{ color: '#888', fontSize: '11px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        );
      }

      case 'line':
        return (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(17,17,17,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#f0f0f0',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ color: '#888', fontSize: '11px' }} />
              {data.datasets.map((ds, idx) => (
                <Line
                  key={ds.label}
                  type="monotone"
                  dataKey={ds.label}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={2}
                  dot={{ fill: COLORS[idx % COLORS.length], r: 4 }}
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'bar':
      default:
        return (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(17,17,17,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#f0f0f0',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ color: '#888', fontSize: '11px' }} />
              {data.datasets.map((ds, idx) => (
                <Bar
                  key={ds.label}
                  dataKey={ds.label}
                  fill={COLORS[idx % COLORS.length]}
                  radius={[4, 4, 0, 0]}
                  animationBegin={0}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <div className="w-full my-2 p-3 rounded-xl glass-glow animate-fadeInUp" style={{ minWidth: 280 }}>
      <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
        📊 {data.title}
      </p>
      {renderChart()}
    </div>
  );
}
