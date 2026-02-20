import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ready } from './lib/telegram';
import App from './App';
import './index.css';

ready();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
