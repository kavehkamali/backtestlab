import { useState, useRef, useCallback } from 'react';

/**
 * Interactive snowflake radar chart with draggable points.
 * Props:
 *   dims: [{key, label, color}]
 *   values: {key: 0-6} current filter thresholds
 *   onChange: (key, newValue) => void
 *   enabled: boolean
 *   onToggle: () => void
 *   title: string
 */

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

export default function InteractiveSnowflake({ dims, values, onChange, enabled, onToggle, title }) {
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null); // index of dim being dragged
  const [hovering, setHovering] = useState(null);

  const size = 180;
  const cx = size / 2, cy = size / 2;
  const maxR = size * 0.34;
  const n = dims.length;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2;

  const getPoint = (i, val) => {
    const angle = startAngle + i * angleStep;
    const r = (val / 6) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const getValueFromMouse = useCallback((i, clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    // Scale to viewBox
    const sx = mx * (size / rect.width);
    const sy = my * (size / rect.height);
    // Distance from center along the axis
    const angle = startAngle + i * angleStep;
    const dx = sx - cx;
    const dy = sy - cy;
    // Project onto axis direction
    const axisX = Math.cos(angle);
    const axisY = Math.sin(angle);
    const projection = dx * axisX + dy * axisY;
    const val = Math.round((projection / maxR) * 6 * 2) / 2; // snap to 0.5
    return Math.max(0, Math.min(6, val));
  }, []);

  const handlePointerDown = (i) => (e) => {
    if (!enabled) return;
    e.preventDefault();
    setDragging(i);
    // Capture pointer
    e.target.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (dragging === null || !enabled) return;
    const val = getValueFromMouse(dragging, e.clientX, e.clientY);
    if (val !== null) {
      onChange(dims[dragging].key, val);
    }
  };

  const handlePointerUp = () => {
    setDragging(null);
  };

  const dataPts = dims.map((d, i) => getPoint(i, values[d.key] || 0));
  const dataPath = splinePath(dataPts);
  const ringPaths = [2, 4, 6].map(level => splinePath(dims.map((_, i) => getPoint(i, level))));

  const opacity = enabled ? 1 : 0.3;

  return (
    <div className="flex flex-col items-center" style={{ opacity }}>
      {/* Header with toggle */}
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={onToggle}
          className={`w-7 h-4 rounded-full transition-colors relative ${enabled ? 'bg-indigo-500' : 'bg-white/10'}`}
        >
          <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${enabled ? 'left-3.5' : 'left-0.5'}`} />
        </button>
        <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{title}</span>
      </div>

      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ cursor: enabled ? (dragging !== null ? 'grabbing' : 'default') : 'not-allowed', touchAction: 'none' }}
      >
        <defs>
          <radialGradient id={`isg_${title}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={enabled ? '#6366f1' : '#888'} stopOpacity={0.08} />
            <stop offset="100%" stopColor={enabled ? '#6366f1' : '#888'} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`isf_${title}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={enabled ? '#818cf8' : '#666'} stopOpacity={0.25} />
            <stop offset="100%" stopColor={enabled ? '#6366f1' : '#444'} stopOpacity={0.05} />
          </linearGradient>
          <filter id={`isb_${title}`}><feGaussianBlur in="SourceGraphic" stdDeviation="2" /></filter>
        </defs>

        {/* Background */}
        <circle cx={cx} cy={cy} r={maxR * 1.15} fill={`url(#isg_${title})`} />

        {/* Grid rings */}
        {ringPaths.map((path, i) => (
          <path key={i} d={path} fill="none" stroke="#ffffff06" strokeWidth={0.8} />
        ))}

        {/* Axis lines */}
        {dims.map((_, i) => {
          const p = getPoint(i, 6);
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#ffffff08" strokeWidth={0.5} />;
        })}

        {/* Glow path */}
        <path d={dataPath} fill={`url(#isf_${title})`} stroke={enabled ? '#818cf8' : '#555'} strokeWidth={2.5}
          filter={`url(#isb_${title})`} opacity={0.4} />

        {/* Data spline */}
        <path d={dataPath} fill={`url(#isf_${title})`} stroke={enabled ? '#818cf8' : '#555'} strokeWidth={2}
          strokeLinejoin="round" />

        {/* Draggable points */}
        {dataPts.map((p, i) => {
          const isActive = dragging === i || hovering === i;
          return (
            <g key={i}>
              {/* Hit area (larger invisible circle for easier grabbing) */}
              <circle
                cx={p.x} cy={p.y} r={12}
                fill="transparent"
                style={{ cursor: enabled ? 'grab' : 'not-allowed' }}
                onPointerDown={handlePointerDown(i)}
                onPointerEnter={() => setHovering(i)}
                onPointerLeave={() => setHovering(null)}
              />
              {/* Glow */}
              {isActive && enabled && (
                <circle cx={p.x} cy={p.y} r={10} fill={dims[i].color} opacity={0.15} filter={`url(#isb_${title})`} />
              )}
              {/* Dot */}
              <circle
                cx={p.x} cy={p.y}
                r={isActive ? 6 : 4}
                fill={enabled ? dims[i].color : '#555'}
                stroke="#08080d"
                strokeWidth={2}
                style={{ transition: 'r 0.1s' }}
              />
            </g>
          );
        })}

        {/* Labels + values */}
        {dims.map((d, i) => {
          const p = getPoint(i, 7.8);
          const val = values[d.key] || 0;
          return (
            <g key={`l${i}`}>
              <text x={p.x} y={p.y - 5} textAnchor="middle" dominantBaseline="middle"
                fill={enabled ? d.color : '#555'} fontSize={9} fontWeight={600}>{d.label}</text>
              <text x={p.x} y={p.y + 7} textAnchor="middle" dominantBaseline="middle"
                fill={enabled ? '#aaa' : '#444'} fontSize={8} fontWeight={500}>≥{val}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
