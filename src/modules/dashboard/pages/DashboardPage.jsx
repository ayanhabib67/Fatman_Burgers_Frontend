import { useEffect, useState } from 'react';
import { posPing } from '@/shared/api/posRpc';
import { outboxCount, loadState } from '@/shared/offline/store';

export default function DashboardPage() {
  const [ping, setPing] = useState(null);
  const [error, setError] = useState('');
  const waiting = outboxCount(loadState());

  useEffect(() => {
    let active = true;

    posPing()
      .then((res) => {
        if (active) setPing(res);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Backend not reachable');
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="space-y-4">
      <div className="page-card">
        <h3 className="mb-1 text-xl font-semibold">FatMan POS engine</h3>
        <p className="text-[var(--color-muted)]">
          Business logic Express pe hai, data MongoDB pe. Offline outbox till pe
          rehti hai jab tak sync confirm na ho.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="page-card">
          <p className="text-sm text-[var(--color-muted)]">RPC ping</p>
          <p className="mt-2 text-2xl font-semibold text-[var(--color-brand)]">
            {error ? 'Offline' : ping?.ok ? 'OK' : 'Checking...'}
          </p>
        </div>
        <div className="page-card">
          <p className="text-sm text-[var(--color-muted)]">FatMan PINs</p>
          <p className="mt-2 text-2xl font-semibold">
            {ping?.outlets?.fatman ? 'Ready' : ping ? 'Not set' : '...'}
          </p>
        </div>
        <div className="page-card">
          <p className="text-sm text-[var(--color-muted)]">Outbox waiting</p>
          <p className="mt-2 text-2xl font-semibold">{waiting}</p>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-[var(--color-danger)]">
          {error}. Backend chalao: <code>cd backend && npm run dev</code>. Mongo
          ke baad PINs: <code>npm run set-pins</code>.
        </p>
      ) : null}

      {ping?.ok && !ping?.outlets?.fatman ? (
        <p className="text-sm text-[var(--color-muted)]">
          Mongo connected hai lekin FatMan PINs set nahi. Backend folder mein{' '}
          <code>npm run set-pins</code> chalao.
        </p>
      ) : null}
    </section>
  );
}
