import { useEffect, useState } from 'react';
import { apiClient } from '@/shared/api/client';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    apiClient
      .get('/auth/users')
      .then((res) => {
        if (active) setUsers(res.data || []);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Failed to load users');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="page-card">
      <h3 className="mb-2 text-xl font-semibold">Users</h3>
      <p className="mb-4 text-[var(--color-muted)]">
        Auth module loaded on demand. Staff accounts and roles will expand here.
      </p>

      {loading ? <p className="text-sm text-[var(--color-muted)]">Loading users...</p> : null}
      {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}

      {!loading && !error ? (
        users.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No users yet.</p>
        ) : (
          <ul className="space-y-2">
            {users.map((user) => (
              <li
                key={user._id || user.id}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
              >
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-[var(--color-muted)]">
                  {user.email} · {user.role}
                </p>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
