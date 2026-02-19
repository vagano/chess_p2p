import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Home } from './components/Home';
import { GameRoom } from './components/GameRoom';
import { getStartParam } from './lib/telegram';

function StartParamRedirect() {
  const startParam = getStartParam();
  console.log('[StartParamRedirect] start_param:', startParam);
  if (startParam) {
    return <Navigate to={`/room/${startParam}`} replace />;
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
