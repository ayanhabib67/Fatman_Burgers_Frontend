/**
 * Till RPC client — same contract as old Supabase /rest/v1/rpc/*
 * All business logic lives on Express; MongoDB stores data only.
 */
const RPC_BASE = import.meta.env.VITE_POS_RPC_BASE || '/api/v1';

export async function posRpc(fn, p = null, options = {}) {
  const body = p === null || p === undefined ? {} : { p };

  const response = await fetch(`${RPC_BASE}/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok && data?.ok !== false) {
    const error = new Error(data.message || `RPC failed: ${fn}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const posPing = () => posRpc('pos_ping');
export const posLogin = (payload) => posRpc('pos_login', payload);
export const posSync = (payload) => posRpc('pos_sync', payload);
export const posSetPin = (payload) => posRpc('pos_set_pin', payload);
