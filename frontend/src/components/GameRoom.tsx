import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { nanoid } from 'nanoid';
import { ChessBoardComponent } from './ChessBoard';
import { ConnectionStatus } from './ConnectionStatus';
import { GameStatus } from './GameStatus';
import { EvalBar } from './EvalBar';
import { StockfishInfo } from './StockfishInfo';
import { GameAnalysis } from './GameAnalysis';
import { useYjsSync } from '../hooks/useYjsSync';
import { useChessGame } from '../hooks/useChessGame';
import {
  registerPlayer,
  derivePlayerColor,
  syncSeatingToGameMap,
  getPlayersMap,
} from '../lib/gameState';
import { fetchEvaluation, type EvalResult } from '../lib/evaluation';
import {
  isTelegram,
  getTelegramUser,
  hapticImpact,
  hapticNotification,
  showBackButton,
  hideBackButton,
  showMainButton,
  hideMainButton,
  shareRoom,
} from '../lib/telegram';

const tgMode = isTelegram();

export function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  if (!roomId) {
    navigate('/');
    return null;
  }

  const { doc, connectionState, isP2P, syncWithServer, peerCount } =
    useYjsSync({ roomId });

  const [playerId] = useState(() => {
    const tgUser = getTelegramUser();
    return tgUser ? tgUser.id.toString() : nanoid(8);
  });
  const [playerName] = useState(() => {
    const tgUser = getTelegramUser();
    return tgUser ? tgUser.first_name : `Player_${playerId.substring(0, 4)}`;
  });
  const [evalResult, setEvalResult] = useState<EvalResult | null>(null);
  const [boardWidth, setBoardWidth] = useState(480);
  const evalAbortRef = useRef<AbortController | null>(null);

  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);

  useEffect(() => {
    const tgUser = getTelegramUser();
    registerPlayer(doc, playerId, playerName, tgUser ? {
      telegramId: tgUser.id,
      username: tgUser.username,
      photoUrl: tgUser.photo_url,
    } : undefined);
  }, [doc, playerId, playerName]);

  useEffect(() => {
    const playersMap = getPlayersMap(doc);
    const recalc = () => {
      const color = derivePlayerColor(doc, playerId);
      setPlayerColor(color);
      syncSeatingToGameMap(doc);
    };
    recalc();
    playersMap.observeDeep(recalc);
    return () => playersMap.unobserveDeep(recalc);
  }, [doc, playerId]);

  useEffect(() => {
    const updateSize = () => {
      const isMobile = window.innerWidth <= 600;
      if (isMobile) {
        const w = window.innerWidth - 16;
        setBoardWidth(Math.max(240, Math.min(w, window.innerHeight * 0.52)));
      } else {
        setBoardWidth(Math.min(window.innerWidth - 320, 560));
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const { game, gameState, position, isMyTurn, isCheck, kingSquare, makeMove: rawMakeMove, isGameOver, lastMove, possibleMoves } =
    useChessGame({ doc, playerColor });

  const makeMove = useCallback(
    (...args: Parameters<typeof rawMakeMove>) => {
      const result = rawMakeMove(...args);
      if (result) {
        hapticImpact('light');
      } else if (tgMode) {
        hapticNotification('error');
      }
      return result;
    },
    [rawMakeMove]
  );

  useEffect(() => {
    if (!position || gameState.status === 'waiting') return;
    evalAbortRef.current?.abort();
    const controller = new AbortController();
    evalAbortRef.current = controller;
    const timer = setTimeout(() => {
      if (controller.signal.aborted) return;
      fetchEvaluation(position, 12).then((result) => {
        if (!controller.signal.aborted) setEvalResult(result);
      });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [position, gameState.status]);

  useEffect(() => {
    const moves = gameState.moves;
    if (isP2P && moves.length > 0 && moves.length % 5 === 0) syncWithServer();
  }, [gameState.moves.length, isP2P, syncWithServer]);

  useEffect(() => {
    if (isGameOver) { syncWithServer(); hapticNotification('success'); }
  }, [isGameOver, syncWithServer]);

  useEffect(() => {
    if (!tgMode) return;
    const goBack = () => navigate('/');
    showBackButton(goBack);
    return () => hideBackButton();
  }, [navigate]);

  useEffect(() => {
    if (!tgMode) return;
    if (gameState.status === 'waiting' && roomId) {
      showMainButton('Invite Friend', () => shareRoom(roomId));
    } else {
      hideMainButton();
    }
    return () => hideMainButton();
  }, [gameState.status, roomId]);

  const handleShareRoom = useCallback(() => {
    if (roomId) shareRoom(roomId);
  }, [roomId]);

  const evalBarProps = {
    evaluation: evalResult?.scoreCp ?? null,
    isMate: evalResult?.isMate ?? false,
    mateIn: evalResult?.mateIn ?? null,
    height: boardWidth,
    orientation: (playerColor || 'white') as 'white' | 'black',
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--tg-theme-bg-color, #1a1a2e)',
        color: 'var(--tg-theme-text-color, #e0e0e0)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: tgMode ? '4px 8px' : '16px',
        paddingBottom: tgMode ? '80px' : '16px',
      }}
    >
      {/* Header — browser mode only */}
      {!tgMode && (
        <div
          style={{
            width: '100%',
            maxWidth: '800px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '12px',
          }}
        >
          <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 700 }}>P2P Chess</h1>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <ConnectionStatus state={connectionState} peerCount={peerCount} />
            <button
              onClick={handleShareRoom}
              style={{
                padding: '6px 14px',
                borderRadius: '16px',
                border: 'none',
                background: 'var(--tg-theme-button-color, #5865f2)',
                color: 'var(--tg-theme-button-text-color, #fff)',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              Share
            </button>
          </div>
        </div>
      )}

      {/* Compact status bar for TMA */}
      {tgMode && (
        <div style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '2px 0 6px',
        }}>
          <ConnectionStatus state={connectionState} peerCount={peerCount} />
        </div>
      )}

      {/* Game area */}
      <div
        className="game-area"
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '800px',
          width: '100%',
        }}
      >
        {/* Board + Eval bar (desktop) */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
          <div className="eval-bar-desktop">
            <EvalBar {...evalBarProps} />
          </div>
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
          />
        </div>

        {/* Sidebar */}
        <div
          className="game-sidebar"
          style={{
            width: tgMode ? '100%' : '250px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Mobile eval — compact bar below board */}
          <div className="eval-bar-mobile">
            <StockfishInfo
              evalResult={evalResult}
              moveCount={gameState.moves.length}
            />
          </div>

          <GameStatus
            gameState={gameState}
            game={game}
            playerColor={playerColor}
            isMyTurn={isMyTurn}
            isCheck={isCheck}
          />

          {/* Desktop Stockfish info */}
          <div className="eval-bar-desktop">
            <StockfishInfo
              evalResult={evalResult}
              moveCount={gameState.moves.length}
            />
          </div>

          {/* Room info — browser only */}
          {!tgMode && (
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.06))',
                borderRadius: '10px',
                fontSize: '12px',
                color: 'var(--tg-theme-hint-color, #888)',
              }}
            >
              <div>Room: <code style={{ color: 'var(--tg-theme-text-color, #e0e0e0)' }}>{roomId}</code></div>
              <div style={{ marginTop: '4px' }}>
                Transport: {isP2P ? 'P2P' : connectionState === 'WS_CONNECTED' ? 'WS' : connectionState === 'WS_FALLBACK' ? 'WS Fallback' : '...'}
              </div>
            </div>
          )}

          {isGameOver && <GameAnalysis gameId={roomId} />}
        </div>
      </div>
    </div>
  );
}
