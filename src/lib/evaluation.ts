import { config } from './config';

/** Result from the evaluation API or local fallback */
export interface EvalResult {
  /** Score in centipawns from white's perspective */
  scoreCp: number;
  isMate: boolean;
  mateIn: number | null;
  bestMove: string | null;
  depth: number;
  /** 'stockfish' | 'material' — indicates source */
  source: 'stockfish' | 'material';
}

/**
 * Compute a simple material-based evaluation from a FEN string.
 * Used as a fast fallback when Stockfish is not available.
 * Returns score in centipawns from white's perspective.
 */
export function materialEval(fen: string): EvalResult {
  const pieceValues: Record<string, number> = {
    p: -100,
    n: -320,
    b: -330,
    r: -500,
    q: -900,
    k: 0,
    P: 100,
    N: 320,
    B: 330,
    R: 500,
    Q: 900,
    K: 0,
  };

  const board = fen.split(' ')[0];
  let score = 0;
  for (const ch of board) {
    if (pieceValues[ch] !== undefined) {
      score += pieceValues[ch];
    }
  }

  return {
    scoreCp: score,
    isMate: false,
    mateIn: null,
    bestMove: null,
    depth: 0,
    source: 'material',
  };
}

/**
 * Fetch position evaluation from the backend (Stockfish).
 * Falls back to material eval if the API is unavailable.
 */
export async function fetchEvaluation(
  fen: string,
  depth: number = 12
): Promise<EvalResult> {
  try {
    const url = `${config.apiBaseUrl}/api/evaluate?fen=${encodeURIComponent(fen)}&depth=${depth}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();

    return {
      scoreCp: data.scoreCp ?? 0,
      isMate: data.isMate ?? false,
      mateIn: data.mateIn ?? null,
      bestMove: data.bestMove ?? null,
      depth: data.depth ?? depth,
      source: 'stockfish',
    };
  } catch {
    // Stockfish unavailable — fall back to material count
    return materialEval(fen);
  }
}
