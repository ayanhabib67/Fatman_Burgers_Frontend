const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const TOKEN_KEY = 'fatman_hr_token';

export function getHrToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setHrToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  const token = getHrToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/hr${path}`, {
    cache: 'no-store',
    ...options,
    headers: {
      ...headers,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  if (options.raw) return response;

  // 304 can arrive with an empty body → treat as hard miss and retry once
  if (response.status === 304) {
    const retry = await fetch(`${API_BASE_URL}/hr${path}`, {
      cache: 'reload',
      headers: {
        ...headers,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    const retryPayload = await retry.json().catch(() => ({}));
    if (!retry.ok) {
      const error = new Error(retryPayload.message || 'Request failed');
      error.status = retry.status;
      throw error;
    }
    return retryPayload;
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || 'Request failed');
    error.status = response.status;
    error.details = payload.details;
    throw error;
  }
  return payload;
}

export const hrClient = {
  get: (path) => request(path, { method: 'GET' }),
  post: (path, body) =>
    request(path, { method: 'POST', body: JSON.stringify(body || {}) }),
  patch: (path, body) =>
    request(path, { method: 'PATCH', body: JSON.stringify(body || {}) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  download: async (path) => {
    const response = await request(path, { method: 'GET', raw: true });
    if (!response.ok) throw new Error('Export failed');
    return response.text();
  },
};
