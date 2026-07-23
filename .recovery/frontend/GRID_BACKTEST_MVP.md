# Grid Analyzer + Backtest + Optimizer (MVP)

## 1) Coin Selector for Grid

Цель: ранжировать монеты, которые лучше подходят под сетку (mean-reversion и ликвидность).

Базовые метрики (на 5m/1h):
- `rangeStability`: доля времени, когда цена остается внутри rolling-канала.
- `meanReversionScore`: скорость возврата к локальной средней после отклонения.
- `noiseToTrend`: отношение пилы к направленному тренду (лучше выше для grid).
- `liqScore`: нормализованный `vol24 + trd24 + spreadPenalty`.
- `wickFillRatio`: как часто свечи прокалывают уровни и возвращаются.

Итоговый скор:
`gridScore = 0.30*rangeStability + 0.25*meanReversionScore + 0.20*noiseToTrend + 0.20*liqScore + 0.05*wickFillRatio`

Выход:
- Top-N монет.
- Для каждой: `gridScore`, риск-флаги, краткое объяснение "почему выбрана".

## 2) Manual Backtest

Входные параметры:
- Диапазон: `bottom`, `top`.
- Размер сетки: `levels` или `stepPct`.
- Режим: `neutral | long-biased | short-biased`.
- Плечо, депозит, комиссия maker/taker, funding.
- Окно теста: `startTs`, `endTs`.

Событийная модель:
- Симуляция по историческим свечам + внутрибарное касание уровней по `high/low`.
- Заполнение лимитных ордеров на уровнях.
- PnL, fee, funding, маржа, liquidation guard.

Метрики отчета:
- `netProfit`, `maxDrawdown`, `profitFactor`, `fillCount`,
- `utilization` (доля времени с открытыми позициями),
- equity-кривая, worst period.

## 3) Optimizer

Перебор:
- `levels`, `stepPct`, диапазон, режим, плечо.
- Grid search на первом этапе; далее можно random/Bayesian.

Ограничения:
- отсекать конфиги с `maxDrawdown > limit`;
- отсекать конфиги с низкой ликвидностью на инструменте.

Сортировки:
- max profit,
- min drawdown,
- best profit/drawdown,
- robust score (стабильность по под-периодам).

## 4) Архитектура внедрения

Этап 1 (быстро, в клиенте):
- модуль `grid-engine` в фронте;
- запуск в `WebWorker`, чтобы не блокировать UI;
- UI-таблица результатов + карточка отчета.

Этап 2 (масштаб):
- вынести симулятор в backend-job для массовых прогонов;
- кэшировать результаты по ключу параметров;
- добавить очередь оптимизаций.

## 5) Definition of Done (MVP)

- Есть экран Coin Selector с объяснением ранга.
- Есть Manual Backtest с базовыми метриками и equity.
- Есть Optimizer с сортировками и экспортом лучших конфигов.
- Время расчета в UI не блокирует интерфейс.
