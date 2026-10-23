// Тесты распознавания сбоев загрузки чанка и защиты от цикла перезагрузок.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isChunkLoadError, shouldHardReload } from '../src/chunk-load.js';

test('isChunkLoadError: реальные сообщения браузеров про динамический импорт', () => {
  const real = [
    'Failed to fetch dynamically imported module: https://cryptscreen.vercel.app/assets/gridSmart-a1b2.js',
    'error loading dynamically imported module: https://x/assets/gridBotScreeners-zz.js',
    'Importing a module script failed.',
    'Loading chunk 42 failed.',
    'ChunkLoadError: Loading chunk vendors failed',
    'TypeError: Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'Load failed',
  ];
  for (const m of real) assert.equal(isChunkLoadError(new Error(m)), true, m);
  assert.equal(isChunkLoadError('Failed to fetch'), true, 'строка, не Error');
});

test('isChunkLoadError: ошибки ЛОГИКИ не считаются сбоем загрузки', () => {
  const logic = [
    'Cannot read properties of undefined (reading "lc")',
    'reg is not a function',
    'обработчик openGridSwingScreener не установлен после загрузки модуля',
    '',
  ];
  for (const m of logic) assert.equal(isChunkLoadError(new Error(m)), false, m);
  assert.equal(isChunkLoadError(null), false);
  assert.equal(isChunkLoadError(undefined), false);
  assert.equal(isChunkLoadError({}), false);
});

test('isChunkLoadError: имя и код ошибки тоже учитываются', () => {
  const e = new Error('что-то пошло не так');
  e.name = 'ChunkLoadError';
  assert.equal(isChunkLoadError(e), true);
  const e2 = new Error('без текста');
  e2.code = 'ERR_NETWORK';
  assert.equal(isChunkLoadError(e2), true);
});

test('shouldHardReload: первый раз — да, второй сразу — нет, через окно — снова да', () => {
  const now = 1_000_000_000_000;
  assert.equal(shouldHardReload(0, now), true, 'перезагрузок ещё не было');
  assert.equal(shouldHardReload(NaN, now), true);
  assert.equal(shouldHardReload(now - 1000, now, 25000), false, '1 с назад — цикл, запрещаем');
  assert.equal(shouldHardReload(now - 24999, now, 25000), false, 'граница окна');
  assert.equal(shouldHardReload(now - 25000, now, 25000), true, 'окно прошло');
  assert.equal(shouldHardReload(now - 5 * 60000, now, 25000), true);
});

test('shouldHardReload: часы уехали назад — не блокируем восстановление', () => {
  const now = 1_000_000_000_000;
  assert.equal(shouldHardReload(now + 60000, now, 25000), true);
  assert.equal(shouldHardReload(0, 0), false, 'без времени сейчас — не перезагружаем');
});