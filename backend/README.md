# CryptScreen — Инструкция по деплою

## Структура проекта

```
cryptscreen/
├── frontend/          ← Vite-приложение → деплой на Vercel
│   ├── index.html
│   ├── src/
│   │   ├── main.js    ← auth + весь код приложения
│   │   └── style.css
│   ├── vite.config.js
│   └── package.json
│
└── backend/           ← Node.js/Express → деплой на Railway
    ├── server.js
    ├── routes/
    │   ├── auth.js    ← /api/auth/register, /api/auth/login
    │   └── user.js    ← /api/user/settings, drawings, alerts
    ├── middleware/
    │   └── auth.js    ← JWT проверка
    ├── db/
    │   ├── pool.js    ← подключение к PostgreSQL
    │   └── schema.sql ← таблицы БД
    └── package.json
```

---

## Шаг 1 — База данных (Railway PostgreSQL)

1. Зайди на https://railway.app → New Project → Add PostgreSQL
2. После создания открой вкладку **Variables** → скопируй `DATABASE_URL`
3. Открой вкладку **Query** (или подключись через psql) и запусти содержимое `backend/db/schema.sql`

---

## Шаг 2 — Бэкенд (Railway Node.js)

1. В том же Railway проекте: **New Service → GitHub Repo**
2. Укажи папку `backend` как root (или залей только её)
3. Во вкладке **Variables** добавь:

```
DATABASE_URL=<скопировал на шаге 1>
JWT_SECRET=<придумай длинную случайную строку, например: openssl rand -hex 32>
FRONTEND_URL=https://your-app.vercel.app
PORT=3001
```

4. Railway сам запустит `npm start` → сервис получит публичный URL вида `https://xxx.railway.app`

---

## Шаг 3 — Фронтенд (Vercel)

1. Зайди на https://vercel.com → New Project → GitHub Repo
2. Укажи папку `frontend` как root directory
3. Framework preset: **Vite**
4. В **Environment Variables** добавь:

```
VITE_BACKEND_URL=https://xxx.railway.app
```

5. Deploy → получишь URL вида `https://cryptscreen.vercel.app`

6. Вернись в Railway бэкенд → обнови `FRONTEND_URL` на этот Vercel URL

---

## Локальная разработка

### Backend
```bash
cd backend
npm install
cp .env.example .env
# заполни .env своими значениями
npm run dev
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# в .env.local: VITE_BACKEND_URL=http://localhost:3001
npm run dev
# открой http://localhost:5173
```

### Применить схему БД локально
```bash
psql $DATABASE_URL -f backend/db/schema.sql
```

---

## API Reference

| Метод | URL | Описание |
|-------|-----|----------|
| POST | /api/auth/register | Регистрация |
| POST | /api/auth/login | Вход → возвращает JWT |
| GET | /api/user/me | Профиль пользователя |
| GET | /api/user/settings | Загрузить настройки |
| POST | /api/user/settings | Сохранить настройки |
| GET | /api/user/drawings | Все рисунки |
| GET | /api/user/drawings/:symbol | Рисунки по символу |
| POST | /api/user/drawings/:symbol | Сохранить рисунки |
| DELETE | /api/user/drawings/:symbol | Удалить рисунки |
| GET | /api/user/alerts | Все алерты |
| POST | /api/user/alerts | Создать алерт |
| DELETE | /api/user/alerts/:id | Удалить алерт |
| PATCH | /api/user/alerts/:id/toggle | Вкл/выкл алерт |

Все `/api/user/*` требуют заголовок:
```
Authorization: Bearer <token>
```

---

## Что происходит при сборке

`npm run build` в папке `frontend` создаст папку `dist/` с:
- Минифицированным и обфусцированным JS (terser)
- CSS бандлом
- index.html

Пользователь видит работающий сайт, но исходный код нечитаем.

---

## Следующие шаги (опционально)

- [ ] Подписка через Stripe (`/api/user/subscription`)
- [ ] Email-алерты через Resend/SendGrid
- [ ] Rate limiting (express-rate-limit)
- [ ] Refresh tokens (сейчас JWT живёт 30 дней)
