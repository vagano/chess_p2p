interface EvalBarProps {
  evaluation: number | null; // centipawns from white's perspective, null = no data
  isMate: boolean;
  mateIn: number | null;
  height?: number;
  orientation?: 'white' | 'black';
}

export function EvalBar({
  evaluation,
  isMate,
  mateIn,
  height = 480,
  orientation = 'white',
}: EvalBarProps) {
  // Calculate white's fill percentage
  let whitePct = 50;

  if (evaluation !== null) {
    if (isMate && mateIn !== null) {
      whitePct = mateIn > 0 ? 95 : 5; // mate for white vs black
    } else {
      // Sigmoid-like mapping: +-500cp -> ~5-95%
      const cp = evaluation / 100;
      whitePct = 50 + 50 * (2 / (1 + Math.exp(-0.5 * cp)) - 1);
      whitePct = Math.max(3, Math.min(97, whitePct));
    }
  }

  const formatEval = () => {
    if (evaluation === null) return '?';
    if (isMate && mateIn !== null) {
      return `M${Math.abs(mateIn)}`;
    }
    const val = evaluation / 100;
    return val >= 0 ? `+${val.toFixed(1)}` : val.toFixed(1);
  };

  // White fills from white's side: bottom when white is at bottom, top when black is at bottom
  const whiteAnchor = orientation === 'white' ? 'bottom' : 'top';

  return (
    <div
      style={{
        width: '28px',
        height: `${height}px`,
        borderRadius: '4px',
        overflow: 'hidden',
        position: 'relative',
        background: '#333',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        flexShrink: 0,
      }}
    >
      {/* White portion — grows from white's side of the board */}
      <div
        style={{
          position: 'absolute',
          [whiteAnchor]: 0,
          width: '100%',
          height: `${whitePct}%`,
          background: '#f0f0f0',
          transition: 'height 0.5s ease',
        }}
      />
      {/* Evaluation text */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%) rotate(-90deg)',
          fontSize: '10px',
          fontWeight: 'bold',
          color: whitePct > 50 ? '#333' : '#eee',
          whiteSpace: 'nowrap',
          zIndex: 1,
        }}
      >
        {formatEval()}
      </div>
    </div>
  );
}
