// Cloud save: every sb27.* setting / squad / editor player mirrored to Firebase Realtime Database
// (REST API, no SDK) under /superball27/main, so progress survives new phones, links and cache wipes.
// On the first sync a device uploads what it already has, unless the cloud holds more progress.

export const DATABASE_URL = 'https://mingchat-e8a29-default-rtdb.firebaseio.com';
const PATH = '/superball27/main.json';
const META = 'sb27.cloud'; // this device's bookkeeping, never uploaded

const toRemote = k => k.replace(/\./g, '_');
const toLocal = k => k.replace(/^sb27_/, 'sb27.');

// all synced keys in a storage, as { sb27_profile: '<json string>', ... }
export function snapshot(storage) {
  const out = {};
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith('sb27.') && k !== META) out[toRemote(k)] = storage.getItem(k);
  }
  return out;
}

// rough "how much has been played" so a first sync never replaces real progress with less
export function progressScore(data) {
  try {
    const p = JSON.parse(data.sb27_profile || 'null');
    if (!p) return 0;
    const r = p.record || {};
    return (p.owned || []).length + 3 * Object.keys(p.custom || {}).length + 2 * Object.keys(p.edits || {}).length + (r.w || 0) + (r.d || 0) + (r.l || 0);
  } catch (_) { return 0; }
}

// 'upload' | 'download' | 'none'
export function decide({ local, remote, meta }) {
  if (!remote || !remote.data) return Object.keys(local).length ? 'upload' : 'none';
  if (meta.syncedAt == null) return progressScore(local) > progressScore(remote.data) ? 'upload' : 'download';
  if (remote.updatedAt > meta.syncedAt) return meta.dirty && (meta.changedAt || 0) > remote.updatedAt ? 'upload' : 'download';
  return meta.dirty ? 'upload' : 'none';
}

// ---------------------------------------------------------------- browser side
let status = 'off', onStatus = () => {}, url = '', timer = 0;
const setStatus = s => { status = s; onStatus(s); };
export const cloudStatus = () => status;

function readMeta() { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch (_) { return {}; } }
function writeMeta(m) { try { _set.call(localStorage, META, JSON.stringify(m)); } catch (_) { /* ignore */ } }
let _set, _remove; // the real Storage methods, captured when the cloud starts

async function upload(keepalive = false) {
  const updatedAt = Date.now();
  try {
    const r = await fetch(url, { method: 'PUT', keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ updatedAt, data: snapshot(localStorage) }) });
    if (!r.ok) throw new Error(r.status);
    writeMeta({ ...readMeta(), syncedAt: updatedAt, dirty: false });
    setStatus('synced');
  } catch (e) { setStatus(/40[13]/.test(String(e.message)) ? 'blocked' : 'offline'); }
}

function markDirty() {
  writeMeta({ ...readMeta(), dirty: true, changedAt: Date.now() });
  clearTimeout(timer);
  timer = setTimeout(() => upload(), 2500);
}

export async function startCloud(opts = {}) {
  url = opts.url || (typeof window !== 'undefined' && window.SB27_CLOUD_URL) || DATABASE_URL + PATH;
  onStatus = opts.onStatus || onStatus;
  _set = Storage.prototype.setItem; _remove = Storage.prototype.removeItem;
  // every save to an sb27.* key schedules an upload
  Storage.prototype.setItem = function (k, v) { _set.call(this, k, v); if (this === localStorage && k.startsWith('sb27.') && k !== META) markDirty(); };
  Storage.prototype.removeItem = function (k) { _remove.call(this, k); if (this === localStorage && k.startsWith('sb27.') && k !== META) markDirty(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && readMeta().dirty) upload(true); });

  setStatus('syncing');
  let remote;
  try {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(to);
    if (!r.ok) throw new Error(r.status);
    remote = await r.json();
  } catch (e) { setStatus(/40[13]/.test(String(e.message)) ? 'blocked' : 'offline'); return 'offline'; }

  const action = decide({ local: snapshot(localStorage), remote, meta: readMeta() });
  if (action === 'upload') await upload();
  else if (action === 'download') {
    // replace this device's game data with the cloud copy, then restart once to load it
    for (const k of Object.keys(snapshot(localStorage))) _remove.call(localStorage, toLocal(k));
    for (const [k, v] of Object.entries(remote.data)) _set.call(localStorage, toLocal(k), v);
    writeMeta({ syncedAt: remote.updatedAt, dirty: false });
    setStatus('synced');
    if (!sessionStorage.getItem('sb27-cloud-reload')) { sessionStorage.setItem('sb27-cloud-reload', '1'); location.reload(); }
  } else setStatus('synced');
  return action;
}
