/**
 * Распознавание сбоев ЗАГРУЗКИ КОДА (динамический import / чанк Vite).
 *
 * Зачем отдельный модуль: такие ошибки лечатся иначе, чем ошибки логики.
 * Их не надо показывать как «баг» и не надо окружать try/catch-заглушками —
 * нужен либо ретрай импорта, либо свежий документ (после деплоя старый HTML
 * ссылается на уже удалённые файлы, и внутри той же страницы это не лечится).
 *
 * Сообщения отличаются по браузерам и по способу загрузки:
 *  - Chrome/Edge: "Failed to fetch dynamically imported module: https://…"
 *  - Firefox:     "error loading dynamically imported module: https://…"
 *  - Safari:      "Importing a module script failed."
 *  - старый Chrome/webpack-подобные: "Loading chunk 123 failed", "ChunkLoadError"
 *  - оффлайн/флапающий канал: "Failed to fetch", "NetworkError", "Load failed"
 */
const CHUNK_LOAD_RE = /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|Failed to fetch|NetworkError|Load failed|Network request failed|import\(\)|HTTP ?5\d\d|504|502/i;

/** true, если ошибка означает «код не догрузился», а не «код упал». */
export function isChunkLoadError(e) {
  if (e == null) return false;
  const msg = typeof e === 'string' ? e : String(e.message || e.reason || e);
  if (!msg) return false;
  if (CHUNK_LOAD_RE.test(msg)) return true;
  // Некоторые обёртки теряют текст, но сохраняют имя/код.
  const name = typeof e === 'object' ? String(e.name || '') : '';
  const code = typeof e === 'object' ? String(e.code || '') : '';
  return /ChunkLoadError/i.test(name) || /^(ERR_)?(NETWORK|IMPORT)(_|$)/i.test(code);
}

/**
 * Стоит ли перезагружать страницу один раз из-за сбоя чанка.
 * Не чаще одного раза в `windowMs` на вкладку — иначе получится цикл
 * «перезагрузка → снова сбой → перезагрузка» при лежащей сети.
 *
 * Pure: принимает время последней перезагрузки (0/NaN — ещё не было) и «сейчас».
 */
export function shouldHardReload(lastReloadAt, now, windowMs = 25000) {
  const last = +lastReloadAt || 0;
  const t = +now || 0;
  if (!t) return false;
  if (last <= 0) return true;
  const age = t - last;
  if (age < 0) return true; // часы уехали назад — не блокируем восстановление
  return age >= windowMs;
}