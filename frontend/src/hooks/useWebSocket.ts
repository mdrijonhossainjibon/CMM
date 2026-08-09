import { useState, useCallback, useRef, useEffect } from 'react';
import { getWsBaseURL } from '../services/apiClient';

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY = 2000;

export function useWebSocket(path: string | null) {
  const [messages, setMessages] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!path) {
      cleanup();
      setIsConnected(false);
      return;
    }

    const fullUrl = `${getWsBaseURL()}${path}`;

    const doConnect = () => {
      if (!mountedRef.current) return;

      try {
        const ws = new WebSocket(fullUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!mountedRef.current) return;
          setIsConnected(true);
          reconnectAttempts.current = 0;
        };

        ws.onclose = () => {
          if (!mountedRef.current) return;
          setIsConnected(false);
          wsRef.current = null;

          if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(
              RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempts.current),
              30000
            );
            reconnectAttempts.current += 1;
            reconnectTimer.current = setTimeout(doConnect, delay);
          }
        };

        ws.onerror = () => {
          if (!mountedRef.current) return;
          setIsConnected(false);
        };

        ws.onmessage = (event) => {
          if (!mountedRef.current) return;
          setMessages((prev) => [...prev, event.data]);
        };
      } catch {
        if (!mountedRef.current) return;
        setIsConnected(false);
      }
    };

    doConnect();

    return () => {
      mountedRef.current = false;
      cleanup();
      setIsConnected(false);
      reconnectAttempts.current = MAX_RECONNECT_ATTEMPTS;
    };
  }, [path, cleanup]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isConnected, clearMessages };
}
