import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { removeNotification } from '../store/uiSlice';

export default function ToastContainer() {
  const notifications = useAppSelector((s) => s.ui.notifications);
  const dispatch = useAppDispatch();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {notifications.map((n) => (
        <Toast key={n.id} id={n.id} message={n.message} type={n.type} onDismiss={() => dispatch(removeNotification(n.id))} />
      ))}
    </div>
  );
}

function Toast({
  id,
  message,
  type,
  onDismiss
}: {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  onDismiss: () => void;
}) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const t = setTimeout(() => dispatch(removeNotification(id)), 4000);
    return () => clearTimeout(t);
  }, [id, dispatch]);

  const colors = {
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    error: 'bg-red-50 border-red-200 text-red-800'
  };

  const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border shadow-md animate-in slide-in-from-right ${colors[type]}`}>
      <span className="font-bold text-sm">{icons[type]}</span>
      <span className="text-sm flex-1">{message}</span>
      <button onClick={onDismiss} className="text-xs opacity-60 hover:opacity-100">✕</button>
    </div>
  );
}
