# Forecast — UMD Campus Opportunity Map

A real-time map and feed of University of Maryland campus events, deadlines, and opportunities. Events are pulled from TerpLink, Discord, Gmail, and the CS department — ranked by semantic relevance to your interests.

```
Forecast/
├── backend/                  # Python · FastAPI
│   ├── api/
│   │   ├── main.py           # REST API + bot/Gmail lifecycle
│   │   └── routes/auth.py    # Google OAuth endpoints
│   ├── core/
│   │   ├── ai_parser.py      # Gemini event + deadline extraction
│   │   ├── database.py       # SQLite helpers
│   │   ├── embedder.py       # Vertex AI text embeddings
│   │   ├── geocoder.py       # Campus building → lat/lng
│   │   └── scoring.py        # In-memory cosine similarity scoring
│   ├── workers/
│   │   ├── discord.py        # Discord bot (event review + deadline capture)
│   │   ├── gmail_sync.py     # Gmail background sync loop
│   │   ├── terplink.py       # TerpLink scraper
│   │   └── cs_news.py        # UMD CS department RSS feed
│   ├── campus_map.json       # Valid campus buildings
│   ├── scope.db              # SQLite database (auto-created)
│   └── requirements.txt
├── mobile/                   # React Native · Expo SDK 54
│   ├── screens/
│   │   ├── MapScreen.js      # Full-screen map with day slider
│   │   ├── FeedScreen.js     # Priority-ranked event feed
│   │   ├── DeadlinesScreen.js# Upcoming deadlines with countdown
│   │   └── IntelScreen.js    # Keywords, sources, account
│   ├── contexts/
│   │   ├── EventsContext.js  # Events state, scoring, caching
│   │   └── AuthContext.js    # Google Sign-In (iOS OAuth)
│   ├── utils/
│   │   ├── categories.js     # Event categorization
│   │   ├── scoring.js        # Client-side keyword scoring
│   │   └── calendar.js       # Google Calendar integration
│   ├── app.json
│   └── package.json
└── README.md
```

---

## Backend

### 1. Create & activate a virtual environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

Create `backend/.env`:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
GEMINI_API_KEY=your_gemini_api_key
GOOGLE_CLIENT_ID=your_ios_oauth_client_id.apps.googleusercontent.com
JWT_SECRET=your_random_secret
JWT_EXPIRE_DAYS=30
```

### 4. Populate the database

```bash
# From backend/
python -m workers.terplink   # TerpLink events
python -m workers.cs_news    # CS department news
```

### 5. Start the API server

```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

The Discord bot and Gmail sync loop start automatically with the server.

- API docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

---

## Mobile

### 1. Install dependencies

```bash
cd mobile
npm install
```

### 2. Configure environment

Create `mobile/.env`:

```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your_ios_oauth_client_id.apps.googleusercontent.com
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

### 3. Build and run on iOS Simulator

```bash
npx expo run:ios
```

> **Physical device:** Set `EXPO_PUBLIC_API_BASE_URL` to your machine's LAN IP, e.g. `http://192.168.1.42:8000`.

---

## API Reference

| Method | Path                | Description                              |
|--------|---------------------|------------------------------------------|
| GET    | /api/events         | Upcoming events (`?keywords=a,b` scores) |
| GET    | /api/deadlines      | Upcoming deadlines sorted by due date    |
| POST   | /api/auth/google    | Exchange Google auth code for JWT        |
| GET    | /api/auth/me        | Current authenticated user               |
| GET    | /health             | Health check                             |

### Event schema

```json
{
  "id": 1,
  "title": "HackUMBC",
  "lat": 38.9891,
  "lng": -76.9364,
  "start_time": "2026-04-20T10:00:00-04:00",
  "link": "https://terplink.umd.edu/event/1",
  "location": "Iribe Center",
  "source": "terplink",
  "semantic_score": 87
}
```

### Deadline schema

```json
{
  "id": 1,
  "title": "Google STEP Internship Application",
  "source": "gmail",
  "link": "https://careers.google.com/...",
  "deadline_time": "2026-04-30T23:59:00-04:00"
}
```

---

## How ranking works

Each event gets a `priorityScore` (0–100) computed from two sources:

- **Semantic score** (server): cosine similarity between a Gemini text embedding of the event and the user's keyword query. Threshold 0.62 — unrelated events score 0.
- **Keyword score** (client): exact title/location/category match against saved keywords, with source and urgency multipliers.

Final score = `Math.max(semanticScore, keywordScore)` so neither system can suppress the other.
