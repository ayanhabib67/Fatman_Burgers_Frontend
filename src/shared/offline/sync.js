import { posSync } from '@/shared/api/posRpc';
import {
  buildSyncChanges,
  clearOutboxKeys,
  loadAuth,
  loadState,
  saveState,
} from '@/shared/offline/store';

/**
 * One sync round-trip: upload outbox changes, merge server rows.
 * Keeps till usable offline — call when online.
 */
export async function syncNow() {
  const auth = loadAuth();
  const roleAuth = auth?.roles?.barista || auth?.roles?.owner;
  if (!roleAuth?.token) {
    return { ok: false, error: 'auth' };
  }

  const state = loadState();
  const { changes, keys } = buildSyncChanges(state);

  const result = await posSync({
    token: roleAuth.token,
    cursor: state.cursor || 0,
    minDay: '',
    seq: state.seq || 0,
    changes,
  });

  if (!result?.ok) {
    return result;
  }

  let next = loadState();

  if (result.reset) {
    // Server restored / cursor ahead — keep local outbox; cursor resets
    next.cursor = 0;
  } else {
    next.cursor = result.cursor ?? next.cursor;
  }

  if (typeof result.seq === 'number') {
    next.seq = Math.max(Number(next.seq || 0), result.seq);
  }

  if (result.epoch) {
    next.epoch = result.epoch;
  }

  // Merge remote rows (LWW already resolved server-side for conflicts)
  for (const row of result.rows || []) {
    const [kind, record] = row;
    if (!record) continue;

    if (Array.isArray(next[kind])) {
      const list = [...next[kind]];
      const idx = list.findIndex((item) => String(item.id) === String(record.id));
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      next[kind] = list;
    } else if (kind === 'customItems') {
      const list = [...(next.customItems || [])];
      const idx = list.findIndex(
        (item) => String(item.n).toLowerCase() === String(record.n).toLowerCase()
      );
      if (idx >= 0) list[idx] = record;
      else list.push(record);
      next.customItems = list;
    } else {
      next.more = { ...(next.more || {}) };
      const bucket = Array.isArray(next.more[kind]) ? [...next.more[kind]] : [];
      const idx = bucket.findIndex((item) => String(item.id) === String(record.id));
      if (idx >= 0) bucket[idx] = record;
      else bucket.push(record);
      next.more[kind] = bucket;
    }
  }

  next = saveState(next);

  if (keys.length && !result.reset) {
    clearOutboxKeys(next, keys);
  }

  return result;
}
