import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getStartParam } from './lib/telegram';
import Home from './components/Home';
import GameRoom from './components/GameRoom';

const ROOM_KEY = 'tma_roomId';

export function persistRoom(roomId: string): void {
  try { sessionStorage.setItem(ROOM_KEY, roomId); } catch { /* noop */ }
}

export function clearPersistedRoom(): void {
  try { sessionStorage.removeItem(ROOM_KEY); } catch { /* noop */ }
}

function StartParamRedirect() {
  const startParam = getStartParam();
  if (startParam) {
    return <Navigate to={`/room/${startParam}`} replace />;
  }
  const saved = sessionStorage.getItem(ROOM_KEY);
  if (saved) {
    return <Navigate to={`/room/${saved}`} replace />;
  }
  return <Home />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StartParamRedirect />} />
        <Route path="/room/:roomId" element={<GameRoom />} />
      </Routes>
    </BrowserRouter>
  );
}
