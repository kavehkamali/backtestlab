import { useState, useRef, useCallback } from 'react';

/**
 * Interactive snowflake radar chart with draggable points.
 * Drag anywhere near an axis to adjust that dimension's threshold.
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
  const [dragging, setDragging] = useState(null);
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

  // Convert mouse position to a value (0-6) for a given axis index
  const mouseToValue = useCallback((i, clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const sx = (clientX - rect.left) * (size / rect.width);
    const sy = (clientY - rect.top) * (size / rect.height);
    const angle = startAngle + i * angleStep;
    const dx = sx - cx;
    const dy = sy - cy;
    const projection = dx * Math.cos(angle) + dy * Math.sin(angle);
    const val = Math.round((projection / maxR) * 6 * 2) / 2;
    return Math.max(0, Math.min(6, val));
  }, []);

  // Find the closest axis to a mouse position
  const closestAxis = useCallback((clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const sx = (clientX - rect.left) * (size / rect.width);
    const sy = (clientY - rect.top) * (size / rect.height);
    const dx = sx - cx;
    const dy = sy - cy;
    const mouseAngle = Math.atan2(dy, dx);

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const angle = startAngle + i * angleStep;
      let diff = Math.abs(mouseAngle - angle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < bestDist) {
        bestDist = diff;
        bestIdx = i;
      }
    }
    // Only match if within ~36 degrees of an axis
    return bestDist < angleStep * 0.6 ? bestIdx : null;
  }, []);

  const handlePointerDown = (e) => {
    if (!enabled) return;
    e.preventDefault();
    const idx = closestAxis(e.clientX, e.clientY);
    if (idx === null) return;
    setDragging(idx);
    // Immediately update the value
    const val = mouseToValue(idx, e.clientX, e.clientY);
    if (val !== null) onChange(dims[idx].key, val);
    // Capture pointer on the SVG so we get all move/up events
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!enabled) return;
    if (dragging !== null) {
      // Dragging mode — update the value
      const val = mouseToValue(dragging, e.clientX, e.clientY);
      if (val !== null) onChange(dims[dragging].key, val);
    } else {
      // Hover mode — highlight closest axis
      const idx = closestAxis(e.clientX, e.clientY);
      setHovering(idx);
    }
  };

  const handlePointerUp = (e) => {
    setDragging(null);
    svgRef.current?.releasePointerCapture(e.pointerId);
  };

  const handlePointerLeave = () => {
    setHovering(null);
  };

  const dataPts = dims.map((d, i) => getPoint(i, values[d.key] || 0));
  const dataPath = splinePath(dataPts);
  const ringPaths = [2, 4, 6].map(level => splinePath(dims.map((_, i) => getPoint(i, level))));
  const opacity = enabled ? 1 : 0.3;

  // Unique ID for SVG defs
  const uid = useRef(`is${Math.random().toString(36).slice(2, 7)}`).current;

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
        <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{title}</span>
      </div>

      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        style={{
          cursor: !enabled ? 'not-allowed' : dragging !== null ? 'grabbing' : hovering !== null ? 'grab' : 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <defs>
          <radialGradient id={`${uid}_g`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={enabled ? '#6366f1' : '#888'} stopOpacity={0.08} />
            <stop offset="100%" stopColor={enabled ? '#6366f1' : '#888'} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}_f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={enabled ? '#818cf8' : '#666'} stopOpacity={0.25} />
            <stop offset="100%" stopColor={enabled ? '#6366f1' : '#444'} stopOpacity={0.05} />
          </linearGradient>
          <filter id={`${uid}_b`}><feGaussianBlur in="SourceGraphic" stdDeviation="2" /></filter>
        </defs>

        {/* Background */}
        <circle cx={cx} cy={cy} r={maxR * 1.15} fill={`url(#${uid}_g)`} />

        {/* Grid rings */}
        {ringPaths.map((path, i) => (
          <path key={i} d={path} fill="none" stroke="#e4e4e7" strokeWidth={0.8} />
        ))}

        {/* Axis lines — highlighted when hovered/dragging */}
        {dims.map((_, i) => {
          const p = getPoint(i, 6);
          const active = dragging === i || hovering === i;
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y}
            stroke={active && enabled ? '#ffffff20' : '#ffffff08'} strokeWidth={active ? 1.5 : 0.5} />;
        })}

        {/* Glow path */}
        <path d={dataPath} fill={`url(#${uid}_f)`} stroke={enabled ? '#818cf8' : '#555'} strokeWidth={2.5}
          filter={`url(#${uid}_b)`} opacity={0.4} />

        {/* Data spline */}
        <path d={dataPath} fill={`url(#${uid}_f)`} stroke={enabled ? '#818cf8' : '#555'} strokeWidth={2}
          strokeLinejoin="round" />

        {/* Points */}
        {dataPts.map((p, i) => {
          const isActive = dragging === i || hovering === i;
          return (
            <g key={i}>
              {isActive && enabled && (
                <circle cx={p.x} cy={p.y} r={12} fill={dims[i].color} opacity={0.12} filter={`url(#${uid}_b)`} />
              )}
              <circle
                cx={p.x} cy={p.y}
                r={isActive && enabled ? 7 : 4.5}
                fill={enabled ? dims[i].color : '#555'}
                stroke="#e4e4e7"
                strokeWidth={2}
              />
            </g>
          );
        })}

        {/* Labels + threshold values */}
        {dims.map((d, i) => {
          const p = getPoint(i, 7.8);
          const val = values[d.key] || 0;
          const isActive = dragging === i || hovering === i;
          return (
            <g key={`l${i}`}>
              <text x={p.x} y={p.y - 5} textAnchor="middle" dominantBaseline="middle"
                fill={enabled ? (isActive ? '#fff' : d.color) : '#555'} fontSize={9} fontWeight={600}>{d.label}</text>
              <text x={p.x} y={p.y + 7} textAnchor="middle" dominantBaseline="middle"
                fill={enabled ? (isActive ? '#ddd' : '#888') : '#444'} fontSize={8} fontWeight={500}>≥{val}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
