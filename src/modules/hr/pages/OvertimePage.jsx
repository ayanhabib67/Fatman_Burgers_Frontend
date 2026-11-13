import { useEffect, useState } from 'react';
import { hrClient } from '@/shared/api/hrClient';
import { useHrAuth } from '@/shared/hr/HrAuthContext';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

function monthKeyFromDate(d = new Date()) {
  const day = d.getDate();
  let y = d.getFullYear();
  let m = d.getMonth() + 1;
  if (day >= 26) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return { year: y, month: m };
}

function overtimePill(status) {
  if (status === 'running') return 'p-blue';
  if (status === 'complete' || status === 'completed') return 'p-green';
  return 'p-grey';
}

export default function OvertimePage() {
  const { user } = useHrAuth();
  const canStart = user?.hrRole === 'admin';
  const isHr = user?.hrRole === 'admin';
  const initial = monthKeyFromDate();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [items, setItems] = useState([]);
  const [range, setRange] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    employeeId: '',
    task: '',
    startedAt: '',
  });

  const load = async () => {
    const res = await hrClient.get(
      `/overtime?year=${year}&month=${month}&q=${encodeURIComponent(q)}`
    );
    setItems(res.data.items || []);
    setRange(res.data.range || null);
    if (canStart) {
      const e = await hrClient.get('/employees?status=active&limit=100');
      setEmployees(e.data.items || []);
    }
  };

  useEffect(() => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setForm((f) => ({ ...f, startedAt: local }));
    load().catch((err) => toast(err.message, 'error'));
  }, [year, month]);

  const start = async (e) => {
    e.preventDefault();
    try {
      await hrClient.post('/overtime', {
        employeeId: form.employeeId,
        task: form.task,
        startedAt: new Date(form.startedAt).toISOString(),
      });
      toast('Overtime started');
      setForm((f) => ({ ...f, task: '' }));
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const end = async (id) => {
    try {
      await hrClient.post(`/overtime/${id}/end`);
      toast('Overtime ended');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const remove = async (id) => {
    try {
      await hrClient.delete(`/overtime/${id}`);
      toast('Deleted');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead
        title="Overtime"
        description={`Attendance month ${String(month).padStart(2, '0')}/${year}${
          range ? ` · ${range.start} → ${range.end}` : ''
        }`}
      />

      <div className="toolbar">
        <input
          type="number"
          className="sel w-24"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        />
        <select
          className="sel"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <div className="search">
          <span aria-hidden>⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => load().catch((err) => toast(err.message, 'error'))}
            placeholder="Search employees…"
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        {canStart && (
          <form onSubmit={start} className="form-panel space-y-3 h-fit">
            <h4>Start session</h4>
            <label className="block text-sm">
              <span className="field-label">Employee</span>
              <select
                required
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                className="field-input"
              >
                <option value="">Select employee</option>
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="field-label">Task</span>
              <input
                required
                placeholder="Task"
                value={form.task}
                onChange={(e) => setForm({ ...form, task: e.target.value })}
                className="field-input"
              />
            </label>
            <label className="block text-sm">
              <span className="field-label">Started at</span>
              <input
                type="datetime-local"
                required
                value={form.startedAt}
                onChange={(e) => setForm({ ...form, startedAt: e.target.value })}
                className="field-input"
              />
            </label>
            <p className="text-xs text-[var(--color-muted)]">
              Working days: earliest start is duty end + 1 hour. Off days / holidays: any time.
            </p>
            <button type="submit" className="btn-teal w-full">
              Start overtime
            </button>
          </form>
        )}

        <div className="data-card overflow-x-auto">
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Task</th>
                <th>Started</th>
                <th>Ended</th>
                <th>Hours</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row._id}>
                  <td>{row.employee?.displayName}</td>
                  <td>{row.task}</td>
                  <td className="whitespace-nowrap">
                    {new Date(row.startedAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap">
                    {row.endedAt ? new Date(row.endedAt).toLocaleString() : '—'}
                  </td>
                  <td>{row.completeHours}</td>
                  <td>
                    <span className={`pill ${overtimePill(row.status)}`}>{row.status}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {row.status === 'running' && canStart && (
                        <button
                          type="button"
                          className="btn-teal"
                          style={{ padding: '4px 8px', fontSize: 11 }}
                          onClick={() => end(row._id)}
                        >
                          End
                        </button>
                      )}
                      {isHr && (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ padding: '4px 8px', fontSize: 11, color: '#b42318' }}
                          onClick={() => remove(row._id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={7} className="text-[var(--color-muted)]">
                    No overtime sessions this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
