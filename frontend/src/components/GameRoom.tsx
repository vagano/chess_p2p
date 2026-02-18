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
import {
  isTelegram,
  getTelegramUser,
  hapticImpact,
  hapticNotification,
  showBackButton,
  hideBackButton,
  showMainButton,
  hideMainButton,
} from '../lib/telegram';

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

  // Conflict-free player color: derived from a Y.Map where each client writes to its OWN key
  const [playerColor, setPlayerColor] = useState<'white' | 'black' | null>(null);

  // Register this player in the shared "players" map (unique key = no CRDT conflicts)
  useEffect(() => {
    const tgUser = getTelegramUser();
    registerPlayer(doc, playerId, playerName, tgUser ? {
      telegramId: tgUser.id,
      username: tgUser.username,
      photoUrl: tgUser.photo_url,
    } : undefined);
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

  // Responsive board size — account for eval bar (28px) + gaps
  useEffect(() => {
    const updateSize = () => {
      const isMobile = window.innerWidth <= 600;
      const w = isMobile
        ? window.innerWidth - 48       // eval bar (28) + padding (20)
        : Math.min(window.innerWidth - 320, 560);
      setBoardWidth(Math.max(240, w));
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const { game, gameState, position, isMyTurn, makeMove: rawMakeMove, isGameOver, lastMove, possibleMoves } =
    useChessGame({ doc, playerColor });

  const makeMove = useCallback(
    (...args: Parameters<typeof rawMakeMove>) => {
      const result = rawMakeMove(...args);
      if (result) {
        hapticImpact('light');
      } else if (isTelegram()) {
        hapticNotification('error');
      }
      return result;
    },
    [rawMakeMove]
  );

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

  // Sync on game over + haptic
  useEffect(() => {
    if (isGameOver) {
      syncWithServer();
      hapticNotification('success');
    }
  }, [isGameOver, syncWithServer]);

  // Telegram BackButton — navigate home
  useEffect(() => {
    if (!isTelegram()) return;
    const goBack = () => navigate('/');
    showBackButton(goBack);
    return () => hideBackButton();
  }, [navigate]);

  // Telegram MainButton — "Invite Friend" while waiting
  useEffect(() => {
    if (!isTelegram()) return;
    if (gameState.status === 'waiting' && roomId) {
      const botUsername = import.meta.env.VITE_TG_BOT_USERNAME || '';
      const appName = import.meta.env.VITE_TG_APP_NAME || '';
      showMainButton('Invite Friend', () => {
        if (botUsername && appName) {
          const link = `https://t.me/${botUsername}/${appName}?startapp=${roomId}`;
          window.Telegram?.WebApp?.openTelegramLink(link);
        }
      });
    } else {
      hideMainButton();
    }
    return () => hideMainButton();
  }, [gameState.status, roomId]);

  const handleShareRoom = useCallback(() => {
    if (isTelegram()) {
      const botUsername = import.meta.env.VITE_TG_BOT_USERNAME || '';
      const appName = import.meta.env.VITE_TG_APP_NAME || '';
      if (botUsername && appName && roomId) {
        const link = `https://t.me/${botUsername}/${appName}?startapp=${roomId}`;
        window.Telegram?.WebApp?.openTelegramLink(link);
        return;
      }
    }
    navigator.clipboard.writeText(window.location.href);
  }, [roomId]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--tg-theme-bg-color, #f5f5f5)',
        color: 'var(--tg-theme-text-color, #333)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px',
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
          marginBottom: '12px',
        }}
      >
        <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 700 }}>P2P Chess</h1>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <ConnectionStatus state={connectionState} peerCount={peerCount} />
          <button
            onClick={handleShareRoom}
            style={{
              padding: '8px 16px',
              borderRadius: '20px',
              border: 'none',
              background: 'var(--tg-theme-button-color, #1976d2)',
              color: 'var(--tg-theme-button-text-color, #fff)',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            {isTelegram() ? 'Invite' : 'Copy Link'}
          </button>
        </div>
      </div>

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
        {/* Board + Eval bar */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
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
          className="game-sidebar"
          style={{
            width: '250px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
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
              padding: '10px 14px',
              background: 'var(--tg-theme-secondary-bg-color, #fff)',
              borderRadius: '8px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
              fontSize: '12px',
              color: 'var(--tg-theme-hint-color, #888)',
            }}
          >
            <div>Room: <code>{roomId}</code></div>
            <div style={{ marginTop: '4px' }}>
              Transport: {isP2P ? 'P2P' : connectionState === 'WS_CONNECTED' ? 'WS' : connectionState === 'WS_FALLBACK' ? 'WS Fallback' : '...'}
            </div>
          </div>

          {isGameOver && <GameAnalysis gameId={roomId} />}
        </div>
      </div>
    </div>
  );
}
