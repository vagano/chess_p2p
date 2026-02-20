import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import GameRoom from './components/GameRoom';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:roomId" element={<GameRoom />} />
      </Routes>
    </BrowserRouter>
  );
}
