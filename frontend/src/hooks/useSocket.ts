import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';

const WS_BASE = 'ws://localhost:8080';

export const useSocket = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const token = useSelector((state: RootState) => state.auth.token);

  useEffect(() => {
    const url = token ? `${WS_BASE}?token=${encodeURIComponent(token)}` : WS_BASE;
    const ws = new WebSocket(url);

    ws.onopen = () => setSocket(ws);
    ws.onclose = () => setSocket(null);

    return () => {
      ws.close();
    };
  }, [token]); // reconnect whenever the auth token changes

  return socket;
};
