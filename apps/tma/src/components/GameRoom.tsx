import { useEffect } from 'react';
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
} from '@chess/shared';
import { config } from '../config';
import { persistRoom, clearPersistedRoom } from '../App';
import {
  getTelegramUser,
  showMainButton,
  hideMainButton,
  showBackButton,
  hideBackButton,
  shareRoom,
  hapticImpact,
  hapticNotification,
} from '../lib/telegram';

export default function GameRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  if (!roomId) return <div>No room ID</div>;

  useEffect(() => { persistRoom(roomId); }, [roomId]);

  const { doc, connectionState, isConnected, peerCount, connLog } = useYjsSync({
    roomId,
    config,
  });

  const tgUser = getTelegramUser();
  const playerId = tgUser ? `tg_${tgUser.id}` : `anon_${roomId.slice(0, 6)}`;
  const playerName = tgUser ? tgUser.first_name : 'Player';

  useEffect(() => {
    if (!isConnected) return;
    registerPlayer(doc, playerId, playerName, tgUser ? {
      telegramId: tgUser.id,
      username: tgUser.username,
      photoUrl: tgUser.photo_url,
    } : undefined);
    syncSeatingToGameMap(doc);
  }, [isConnected, doc, playerId, playerName, tgUser]);

  const playerColor = derivePlayerColor(doc, playerId);
  const {
    game, gameState, position, isMyTurn, isCheck, kingSquare,
    makeMove, isGameOver, lastMove, possibleMoves, isPending,
  } = useChessGame({ doc, playerColor });

  // Haptic feedback on move confirmation
  useEffect(() => {
    if (gameState.moves.length > 0) hapticImpact('light');
  }, [gameState.moves.length]);

  useEffect(() => {
    if (gameState.moveError) hapticNotification('error');
  }, [gameState.moveError]);

  // Back button
  useEffect(() => {
    const goBack = () => {
      clearPersistedRoom();
      navigate('/');
    };
    showBackButton(goBack);
    return () => hideBackButton();
  }, [navigate]);

  // Main button: invite when waiting
  useEffect(() => {
    if (gameState.status === 'waiting') {
      showMainButton('Invite Friend', () => shareRoom(roomId));
    } else {
      hideMainButton();
    }
    return () => hideMainButton();
  }, [gameState.status, roomId]);

  const boardWidth = Math.min(window.innerWidth - 16, 480);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minHeight: '100vh', padding: '4px 8px', paddingBottom: '80px',
      background: 'var(--tg-theme-bg-color, #1a1a2e)',
      color: 'var(--tg-theme-text-color, #fff)',
    }}>
      {/* Compact status bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        width: '100%', padding: '6px 4px', marginBottom: '4px',
      }}>
        <ConnectionStatus state={connectionState} peerCount={peerCount} />
        <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color, #888)' }}>
          {playerColor === 'white' ? '♔' : playerColor === 'black' ? '♚' : '👁'}
          {' '}{isMyTurn ? 'Your turn' : isPending ? 'Confirming...' : 'Wait'}
        </div>
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
        isPending={isPending}
      />

      <div style={{ width: '100%', maxWidth: `${boardWidth}px`, marginTop: '8px' }}>
        <GameStatus
          gameState={gameState}
          game={game}
          playerColor={playerColor}
          isMyTurn={isMyTurn}
          isCheck={isCheck}
          isPending={isPending}
        />
      </div>
    </div>
  );
}
