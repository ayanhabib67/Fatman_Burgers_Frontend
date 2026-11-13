import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { hrClient } from '@/shared/api/hrClient';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Attendance month for a YMD (cutoff 26 → next month). */
function monthKeyFromYmd(ymd, cutoff = 26) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  let year = y;
  let month = m;
  if (d >= cutoff) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { year, month };
}

function monthRange(year, month, cutoff = 26) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const start = `${prevYear}-${pad(prevMonth)}-${pad(cutoff)}`;
  const end = `${year}-${pad(month)}-${pad(cutoff - 1)}`;
  const days = [];
  const cur = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cur <= last) {
    days.push(
      `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`
    );
    cur.setDate(cur.getDate() + 1);
  }
  return { start, end, days };
}

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

function displayStatus(row, beforeJoin, future) {
  if (beforeJoin) return '—';
  if (future && !row?.timeIn) return '—';
  if (!row) return 'Absent';
  if (row.status === 'Late' || row.status === 'Early-departure') return 'Present';
  if (row.status === 'Open' && !row.timeIn) return 'Absent';
  if (row.status === 'Incomplete' || row.status === 'Missing Check-Out') {
    return row.timeIn ? 'Present' : 'Absent';
  }
  return row.status || 'Absent';
}

function weekdayLabel(ymd) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${ymd}T12:00:00`));
  } catch {
    return ymd;
  }
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

export default function EmployeeAttendancePage() {
  const { employeeId } = useParams();
  const [search] = useSearchParams();
  const anchorDate = search.get('date') || todayYmd();
  const initial = monthKeyFromYmd(anchorDate);

  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [employee, setEmployee] = useState(null);
  const [daysMap, setDaysMap] = useState({});
  const [loading, setLoading] = useState(true);

  const { start, end, days } = useMemo(
    () => monthRange(year, month, 26),
    [year, month]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [empRes, attRes] = await Promise.all([
        hrClient.get(`/employees/${employeeId}`),
        hrClient.get(
          `/attendance?employeeId=${employeeId}&from=${start}&to=${end}&limit=100`
        ),
      ]);
      setEmployee(empRes.data);
      const map = {};
      for (const row of attRes.data || []) {
        map[row.workDate] = row;
      }
      setDaysMap(map);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [employeeId, start, end]);

  const shiftMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };

  const summary = useMemo(() => {
    const today = todayYmd();
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    for (const d of days) {
      if (d > today) continue;
      if (employee?.joiningDate && d < employee.joiningDate) continue;
      const row = daysMap[d];
      const st = displayStatus(row, false, false);
      if (st === 'Present') present += 1;
      else if (st === 'Absent') absent += 1;
      else if (st === 'Leave' || st === 'Lieu' || st === 'Official-leave') leave += 1;
      if (row?.status === 'Late' || (row?.lateMinutes || 0) > 0) late += 1;
    }
    return { present, absent, late, leave };
  }, [days, daysMap, employee]);

  const monthLabel = `${pad(month)}/${year}`;

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead
        title={employee?.displayName || 'Employee attendance'}
        description={`Attendance month ${start} → ${end} (26th–25th)`}
      >
        <Link to="/hr/attendance" className="btn-ghost">
          Back to attendance
        </Link>
        <button type="button" className="btn-ghost" onClick={() => shiftMonth(-1)}>
          Previous month
        </button>
        <button type="button" className="btn-ghost" onClick={() => shiftMonth(1)}>
          Next month
        </button>
      </PageHead>

      {employee ? (
        <div className="emp-form-section flex flex-wrap items-center gap-4">
          {employee.photoUrl ? (
            <img src={employee.photoUrl} alt="" className="att-avatar" style={{ width: 56, height: 56 }} />
          ) : (
            <span className="att-avatar att-avatar-fallback" style={{ width: 56, height: 56, fontSize: 14 }}>
              {initials(employee.displayName)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-base">{employee.displayName}</p>
            <p className="text-sm text-[var(--color-muted)]">
              {employee.employeeNumber}
              {employee.department?.name ? ` · ${employee.department.name}` : ''}
              {employee.designation ? ` · ${employee.designation}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="pill p-grey">Month {monthLabel}</span>
            <span className="pill p-green">Present {summary.present}</span>
            <span className="pill p-red">Absent {summary.absent}</span>
            <span className="pill p-amber">Late {summary.late}</span>
            <span className="pill p-blue">Leave {summary.leave}</span>
          </div>
        </div>
      ) : null}

      <div className="data-card overflow-x-auto">
        {loading ? (
          <p className="p-6 text-[var(--color-muted)]">Loading month…</p>
        ) : (
          <table className="data-table att-day-table min-w-[760px]">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th>Date</th>
                <th>IN</th>
                <th>OUT</th>
                <th>Status</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, idx) => {
                const row = daysMap[d];
                const beforeJoin = employee?.joiningDate && d < employee.joiningDate;
                const future = d > todayYmd();
                const status = displayStatus(row, beforeJoin, future);
                const remark = beforeJoin
                  ? 'Not joined yet'
                  : future && !row?.timeIn
                    ? '—'
                    : row?.remark ||
                      (!row?.timeIn && status === 'Absent' ? 'No gate punches' : '') ||
                      '—';
                const tags = [];
                if (row?.status === 'Late' || (row?.lateMinutes || 0) > 0) tags.push('Late');
                if (
                  row?.status === 'Early-departure' ||
                  ((row?.earlyMinutes || 0) > 0 && row?.timeOut)
                ) {
                  tags.push('Early');
                }

                return (
                  <tr key={d}>
                    <td className="text-[var(--color-muted)]">{idx + 1}</td>
                    <td>
                      <div className="font-medium">{weekdayLabel(d)}</div>
                      <div className="text-xs text-[var(--color-muted)]">{d}</div>
                      {tags.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {tags.map((t) => (
                            <span key={t} className="att-tag">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap">
                      {beforeJoin || (future && !row?.timeIn) ? '—' : formatAmPm(row?.timeIn)}
                    </td>
                    <td className="whitespace-nowrap">
                      {beforeJoin || (future && !row?.timeOut) ? '—' : formatAmPm(row?.timeOut)}
                    </td>
                    <td>
                      {status === '—' ? (
                        '—'
                      ) : (
                        <span className={`pill ${statusPill(status)}`}>{status}</span>
                      )}
                    </td>
                    <td className="text-xs text-[var(--color-muted)] max-w-[260px]">
                      {remark}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
