import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../redux/store';

// In Docker/production: VITE_WS_URL is unset — we derive the URL from window.location
// so the browser connects back to nginx (same host), and nginx proxies /ws → backend.
// In local dev (no Docker): set VITE_WS_URL=ws://localhost:8080 in frontend/.env.local
function getWsBase(): string {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL as string;
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${window.location.host}/ws`;
}

export const useSocket = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const token = useSelector((state: RootState) => state.auth.token);

  useEffect(() => {
    const base = getWsBase();
    const url = token ? `${base}?token=${encodeURIComponent(token)}` : base;
    const ws = new WebSocket(url);

    ws.onopen = () => setSocket(ws);
    ws.onclose = () => setSocket(null);

    return () => ws.close();
  }, [token]);

  return socket;
};
