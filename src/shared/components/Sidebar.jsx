import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { navGroupsForRole } from '@/modules/registry';
import { useHrAuth } from '@/shared/hr/HrAuthContext';

function NavItem({ item }) {
  if (item.external) {
    return (
      <a href={item.path} className="nav-link">
        <span>{item.label}</span>
      </a>
    );
  }
  return (
    <NavLink
      to={item.path}
      className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
      end={item.path === '/hr'}
    >
      <span>{item.label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, logout } = useHrAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState({});
  const groups = navGroupsForRole(user?.hrRole);

  // Keep the group that owns the current route expanded (GuStaff-style)
  const activeGroups = groups.reduce((acc, g) => {
    if (!g.label) return acc;
    acc[g.key] = g.items.some(
      (i) => pathname === i.path || (i.path !== '/hr' && pathname.startsWith(i.path))
    );
    return acc;
  }, {});

  const isGroupOpen = (key) =>
    open[key] !== undefined ? open[key] : Boolean(activeGroups[key]);

  return (
    <aside className="app-sidebar">
      <div className="mb-6 px-2 pt-2">
        <div className="flex items-center gap-3">
          <img
            src="/img/logo.png"
            alt="FatMan"
            className="h-11 w-11 rounded-lg bg-white/10 object-contain p-1"
          />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
              FatMan Burgers
            </p>
            <h1 className="text-lg font-bold leading-tight text-white">
              {user?.hrRole === 'pos' ? 'POS Portal' : 'HR Portal'}
            </h1>
          </div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-1 overflow-y-auto" aria-label="Main">
        {groups.map((group) => {
          if (!group.label) {
            return (
              <div key={group.key} className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavItem key={item.key} item={item} />
                ))}
              </div>
            );
          }
          const isOpen = isGroupOpen(group.key);
          return (
            <div key={group.key} className="nav-section">
              <button
                type="button"
                className="nav-section-head"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [group.key]: !isOpen }))}
              >
                <span>{group.label}</span>
                <span aria-hidden>{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen ? (
                <div className="nav-section-body">
                  {group.items.map((item) => (
                    <NavItem key={item.key} item={item} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>

      <div className="mt-4 space-y-2 px-1 pb-2">
        <button type="button" onClick={logout} className="btn-side">
          Logout
        </button>
      </div>
    </aside>
  );
}
