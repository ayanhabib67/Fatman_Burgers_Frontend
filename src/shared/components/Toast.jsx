import { useEffect, useState } from 'react';

let pushToast = () => {};

export function toast(message, tone = 'ok') {
  pushToast({ message, tone, id: Date.now() });
}

export function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    pushToast = (item) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, 3200);
    };
  }, []);

  if (!items.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm shadow"
          style={{
            borderColor:
              item.tone === 'error' ? 'var(--color-danger)' : 'var(--color-border)',
          }}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
