import { useEffect, useMemo, useState } from 'react';
import { hrClient } from '@/shared/api/hrClient';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

const CHIP = {
  Inside: 'p-green',
  Out: 'p-grey',
  'On leave': 'p-blue',
  'Off day': 'p-gold',
};

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('')
    .toUpperCase() || '?';
}

export default function StaffBoardPage() {
  const [data, setData] = useState({ cards: [], inside: 0, outside: 0, today: '' });
  const [departments, setDepartments] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const qs = departmentId ? `?departmentId=${departmentId}` : '';
      const [p, d] = await Promise.all([
        hrClient.get(`/presence${qs}`),
        hrClient.get('/departments?activeOnly=true'),
      ]);
      setData(p.data || { cards: [], inside: 0, outside: 0 });
      setDepartments(d.data || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [departmentId]);

  const filtered = useMemo(() => {
    const rx = q.trim() ? new RegExp(q.trim(), 'i') : null;
    return (data.cards || []).filter((c) => {
      if (!rx) return true;
      return (
        rx.test(c.displayName || '') ||
        rx.test(c.employeeNumber || '') ||
        rx.test(c.department?.name || '')
      );
    });
  }, [data.cards, q]);

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead
        title="Staff board"
        description={`Live presence · ${data.today || '—'} · refreshes every 30s`}
      >
        <button type="button" onClick={load} className="btn-ghost">
          Refresh
        </button>
      </PageHead>

      <div className="toolbar">
        <div className="search">
          <span aria-hidden>⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name / # / dept"
          />
        </div>
        <select
          className="sel"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="kpi-card">
          <p className="kpi-value text-[var(--color-teal)]">{data.inside}</p>
          <p className="kpi-label">Inside</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-value">{data.outside}</p>
          <p className="kpi-label">Outside</p>
        </div>
        <div className="kpi-card sm:col-span-2">
          <p className="kpi-value">
            {filtered.length}
            <span className="ml-2 text-base font-normal text-[var(--color-muted)]">
              of {data.cards?.length || 0}
            </span>
          </p>
          <p className="kpi-label">Showing</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--color-muted)]">Loading presence…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((card) => (
            <article key={card._id} className="data-card pad flex items-start gap-3">
              <span className="avatar-sm">{initials(card.displayName)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{card.displayName}</p>
                    <p className="truncate text-xs text-[var(--color-muted)]">
                      {card.employeeNumber} · {card.department?.name || '—'}
                    </p>
                  </div>
                  <span className={`pill ${CHIP[card.chip] || CHIP.Out}`}>{card.chip}</span>
                </div>
                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  {card.day?.timeIn
                    ? `In ${card.day.timeIn}${card.day.timeOut ? ` · Out ${card.day.timeOut}` : ''}`
                    : 'No punch today'}
                  {card.day?.status ? ` · ${card.day.status}` : ''}
                </p>
              </div>
            </article>
          ))}
          {!filtered.length && (
            <p className="text-sm text-[var(--color-muted)]">No staff match this filter.</p>
          )}
        </div>
      )}
    </section>
  );
}
