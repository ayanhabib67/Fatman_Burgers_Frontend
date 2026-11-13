import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useHrAuth } from '@/shared/hr/HrAuthContext';
import { toast } from '@/shared/components/Toast';
import { TILL_URL, isPosOnly } from '@/modules/registry';

export default function HrLoginPage() {
  const { user, login, loading } = useHrAuth();
  const [email, setEmail] = useState('hr@fatman.local');
  const [password, setPassword] = useState('admin123');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    if (isPosOnly(user.hrRole)) {
      window.location.replace(TILL_URL);
      return null;
    }
    return <Navigate to="/hr" replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(email, password);
      toast('Welcome back');
      if (isPosOnly(u?.hrRole)) {
        window.location.replace(TILL_URL);
        return;
      }
    } catch (err) {
      toast(err.message || 'Login failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-portal relative flex min-h-screen items-center justify-center bg-white px-4 py-10">
      <div className="relative w-full max-w-[420px] animate-fade-in">
        <div className="rounded-2xl border border-[var(--color-line)] bg-white p-8 shadow-[var(--shadow-app)] sm:p-9">
          <div className="space-y-6">
            <div className="text-center">
              <img
                alt="FatMan Burgers"
                src="/img/logo.png"
                className="mx-auto mb-5 h-16 w-auto max-w-[220px] object-contain"
              />
              <h1 className="text-2xl font-bold leading-tight text-[var(--color-ink)]">
                FatMan Burgers{' '}
                <span className="text-[var(--color-red)]">Portal</span>
              </h1>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Sign in to HR · attendance, leave & people
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="field-label" htmlFor="hr-email">
                  Email *
                </label>
                <input
                  id="hr-email"
                  type="email"
                  className="field-input"
                  placeholder="you@fatman.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="field-label mb-0" htmlFor="hr-password">
                    Password *
                  </label>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--color-red)]"
                    tabIndex={-1}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="hr-password"
                    type={showPw ? 'text' : 'password'}
                    className="field-input pr-10"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs text-[#7a6b6b]"
                  >
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={busy} className="btn-primary w-full py-2.5">
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <a
              href="/till/index.html"
              className="block text-center text-sm font-medium text-[var(--color-muted)] hover:text-[var(--color-teal)]"
            >
              Open POS till instead
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
