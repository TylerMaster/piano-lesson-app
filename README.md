# Piano Lesson Companion

An Android-first app for recording piano lessons and turning them
into organized lesson notes and practice assignments.

See [CLAUDE.md](CLAUDE.md) for project goals, technical decisions,
audio experiment findings, and development guidelines.

---

## Project structure

```
piano-lesson-app/
├── mobile/        React Native / Expo / TypeScript app
├── processing/    Python FastAPI transcription service (Whisper)
├── backend/       Java Spring Boot REST API + PostgreSQL
└── scripts/       Helper scripts (Windows port-proxy setup)
```

---

## How it works

```
Android phone (Expo Go)
    │  POST /lessons          — register lesson record
    │  POST /lessons/{id}/audio — upload m4a recording
    │  GET  /lessons/{id}     — poll for transcript
    ▼
Spring Boot API (port 8083)
    │  saves metadata to PostgreSQL
    │  saves audio file to backend/audio-uploads/
    │  calls POST /transcribe (async, background thread)
    ▼
Python Whisper service (port 8000)
    │  runs OpenAI Whisper locally (tiny model by default)
    ▼
Transcript stored in PostgreSQL
    │  Spring Boot returns it on the next GET /lessons/{id} poll
    ▼
Mobile app displays transcript and saves it locally to AsyncStorage
```

The mobile app is **local-first**. Lessons are recorded and stored
on-device immediately. Transcription is optional — a lesson without a
`backendId` is fully usable for playback, rename, and delete.

### Transcription status lifecycle

```
PENDING  →  PROCESSING  →  DONE
                        ↘  FAILED
```

The mobile app polls GET /lessons/{id} every 4 seconds once audio is
uploaded. Polling stops when status reaches DONE or FAILED, and when
the PlaybackScreen unmounts.

### Restart recovery

If the user closes the app while transcription is in progress:

- The backend continues running Whisper in the background.
- When the user reopens the lesson, the mount effect in PlaybackScreen
  fetches the latest status from the backend.
- If PROCESSING, polling resumes automatically.
- If DONE, the transcript is saved locally and displayed immediately.
- If FAILED, an error is shown with a retry option.

---

## Mobile lesson IDs

The mobile app uses two independent IDs for each lesson:

| Field       | Type     | Purpose                                       |
|-------------|----------|-----------------------------------------------|
| `id`        | `string` | Local ID, generated as `Date.now().toString()`  |
| `backendId` | `number` | Backend-assigned PostgreSQL ID (optional)     |

`id` is used for all local operations (AsyncStorage, playback, rename,
delete). `backendId` is set after a successful POST /lessons call and
persisted immediately — before the audio upload — so a failed upload
can be retried against the same backend lesson without creating a
duplicate.

---

## Running the backend (development)

### 1. Start PostgreSQL

```bash
cd backend/
docker compose up -d
```

This starts `piano-lesson-db` on **host port 5434** (container port 5432).
Data is stored in the `backend_piano_lessons_postgres_data` Docker volume and
survives container restarts.

### 2. Start the Spring Boot API

```bash
cd backend/
SPRING_PROFILES_ACTIVE=local ./gradlew bootRun
```

The API starts on **port 8083**. Credentials are read from
`src/main/resources/application-local.properties` (not committed to Git).

### 3. Start the Python transcription service

```bash
cd processing/
source .venv/bin/activate
WHISPER_MODEL=tiny uvicorn main:app --host 0.0.0.0 --port 8000
```

The service runs on **port 8000** and must be running before audio uploads
will produce a transcript. The tiny model (~5 seconds for a 1-minute clip)
is good for development. Use `WHISPER_MODEL=small` for better accuracy.

### Stopping everything

```bash
# Spring Boot: Ctrl-C in its terminal
# Transcription service: Ctrl-C

# Stop the database container (data is preserved):
cd backend/ && docker compose stop

# Stop and remove the container (data still preserved in volume):
cd backend/ && docker compose down
```

---

