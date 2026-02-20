import type { EvalResult } from '../types';

interface StockfishInfoProps {
  evalResult: EvalResult | null;
  moveCount: number;
}

export function StockfishInfo({ evalResult, moveCount }: StockfishInfoProps) {
  if (!evalResult) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}><span style={iconStyle}>{'\u265F'}</span> Stockfish</div>
        <div style={emptyStyle}>Waiting for position...</div>
      </div>
    );
  }

  const isStockfish = evalResult.source === 'stockfish';
  const score = evalResult.scoreCp / 100;
  const absScore = Math.abs(score);

  let scoreText: string;
  let scoreColor: string;
  if (evalResult.isMate && evalResult.mateIn !== null) {
    const m = evalResult.mateIn;
    scoreText = m > 0 ? `M${m}` : `M${Math.abs(m)}`;
    scoreColor = m > 0 ? '#4caf50' : '#f44336';
  } else {
    scoreText = score >= 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
    if (absScore < 0.3) scoreColor = '#888';
    else if (score > 0) scoreColor = '#4caf50';
    else scoreColor = '#f44336';
  }

  let verdict: string;
  let verdictColor: string;
  if (evalResult.isMate && evalResult.mateIn !== null) {
    verdict = evalResult.mateIn > 0 ? 'White mates' : 'Black mates';
    verdictColor = evalResult.mateIn > 0 ? '#4caf50' : '#f44336';
  } else if (absScore < 0.3) {
    verdict = 'Equal'; verdictColor = '#888';
  } else if (absScore < 1.0) {
    verdict = score > 0 ? 'White slightly better' : 'Black slightly better';
    verdictColor = score > 0 ? '#8bc34a' : '#ff9800';
  } else if (absScore < 3.0) {
    verdict = score > 0 ? 'White is better' : 'Black is better';
    verdictColor = score > 0 ? '#4caf50' : '#f44336';
  } else {
    verdict = score > 0 ? 'White winning' : 'Black winning';
    verdictColor = score > 0 ? '#2e7d32' : '#c62828';
  }

  const whiteBar = evalResult.isMate
    ? (evalResult.mateIn! > 0 ? 95 : 5)
    : Math.max(2, Math.min(98, 50 + 50 * (2 / (1 + Math.exp(-0.5 * score)) - 1)));

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={iconStyle}>{'\u265F'}</span>
        Stockfish
        <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.5, fontWeight: 400 }}>
          {isStockfish ? `d${evalResult.depth}` : 'material'}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '28px', fontWeight: 800, color: scoreColor, fontFamily: 'monospace' }}>{scoreText}</span>
        <span style={{ fontSize: '12px', color: verdictColor, fontWeight: 600 }}>{verdict}</span>
      </div>

      <div style={{ height: '8px', borderRadius: '4px', background: '#333', overflow: 'hidden', marginBottom: '10px' }}>
        <div style={{ height: '100%', width: `${whiteBar}%`, background: '#f0f0f0', borderRadius: '4px', transition: 'width 0.4s ease' }} />
      </div>

      {isStockfish && (
        <div style={{ fontSize: '11px', fontFamily: 'monospace', lineHeight: 1.7 }}>
          {evalResult.bestMove && (
            <div style={rowStyle}><span style={labelStyle}>Best move</span><span style={{ fontWeight: 700 }}>{evalResult.bestMove}</span></div>
          )}
          <div style={rowStyle}><span style={labelStyle}>Depth</span><span>{evalResult.depth}</span></div>
          <div style={rowStyle}>
            <span style={labelStyle}>Move</span>
            <span>{Math.ceil(moveCount / 2)}{moveCount % 2 === 1 ? '. W' : '... B'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: '12px 14px',
  background: 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.06))',
  borderRadius: '10px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px',
  fontSize: '13px', fontWeight: 700, marginBottom: '8px',
  color: 'var(--tg-theme-text-color, #333)',
};

const iconStyle: React.CSSProperties = { fontSize: '16px' };
const emptyStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--tg-theme-hint-color, #aaa)' };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', color: 'var(--tg-theme-text-color, #555)' };
const labelStyle: React.CSSProperties = { color: 'var(--tg-theme-hint-color, #999)' };
