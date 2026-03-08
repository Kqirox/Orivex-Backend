# Discoverly Restaurant Dashboard

Lightweight React/Vite dashboard for restaurant menu management.

## Run

```bash
npm install -w web
npm run dev -w web
```

## Environment

Optional:

- `VITE_API_BASE_URL` (default: `http://localhost:4000`)

The dashboard expects:

- `POST /api/upload`
- `GET /api/restaurant/foods`
- `POST /api/restaurant/foods`
- `PUT /api/restaurant/foods/:id`
- `DELETE /api/restaurant/foods/:id`
