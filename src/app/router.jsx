import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from '@/shared/components/AppLayout';
import PageLoader from '@/shared/components/PageLoader';
import ErrorBoundary from '@/shared/components/ErrorBoundary';
import { useHrAuth } from '@/shared/hr/HrAuthContext';
import { TILL_URL, isPosOnly } from '@/modules/registry';

const HrLoginPage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.HrLoginPage }))
);
const HrHomePage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.HrHomePage }))
);
const DirectoryPage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.DirectoryPage }))
);
const EmployeeFormPage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.EmployeeFormPage }))
);
const ShiftsPage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.ShiftsPage }))
);
const DevicesPage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.DevicesPage }))
);
const AttendancePage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.AttendancePage }))
);
const EmployeeAttendancePage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.EmployeeAttendancePage }))
);
const StaffBoardPage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.StaffBoardPage }))
);
const LeavePage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.LeavePage }))
);
const CorrectionsPage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.CorrectionsPage }))
);
const OvertimePage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.OvertimePage }))
);
const PunchLogsPage = lazy(() =>
  import('@/modules/hr').then((m) => ({ default: m.PunchLogsPage }))
);

function LazyRoute({ children }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

function RequireHr({ children }) {
  const { user, loading } = useHrAuth();
  if (loading) return <PageLoader label="Checking session…" />;
  if (!user) return <Navigate to="/hr/login" replace />;
  // POS operators only get the till — never HR pages
  if (isPosOnly(user.hrRole)) {
    window.location.replace(TILL_URL);
    return <PageLoader label="Opening till…" />;
  }
  return children;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route
        path="/hr/login"
        element={
          <LazyRoute>
            <HrLoginPage />
          </LazyRoute>
        }
      />

      <Route
        element={
          <RequireHr>
            <AppLayout />
          </RequireHr>
        }
      >
        <Route
          path="/hr"
          element={
            <LazyRoute>
              <HrHomePage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/staff"
          element={
            <LazyRoute>
              <StaffBoardPage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/directory"
          element={
            <LazyRoute>
              <DirectoryPage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/directory/new"
          element={
            <LazyRoute>
              <EmployeeFormPage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/directory/:id"
          element={
            <LazyRoute>
              <EmployeeFormPage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/shifts"
          element={
            <LazyRoute>
              <ShiftsPage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/devices"
          element={
            <LazyRoute>
              <DevicesPage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/attendance"
          element={
            <LazyRoute>
              <AttendancePage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/attendance/:employeeId"
          element={
            <LazyRoute>
              <EmployeeAttendancePage />
            </LazyRoute>
          }
        />
        <Route path="/hr/timesheets" element={<Navigate to="/hr/attendance" replace />} />
        <Route
          path="/hr/logs"
          element={
            <LazyRoute>
              <PunchLogsPage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/leave"
          element={
            <LazyRoute>
              <LeavePage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/corrections"
          element={
            <LazyRoute>
              <CorrectionsPage />
            </LazyRoute>
          }
        />
        <Route
          path="/hr/overtime"
          element={
            <LazyRoute>
              <OvertimePage />
            </LazyRoute>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/hr" replace />} />
      <Route path="*" element={<Navigate to="/hr" replace />} />
    </Routes>
  );
}
