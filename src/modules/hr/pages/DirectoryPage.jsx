import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hrClient } from '@/shared/api/hrClient';
import { useHrAuth } from '@/shared/hr/HrAuthContext';
import { toast } from '@/shared/components/Toast';
import PageHead from '@/shared/components/PageHead';

const canManage = (role) => role === 'admin';

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || '?';
}

export default function DirectoryPage() {
  const { user } = useHrAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('active');
  const [departmentId, setDepartmentId] = useState('');
  const [portalAccess, setPortalAccess] = useState('');
  const [hiredFrom, setHiredFrom] = useState('');
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState({ items: [], page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [auditFor, setAuditFor] = useState(null);
  const [auditRows, setAuditRows] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    hrClient.get('/departments?activeOnly=true').then((res) => setDepartments(res.data || []));
  }, []);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      limit: '50',
      status,
    });
    if (debouncedQ) params.set('q', debouncedQ);
    if (departmentId) params.set('departmentId', departmentId);
    if (portalAccess) params.set('portalAccess', portalAccess);
    if (hiredFrom) params.set('hiredFrom', `${hiredFrom}-01`);
    return params.toString();
  }, [page, status, debouncedQ, departmentId, portalAccess, hiredFrom]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await hrClient.get(`/employees?${queryString}`);
      setData(res.data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [queryString]);

  const manage = canManage(user?.hrRole);
  const from = data.total ? (data.page - 1) * 50 + 1 : 0;
  const to = Math.min(data.page * 50, data.total);

  const onAction = async (id, action) => {
    try {
      await hrClient.post(`/employees/${id}/${action}`);
      toast(action === 'remove' ? 'Employee removed' : `Employee ${action}d`);
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const openAudit = async (row) => {
    try {
      const res = await hrClient.get(`/employees/${row._id}/audit`);
      setAuditFor(row);
      setAuditRows(res.data || []);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const exportCsv = async () => {
    try {
      const text = await hrClient.download(`/employees/export.csv?${queryString}`);
      const blob = new Blob([text], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'employees.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <section className="space-y-4 animate-fade-in">
      <PageHead
        title="Employee Directory"
        description={`Showing ${from}–${to} of ${data.total} people. Search and filter; add, edit, or set active / inactive.`}
      >
        <button type="button" onClick={exportCsv} className="btn-ghost">
          Export CSV
        </button>
        {manage ? (
          <Link to="/hr/directory/new" className="btn-teal">
            + Add Employee
          </Link>
        ) : null}
      </PageHead>

      <div className="toolbar">
        <div className="search">
          <span aria-hidden>⌕</span>
          <input
            placeholder="Search name, email, emp no…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
        </div>
        <select
          className="sel"
          value={departmentId}
          disabled={user?.hrRole !== 'admin'}
          onChange={(e) => {
            setPage(1);
            setDepartmentId(e.target.value);
          }}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          className="sel"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All statuses</option>
        </select>
        <input
          type="month"
          className="sel"
          value={hiredFrom}
          onChange={(e) => {
            setPage(1);
            setHiredFrom(e.target.value);
          }}
          title="Hired from month"
        />
        <select
          className="sel"
          value={portalAccess}
          onChange={(e) => {
            setPage(1);
            setPortalAccess(e.target.value);
          }}
        >
          <option value="">All portal access</option>
          <option value="logged_in">Has logged in</option>
          <option value="never">Never logged in</option>
        </select>
      </div>

      <div className="data-card overflow-x-auto">
        <table className="data-table min-w-[900px]">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Designation</th>
              <th>Department</th>
              <th>Email</th>
              <th>Status</th>
              {manage ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="text-[var(--color-muted)]" colSpan={7}>
                  Loading…
                </td>
              </tr>
            ) : data.items.length === 0 ? (
              <tr>
                <td className="text-[var(--color-muted)]" colSpan={7}>
                  No employees match these filters.
                </td>
              </tr>
            ) : (
              data.items.map((row, idx) => (
                <tr key={row._id}>
                  <td>{(data.page - 1) * 50 + idx + 1}</td>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="avatar-sm">{initials(row.displayName)}</span>
                      <div>
                        <p className="font-semibold">{row.displayName}</p>
                        <p className="text-xs text-[var(--color-muted)]">{row.employeeNumber}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.onProbation ? <span className="pill p-amber">Probation</span> : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{row.designation || '—'}</td>
                  <td>{row.department?.name || '—'}</td>
                  <td>{row.workEmail || '—'}</td>
                  <td>
                    <span className={`pill ${row.status === 'active' ? 'p-green' : 'p-grey'}`}>
                      {row.status}
                    </span>
                  </td>
                  {manage ? (
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Edit"
                          onClick={() => navigate(`/hr/directory/${row._id}`)}
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title={row.status === 'active' ? 'Deactivate' : 'Activate'}
                          onClick={() =>
                            onAction(row._id, row.status === 'active' ? 'deactivate' : 'activate')
                          }
                        >
                          ⏻
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="History"
                          onClick={() => openAudit(row)}
                        >
                          ◉
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          title="Remove"
                          onClick={() => onAction(row._id, 'remove')}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="pager">
        <button
          type="button"
          disabled={page <= 1}
          className="btn-ghost"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Previous
        </button>
        <span>
          Page {data.page} / {data.pages}
        </span>
        <button
          type="button"
          disabled={page >= data.pages}
          className="btn-ghost"
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      {auditFor ? (
        <div className="form-panel">
          <div className="mb-3 flex items-center justify-between">
            <h4>History · {auditFor.displayName}</h4>
            <button type="button" className="btn-ghost" onClick={() => setAuditFor(null)}>
              Close
            </button>
          </div>
          <ul className="space-y-2 text-sm">
            {auditRows.map((row) => (
              <li key={row._id} className="rounded-lg bg-[var(--color-surface-2)] px-3 py-2">
                <p>{row.summary}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {row.actorName} · {row.action} · {new Date(row.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
