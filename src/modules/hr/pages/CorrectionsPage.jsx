import { useEffect, useState } from 'react';
import { hrClient } from '@/shared/api/hrClient';
import { useHrAuth } from '@/shared/hr/HrAuthContext';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

const TYPES = [
  'missing_check_in',
  'missing_check_out',
  'wrong_time',
  'forgotten_punch',
  'device_failure',
  'sync_failure',
  'movement_reclassify',
  'other',
];

function correctionPill(status) {
  if (status === 'approved') return 'p-green';
  if (status === 'rejected') return 'p-red';
  if (status === 'pending') return 'p-amber';
  return 'p-grey';
}

export default function CorrectionsPage() {
  const { user } = useHrAuth();
  const isHr = user?.hrRole === 'admin';
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [status, setStatus] = useState('pending');
  const [note, setNote] = useState('');
  const [form, setForm] = useState({
    employeeId: '',
    workDate: '',
    type: 'forgotten_punch',
    proposedTimeIn: '',
    proposedTimeOut: '',
    proposedStatus: '',
    proposedMovementType: '',
    reason: '',
  });

  const load = async () => {
    const qs = status ? `?status=${status}` : '';
    const res = await hrClient.get(`/corrections${qs}`);
    setItems(res.data || []);
    if (isHr) {
      const e = await hrClient.get('/employees?status=active&limit=100');
      setEmployees(e.data.items || []);
    }
  };

  useEffect(() => {
    load().catch((err) => toast(err.message, 'error'));
  }, [status]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await hrClient.post('/corrections', {
        ...form,
        employeeId: form.employeeId || undefined,
        proposedTimeIn: form.proposedTimeIn || undefined,
        proposedTimeOut: form.proposedTimeOut || undefined,
        proposedStatus: form.proposedStatus || undefined,
        proposedMovementType: form.proposedMovementType || undefined,
      });
      toast('Correction submitted');
      setForm((f) => ({ ...f, reason: '', proposedTimeIn: '', proposedTimeOut: '' }));
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const decide = async (id, action) => {
    try {
      await hrClient.post(`/corrections/${id}/decide`, { action, reviewNote: note });
      toast(`Correction ${action}d`);
      setNote('');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead
        title="Attendance corrections"
        description="Request fixes for missing or wrong punches"
      >
        <select
          className="sel"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
      </PageHead>

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <form onSubmit={submit} className="form-panel space-y-3 h-fit">
          <h4>New correction</h4>
          {isHr && (
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
            <span className="field-label">Work date</span>
            <input
              type="date"
              required
              value={form.workDate}
              onChange={(e) => setForm({ ...form, workDate: e.target.value })}
              className="field-input"
            />
          </label>
          <label className="block text-sm">
            <span className="field-label">Type</span>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="field-input"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Time in HH:MM"
              value={form.proposedTimeIn}
              onChange={(e) => setForm({ ...form, proposedTimeIn: e.target.value })}
              className="field-input"
            />
            <input
              placeholder="Time out HH:MM"
              value={form.proposedTimeOut}
              onChange={(e) => setForm({ ...form, proposedTimeOut: e.target.value })}
              className="field-input"
            />
          </div>
          <input
            placeholder="Proposed status (optional)"
            value={form.proposedStatus}
            onChange={(e) => setForm({ ...form, proposedStatus: e.target.value })}
            className="field-input"
          />
          {form.type === 'movement_reclassify' && (
            <select
              value={form.proposedMovementType}
              onChange={(e) => setForm({ ...form, proposedMovementType: e.target.value })}
              className="field-input"
            >
              <option value="">Movement type</option>
              <option value="lunch">Lunch</option>
              <option value="office_exit">Office exit</option>
              <option value="unauthorized">Unauthorized</option>
            </select>
          )}
          <label className="block text-sm">
            <span className="field-label">Reason</span>
            <textarea
              required
              rows={3}
              placeholder="Reason"
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
          {isHr && (
            <div className="toolbar">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Review note"
                className="sel min-w-[200px] flex-1"
              />
            </div>
          )}
          <div className="data-card overflow-x-auto">
            <table className="data-table min-w-full">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Proposed</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row._id}>
                    <td>{row.employee?.displayName}</td>
                    <td className="whitespace-nowrap">{row.workDate}</td>
                    <td>{row.type.replaceAll('_', ' ')}</td>
                    <td className="text-xs">
                      {[row.proposedTimeIn, row.proposedTimeOut, row.proposedStatus]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </td>
                    <td>
                      <span className={`pill ${correctionPill(row.status)}`}>{row.status}</span>
                    </td>
                    <td>
                      {isHr && row.status === 'pending' && (
                        <div className="flex flex-wrap gap-1">
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
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td colSpan={6} className="text-[var(--color-muted)]">
                      No corrections.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
