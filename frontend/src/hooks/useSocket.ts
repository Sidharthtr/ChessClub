import { useEffect, useState } from 'react';

const WS_URL =  'ws://localhost:8080';

export const useSocket = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Create WebSocket connection
    const ws = new WebSocket(WS_URL);

    // When WebSocket connection is open, set the socket state
    ws.onopen = () => {
      console.log('WebSocket connected');
      setSocket(ws);
    };

    // Handle WebSocket closure
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setSocket(null);
    };

    // Cleanup WebSocket on component unmount
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  return socket;
};
