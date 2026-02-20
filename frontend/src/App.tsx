import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './components/Home';
import { GameRoom } from './components/GameRoom';
import { getStartParam, isTelegram } from './lib/telegram';

const ROOM_KEY = 'p2p_chess_room';

/** Save current roomId so we can restore after TMA WebView reload */
export function persistRoom(roomId: string): void {
  try { sessionStorage.setItem(ROOM_KEY, roomId); } catch { /* noop */ }
}

/** Clear persisted room so Back button can navigate to Home */
export function clearPersistedRoom(): void {
  try { sessionStorage.removeItem(ROOM_KEY); } catch { /* noop */ }
}

function StartParamRedirect() {
  const startParam = getStartParam();
  console.log('[StartParamRedirect] start_param:', startParam);

  // 1) Telegram deep link: startapp=roomId
  if (startParam) {
    persistRoom(startParam);
    return <Navigate to={`/room/${startParam}`} replace />;
  }

  // 2) Restore after TMA WebView reload
  if (isTelegram()) {
    try {
      const saved = sessionStorage.getItem(ROOM_KEY);
      if (saved) {
        console.log('[StartParamRedirect] restoring room from session:', saved);
        return <Navigate to={`/room/${saved}`} replace />;
      }
    } catch { /* noop */ }
  }

  return <Home />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StartParamRedirect />} />
        <Route path="/room/:roomId" element={<GameRoom />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
