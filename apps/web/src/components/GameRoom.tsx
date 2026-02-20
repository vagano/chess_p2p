import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  useYjsSync,
  useChessGame,
  registerPlayer,
  derivePlayerColor,
  syncSeatingToGameMap,
  ChessBoardComponent,
  GameStatus,
  ConnectionStatus,
  EvalBar,
  StockfishInfo,
  fetchEvaluation,
  type EvalResult,
} from '@chess/shared';
import { config } from '../config';
import { createWebrtcProvider } from '../webrtcFactory';

function getOrCreatePlayerId(roomId: string): string {
  const key = `chess_pid_${roomId}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `web_${roomId.slice(0, 6)}_${Math.random().toString(36).slice(2, 6)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export default function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);

  const { doc, connectionState, isConnected, peerCount } = useYjsSync({
    roomId: roomId ?? '',
    config,
    createWebrtcProvider: config.connectionMode !== 'websocket' ? createWebrtcProvider : undefined,
  });

  const playerId = useMemo(() => getOrCreatePlayerId(roomId ?? ''), [roomId]);
  const playerName = 'Player';

  useEffect(() => {
    if (!isConnected) return;
    registerPlayer(doc, playerId, playerName);
    syncSeatingToGameMap(doc);
  }, [isConnected, doc, playerId, playerName]);

  const playerColor = derivePlayerColor(doc, playerId);
  const {
    game, gameState, position, isMyTurn, isCheck, kingSquare,
    makeMove, isGameOver, lastMove, possibleMoves, isPending,
  } = useChessGame({ doc, playerColor });

  // Fetch evaluation on each move
  useEffect(() => {
    if (gameState.moves.length > 0) {
      fetchEvaluation(position, config).then(setEvalResult);
    }
  }, [position]);

  const shareLink = useCallback(async () => {
    const link = `${window.location.origin}/room/${roomId}`;
    if (navigator.share) {
      try { await navigator.share({ url: link }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(link);
      alert('Link copied!');
    } catch {
      prompt('Copy this link:', link);
    }
  }, [roomId]);

  const isMobile = window.innerWidth < 640;
  const boardWidth = isMobile ? Math.min(window.innerWidth - 16, 480) : 480;

  if (!roomId) return <div>No room ID</div>;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      color: '#e0e0e0',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'none', border: 'none', color: '#888', cursor: 'pointer',
            fontSize: '14px', padding: '4px 8px',
          }}
        >
          ← Back
        </button>
        <ConnectionStatus state={connectionState} peerCount={peerCount} />
        <button
          onClick={shareLink}
          style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', color: '#e0e0e0',
            cursor: 'pointer', fontSize: '13px', padding: '6px 12px', borderRadius: '8px',
          }}
        >
          Share
        </button>
      </div>

      {/* Main content */}
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'center', alignItems: isMobile ? 'center' : 'flex-start',
        gap: '16px', padding: '16px', flex: 1,
      }}>
        {/* Board + eval bar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isMobile && evalResult && (
            <EvalBar
              evaluation={evalResult.scoreCp}
              isMate={evalResult.isMate}
              mateIn={evalResult.mateIn}
              height={boardWidth}
              orientation={playerColor || 'white'}
            />
          )}
          <ChessBoardComponent
            position={position}
            playerColor={playerColor}
            isMyTurn={isMyTurn}
            isCheck={isCheck}
            onMove={makeMove}
            possibleMoves={possibleMoves}
            lastMove={lastMove}
            kingSquare={kingSquare}
            boardWidth={boardWidth}
            isPending={isPending}
          />
        </div>

        {/* Sidebar / bottom panel */}
        <div style={{
          width: isMobile ? '100%' : '250px',
          maxWidth: isMobile ? `${boardWidth}px` : undefined,
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          <GameStatus
            gameState={gameState}
            game={game}
            playerColor={playerColor}
            isMyTurn={isMyTurn}
            isCheck={isCheck}
            isPending={isPending}
          />
          {evalResult && (
            <StockfishInfo evalResult={evalResult} moveCount={gameState.moves.length} />
          )}
        </div>
      </div>
    </div>
  );
}
