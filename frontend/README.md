# ATGS Frontend (React + Vite)

- Dev server: Vite (React)
- Routing: React Router v6
- State: Zustand
- CSV: PapaParse
- HTTP: Axios
- Realtime: socket.io-client (ready)

## Available scripts

- npm install
- npm run dev
- npm run build
- npm run preview

## Environment

- API base is proxied to http://localhost:4000 via Vite proxy for paths starting with /api and /socket.io

## Structure

src/
- App.jsx, main.jsx
- routes.jsx
- components/
- pages/
- services/
- store/
- styles/global.css

## Next steps

- Wire Login to backend JWT
- Implement CSV endpoints (/api/admin/upload)
- Build visual drag-n-drop builder
- Connect timetables to backend data
