import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { ChessBoardComponent } from './ChessBoard';
import { ConnectionStatus } from './ConnectionStatus';
import { GameStatus } from './GameStatus';
import { EvalBar } from './EvalBar';
import { GameAnalysis } from './GameAnalysis';
import { useYjsSync } from '../hooks/useYjsSync';
import { useChessGame } from '../hooks/useChessGame';
import {
  registerPlayer,
  derivePlayerColor,
  syncSeatingToGameMap,
  getPlayersMap,
} from '../lib/gameState';
import { config } from '../lib/config';
import { fetchEvaluation, type EvalResult } from '../lib/evaluation';

export function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  if (!roomId) {
    navigate('/');
    return null;
  }

  const { doc, connectionState, isP2P, syncWithServer, peerCount } =
    useYjsSync({ roomId });

  const [playerId] = useState(() => nanoid(8));
  const [playerName] = useState(() => `Player_${playerId.substring(0, 4)}`);
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [boardWidth, setBoardWidth] = useState(480);
  const evalAbortRef = useRef<AbortController | null>(null);

  // Conflict-free player color: derived from a Y.Map where each client writes to its OWN key
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);

  // Register this player in the shared "players" map (unique key = no CRDT conflicts)
  useEffect(() => {
    registerPlayer(doc, playerId, playerName);
  }, [doc, playerId, playerName]);

  // Observe the "players" map and derive color whenever it changes
  useEffect(() => {
    const playersMap = getPlayersMap(doc);

    const recalc = () => {
      const color = derivePlayerColor(doc, playerId);
      setPlayerColor(color);
      // Also sync into the "game" map so rest of the code can read white/black
      syncSeatingToGameMap(doc);
    };

    // Initial calc
    recalc();

    playersMap.observeDeep(recalc);
    return () => playersMap.unobserveDeep(recalc);
  }, [doc, playerId]);

  // Responsive board size
  useEffect(() => {
    const updateSize = () => {
      const w = Math.min(window.innerWidth - 80, 560);
      setBoardWidth(Math.max(280, w));
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const { game, gameState, position, isMyTurn, makeMove, isGameOver, lastMove, possibleMoves } =
    useChessGame({ doc, playerColor });

  // Fetch position evaluation after each move
  useEffect(() => {
    if (!position || gameState.status === 'waiting') return;

    // Cancel any pending eval request
    evalAbortRef.current?.abort();
    const controller = new AbortController();
    evalAbortRef.current = controller;

    // Small debounce to avoid rapid-fire requests during sync bursts
    const timer = setTimeout(() => {
      if (controller.signal.aborted) return;
      fetchEvaluation(position, 12).then((result) => {
        if (!controller.signal.aborted) {
          setEvalResult(result);
        }
      });
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [position, gameState.status]);

  // Periodic server sync in P2P mode (every 5 moves)
  useEffect(() => {
    const moves = gameState.moves;
    if (isP2P && moves.length > 0 && moves.length % 5 === 0) {
      syncWithServer();
    }
  }, [gameState.moves.length, isP2P, syncWithServer]);

  // Sync on game over
  useEffect(() => {
    if (isGameOver) {
      syncWithServer();
    }
  }, [isGameOver, syncWithServer]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f5f5f5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px',
      }}
    >
      {/* Header */}
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <h1 style={{ fontSize: '20px', margin: 0, fontWeight: 700 }}>P2P Chess</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <ConnectionStatus state={connectionState} peerCount={peerCount} />
          <button
            onClick={handleCopyLink}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              background: '#1976d2',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            Copy Link
          </button>
        </div>
      </div>

      {/* Game area */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '800px',
          width: '100%',
        }}
      >
        {/* Board + Eval bar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
          <EvalBar
            evaluation={evalResult?.scoreCp ?? null}
            isMate={evalResult?.isMate ?? false}
            mateIn={evalResult?.mateIn ?? null}
            height={boardWidth}
            orientation={playerColor || 'white'}
          />
          <ChessBoardComponent
            position={position}
            playerColor={playerColor}
            isMyTurn={isMyTurn}
            onMove={makeMove}
            possibleMoves={possibleMoves}
            lastMove={lastMove}
            boardWidth={boardWidth}
          />
        </div>

        {/* Sidebar */}
        <div
          style={{
            width: '250px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            minWidth: '200px',
          }}
        >
          <GameStatus
            gameState={gameState}
            game={game}
            playerColor={playerColor}
            isMyTurn={isMyTurn}
          />

          {/* Room info */}
          <div
            style={{
              padding: '12px 16px',
              background: '#fff',
              borderRadius: '8px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              fontSize: '12px',
              color: '#888',
            }}
          >
            <div>Room: <code>{roomId}</code></div>
            <div style={{ marginTop: '4px' }}>
              Transport: {isP2P ? 'Peer-to-Peer' : connectionState === 'WS_CONNECTED' ? 'WebSocket' : connectionState === 'WS_FALLBACK' ? 'WS Fallback' : 'Connecting...'}
            </div>
            <div style={{ marginTop: '2px' }}>
              Config: {config.connectionMode}
            </div>
          </div>

          {/* Game analysis (after game over) */}
          {isGameOver && <GameAnalysis gameId={roomId} />}
        </div>
      </div>
    </div>
  );
}
