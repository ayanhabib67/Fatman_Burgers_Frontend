import { createContext, useContext, useEffect, useState } from 'react';
import { hrClient, getHrToken, setHrToken } from '@/shared/api/hrClient';

const HrAuthContext = createContext(null);

export function HrAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!getHrToken()) {
      setUser(null);
      setLoading(false);
      return null;
    }
    try {
      const res = await hrClient.get('/auth/me');
      setUser(res.data);
      return res.data;
    } catch {
      setHrToken('');
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const login = async (email, password) => {
    const res = await hrClient.post('/auth/login', { email, password });
    setHrToken(res.data.token);
    setUser(res.data.user);
    return res.data.user;
  };

  const logout = () => {
    setHrToken('');
    setUser(null);
  };

  return (
    <HrAuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </HrAuthContext.Provider>
  );
}

export function useHrAuth() {
  const ctx = useContext(HrAuthContext);
  if (!ctx) throw new Error('useHrAuth outside provider');
  return ctx;
}
