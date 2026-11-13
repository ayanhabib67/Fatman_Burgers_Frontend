import { useHrAuth } from '@/shared/hr/HrAuthContext';

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('') || 'FM';
}

export default function Header({ title = 'Dashboard' }) {
  const { user } = useHrAuth();
  const role = user?.hrRole || 'Staff';

  return (
    <header className="flex h-[var(--header-height)] items-center justify-between border-b border-[var(--color-line)] bg-white px-6">
      <div className="flex items-center gap-2">
        <span className="text-[var(--color-gold)]" aria-hidden>
          ▦
        </span>
        <h2 className="text-[15px] font-semibold text-[var(--color-ink)]">{title}</h2>
      </div>

      <div className="flex items-center gap-3">
        <span className="badge hidden sm:inline-flex">Attendance 26→25</span>
        <div className="flex items-center gap-2 rounded-full border border-[var(--color-line)] py-1 pl-1 pr-3">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
            style={{ background: 'var(--color-gold)' }}
          >
            {initials(user?.displayName)}
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-[var(--color-ink)]">
              {user?.displayName || 'User'}
            </p>
            <span className="role-tag p-gold">{role}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
