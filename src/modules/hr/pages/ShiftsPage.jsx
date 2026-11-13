import { useEffect, useState } from 'react';
import { hrClient } from '@/shared/api/hrClient';
import { useHrAuth } from '@/shared/hr/HrAuthContext';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function to12h(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = ((h + 11) % 12) + 1;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export default function ShiftsPage() {
  const { user } = useHrAuth();
  const manage = user?.hrRole === 'admin';
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    name: '',
    description: '',
    type: 'general',
    dutyStart: '09:00',
    dutyEnd: '17:00',
    workingDays: [1, 2, 3, 4, 5, 6],
    active: true,
  });

  const load = async () => {
    const res = await hrClient.get('/shifts');
    setItems(res.data || []);
  };

  useEffect(() => {
    load().catch((err) => toast(err.message, 'error'));
  }, []);

  const toggleDay = (day) => {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(day)
        ? f.workingDays.filter((d) => d !== day)
        : [...f.workingDays, day].sort(),
    }));
  };

  const onCreate = async (e) => {
    e.preventDefault();
    try {
      await hrClient.post('/shifts', form);
      toast('Shift created');
      setForm({
        name: '',
        description: '',
        type: 'general',
        dutyStart: '09:00',
        dutyEnd: '17:00',
        workingDays: [1, 2, 3, 4, 5, 6],
        active: true,
      });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const toggleActive = async (shift) => {
    try {
      await hrClient.patch(`/shifts/${shift._id}`, { active: !shift.active });
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead
        title="Shifts"
        description="End ≤ start means overnight. Night check-out stays on the start date."
      />

      <div className="data-card overflow-x-auto">
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Duty</th>
              <th>Working days</th>
              <th>Status</th>
              {manage ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s._id}>
                <td>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{s.description}</p>
                </td>
                <td className="capitalize">{s.type}</td>
                <td>
                  {to12h(s.dutyStart)} – {to12h(s.dutyEnd)}
                </td>
                <td>
                  {(s.workingDays || []).map((d) => DAY_LABELS[d]).join(', ')}
                </td>
                <td>
                  <span className={`pill ${s.active ? 'p-green' : 'p-grey'}`}>
                    {s.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                {manage ? (
                  <td>
                    <button type="button" className="btn-ghost" onClick={() => toggleActive(s)}>
                      {s.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {manage ? (
        <form onSubmit={onCreate} className="form-panel grid gap-3 md:grid-cols-2">
          <h4 className="md:col-span-2">Add shift</h4>
          <label className="block text-sm">
            <span className="field-label">Name</span>
            <input
              required
              placeholder="Name"
              className="field-input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="field-label">Type</span>
            <select
              className="field-input"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="general">General</option>
              <option value="night">Night</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="field-label">Description</span>
            <input
              placeholder="Description"
              className="field-input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="field-label">Duty from</span>
            <input
              type="time"
              className="field-input"
              value={form.dutyStart}
              onChange={(e) => setForm((f) => ({ ...f, dutyStart: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="field-label">Duty to</span>
            <input
              type="time"
              className="field-input"
              value={form.dutyEnd}
              onChange={(e) => setForm((f) => ({ ...f, dutyEnd: e.target.value }))}
            />
          </label>
          <div className="md:col-span-2 flex flex-wrap gap-3 text-sm">
            {DAY_LABELS.map((label, day) => (
              <label key={label} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={form.workingDays.includes(day)}
                  onChange={() => toggleDay(day)}
                />
                {label}
              </label>
            ))}
          </div>
          <button type="submit" className="btn-teal md:col-span-2">
            Create shift
          </button>
        </form>
      ) : null}
    </section>
  );
}
