import { useState } from 'react';

// ─── Snowflake Radar Chart (SVG with Catmull-Rom spline curves) ───
// Reusable: used in Research summary + Screener table

const SNOWFLAKE_DIMS = [
  { key: 'value', label: 'Value', color: '#818cf8' },
  { key: 'future', label: 'Future', color: '#34d399' },
  { key: 'past', label: 'Past', color: '#fbbf24' },
  { key: 'health', label: 'Health', color: '#22d3ee' },
  { key: 'dividend', label: 'Dividend', color: '#f472b6' },
];

function splinePath(points) {
  const n = points.length;
  if (n < 3) return '';
  let d = '';
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    if (i === 0) d += `M ${p1.x},${p1.y} `;
    d += `C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y} `;
  }
  return d + 'Z';
}

export default function SnowflakeChart({ data, size = 240, mini = false }) {
  if (!data) return null;
  const dims = SNOWFLAKE_DIMS;
  const cx = size / 2, cy = size / 2;
  const maxR = size * 0.37;
  const angleStep = (2 * Math.PI) / 5;
  const startAngle = -Math.PI / 2;
  const [uid] = useState(() => `sf${Math.random().toString(36).slice(2, 8)}`);

  const getPoint = (i, val) => {
    const angle = startAngle + i * angleStep;
    const r = (val / 6) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const dataPts = dims.map((d, i) => getPoint(i, data[d.key] || 0));
  const dataPath = splinePath(dataPts);
  const ringPaths = [2, 4, 6].map(level => splinePath(dims.map((_, i) => getPoint(i, level))));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id={`${uid}_glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.12} />
          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
        </radialGradient>
        <linearGradient id={`${uid}_fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#818cf8" stopOpacity={0.2} />
          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
        </linearGradient>
        <filter id={`${uid}_blur`}><feGaussianBlur in="SourceGraphic" stdDeviation={mini ? 1.5 : 3} /></filter>
      </defs>

      <circle cx={cx} cy={cy} r={maxR * 1.1} fill={`url(#${uid}_glow)`} />

      {ringPaths.map((path, i) => <path key={i} d={path} fill="none" stroke="#ffffff06" strokeWidth={0.8} />)}

      {!mini && dims.map((_, i) => {
        const p = getPoint(i, 6);
        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#ffffff06" strokeWidth={0.5} />;
      })}

      <path d={dataPath} fill={`url(#${uid}_fill)`} stroke="#818cf8" strokeWidth={3} filter={`url(#${uid}_blur)`} opacity={0.5} />
      <path d={dataPath} fill={`url(#${uid}_fill)`} stroke="#818cf8" strokeWidth={mini ? 1.5 : 2} strokeLinejoin="round" />

      {dataPts.map((p, i) => (
        <g key={i}>
          {!mini && <circle cx={p.x} cy={p.y} r={5} fill={dims[i].color} opacity={0.3} filter={`url(#${uid}_blur)`} />}
          <circle cx={p.x} cy={p.y} r={mini ? 2 : 4} fill={dims[i].color} stroke="#e4e4e7" strokeWidth={mini ? 1 : 2} />
        </g>
      ))}

      {!mini && dims.map((d, i) => {
        const p = getPoint(i, 7.5);
        return (
          <g key={`l${i}`}>
            <text x={p.x} y={p.y - 6} textAnchor="middle" dominantBaseline="middle" fill={d.color} fontSize={10} fontWeight={600}>{d.label}</text>
            <text x={p.x} y={p.y + 7} textAnchor="middle" dominantBaseline="middle" fill="#555" fontSize={8}>{data[d.key]}/6</text>
          </g>
        );
      })}

      <text x={cx} y={cy - (mini ? 2 : 5)} textAnchor="middle" fill="white" fontSize={mini ? 10 : 20} fontWeight={700}>{data.total}</text>
      {!mini && <text x={cx} y={cy + 12} textAnchor="middle" fill="#555" fontSize={9}>/6</text>}
    </svg>
  );
}

export function MiniSnowflake({ data }) {
  if (!data) return <div style={{ width: 48, height: 48 }} />;
  return <SnowflakeChart data={data} size={48} mini />;
}
