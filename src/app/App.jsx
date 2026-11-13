import { BrowserRouter } from 'react-router-dom';
import AppRouter from './router';
import { HrAuthProvider } from '@/shared/hr/HrAuthContext';
import { ToastHost } from '@/shared/components/Toast';

export default function App() {
  return (
    <BrowserRouter>
      <HrAuthProvider>
        <AppRouter />
        <ToastHost />
      </HrAuthProvider>
    </BrowserRouter>
  );
}
