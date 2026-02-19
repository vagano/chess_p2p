import { useState, useEffect } from 'react';
import { config } from '../lib/config';
import { getInitData } from '../lib/telegram';

interface MoveAnalysisData {
  moveNumber: number;
  fen: string;
  scoreCp: number;
  isMate: boolean;
  mateIn: number | null;
  bestMove: string;
  pv: string;
  winPct: number;
  drawPct: number;
  lossPct: number;
  depth: number;
  classification: string;
}

interface GameAnalysisProps {
  gameId: string;
  apiBaseUrl?: string;
}

const classificationColors: Record<string, string> = {
  brilliant: '#1baaa7',
  great: '#5b8bb4',
  best: '#96bc4b',
  good: '#96bc4b',
  inaccuracy: '#f7c631',
  mistake: '#e58f2a',
  blunder: '#ca3431',
};

const classificationSymbols: Record<string, string> = {
  brilliant: '!!',
  great: '!',
  best: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

export function GameAnalysis({ gameId, apiBaseUrl = config.apiBaseUrl }: GameAnalysisProps) {
  const [analysis, setAnalysis] = useState<MoveAnalysisData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        const headers: Record<string, string> = {};
        const tgData = getInitData();
        if (tgData) headers['Authorization'] = `tma ${tgData}`;
        const res = await fetch(`${apiBaseUrl}/api/game/${gameId}/analysis`, { headers });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setAnalysis(data.moves || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analysis');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [gameId, apiBaseUrl]);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
        Loading analysis...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#f44336' }}>
        Analysis not available: {error}
      </div>
    );
  }

  if (analysis.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
        No analysis data available yet.
      </div>
    );
  }

  // Evaluation chart (simple SVG)
  const chartWidth = 400;
  const chartHeight = 120;
  const maxCp = 500;

  const points = analysis.map((m, i) => {
    const x = (i / Math.max(analysis.length - 1, 1)) * chartWidth;
    let cp = m.isMate ? (m.mateIn && m.mateIn > 0 ? maxCp : -maxCp) : m.scoreCp;
    cp = Math.max(-maxCp, Math.min(maxCp, cp));
    const y = chartHeight / 2 - (cp / maxCp) * (chartHeight / 2);
    return `${x},${y}`;
  });

  // Statistics summary
  const stats = analysis.reduce(
    (acc, m) => {
      acc[m.classification] = (acc[m.classification] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div
      style={{
        background: 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.06))',
        borderRadius: '10px',
        padding: '16px',
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--tg-theme-text-color, #e0e0e0)' }}>Game Analysis</h3>

      {/* Eval chart */}
      <svg
        width={chartWidth}
        height={chartHeight}
        style={{ display: 'block', margin: '0 auto 16px', maxWidth: '100%' }}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      >
        {/* Zero line */}
        <line
          x1={0}
          y1={chartHeight / 2}
          x2={chartWidth}
          y2={chartHeight / 2}
          stroke="#ddd"
          strokeWidth={1}
        />
        {/* Eval line */}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#333"
          strokeWidth={2}
        />
        {/* Area above zero (white advantage) */}
        <polygon
          points={`0,${chartHeight / 2} ${points.join(' ')} ${chartWidth},${chartHeight / 2}`}
          fill="rgba(255,255,255,0.6)"
          stroke="none"
        />
      </svg>

      {/* Stats summary */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        {Object.entries(stats).map(([classification, count]) => (
          <div
            key={classification}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '12px',
              background: classificationColors[classification] || '#999',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <span>{classification}</span>
            <span
              style={{
                background: 'rgba(255,255,255,0.3)',
                borderRadius: '8px',
                padding: '0 6px',
              }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>

      {/* Move-by-move analysis */}
      <div
        style={{
          maxHeight: '200px',
          overflowY: 'auto',
          fontSize: '12px',
          fontFamily: 'monospace',
        }}
      >
        {analysis.map((m) => (
          <div
            key={m.moveNumber}
            style={{
              display: 'flex',
              gap: '8px',
              padding: '4px 8px',
              borderBottom: '1px solid var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.08))',
              alignItems: 'center',
            }}
          >
            <span style={{ width: '30px', color: '#999', textAlign: 'right' }}>
              {Math.ceil(m.moveNumber / 2)}.
            </span>
            <span
              style={{
                width: '20px',
                color: classificationColors[m.classification] || '#999',
                fontWeight: 'bold',
              }}
            >
              {classificationSymbols[m.classification] || ''}
            </span>
            <span style={{ width: '60px' }}>
              {m.isMate ? `M${Math.abs(m.mateIn || 0)}` : `${(m.scoreCp / 100).toFixed(1)}`}
            </span>
            <span style={{ color: '#888', flex: 1 }}>
              Best: {m.bestMove}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
