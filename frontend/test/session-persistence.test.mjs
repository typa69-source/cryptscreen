import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionScope, createSessionPersistence } from '../src/sessionPersistence.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
function token(userId) {
  return `header.${Buffer.from(JSON.stringify({ userId })).toString('base64url')}.signature`;
}

test('session scopes isolate guests and accounts without storing tokens', () => {
  assert.equal(sessionScope(null), 'guest');
  assert.equal(sessionScope(token(7)), 'user:7');
  assert.equal(sessionScope(token(8)), 'user:8');
  assert.equal(sessionScope('broken'), null);
  assert.equal(sessionScope(token('../guest')), null);
  const storage = memoryStorage();
  const guest = createSessionPersistence(storage, 'guest');
  const first = createSessionPersistence(storage, 'user:7');
  const second = createSessionPersistence(storage, 'user:8');
  guest.saveSettings({ symGroups: { BTCUSDT: 1 } });
  first.saveSettings({ symGroups: { ETHUSDT: 2 } });
  assert.deepEqual(second.restore(null, null).settings, null);
  assert.deepEqual(first.restore(null, null).settings.symGroups, { ETHUSDT: 2 });
  assert.deepEqual(guest.restore(null, null).settings.symGroups, { BTCUSDT: 1 });
});

test('immediate reload restores unsent categories and drawing deletions', () => {
  const storage = memoryStorage();
  const before = createSessionPersistence(storage, 'user:7');
  before.saveSettings({ symGroups: {}, lineColors: { hray: '#123456' } });
  before.saveDrawings('BTCUSDT', []);
  const after = createSessionPersistence(storage, 'user:7');
  const restored = after.restore(
    { symGroups: { BTCUSDT: 3 } },
    { BTCUSDT: [{ id: 1, type: 'hray' }], ETHUSDT: [{ id: 2 }] },
  );
  assert.deepEqual(restored.settings.symGroups, {});
  assert.deepEqual(restored.drawings.BTCUSDT, []);
  assert.deepEqual(restored.drawings.ETHUSDT, [{ id: 2 }]);
  assert.deepEqual(restored.dirtyDrawSyms, ['BTCUSDT']);
  assert.equal(restored.settingsDirty, true);
});

test('clean recovery copies do not override newer server data', () => {
  const persistence = createSessionPersistence(memoryStorage(), 'user:7');
  const settingsJson = persistence.saveSettings({ symGroups: { BTCUSDT: 1 } });
  const drawingJson = persistence.saveDrawings('BTCUSDT', [{ id: 1 }]);
  persistence.acknowledgeSettings(settingsJson);
  persistence.acknowledgeDrawings('BTCUSDT', drawingJson);
  const restored = persistence.restore({ symGroups: {} }, {});
  assert.deepEqual(restored.settings, { symGroups: {} });
  assert.deepEqual(restored.drawings, {});
  assert.equal(restored.settingsDirty, false);
  assert.deepEqual(restored.dirtyDrawSyms, []);
});

test('late server acknowledgements cannot clear a newer local edit', () => {
  const persistence = createSessionPersistence(memoryStorage(), 'user:7');
  const oldSettings = persistence.saveSettings({ theme: 'old' });
  const oldDrawings = persistence.saveDrawings('BTCUSDT', [{ id: 1 }]);
  persistence.saveSettings({ theme: 'new' });
  persistence.saveDrawings('BTCUSDT', []);
  assert.equal(persistence.acknowledgeSettings(oldSettings), false);
  assert.equal(persistence.acknowledgeDrawings('BTCUSDT', oldDrawings), false);
  const restored = persistence.restore({ theme: 'old' }, { BTCUSDT: [{ id: 1 }] });
  assert.equal(restored.settings.theme, 'new');
  assert.deepEqual(restored.drawings.BTCUSDT, []);
  assert.equal(restored.settingsDirty, true);
});

test('offline loads retain clean copies as recovery data', () => {
  const storage = memoryStorage();
  const persistence = createSessionPersistence(storage, 'guest');
  persistence.restore({ theme: 'dark' }, { BTCUSDT: [{ id: 5 }] });
  const restored = createSessionPersistence(storage, 'guest').restore(null, null);
  assert.equal(restored.settings.theme, 'dark');
  assert.deepEqual(restored.drawings.BTCUSDT, [{ id: 5 }]);
});

test('blocked storage and invalid account scopes degrade safely', () => {
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('quota'); },
  };
  const persistence = createSessionPersistence(blocked, 'guest');
  assert.equal(persistence.saveSettings({ theme: 'dark' }), null);
  assert.deepEqual(persistence.restore({ theme: 'server' }, {}).settings, { theme: 'server' });
  const disabled = createSessionPersistence(memoryStorage(), null);
  assert.equal(disabled.saveDrawings('BTCUSDT', []), null);
  assert.deepEqual(disabled.restore(null, null).drawings, {});
});
