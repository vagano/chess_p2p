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
import { persistRoom, clearPersistedRoom } from '../App';
import { fetchEvaluation, type EvalResult } from '../lib/evaluation';
import { config } from '../lib/config';
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

interface DiagResult {
  http: string;
  ws: string;
  sig: string;
  err: string;
}

async function runConnectionDiag(wsUrl: string, sigUrl: string, apiBase: string): Promise<DiagResult> {
  const result: DiagResult = { http: '...', ws: '...', sig: '...', err: '' };

  // 1) HTTP health check
  try {
    const resp = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(5000) });
    result.http = resp.ok ? `OK ${resp.status}` : `FAIL ${resp.status}`;
  } catch (e: unknown) {
    result.http = `ERR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 2) Raw WebSocket to /ws/diag-test
  try {
    await new Promise<void>((resolve, reject) => {
      const url = `${wsUrl}/diag-test-${Date.now()}`;
      const socket = new WebSocket(url);
      const timer = setTimeout(() => { socket.close(); reject(new Error('timeout 5s')); }, 5000);
      socket.onopen = () => { clearTimeout(timer); result.ws = 'OPEN'; socket.close(); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('onerror')); };
      socket.onclose = (ev) => {
        clearTimeout(timer);
        if (result.ws !== 'OPEN') reject(new Error(`closed ${ev.code} ${ev.reason || 'no reason'}`));
      };
    });
  } catch (e: unknown) {
    result.ws = `ERR: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 3) Raw WebSocket to /signaling
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(sigUrl);
      const timer = setTimeout(() => { socket.close(); reject(new Error('timeout 5s')); }, 5000);
      socket.onopen = () => {
        clearTimeout(timer);
        result.sig = 'OPEN';
        socket.send(JSON.stringify({ type: 'ping' }));
        setTimeout(() => socket.close(), 200);
        resolve();
      };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('onerror')); };
      socket.onclose = (ev) => {
        clearTimeout(timer);
        if (result.sig !== 'OPEN') reject(new Error(`closed ${ev.code} ${ev.reason || 'no reason'}`));
      };
    });
  } catch (e: unknown) {
    result.sig = `ERR: ${e instanceof Error ? e.message : String(e)}`;
  }

  return result;
}

export function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  if (!roomId) {
    navigate('/');
    return null;
  }

  // Persist roomId so TMA can restore after WebView reload
  persistRoom(roomId);

  const { doc, connectionState, isP2P, syncWithServer, peerCount, connLog } =
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
  const [diag, setDiag] = useState<DiagResult | null>(null);
  const [diagRunning, setDiagRunning] = useState(false);

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
    const goBack = () => {
      clearPersistedRoom();
      navigate('/');
    };
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
          padding: '2px 0 6px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <ConnectionStatus state={connectionState} peerCount={peerCount} />
            <span style={{
              fontSize: '10px',
              fontFamily: 'monospace',
              color: 'var(--tg-theme-hint-color, #888)',
              opacity: 0.7,
            }}>
              {roomId}
            </span>
          </div>
          {/* DEBUG: connection diagnostics */}
          <div style={{
            marginTop: '4px',
            padding: '6px 8px',
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.05)',
            fontSize: '9px',
            fontFamily: 'monospace',
            color: 'var(--tg-theme-hint-color, #888)',
            wordBreak: 'break-all',
          }}>
            <div>state: <b>{connectionState}</b> | peers: {peerCount}</div>
            <div>ws: {config.wsServerUrl}</div>
            <div>sig: {config.signalingServers[0]}</div>
            <div>mode: {config.connectionMode}</div>
            <div>origin: {window.location.origin}</div>
            <div style={{ marginTop: '4px' }}>
              <button
                disabled={diagRunning}
                onClick={() => {
                  setDiagRunning(true);
                  runConnectionDiag(config.wsServerUrl, config.signalingServers[0], config.apiBaseUrl)
                    .then(r => { setDiag(r); setDiagRunning(false); })
                    .catch(() => setDiagRunning(false));
                }}
                style={{
                  fontSize: '9px',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.1)',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {diagRunning ? 'Testing...' : 'Run Network Test'}
              </button>
            </div>
            {diag && (
              <div style={{ marginTop: '4px' }}>
                <div>HTTP /health: <b style={{ color: diag.http.startsWith('OK') ? '#66bb6a' : '#ef5350' }}>{diag.http}</b></div>
                <div>WS /ws: <b style={{ color: diag.ws === 'OPEN' ? '#66bb6a' : '#ef5350' }}>{diag.ws}</b></div>
                <div>SIG /signaling: <b style={{ color: diag.sig === 'OPEN' ? '#66bb6a' : '#ef5350' }}>{diag.sig}</b></div>
                {diag.err && <div>err: {diag.err}</div>}
              </div>
            )}
            {connLog.length > 0 && (
              <div style={{
                marginTop: '4px',
                maxHeight: '120px',
                overflowY: 'auto',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                paddingTop: '4px',
              }}>
                {connLog.map((line, i) => (
                  <div key={i} style={{
                    color: line.includes('ERROR') || line.includes('CLOSE') ? '#ef5350' : 'inherit',
                  }}>{line}</div>
                ))}
              </div>
            )}
          </div>
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
