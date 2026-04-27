import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppSelector, useAppDispatch } from './redux';
import { addNotification } from '../store/uiSlice';

export type SocketEventMap = {
  'kot:rejected': (data: { kot_number?: string; reason?: string; order_id?: string }) => void;
  'order:status:changed': (data: { order_id?: string; status?: string; reason?: string }) => void;
};

export function useSocket() {
  const token = useAppSelector((s) => s.auth.token);
  const dispatch = useAppDispatch();
  // useState (not useRef) so consumer effects re-run when the socket connects.
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const url = import.meta.env.VITE_REALTIME_SERVICE_URL ?? 'http://localhost:3008';
    console.log('[useSocket] Connecting to', url);
    const s = io(url, {
      auth: { token },
      transports: ['websocket']
    });
    setSocket(s);
    const socket = s;

    socket.on('connect', () => console.log('[useSocket] CONNECTED, socket id:', socket.id));
    socket.on('connect_error', (err: Error) => console.error('[useSocket] CONNECT ERROR:', err.message));
    socket.on('disconnect', (reason: string) => console.warn('[useSocket] DISCONNECTED:', reason));
    socket.onAny((event: string, ...args: unknown[]) => console.log('[useSocket] event:', event, args));

    socket.on('order:new', (data: { order_number: string; table_name?: string }) => {
      dispatch(
        addNotification({
          message: `New order ${data.order_number}${data.table_name ? ` at ${data.table_name}` : ''}`,
          type: 'info'
        })
      );
    });

    socket.on('kot:ready', (data: { table_name?: string }) => {
      dispatch(
        addNotification({
          message: `KOT ready${data.table_name ? ` at ${data.table_name}` : ''}`,
          type: 'success'
        })
      );
    });

    socket.on('kot:rejected', (data: { kot_number?: string; reason?: string }) => {
      dispatch(
        addNotification({
          message: `Kitchen rejected ${data.kot_number ?? 'KOT'}: ${data.reason ?? 'Unable to fulfill'}`,
          type: 'error'
        })
      );
    });

    socket.on('order:unbilled_alert', (data: { order_number?: string; previous_status?: string }) => {
      dispatch(
        addNotification({
          message: `⚠️ ${data.order_number ?? 'Order'} was ${data.previous_status ?? 'in progress'} at end of day but was never billed. Please review.`,
          type: 'error'
        })
      );
    });

    socket.on('inventory:critical', (data: { ingredient_name: string }) => {
      dispatch(
        addNotification({
          message: `CRITICAL: ${data.ingredient_name} out of stock`,
          type: 'error'
        })
      );
    });

    return () => {
      socket.disconnect();
      setSocket(null);
    };
  }, [token, dispatch]);

  return socket;
}
