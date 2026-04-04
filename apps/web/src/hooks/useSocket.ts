import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppSelector, useAppDispatch } from './redux';
import { addNotification } from '../store/uiSlice';

export function useSocket() {
  const token = useAppSelector((s) => s.auth.token);
  const dispatch = useAppDispatch();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(
      import.meta.env.VITE_REALTIME_SERVICE_URL ?? 'http://localhost:3008',
      {
        auth: { token },
        transports: ['websocket']
      }
    );
    socketRef.current = socket;

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
    };
  }, [token, dispatch]);

  return socketRef;
}
