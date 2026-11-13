import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { getModuleMetaByPath } from '@/modules/registry';

export default function AppLayout() {
  const { pathname } = useLocation();
  const meta = getModuleMetaByPath(pathname);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Header title={meta?.label || 'POS'} />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
