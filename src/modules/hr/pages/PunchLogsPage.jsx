import { useEffect, useState } from 'react';
import { hrClient } from '@/shared/api/hrClient';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

const pad = (n) => String(n).padStart(2, '0');
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function ingestPill(s) {
  if (s === 'processed') return 'p-green';
  if (s === 'unmapped') return 'p-amber';
  if (s === 'pending') return 'p-blue';
  if (s === 'error') return 'p-red';
  return 'p-grey';
}

export default function PunchLogsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    q: '',
    pin: '',
    status: 'all',
    source: 'all',
    from: todayLocal(),
    to: todayLocal(),
  });

  const load = async (pageOverride) => {
    setLoading(true);
    try {
      const p = pageOverride || page;
      const qs = new URLSearchParams({
        page: String(p),
        limit: '100',
        status: filters.status,
        source: filters.source,
      });
      if (filters.q.trim()) qs.set('q', filters.q.trim());
      if (filters.pin.trim()) qs.set('pin', filters.pin.trim());
      if (filters.from) qs.set('from', `${filters.from}T00:00:00+05:00`);
      if (filters.to) qs.set('to', `${filters.to}T23:59:59+05:00`);

      const res = await hrClient.get(`/punches?${qs.toString()}`);
      const data = res.data || {};
      // backward compat if API still returns array
      if (Array.isArray(data)) {
        setItems(data);
        setTotal(data.length);
        setPages(1);
      } else {
        setItems(data.items || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
        setPage(data.page || p);
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    const t = setInterval(() => load(), 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (e) => {
    e?.preventDefault?.();
    setPage(1);
    load(1);
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead
        title="Punch logs"
        description={`Saari machine / manual / ADMS punches yahan save hain · ${total} records`}
      >
        <button type="button" onClick={() => load(page)} className="btn-ghost">
          Refresh
        </button>
      </PageHead>

      <form onSubmit={apply} className="toolbar flex-wrap">
        <input
          type="date"
          className="sel"
          title="From"
          value={filters.from}
          onChange={(e) => setFilters({ ...filters, from: e.target.value })}
        />
        <input
          type="date"
          className="sel"
          title="To"
          value={filters.to}
          onChange={(e) => setFilters({ ...filters, to: e.target.value })}
        />
        <input
          className="sel"
          value={filters.pin}
          onChange={(e) => setFilters({ ...filters, pin: e.target.value })}
          placeholder="ZK PIN"
        />
        <div className="search">
          <span aria-hidden>⌕</span>
          <input
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
            placeholder="Name / # / device"
          />
        </div>
        <select
          className="sel"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="all">All statuses</option>
          <option value="processed">Processed</option>
          <option value="unmapped">Unmapped</option>
          <option value="pending">Pending</option>
          <option value="error">Error</option>
        </select>
        <select
          className="sel"
          value={filters.source}
          onChange={(e) => setFilters({ ...filters, source: e.target.value })}
        >
          <option value="all">All sources</option>
          <option value="agent">Agent / ADMS</option>
          <option value="manual">Manual</option>
          <option value="import">Import</option>
        </select>
        <button type="submit" className="btn-teal">
          Apply filters
        </button>
      </form>

      <div className="data-card overflow-x-auto">
        {loading ? (
          <p className="p-6 text-sm text-[var(--color-muted)]">Loading logs…</p>
        ) : (
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>Date / time</th>
                <th>PIN</th>
                <th>Employee</th>
                <th>Dir</th>
                <th>Verify</th>
                <th>Source</th>
                <th>Device</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row._id}>
                  <td className="whitespace-nowrap">
                    {new Date(row.eventTimeUtc).toLocaleString('en-GB', {
                      timeZone: 'Asia/Karachi',
                    })}
                  </td>
                  <td className="font-medium">{row.deviceUserPin}</td>
                  <td>
                    {row.employee?.displayName || (
                      <span className="pill p-amber">Unmapped</span>
                    )}
                    {row.employee?.employeeNumber ? (
                      <div className="text-xs text-[var(--color-muted)]">
                        {row.employee.employeeNumber}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`pill ${row.direction === 'IN' ? 'p-green' : 'p-red'}`}>
                      {row.direction}
                    </span>
                  </td>
                  <td>{row.verifyMode || '—'}</td>
                  <td>{row.source}</td>
                  <td className="text-xs">
                    {row.device?.name || row.device?.code || '—'}
                  </td>
                  <td>
                    <span className={`pill ${ingestPill(row.ingestStatus)}`}>
                      {row.ingestStatus}
                    </span>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={8} className="text-[var(--color-muted)]">
                    Is range mein koi punch log nahi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="pager">
        <button
          type="button"
          disabled={page <= 1 || loading}
          className="btn-ghost"
          onClick={() => {
            const next = page - 1;
            setPage(next);
            load(next);
          }}
        >
          Previous
        </button>
        <span>
          Page {page} / {pages}
        </span>
        <button
          type="button"
          disabled={page >= pages || loading}
          className="btn-ghost"
          onClick={() => {
            const next = page + 1;
            setPage(next);
            load(next);
          }}
        >
          Next
        </button>
      </div>
    </section>
  );
}
