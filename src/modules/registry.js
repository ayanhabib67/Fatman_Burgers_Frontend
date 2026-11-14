/**
 * Frontend module registry (modular monolith).
 * POS till remains at /till/ (static). React shell hosts HR + future modules.
 * Nav groups mirror GuStaff: People / Attendance.
 */
export const moduleNavGroups = [
  {
    key: 'root',
    label: null,
    roles: ['admin', 'employee'],
    items: [{ key: 'hr-home', label: 'Dashboard', path: '/hr', roles: ['admin', 'employee'] }],
  },
  {
    key: 'people',
    label: 'People',
    roles: ['admin', 'employee'],
    items: [
      { key: 'hr-staff', label: 'Staff board', path: '/hr/staff', roles: ['admin', 'employee'] },
      { key: 'hr-directory', label: 'Employee Directory', path: '/hr/directory', roles: ['admin'] },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    roles: ['admin', 'employee'],
    items: [
      { key: 'hr-attendance', label: 'Attendance', path: '/hr/attendance', roles: ['admin', 'employee'] },
      { key: 'hr-overtime', label: 'Overtime', path: '/hr/overtime', roles: ['admin', 'employee'] },
      { key: 'hr-leave', label: 'Leave & Approvals', path: '/hr/leave', roles: ['admin', 'employee'] },
      { key: 'hr-logs', label: 'Punch logs', path: '/hr/logs', roles: ['admin'] },
      { key: 'hr-devices', label: 'Gate & Devices', path: '/hr/devices', roles: ['admin'] },
      { key: 'hr-corrections', label: 'Attendance Corrections', path: '/hr/corrections', roles: ['admin', 'employee'] },
      { key: 'hr-shifts', label: 'Shifts', path: '/hr/shifts', roles: ['admin'] },
    ],
  },
  {
    key: 'other',
    label: null,
    roles: ['admin', 'employee', 'pos'],
    items: [
      {
        key: 'pos-till',
        label: 'POS Till',
        path: '/till/',
        external: true,
        roles: ['admin', 'employee', 'pos'],
      },
    ],
  },
];

export const moduleNav = moduleNavGroups.flatMap((g) => g.items);

export function navGroupsForRole(role) {
  const r = role || 'employee';
  return moduleNavGroups
    .map((g) => ({
      ...g,
      items: (g.items || []).filter((i) => !i.roles || i.roles.includes(r)),
    }))
    .filter((g) => (!g.roles || g.roles.includes(r)) && g.items.length > 0);
}

export const TILL_URL = '/till/';

export function isPosOnly(role) {
  return role === 'pos';
}

export function getModuleMetaByPath(pathname) {
  if (pathname === '/hr' || pathname === '/hr/') {
    return moduleNav.find((item) => item.path === '/hr');
  }
  return (
    moduleNav.find((item) => item.path !== '/hr' && pathname.startsWith(item.path)) ||
    moduleNav[0]
  );
}
