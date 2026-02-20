// Types
export * from './types';

// Lib
export {
  INITIAL_FEN,
  createGameDoc,
  getGameMap,
  initGameState,
  readGameState,
  requestMove,
  confirmMove,
  rejectMove,
  setGameFinished,
  joinGame,
  getPlayersMap,
  registerPlayer,
  derivePlayerColor,
  syncSeatingToGameMap,
} from './lib/gameState';

export {
  ConnectionManager,
  type ConnectionState,
  type ConnectionManagerOptions,
} from './lib/connectionManager';

export {
  materialEval,
  fetchEvaluation,
} from './lib/evaluation';

// Hooks
export { useYjsSync, type UseYjsSyncOptions, type UseYjsSyncReturn } from './hooks/useYjsSync';
export { useChessGame, type UseChessGameReturn } from './hooks/useChessGame';

// Components
export { ChessBoardComponent } from './components/ChessBoard';
export { GameStatus } from './components/GameStatus';
export { ConnectionStatus } from './components/ConnectionStatus';
export { EvalBar } from './components/EvalBar';
export { StockfishInfo } from './components/StockfishInfo';
