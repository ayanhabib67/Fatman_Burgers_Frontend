import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { hrClient } from '@/shared/api/hrClient';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

function deviceStatusPill(d) {
  if (!d.active) return 'p-grey';
  if (String(d.lastStatus || '').includes('adms') || d.lastStatus === 'online' || d.lastStatus === 'ok') {
    return 'p-green';
  }
  if (d.lastStatus === 'error' || d.lastError) return 'p-red';
  return 'p-amber';
}

export default function DevicesPage() {
  const [devices, setDevices] = useState([]);
  const [unmappedCount, setUnmappedCount] = useState(0);
  const [adms, setAdms] = useState(null);
  const [busyId, setBusyId] = useState('');

  const load = async () => {
    const [d, setup] = await Promise.all([
      hrClient.get('/devices'),
      hrClient.get('/adms/setup').catch(() => ({ data: null })),
    ]);
    const items = d.data.items || [];
    // ADMS only — ignore TCP leftovers / probe SNs (test, check)
    setDevices(
      items.filter((x) => {
        const code = String(x.code || '').toLowerCase();
        if (['test', 'check', 'unknown'].includes(code)) return false;
        return String(x.location || '').toLowerCase().includes('adms') || code === 'jym6245100353';
      })
    );
    setUnmappedCount((d.data.unmapped || []).length);
    setAdms(setup.data || null);
  };

  useEffect(() => {
    load().catch((err) => toast(err.message, 'error'));
  }, []);

  const admsResync = async (id) => {
    setBusyId(`resync-${id}`);
    try {
      await hrClient.post(`/devices/${id}/adms-resync`);
      toast('ADMS resync queued');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusyId('');
    }
  };

  const ds = adms?.deviceSettings;

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead
        title="Gate & Devices"
        description="uFace800 Plus · ADMS push. Punches Punch logs page pe dikhte hain."
      >
        <Link to="/hr/logs" className="btn-teal">
          Open punch logs
        </Link>
      </PageHead>

      {ds ? (
        <div className="form-panel space-y-3">
          <h4>ADMS connection</h4>
          <p className="text-sm text-[var(--color-muted)]">
            Device punches ko backend pe push karti hai. Server Address / Port device menu mein
            set karo.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="rounded-lg border border-[var(--color-line)] px-3 py-2">
              <p className="text-xs text-[var(--color-muted)]">Server Address</p>
              <p className="font-semibold break-all">{ds.serverAddress}</p>
            </div>
            <div className="rounded-lg border border-[var(--color-line)] px-3 py-2">
              <p className="text-xs text-[var(--color-muted)]">Server Port</p>
              <p className="font-semibold">{ds.serverPort}</p>
            </div>
            <div className="rounded-lg border border-[var(--color-line)] px-3 py-2">
              <p className="text-xs text-[var(--color-muted)]">Protocol</p>
              <p className="font-semibold">HTTP</p>
            </div>
            <div className="rounded-lg border border-[var(--color-line)] px-3 py-2">
              <p className="text-xs text-[var(--color-muted)]">Mode</p>
              <p className="font-semibold">ADMS / Cloud Push</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="data-card overflow-x-auto">
        <table className="data-table min-w-[720px]">
          <thead>
            <tr>
              <th>Device</th>
              <th>Serial (SN)</th>
              <th>Last seen</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.length === 0 ? (
              <tr>
                <td className="text-[var(--color-muted)]" colSpan={5}>
                  Abhi koi machine connect nahi. Device pe ADMS server IP/port set karke reboot
                  karo — connect hote hi yahan dikhegi.
                </td>
              </tr>
            ) : (
              devices.map((d) => (
                <tr key={d._id}>
                  <td>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{d.location || 'ADMS'}</p>
                  </td>
                  <td className="font-mono text-sm uppercase">{d.code}</td>
                  <td className="text-xs">
                    {d.lastSuccessfulPullAt
                      ? new Date(d.lastSuccessfulPullAt).toLocaleString()
                      : '—'}
                  </td>
                  <td>
                    <span className={`pill ${deviceStatusPill(d)}`}>
                      {d.active ? d.lastStatus || 'unknown' : 'inactive'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={busyId === `resync-${d._id}`}
                      onClick={() => admsResync(d._id)}
                      className="btn-teal disabled:opacity-50"
                      style={{ padding: '4px 10px', fontSize: 12 }}
                    >
                      {busyId === `resync-${d._id}` ? '…' : 'Resync logs'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {unmappedCount > 0 ? (
        <div className="form-panel">
          <p className="text-sm">
            <span className="font-semibold text-[var(--color-red)]">{unmappedCount} unmapped</span>{' '}
            punches — employee pe ZK PIN set karo.{' '}
            <Link to="/hr/logs" className="font-semibold text-[var(--color-teal)]">
              Punch logs
            </Link>
          </p>
        </div>
      ) : null}
    </section>
  );
}
