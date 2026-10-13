/** Local recovery copies, scoped by account. JWT decoding is not authentication. */
export function sessionScope(token, decodeBase64 = globalThis.atob) {
  if (!token) return 'guest';
  try {
    const part = token.split('.')[1];
    if (!part || typeof decodeBase64 !== 'function') return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(decodeBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));
    const id = payload.userId;
    if (!Number.isSafeInteger(id) || id <= 0) return null;
    return `user:${id}`;
  } catch {
    // A malformed account token must never fall back to the guest's data.
    return null;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createSessionPersistence(storage, scope) {
  const key = scope ? `cs_session_v1:${scope}` : null;
  function read() {
    if (!key) return { version: 1, drawings: {} };
    try {
      const value = JSON.parse(storage.getItem(key));
      if (value?.version === 1 && isObject(value.drawings)) return value;
    } catch {}
    return { version: 1, drawings: {} };
  }
  function write(value) {
    if (!key) return false;
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      // Storage may be blocked or full; server persistence must still run.
      return false;
    }
  }
  function saveSettings(settings) {
    if (!isObject(settings)) return null;
    const snapshot = read();
    const json = JSON.stringify(settings);
    snapshot.settings = { value: JSON.parse(json), dirty: true };
    return write(snapshot) ? json : null;
  }
  function saveDrawings(sym, drawings) {
    if (!/^[A-Z0-9]{1,20}$/.test(sym) || !Array.isArray(drawings)) return null;
    const snapshot = read();
    const json = JSON.stringify(drawings);
    snapshot.drawings[sym] = { value: JSON.parse(json), dirty: true };
    return write(snapshot) ? json : null;
  }
  function acknowledgeSettings(sentJson) {
    const snapshot = read();
    const record = snapshot.settings;
    if (!record || JSON.stringify(record.value) !== sentJson) return false;
    record.dirty = false;
    return write(snapshot);
  }
  function acknowledgeDrawings(sym, sentJson) {
    const snapshot = read();
    const record = snapshot.drawings[sym];
    if (!record || JSON.stringify(record.value) !== sentJson) return false;
    record.dirty = false;
    return write(snapshot);
  }
  function restore(serverSettings, serverDrawings) {
    const snapshot = read();
    const localSettings = snapshot.settings;
    const hasServerSettings = isObject(serverSettings);
    const hasServerDrawings = isObject(serverDrawings);
    const settings = isObject(localSettings?.value) && (!hasServerSettings || localSettings.dirty === true)
      ? localSettings.value : hasServerSettings ? serverSettings : null;
    const drawings = {};
    if (hasServerDrawings) {
      for (const [sym, value] of Object.entries(serverDrawings)) {
        if (/^[A-Z0-9]{1,20}$/.test(sym) && Array.isArray(value)) drawings[sym] = value;
      }
    }
    const dirtyDrawSyms = [];
    for (const [sym, record] of Object.entries(snapshot.drawings)) {
      if (!/^[A-Z0-9]{1,20}$/.test(sym) || !Array.isArray(record?.value)) continue;
      if (!hasServerDrawings || record.dirty === true) drawings[sym] = record.value;
      if (record.dirty === true) dirtyDrawSyms.push(sym);
    }
    // Refresh clean recovery copies from successful server loads. A clean
    // drawing missing on the server stays deleted rather than resurrecting.
    const recovered = { version: 1, drawings: {} };
    if (settings) recovered.settings = { value: settings, dirty: localSettings?.dirty === true };
    for (const [sym, value] of Object.entries(drawings)) {
      recovered.drawings[sym] = { value, dirty: snapshot.drawings[sym]?.dirty === true };
    }
    write(recovered);
    return {
      settings, drawings, dirtyDrawSyms,
      settingsDirty: isObject(localSettings?.value) && localSettings.dirty === true,
    };
  }
  return { saveSettings, saveDrawings, acknowledgeSettings, acknowledgeDrawings, restore };
}
