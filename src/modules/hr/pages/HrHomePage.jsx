import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hrClient } from '@/shared/api/hrClient';
import { useHrAuth } from '@/shared/hr/HrAuthContext';
import { toast } from '@/shared/components/Toast';

function nowLabel() {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());
  } catch {
    return new Date().toLocaleString();
  }
}

export default function HrHomePage() {
  const { user } = useHrAuth();
  const [dash, setDash] = useState(null);
  const [clock, setClock] = useState(nowLabel);

  useEffect(() => {
    hrClient
      .get('/dashboard')
      .then((res) => setDash(res.data))
      .catch((err) => toast(err.message, 'error'));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setClock(nowLabel()), 1000);
    return () => clearInterval(id);
  }, []);

  const kpis = dash?.kpis || {};
  const inside = kpis.inside ?? 0;
  const outside = Math.max((kpis.activeEmployees ?? 0) - inside, 0);
  const gateRoll = (kpis.activeEmployees ?? inside + outside) || 0;
  const insidePct = gateRoll ? Math.round((inside / gateRoll) * 100) : 0;
  const outsidePct = gateRoll ? Math.max(100 - insidePct, 0) : 0;

  const leaveMix = useMemo(() => {
    const pending = (kpis.pendingHod || 0) + (kpis.pendingHr || 0);
    const approved = dash?.monthSummary?.leave ?? 0;
    const total = Math.max(pending + approved, 1);
    return {
      pending,
      approved,
      pendingPct: Math.round((pending / total) * 100),
      approvedPct: Math.round((approved / total) * 100),
      total: pending + approved,
    };
  }, [kpis, dash]);

  const welcomeName = dash?.header?.welcome || user?.displayName || 'there';
  const role = dash?.header?.role || user?.hrRole || 'Staff';

  return (
    <section className="space-y-4 animate-fade-in">
      <div className="hr-banner">
        <div>
          <h2>Welcome, {welcomeName}</h2>
          <div className="bstrap">One-window solution to your HR needs.</div>
          <div className="bsub">
            <span className="role-tag p-gold">{role}</span>
            <span>·</span>
            <span>{clock}</span>
            {dash?.attendanceMonth ? (
              <>
                <span>·</span>
                <span>
                  Month {dash.attendanceMonth.key} ({dash.attendanceMonth.start} →{' '}
                  {dash.attendanceMonth.end})
                </span>
              </>
            ) : null}
          </div>
          {dash?.onProbation && (
            <p className="mt-2 text-sm text-amber-100">
              On probation — leave balance hidden until probation ends.
            </p>
          )}
          {!dash?.onProbation && dash?.leaveBalance && (
            <p className="mt-2 text-sm text-white/90">
              Leave remaining:{' '}
              <strong>
                {dash.leaveBalance.remaining}/{dash.leaveBalance.entitlement}
              </strong>
            </p>
          )}
        </div>
        <div className="actions">
          <Link to="/hr/directory" className="btn-on-banner">
            Directory
          </Link>
          <Link to="/hr/leave" className="btn-on-banner outline">
            + Apply for Leave
          </Link>
          <Link to="/hr/staff" className="btn-on-banner gold">
            Staff board
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/hr/leave" className="kpi-card hover:border-[var(--color-gold)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="kpi-value">{(kpis.pendingHod || 0) + (kpis.pendingHr || 0)}</p>
              <p className="kpi-label">Pending leave</p>
            </div>
            <span className="kpi-icon" style={{ background: '#f5e6c8' }}>
              ⚡
            </span>
          </div>
        </Link>
        {kpis.activeEmployees != null && (
          <Link to="/hr/directory" className="kpi-card hover:border-[var(--color-teal)]">
            <div className="flex items-start justify-between">
              <div>
                <p className="kpi-value">{kpis.activeEmployees}</p>
                <p className="kpi-label">Employees</p>
              </div>
              <span className="kpi-icon" style={{ background: '#d8f0e8' }}>
                👥
              </span>
            </div>
          </Link>
        )}
        <Link to="/hr/staff" className="kpi-card hover:border-[var(--color-teal)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="kpi-value">{kpis.inside ?? '—'}</p>
              <p className="kpi-label">Inside now</p>
            </div>
            <span className="kpi-icon" style={{ background: '#dceaf8' }}>
              ✓
            </span>
          </div>
        </Link>
        <div className="kpi-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="kpi-value">{outside || '—'}</p>
              <p className="kpi-label">Outside now</p>
            </div>
            <span className="kpi-icon" style={{ background: '#fde3e3' }}>
              ↗
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="section-h mb-0">Overview</p>
        <p className="text-sm text-[var(--color-muted)]">
          {dash?.attendanceMonth?.key || 'Current month'}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="page-card">
          <h4 className="font-semibold text-[var(--color-ink)]">On site now</h4>
          <div className="mt-4 flex items-center gap-6">
            <div
              className="relative h-28 w-28 shrink-0 rounded-full"
              style={{
                background: `conic-gradient(var(--color-teal) 0 ${insidePct}%, var(--color-gold) ${insidePct}% 100%)`,
              }}
            >
              <div className="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-white text-center">
                <span className="text-lg font-bold text-[var(--color-ink)]">{insidePct}%</span>
                <span className="text-[10px] text-[var(--color-muted)]">inside</span>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-teal)]" />
                Inside <strong className="ml-1">{inside}</strong>
                <span className="text-[var(--color-muted)]">({insidePct}%)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-gold)]" />
                Outside <strong className="ml-1">{outside}</strong>
                <span className="text-[var(--color-muted)]">({outsidePct}%)</span>
              </li>
              <li className="pt-1 text-[var(--color-muted)]">
                Gate roll <strong className="text-[var(--color-ink)]">{gateRoll}</strong>
              </li>
            </ul>
          </div>
          {dash?.todayCard && (
            <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-sm text-[var(--color-muted)]">
              You today · {dash.todayCard.status || '—'} · In {dash.todayCard.timeIn || '—'} · Out{' '}
              {dash.todayCard.timeOut || '—'}
            </p>
          )}
        </div>

        <div className="page-card">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-[var(--color-ink)]">Leave this month</h4>
            <Link to="/hr/leave" className="text-sm font-semibold text-[var(--color-teal)]">
              Leave
            </Link>
          </div>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{leaveMix.total} requests</p>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
            <div className="flex h-full w-full">
              <div
                style={{
                  width: `${leaveMix.pendingPct}%`,
                  background: 'var(--color-blue, #1565c0)',
                }}
              />
              <div
                style={{
                  width: `${leaveMix.approvedPct}%`,
                  background: 'var(--color-green)',
                }}
              />
            </div>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            <li>
              With HR/HOD <strong>{leaveMix.pending}</strong>{' '}
              <span className="text-[var(--color-muted)]">({leaveMix.pendingPct}%)</span>
            </li>
            <li>
              On leave (month) <strong>{leaveMix.approved}</strong>{' '}
              <span className="text-[var(--color-muted)]">({leaveMix.approvedPct}%)</span>
            </li>
          </ul>
          {dash?.monthSummary && (
            <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-sm text-[var(--color-muted)]">
              Present {dash.monthSummary.present} · Late {dash.monthSummary.late} · Absent{' '}
              {dash.monthSummary.absent}
            </p>
          )}
        </div>
      </div>

      {!!dash?.lateWatch?.length && (
        <div className="page-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">Late this month</h4>
            <p className="text-sm text-[var(--color-muted)]">
              3 or more lates
              {dash?.attendanceMonth
                ? ` · ${dash.attendanceMonth.start} → ${dash.attendanceMonth.end}`
                : ''}
            </p>
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {dash.lateWatch.map((row, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-line)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-sm">
                    {row.employee?.displayName || '—'}
                  </p>
                  <p className="truncate text-xs text-[var(--color-muted)]">
                    {row.employee?.department?.name || '—'}
                  </p>
                </div>
                <span className="text-sm font-bold text-[var(--color-red)]">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="page-card">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Pending approvals</h4>
            <Link to="/hr/leave" className="text-sm font-semibold text-[var(--color-teal)]">
              Review
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {(dash?.pendingApprovals || []).slice(0, 8).map((row) => (
              <li
                key={row._id}
                className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] pb-2"
              >
                <span>
                  {row.employee?.displayName} · {row.leaveType}
                </span>
                <span className="text-xs text-[var(--color-muted)]">{row.status}</span>
              </li>
            ))}
            {!dash?.pendingApprovals?.length && (
              <li className="text-[var(--color-muted)]">Nothing waiting on you.</li>
            )}
          </ul>
        </div>

        <div className="page-card">
          <h4 className="font-semibold">My requests</h4>
          <ul className="mt-3 space-y-2 text-sm">
            {(dash?.myRequests || []).slice(0, 8).map((row) => (
              <li
                key={row._id}
                className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] pb-2"
              >
                <span>
                  {row.leaveType} · {row.fromDate}
                </span>
                <span className="text-xs text-[var(--color-muted)]">{row.status}</span>
              </li>
            ))}
            {!dash?.myRequests?.length && (
              <li className="text-[var(--color-muted)]">No requests yet.</li>
            )}
          </ul>
        </div>
      </div>

      <div className="page-card">
        <h4 className="font-semibold">Activity feed</h4>
        <ul className="mt-3 space-y-2 text-sm">
          {(dash?.activity || []).slice(0, 10).map((row) => (
            <li key={row._id} className="border-b border-[var(--color-line)] pb-2">
              <span className="font-medium">{row.action}</span>
              {row.employeeName ? ` · ${row.employeeName}` : ''}
              {row.comment ? ` — ${row.comment}` : ''}
              <div className="text-xs text-[var(--color-muted)]">
                {row.actorName} · {new Date(row.createdAt).toLocaleString()}
              </div>
            </li>
          ))}
          {!dash?.activity?.length && (
            <li className="text-[var(--color-muted)]">No recent leave activity.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
