import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hrClient } from '@/shared/api/hrClient';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

function todayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

/** HH:mm (24h) → h:mm AM/PM */
function formatAmPm(hm) {
  if (!hm) return '—';
  const [hRaw, mRaw] = String(hm).split(':');
  let h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return String(hm);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

function statusPill(status) {
  if (status === 'Present') return 'p-green';
  if (status === 'Absent') return 'p-red';
  if (status === 'Half-day') return 'p-purple';
  if (status === 'Late') return 'p-amber';
  if (status === 'Early-departure') return 'p-gold';
  if (status === 'Leave' || status === 'Lieu' || status === 'Official-leave') return 'p-blue';
  if (status === 'Weekend' || status === 'Public-holiday') return 'p-grey';
  return 'p-amber';
}

function nameBadges(row) {
  const tags = [];
  if (row.status === 'Late' || (row.lateMinutes > 0 && row.timeIn)) tags.push('Late');
  if (row.status === 'Early-departure' || (row.earlyMinutes > 0 && row.timeOut)) {
    tags.push('Early');
  }
  if (row.status === 'Late' && tags.includes('Late') && !tags.includes('Early') && row.earlyMinutes > 0) {
    tags.push('Early');
  }
  return [...new Set(tags)];
}

function displayStatus(row) {
  if (!row) return 'Absent';
  if (row.status === 'Late') return 'Present';
  if (row.status === 'Early-departure') return 'Present';
  if (row.status === 'Open' && !row.timeIn) return 'Absent';
  if (row.status === 'Incomplete' || row.status === 'Missing Check-Out') {
    return row.timeIn ? 'Present' : 'Absent';
  }
  return row.status || 'Absent';
}

export default function AttendancePage() {
  const [workDate, setWorkDate] = useState(todayYmd());
  const [departmentId, setDepartmentId] = useState('');
  const [q, setQ] = useState('');
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [daysByEmp, setDaysByEmp] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    hrClient
      .get('/departments?activeOnly=true')
      .then((res) => setDepartments(res.data || []))
      .catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: 'active',
        limit: '200',
        page: '1',
      });
      if (q.trim()) params.set('q', q.trim());
      if (departmentId) params.set('departmentId', departmentId);

      const [empRes, attRes] = await Promise.all([
        hrClient.get(`/employees?${params}`),
        hrClient.get(`/attendance?workDate=${workDate}&limit=500`),
      ]);

      setEmployees(empRes.data.items || []);
      const map = {};
      for (const row of attRes.data || []) {
        const id = String(row.employee?._id || row.employee || '');
        if (id) map[id] = row;
      }
      setDaysByEmp(map);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [workDate, departmentId]);

  useEffect(() => {
    const t = setTimeout(() => load(), 280);
    return () => clearTimeout(t);
  }, [q]);

  const rows = useMemo(() => {
    return (employees || []).map((emp) => {
      const day = daysByEmp[emp._id] || null;
      const beforeJoin = emp.joiningDate && workDate < emp.joiningDate;
      return { emp, day, beforeJoin };
    });
  }, [employees, daysByEmp, workDate]);

  const shiftDay = (delta) => {
    const d = new Date(`${workDate}T12:00:00`);
    d.setDate(d.getDate() + delta);
    const pad = (n) => String(n).padStart(2, '0');
    setWorkDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead title="Attendance" description="Daily IN / OUT for every employee">
        <button type="button" className="btn-ghost" onClick={() => shiftDay(-1)}>
          Previous day
        </button>
        <button type="button" className="btn-ghost" onClick={() => setWorkDate(todayYmd())}>
          Today
        </button>
        <button type="button" className="btn-ghost" onClick={() => shiftDay(1)}>
          Next day
        </button>
      </PageHead>

      <div className="toolbar">
        <div className="search">
          <span aria-hidden>⌕</span>
          <input
            placeholder="Search employees…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <input
          type="date"
          className="sel"
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
        />
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

      <div className="data-card overflow-x-auto">
        {loading ? (
          <p className="p-6 text-[var(--color-muted)]">Loading attendance…</p>
        ) : (
          <table className="data-table att-day-table min-w-[860px]">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>Employee</th>
                <th>Department</th>
                <th>IN</th>
                <th>OUT</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-[var(--color-muted)]">
                    No employees found.
                  </td>
                </tr>
              ) : (
                rows.map(({ emp, day, beforeJoin }, idx) => {
                  const status = beforeJoin ? '—' : displayStatus(day);
                  const badges = beforeJoin || !day ? [] : nameBadges(day);
                  const remark = beforeJoin
                    ? 'Not joined yet'
                    : day?.remark ||
                      (!day?.timeIn && status === 'Absent' ? 'No gate punches' : '') ||
                      '—';
                  const dept =
                    emp.department?.name ||
                    day?.employee?.department?.name ||
                    '—';

                  return (
                    <tr key={emp._id}>
                      <td className="text-[var(--color-muted)]">{idx + 1}</td>
                      <td>
                        <div className="att-emp">
                          {emp.photoUrl ? (
                            <img src={emp.photoUrl} alt="" className="att-avatar" />
                          ) : (
                            <span className="att-avatar att-avatar-fallback">
                              {initials(emp.displayName)}
                            </span>
                          )}
                          <div className="att-emp-meta">
                            <div className="att-emp-name">
                              <Link
                                to={`/hr/attendance/${emp._id}?date=${workDate}`}
                                className="font-semibold text-[var(--color-teal)] hover:underline"
                              >
                                {emp.displayName}
                              </Link>
                              {badges.map((b) => (
                                <span key={b} className="att-tag">
                                  {b}
                                </span>
                              ))}
                            </div>
                            <div className="text-xs text-[var(--color-muted)]">
                              {emp.employeeNumber}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{dept}</td>
                      <td className="whitespace-nowrap">
                        {beforeJoin ? '—' : formatAmPm(day?.timeIn)}
                      </td>
                      <td className="whitespace-nowrap">
                        {beforeJoin ? '—' : formatAmPm(day?.timeOut)}
                      </td>
                      <td>
                        {status === '—' ? (
                          '—'
                        ) : (
                          <span className={`pill ${statusPill(status)}`}>{status}</span>
                        )}
                      </td>
                      <td className="text-xs text-[var(--color-muted)] max-w-[240px]">
                        {remark}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
