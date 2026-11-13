import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { hrClient } from '@/shared/api/hrClient';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

const ROLES = ['employee', 'admin', 'pos'];
const WEEKDAYS = [
  ['0', 'Sun'],
  ['1', 'Mon'],
  ['2', 'Tue'],
  ['3', 'Wed'],
  ['4', 'Thu'],
  ['5', 'Fri'],
  ['6', 'Sat'],
];

const blank = {
  firstName: '',
  middleName: '',
  lastName: '',
  displayName: '',
  employeeNumber: '',
  designation: '',
  departmentId: '',
  hrRole: 'employee',
  workEmail: '',
  phone: '',
  gender: '',
  cnic: '',
  photoUrl: '',
  joiningDate: '',
  dateOfBirth: '',
  status: 'active',
  zkUserPin: '',
  shiftId: '',
  dutyStart: '09:00',
  dutyEnd: '17:00',
  leaveEntitlement: 30,
  leaveRemaining: 30,
  probationEndedOn: '',
  portalPassword: '',
  weeklyRoster: [],
};

function Field({ label, children, className = '' }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

function readImageAsDataUrl(file, maxSize = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read photo'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function rosterForDay(roster, day) {
  return (
    (roster || []).find((r) => String(r.weekday) === day) || {
      weekday: Number(day),
      off: false,
      start: '',
      end: '',
    }
  );
}

export default function EmployeeFormPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const [form, setForm] = useState(blank);
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      hrClient.get('/departments?activeOnly=true'),
      hrClient.get('/shifts?activeOnly=true'),
      isNew ? hrClient.get('/employees/next-number') : Promise.resolve(null),
    ]).then(([deps, sh, next]) => {
      setDepartments(deps.data || []);
      setShifts(sh.data || []);
      if (next?.data?.preview) {
        setForm((f) => ({ ...f, employeeNumber: next.data.preview }));
      }
    });
  }, [isNew]);

  useEffect(() => {
    if (isNew) return;
    hrClient
      .get(`/employees/${id}`)
      .then((res) => {
        const e = res.data;
        setForm({
          ...blank,
          ...e,
          departmentId: e.department?._id || e.department || '',
          shiftId: e.shift?._id || e.shift || '',
          workEmail: e.workEmail || '',
          probationEndedOn: e.probationEndedOn || '',
          weeklyRoster: e.weeklyRoster || [],
          portalPassword: '',
          dutyStart: (e.dutyStart || '09:00').slice(0, 5),
          dutyEnd: (e.dutyEnd || '17:00').slice(0, 5),
        });
      })
      .catch((err) => toast(err.message, 'error'));
  }, [id, isNew]);

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const onShiftChange = (shiftId) => {
    const shift = shifts.find((s) => s._id === shiftId);
    setForm((f) => ({
      ...f,
      shiftId,
      dutyStart: (shift?.dutyStart || f.dutyStart || '09:00').slice(0, 5),
      dutyEnd: (shift?.dutyEnd || f.dutyEnd || '17:00').slice(0, 5),
    }));
  };

  const setRosterDay = (day, patch) => {
    const current = rosterForDay(form.weeklyRoster, day);
    const next = (form.weeklyRoster || []).filter((r) => String(r.weekday) !== day);
    next.push({ ...current, weekday: Number(day), ...patch });
    setField('weeklyRoster', next);
  };

  const onPhotoPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file', 'error');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast('Photo too large (max 8MB)', 'error');
      return;
    }
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setField('photoUrl', dataUrl);
      toast('Photo added');
    } catch (err) {
      toast(err.message || 'Photo failed', 'error');
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        displayName:
          form.displayName ||
          [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' '),
      };
      if (isNew) {
        const res = await hrClient.post('/employees', payload);
        toast('Employee created');
        navigate(`/hr/directory/${res.data._id}`);
      } else {
        await hrClient.patch(`/employees/${id}`, payload);
        toast('Employee updated');
        navigate('/hr/directory');
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead
        title={isNew ? 'Add employee' : 'Edit employee'}
        description="Photo, profile, shift times, and portal access"
      >
        <Link to="/hr/directory" className="btn-ghost">
          Back to directory
        </Link>
      </PageHead>

      <form onSubmit={onSubmit} className="emp-form">
        <div className="emp-form-section">
          <h4>Photo</h4>
          <p className="sec-sub">Employee face photo for directory / staff board</p>
          <div className="emp-photo-row">
            {form.photoUrl ? (
              <img src={form.photoUrl} alt="Employee" className="emp-photo-preview" />
            ) : (
              <div className="emp-photo-placeholder">No photo</div>
            )}
            <div className="emp-photo-actions">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onPhotoPick}
              />
              <button
                type="button"
                className="btn-teal"
                onClick={() => fileRef.current?.click()}
              >
                {form.photoUrl ? 'Change photo' : 'Upload photo'}
              </button>
              {form.photoUrl ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setField('photoUrl', '')}
                >
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="emp-form-section">
          <h4>Identity</h4>
          <p className="sec-sub">Name, PIN, and department</p>
          <div className="emp-form-grid">
            <Field label="Employee number">
              <input
                required
                className="field-input"
                value={form.employeeNumber}
                onChange={(e) => setField('employeeNumber', e.target.value)}
                disabled={!isNew}
              />
            </Field>
            <Field label="ZKTeco user PIN (uFace800)">
              <input
                required
                className="field-input"
                value={form.zkUserPin}
                onChange={(e) => setField('zkUserPin', e.target.value)}
                placeholder="Machine enroll no."
              />
            </Field>
            <Field label="First name">
              <input
                required
                className="field-input"
                value={form.firstName}
                onChange={(e) => setField('firstName', e.target.value)}
              />
            </Field>
            <Field label="Middle name">
              <input
                className="field-input"
                value={form.middleName}
                onChange={(e) => setField('middleName', e.target.value)}
              />
            </Field>
            <Field label="Last name">
              <input
                required
                className="field-input"
                value={form.lastName}
                onChange={(e) => setField('lastName', e.target.value)}
              />
            </Field>
            <Field label="Display name">
              <input
                className="field-input"
                value={form.displayName}
                onChange={(e) => setField('displayName', e.target.value)}
                placeholder="Optional — auto from name"
              />
            </Field>
            <Field label="Designation">
              <input
                className="field-input"
                value={form.designation}
                onChange={(e) => setField('designation', e.target.value)}
              />
            </Field>
            <Field label="Role">
              <select
                className="field-input"
                value={form.hrRole === 'admin' ? 'admin' : 'employee'}
                onChange={(e) => setField('hrRole', e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Department" className="span-2">
              <select
                required
                className="field-input"
                value={form.departmentId}
                onChange={(e) => setField('departmentId', e.target.value)}
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="emp-form-section">
          <h4>Contact & portal</h4>
          <p className="sec-sub">Login email / password for HR portal</p>
          <div className="emp-form-grid">
            <Field label="Work email">
              <input
                type="email"
                className="field-input"
                value={form.workEmail}
                onChange={(e) => setField('workEmail', e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label={`Portal password${isNew ? '' : ' (blank = keep)'}`}>
              <input
                type="password"
                className="field-input"
                value={form.portalPassword}
                onChange={(e) => setField('portalPassword', e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <Field label="Phone">
              <input
                className="field-input"
                value={form.phone}
                onChange={(e) => setField('phone', e.target.value)}
              />
            </Field>
            <Field label="Gender">
              <select
                className="field-input"
                value={form.gender}
                onChange={(e) => setField('gender', e.target.value)}
              >
                <option value="">Select</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="CNIC">
              <input
                className="field-input"
                value={form.cnic}
                onChange={(e) => setField('cnic', e.target.value)}
              />
            </Field>
            <Field label="Date of joining">
              <input
                required
                type="date"
                className="field-input"
                value={form.joiningDate}
                onChange={(e) => setField('joiningDate', e.target.value)}
              />
            </Field>
            <Field label="Date of birth">
              <input
                type="date"
                className="field-input"
                value={form.dateOfBirth || ''}
                onChange={(e) => setField('dateOfBirth', e.target.value)}
              />
            </Field>
            <Field label="End probation early">
              <input
                type="date"
                className="field-input"
                value={form.probationEndedOn || ''}
                onChange={(e) => setField('probationEndedOn', e.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="emp-form-section">
          <h4>Duty hours</h4>
          <p className="sec-sub">Default shift window for this employee</p>
          <div className="emp-form-grid">
            <Field label="Shift template">
              <select
                className="field-input"
                value={form.shiftId || ''}
                onChange={(e) => onShiftChange(e.target.value)}
              >
                <option value="">No shift</option>
                {shifts.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.dutyStart}–{s.dutyEnd})
                  </option>
                ))}
              </select>
            </Field>
            <div />
            <Field label="Duty start">
              <input
                type="time"
                required
                className="field-input"
                value={form.dutyStart}
                onChange={(e) => setField('dutyStart', e.target.value)}
              />
            </Field>
            <Field label="Duty end">
              <input
                type="time"
                required
                className="field-input"
                value={form.dutyEnd}
                onChange={(e) => setField('dutyEnd', e.target.value)}
              />
            </Field>
            <Field label="Leave entitlement">
              <input
                type="number"
                step="0.5"
                className="field-input"
                value={form.leaveEntitlement}
                onChange={(e) => setField('leaveEntitlement', Number(e.target.value))}
              />
            </Field>
            <Field label="Leave remaining">
              <input
                type="number"
                step="0.5"
                className="field-input"
                value={form.leaveRemaining}
                onChange={(e) => setField('leaveRemaining', Number(e.target.value))}
              />
            </Field>
          </div>
        </div>

        <div className="emp-form-section">
          <h4>Weekly roster</h4>
          <p className="sec-sub">Optional day overrides — leave blank to use duty hours</p>
          <div className="grid gap-2 md:grid-cols-2">
            {WEEKDAYS.map(([day, label]) => {
              const row = rosterForDay(form.weeklyRoster, day);
              return (
                <div key={day} className="roster-row">
                  <span className="text-sm font-semibold">{label}</span>
                  <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
                    <input
                      type="checkbox"
                      checked={Boolean(row.off)}
                      onChange={(e) =>
                        setRosterDay(day, {
                          off: e.target.checked,
                          start: row.start || null,
                          end: row.end || null,
                        })
                      }
                    />
                    Off
                  </label>
                  <input
                    type="time"
                    className="field-input"
                    value={row.start || ''}
                    disabled={row.off}
                    onChange={(e) =>
                      setRosterDay(day, {
                        off: false,
                        start: e.target.value || null,
                        end: row.end || null,
                      })
                    }
                  />
                  <input
                    type="time"
                    className="field-input"
                    value={row.end || ''}
                    disabled={row.off}
                    onChange={(e) =>
                      setRosterDay(day, {
                        off: false,
                        start: row.start || null,
                        end: e.target.value || null,
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="emp-form-actions">
          <Link to="/hr/directory" className="btn-ghost">
            Cancel
          </Link>
          <button type="submit" disabled={busy} className="btn-teal disabled:opacity-60">
            {busy ? 'Saving…' : isNew ? 'Create employee' : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  );
}
