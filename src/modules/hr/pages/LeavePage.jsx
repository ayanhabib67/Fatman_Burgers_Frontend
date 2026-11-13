import { useEffect, useState } from 'react';
import { hrClient } from '@/shared/api/hrClient';
import { useHrAuth } from '@/shared/hr/HrAuthContext';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

const TABS = ['requests', 'balances', 'holidays'];

function statusPill(status) {
  if (/approved|ok/i.test(status)) return 'p-green';
  if (/reject/i.test(status)) return 'p-red';
  if (/pending/i.test(status)) return 'p-amber';
  return 'p-grey';
}

export default function LeavePage() {
  const { user } = useHrAuth();
  const [tab, setTab] = useState('requests');
  const [types, setTypes] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [balances, setBalances] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [queue, setQueue] = useState('');
  const [form, setForm] = useState({
    employeeId: '',
    leaveType: 'Casual',
    fromDate: '',
    toDate: '',
    reason: '',
    halfDay: false,
    halfDayPart: 'first',
  });
  const [holidayForm, setHolidayForm] = useState({
    date: '',
    name: '',
    portion: 'full',
  });
  const [comment, setComment] = useState('');

  const isAdmin = user?.hrRole === 'admin';
  const canDecide = isAdmin;

  const load = async () => {
    const qs = queue ? `?queue=${queue}` : '';
    const [t, l, b, h] = await Promise.all([
      hrClient.get('/leave/types'),
      hrClient.get(`/leave${qs}`),
      hrClient.get('/balances'),
      hrClient.get(`/holidays?year=${new Date().getFullYear()}`),
    ]);
    setTypes(t.data.types || []);
    setLeaves(l.data || []);
    setBalances(b.data || []);
    setHolidays(h.data || []);
    if (isAdmin) {
      const e = await hrClient.get('/employees?status=active&limit=100');
      setEmployees(e.data.items || []);
    }
  };

  useEffect(() => {
    load().catch((err) => toast(err.message, 'error'));
  }, [queue]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await hrClient.post('/leave', {
        ...form,
        employeeId: form.employeeId || undefined,
        toDate: form.halfDay ? form.fromDate : form.toDate,
      });
      toast('Leave submitted');
      setForm((f) => ({ ...f, reason: '', fromDate: '', toDate: '' }));
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const decide = async (id, action) => {
    try {
      await hrClient.post(`/leave/${id}/decide`, {
        action,
        comment,
      });
      toast('Leave updated');
      setComment('');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const saveHoliday = async (e) => {
    e.preventDefault();
    try {
      await hrClient.post('/holidays', holidayForm);
      toast('Holiday saved');
      setHolidayForm({ date: '', name: '', portion: 'full' });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const removeHoliday = async (id) => {
    try {
      await hrClient.delete(`/holidays/${id}`);
      toast('Holiday removed');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const saveBalance = async (id, leaveEntitlement, leaveRemaining) => {
    try {
      await hrClient.patch(`/balances/${id}`, {
        leaveEntitlement: Number(leaveEntitlement),
        leaveRemaining: Number(leaveRemaining),
      });
      toast('Balance updated');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead
        title="Leave & Approvals"
        description="Requests, balances, and public holidays"
      >
        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={tab === t ? 'is-active' : ''}
            >
              {t}
            </button>
          ))}
        </div>
      </PageHead>

      {tab === 'requests' && (
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <form onSubmit={submit} className="form-panel space-y-3 h-fit">
            <h4>Apply for leave</h4>
            {isAdmin && (
              <label className="block text-sm">
                <span className="field-label">Employee</span>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="field-input"
                >
                  <option value="">Myself</option>
                  {employees.map((emp) => (
                    <option key={emp._id} value={emp._id}>
                      {emp.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="block text-sm">
              <span className="field-label">Type</span>
              <select
                value={form.leaveType}
                onChange={(e) => setForm({ ...form, leaveType: e.target.value })}
                className="field-input"
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="field-label">From</span>
                <input
                  type="date"
                  required
                  value={form.fromDate}
                  onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
                  className="field-input"
                />
              </label>
              <label className="block text-sm">
                <span className="field-label">To</span>
                <input
                  type="date"
                  required={!form.halfDay}
                  disabled={form.halfDay}
                  value={form.halfDay ? form.fromDate : form.toDate}
                  onChange={(e) => setForm({ ...form, toDate: e.target.value })}
                  className="field-input disabled:opacity-50"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.halfDay}
                onChange={(e) => setForm({ ...form, halfDay: e.target.checked })}
              />
              Half day
            </label>
            {form.halfDay && (
              <select
                value={form.halfDayPart}
                onChange={(e) => setForm({ ...form, halfDayPart: e.target.value })}
                className="field-input"
              >
                <option value="first">First half</option>
                <option value="second">Second half</option>
              </select>
            )}
            <label className="block text-sm">
              <span className="field-label">Reason</span>
              <textarea
                required
                rows={3}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="field-input"
              />
            </label>
            <button type="submit" className="btn-teal w-full">
              Submit
            </button>
          </form>

          <div className="space-y-3">
            <div className="toolbar">
              {isAdmin ? (
                <select className="sel" value={queue} onChange={(e) => setQueue(e.target.value)}>
                  <option value="">All</option>
                  <option value="pending">Pending</option>
                </select>
              ) : null}
              {canDecide && (
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Decision comment"
                  className="sel min-w-[200px] flex-1"
                />
              )}
            </div>

            <div className="data-card overflow-x-auto">
              <table className="data-table min-w-full">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((row) => (
                    <tr key={row._id}>
                      <td>{row.employee?.displayName || '—'}</td>
                      <td>{row.leaveType}</td>
                      <td className="whitespace-nowrap">
                        {row.fromDate}
                        {row.fromDate !== row.toDate ? ` → ${row.toDate}` : ''}
                        {row.halfDay ? ` (${row.halfDayPart})` : ''}
                      </td>
                      <td>{row.days}</td>
                      <td>
                        <span className={`pill ${statusPill(row.status)}`}>{row.status}</span>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {isAdmin &&
                            ['pending_hod', 'pending_hr'].includes(row.status) && (
                              <>
                                <button
                                  type="button"
                                  className="btn-teal"
                                  style={{ padding: '4px 8px', fontSize: 11 }}
                                  onClick={() => decide(row._id, 'approve')}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  style={{ padding: '4px 8px', fontSize: 11, color: '#b42318' }}
                                  onClick={() => decide(row._id, 'reject')}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!leaves.length && (
                    <tr>
                      <td colSpan={6} className="text-[var(--color-muted)]">
                        No leave requests.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'balances' && (
        <div className="data-card overflow-x-auto">
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Department</th>
                <th>Entitlement</th>
                <th>Remaining</th>
                {isAdmin && <th>Save</th>}
              </tr>
            </thead>
            <tbody>
              {balances.map((row) => (
                <BalanceRow key={row._id} row={row} canEdit={isAdmin} onSave={saveBalance} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'holidays' && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {isAdmin && (
            <form onSubmit={saveHoliday} className="form-panel space-y-3 h-fit">
              <h4>Add holiday</h4>
              <input
                type="date"
                required
                value={holidayForm.date}
                onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                className="field-input"
              />
              <input
                required
                placeholder="Name"
                value={holidayForm.name}
                onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                className="field-input"
              />
              <select
                value={holidayForm.portion}
                onChange={(e) => setHolidayForm({ ...holidayForm, portion: e.target.value })}
                className="field-input"
              >
                <option value="full">Full day</option>
                <option value="half">Half day</option>
              </select>
              <button type="submit" className="btn-teal w-full">
                Save holiday
              </button>
            </form>
          )}
          <div className="data-card overflow-x-auto">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Name</th>
                  <th>Portion</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h._id}>
                    <td>{h.date}</td>
                    <td>{h.name}</td>
                    <td>
                      <span className="pill p-grey">{h.portion}</span>
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          type="button"
                          className="text-xs font-semibold text-[var(--color-red)]"
                          onClick={() => removeHoliday(h._id)}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!holidays.length && (
                  <tr>
                    <td colSpan={4} className="text-[var(--color-muted)]">
                      No holidays this year.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function BalanceRow({ row, canEdit, onSave }) {
  const [ent, setEnt] = useState(row.leaveEntitlement);
  const [rem, setRem] = useState(row.leaveRemaining);
  useEffect(() => {
    setEnt(row.leaveEntitlement);
    setRem(row.leaveRemaining);
  }, [row.leaveEntitlement, row.leaveRemaining]);

  return (
    <tr>
      <td>
        {row.displayName}
        <div className="text-xs text-[var(--color-muted)]">{row.employeeNumber}</div>
      </td>
      <td>{row.department?.name || '—'}</td>
      <td>
        {canEdit ? (
          <input
            type="number"
            value={ent}
            onChange={(e) => setEnt(e.target.value)}
            className="sel w-20"
          />
        ) : (
          ent
        )}
      </td>
      <td>
        {canEdit ? (
          <input
            type="number"
            value={rem}
            onChange={(e) => setRem(e.target.value)}
            className="sel w-20"
          />
        ) : (
          rem
        )}
      </td>
      {canEdit && (
        <td>
          <button type="button" className="btn-ghost" onClick={() => onSave(row._id, ent, rem)}>
            Save
          </button>
        </td>
      )}
    </tr>
  );
}