## REST API endpoints (port 8083)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/lessons`          | List all lessons |
| `GET`  | `/lessons/{id}`     | Get one lesson including transcript |
| `POST` | `/lessons`          | Register a lesson record |
| `POST` | `/lessons/{id}/audio` | Upload audio; triggers async transcription |

**POST /lessons body (JSON):**
```json
{
    "title": "Practice session",
    "recordedAt": "2024-11-04T18:00:00Z",
    "durationMs": 60000
}
```

**POST /lessons/{id}/audio:** multipart/form-data, field name `audio`.
Returns 202 Accepted immediately with `transcriptStatus: "PROCESSING"`.
Poll GET /lessons/{id} until status is `DONE` or `FAILED`.

---

## Android-to-WSL2 networking

The Android phone communicates with Spring Boot over WiFi. WSL2 runs in
a private virtual network, so a Windows port proxy is required to forward
traffic from the phone to WSL2.

### One-time setup

1. **Open PowerShell as Administrator** on Windows.

2. **Run the port-proxy script:**
   ```powershell
   cd path\to\piano-lesson-app
   .\scripts\setup-portproxy.ps1
   ```
   This script:
   - Gets the current WSL2 IP automatically.
   - Configures `netsh portproxy` to forward `0.0.0.0:8083 → WSL2:8083`.
   - Adds a Windows Firewall rule to allow inbound TCP on port 8083.

3. **Find your Windows WiFi IP:**
   ```powershell
   ipconfig
   ```
   Look for **IPv4 Address** under your WiFi adapter
   (e.g., `192.168.1.42` — ignore the WSL adapter).

4. **Update `mobile/src/config.ts`:**
   ```typescript
   export const BACKEND_URL = 'http://192.168.1.42:8083';
   ```

5. **Test from your Android phone's browser:**
   Navigate to `http://192.168.1.42:8083/lessons`
   A response of `[]` or a JSON array confirms connectivity.

### After WSL2 restarts

WSL2 is assigned a new IP on every restart. Re-run the script whenever
this happens:
```powershell
.\scripts\setup-portproxy.ps1
```
The `BACKEND_URL` in config.ts does not need to change — only the internal
proxy target changes (which the script handles automatically).

### Phone and PC must be on the same WiFi network

The phone connects to the Windows LAN IP, not the WSL2 IP. Make sure
the phone and the Windows machine are connected to the same WiFi network.
The Python service (port 8000) stays inside WSL2 and is never exposed
to the phone.

---

## Running the mobile app

```bash
cd mobile/
npx expo start --tunnel
```

The `--tunnel` flag is required on WSL2 because direct LAN connections
to the Expo Metro bundler are blocked by the same WSL2 networking
restrictions described above. For transcription to work (backend calls),
`BACKEND_URL` in config.ts must be set to your Windows WiFi IP.

---

## Port assignments (this machine)

| Service | Host port |
|---------|-----------|
| job-scraper PostgreSQL | 5432 |
| banking-postgres | 5433 |
| piano-lesson-db | **5434** |
| banking Spring Boot | 8082 |
| piano-lesson Spring Boot | **8083** |
| piano-lesson transcription (FastAPI) | **8000** |

---

## Known limitations

- **No timeout on audio upload.** React Native's `fetch` has no built-in
  timeout. A very slow connection may hang indefinitely. Acceptable for MVP.
- **No authentication.** All API endpoints are unauthenticated. Only use
  on a trusted local network.
- **WSL2 IP changes on restart.** Run `setup-portproxy.ps1` after each
  `wsl --shutdown`.
- **Stuck PROCESSING on backend restart.** If Spring Boot restarts while
  Whisper is running, the lesson stays in PROCESSING permanently. Workaround:
  retry the upload from the app — it re-uses the same backend lesson.
- **Tiny model accuracy.** The `tiny` Whisper model is fast but may
  misrecognise music-related vocabulary. Switch to `small` for production use.

---

## Existing audio experiments

The original Demucs/Whisper experiments are maintained separately
in `~/projects/piano-master/piano-voice-test` and are not part of this project.
