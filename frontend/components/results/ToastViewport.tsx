'use client';

import { useEffect, useState } from 'react';
import { subscribeToasts, type ToastItem } from './toast';

export default function ToastViewport() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-brand-black text-white text-sm px-4 py-2.5 rounded-lg shadow-xl pointer-events-auto"
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
