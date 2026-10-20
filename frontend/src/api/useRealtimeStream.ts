import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '../components/ui/Toast';

interface RealtimeStreamState {
  isConnected: boolean;
  isOffline: boolean;
  lastEventTime: Date | null;
}

export function useRealtimeStream(): RealtimeStreamState {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isConnected, setIsConnected] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [lastEventTime, setLastEventTime] = useState<Date | null>(null);
  const toastDebounceRef = useRef<number>(0);

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      queryClient.invalidateQueries();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queryClient]);

  // Connect to Server-Sent Events stream (/api/stream)
  useEffect(() => {
    // If browser doesn't support EventSource, rely on query polling
    if (typeof EventSource === 'undefined') {
      return;
    }

    const eventSourceUrl = '/api/stream';
    let es: EventSource | null = null;
    let retryTimeout: any = null;

    const connectSSE = () => {
      try {
        es = new EventSource(eventSourceUrl);

        es.addEventListener('connect', () => {
          setIsConnected(true);
        });

        es.addEventListener('data_update', () => {
          const now = new Date();
          setLastEventTime(now);

          // Invalidate active queries without resetting scroll or state
          queryClient.invalidateQueries();

          // Show subtle notification toast (debounced to avoid multiple toasts in 5 seconds)
          const nowTs = Date.now();
          if (nowTs - toastDebounceRef.current > 5000) {
            toastDebounceRef.current = nowTs;
            toast('New data available', 'info', 3000);
          }
        });

        es.onerror = () => {
          setIsConnected(false);
          if (es) {
            es.close();
            es = null;
          }
          // Retry connecting with backoff
          retryTimeout = setTimeout(connectSSE, 10000);
        };
      } catch (err) {
        setIsConnected(false);
        retryTimeout = setTimeout(connectSSE, 10000);
      }
    };

    connectSSE();

    return () => {
      if (retryTimeout) clearTimeout(retryTimeout);
      if (es) es.close();
    };
  }, [queryClient, toast]);

  return { isConnected, isOffline, lastEventTime };
}
