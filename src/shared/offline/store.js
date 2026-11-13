/**
 * Offline-first device store (FatMan outlet).
 * Mirrors live till keys: state blob + auth + outbox dirty flags.
 */
const OUTLET = 'fatman';
const SUF = `_${OUTLET}`;

export const STORAGE_KEYS = {
  STATE: `whipped_pos_v5${SUF}`,
  AUTH: `whipped_pos_auth${SUF}`,
  LOCK: `whipped_pos_lock${SUF}`,
};

const emptyState = () => ({
  orders: [],
  expenses: [],
  voided: [],
  seq: 0,
  paper80: true,
  matchaLocal: false,
  customItems: [],
  dirty: {},
  cursor: 0,
  outbox: {},
  migrated: true,
  epoch: null,
  skew: 0,
  more: {},
  kinds: {},
});

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATE);
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    return emptyState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(state));
  return state;
}

export function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUTH);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveAuth(auth) {
  localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(auth));
  return auth;
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEYS.AUTH);
}

/**
 * Mark a record dirty for upload (outbox).
 * kind+id stays until pos_sync confirms.
 */
export function commitRecord(state, kind, id, record) {
  const next = { ...state };
  next.outbox = { ...(next.outbox || {}) };
  next.outbox[`${kind}:${id}`] = true;

  if (Array.isArray(next[kind])) {
    const list = [...next[kind]];
    const idx = list.findIndex((row) => String(row.id) === String(id));
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    next[kind] = list;
  } else if (kind === 'customItems') {
    const list = [...(next.customItems || [])];
    const idx = list.findIndex((row) => String(row.n).toLowerCase() === String(record.n).toLowerCase());
    if (idx >= 0) list[idx] = record;
    else list.push(record);
    next.customItems = list;
  } else {
    next.more = { ...(next.more || {}) };
    const bucket = Array.isArray(next.more[kind]) ? [...next.more[kind]] : [];
    const idx = bucket.findIndex((row) => String(row.id) === String(id));
    if (idx >= 0) bucket[idx] = record;
    else bucket.push(record);
    next.more[kind] = bucket;
  }

  return saveState(next);
}

export function outboxCount(state = loadState()) {
  return Object.keys(state.outbox || {}).length;
}

export function buildSyncChanges(state = loadState(), limit = 200) {
  const changes = {};
  const keys = Object.keys(state.outbox || {}).slice(0, limit);

  for (const key of keys) {
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    let record = null;

    if (Array.isArray(state[kind])) {
      record = state[kind].find((row) => String(row.id) === String(id));
    } else if (kind === 'customItems') {
      record = (state.customItems || []).find(
        (row) => `ci:${String(row.n).toLowerCase()}` === key || String(row.n).toLowerCase() === id
      );
    } else if (state.more?.[kind]) {
      record = state.more[kind].find((row) => String(row.id) === String(id));
    }

    if (!record) continue;
    if (!changes[kind]) changes[kind] = [];
    changes[kind].push(record);
  }

  return { changes, keys };
}

export function clearOutboxKeys(state, keys = []) {
  const next = { ...state, outbox: { ...(state.outbox || {}) } };
  for (const key of keys) delete next.outbox[key];
  return saveState(next);
}
