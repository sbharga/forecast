# Scope — UMD Campus Opportunity Map

A real-time map of University of Maryland campus events, built with FastAPI and React Native/Expo.

```
scope/
├── backend/          # Python · FastAPI
│   ├── main.py       # REST API (GET /api/events)
│   ├── scraper.py    # TerpLink scraper stub
│   ├── campus_map.json
│   └── requirements.txt
├── mobile/           # React Native · Expo
│   ├── App.js        # Map + date slider + event list
│   ├── app.json
│   └── package.json
├── .gitignore
└── README.md
```

---

## Backend

### 1. Create & activate a virtual environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Start the dev server

```bash
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
Interactive docs: `http://localhost:8000/docs`

---

## Mobile

### 1. Install dependencies

```bash
cd mobile
npm install
```

### 2. (Android) Add your Google Maps API key

Open `app.json` and replace `YOUR_GOOGLE_MAPS_API_KEY` with a real key from
[Google Cloud Console](https://console.cloud.google.com).  iOS uses Apple Maps
by default and does not need a key.

### 3. Start Expo

```bash
npx expo start
```

- Press `i` to open in the iOS Simulator.
- Press `a` to open in an Android emulator.
- Scan the QR code with the **Expo Go** app on a physical device.

> **Physical device tip:** In `App.js`, update `EVENTS_URL` from
> `http://localhost:8000/api/events` to your machine's local IP address, e.g.
> `http://192.168.1.42:8000/api/events`.  You can find your IP with
> `ipconfig getifaddr en0` (macOS) or `ipconfig` (Windows).

---

## API Reference

| Method | Path          | Description                       |
|--------|---------------|-----------------------------------|
| GET    | /api/events   | List upcoming campus events       |
| GET    | /health       | Health check                      |
| GET    | /docs         | Swagger UI (dev only)             |

### Event schema

```json
{
  "id": 1,
  "title": "Hackathon Kickoff @ Iribe",
  "lat": 38.9891,
  "lng": -76.9364,
  "start_time": "2026-04-12T10:00:00-04:00",
  "link": "https://terplink.umd.edu/event/1"
}
```

---

## Roadmap

- [ ] Wire `scraper.py` to the live TerpLink / Engage API
- [ ] Persist events to SQLite via SQLAlchemy
- [ ] Add building-polygon overlay from `campus_map.json`
- [ ] Push notifications for events starting soon
- [ ] Filter by category (academic, social, career, …)
