import { useState, useCallback, useRef, useEffect } from 'react';

export function usePolling<T>(
  fetcher: () => Promise<T>,
  interval: number,
  enabled = true
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetcherRef = useRef(fetcher);
  const mountedRef = useRef(true);

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setLoading(false);
      return;
    }

    const doFetch = async () => {
      if (!mountedRef.current) return;
      try {
        const result = await fetcherRef.current();
        if (!mountedRef.current) return;
        setData(result);
        setError(null);
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Polling failed');
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };

    doFetch();
    intervalRef.current = setInterval(doFetch, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [interval, enabled]);

  const refetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Polling failed');
      }
    }
  }, []);

  return { data, loading, error, refetch };
}
