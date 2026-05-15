# Krishi Shayak

An AI-powered agricultural assistant for Indian farmers. Provides plant disease detection from photos, weather-based farming insights, and an expert chat advisor — all in 10 Indian languages.

## Features

- **Plant Disease Detection** — Upload a photo of any leaf or crop; get instant diagnosis with organic and chemical treatment options grounded in ICAR/IARI research
- **Weather Insights** — Enter your location for real-time farming advice: disease risk, irrigation timing, and spraying alerts
- **Expert Chat** — Conversational agricultural advisor that understands Indian farming context and regional terminology
- **Voice Output** — Natural text-to-speech in Hindi, Marathi, Telugu, Tamil, Bengali, Gujarati, Kannada, Malayalam, Punjabi, and English
- **Multilingual** — Full UI and AI responses in all 10 languages
- **Offline History** — Previous detections and reports stored locally via Firebase

---

## Running Locally

### Prerequisites

- **Node.js v20+** — [Download](https://nodejs.org)
- **A GROQ API key** (free, no credit card) — [console.groq.com](https://console.groq.com)
- **A Firebase project** — [console.firebase.google.com](https://console.firebase.google.com)

---

### Step 1 — Clone and install

```bash
git clone <your-repo-url>
cd Krishi_Shayak
npm install
```

---

### Step 2 — Get your free GROQ API key

1. Go to [https://console.groq.com](https://console.groq.com) and sign up (free)
2. Click **API Keys** in the left sidebar
3. Click **Create API Key**, give it a name, and copy the key

---

### Step 3 — Set up Firebase

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**, give it a name, and follow the setup wizard
3. In your project, go to **Build → Authentication** and enable the **Email/Password** sign-in method
4. Go to **Build → Firestore Database**, click **Create database**, and choose **Start in test mode**
5. Go to **Project Settings** (gear icon) → **Your apps** → click the web icon (`</>`) to register a web app
6. Copy the config values shown — you will need them in the next step

---

### Step 4 — Create your `.env` file

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Then open `.env` and fill in:

```env
# AI — your GROQ key from Step 2
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Weather — optional but recommended (free at https://openweathermap.org/api)
# Without this, AI-generated seasonal estimates are used instead
# OPENWEATHER_API_KEY=

# Firebase — values from Step 3 (Project Settings → Your Web App)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# App URL — keep this as-is for local development
VITE_APP_URL=http://localhost:3000
```

---

### Step 5 — Start the app

```bash
npm run dev:all
```

This starts two processes:

- **API server** on `http://localhost:3001` (handles AI and weather calls)
- **Frontend** on `http://localhost:3000` (the React app)

Open [http://localhost:3000](http://localhost:3000) in your browser.

> If you only want the frontend (e.g. for UI work), use `npm run dev`.
> If you only want the API server, use `npm run server`.

---

### Optional — Real weather data

By default the weather feature uses AI-generated seasonal estimates for Indian locations. For accurate live weather:

1. Sign up free at [https://openweathermap.org/api](https://openweathermap.org/api)
2. Go to **API keys** and copy your key
3. Uncomment and fill in `.env`:
   ```env
   OPENWEATHER_API_KEY=your_key_here
   ```

---

## Project Structure

```
├── server.ts            # Express API server (local dev — handles all /api routes)
├── api/                 # Vercel Serverless Functions (production deployment)
│   ├── analyze-image.ts
│   ├── chat.ts
│   ├── weather.ts
│   ├── briefing.ts
│   └── check-image-quality.ts
├── src/
│   ├── App.tsx          # Main React app
│   ├── components/      # UI components
│   ├── services/        # API client and voice service
│   └── lib/             # Firebase and utilities
├── .env.example         # Template for environment variables
└── vite.config.ts       # Vite config with /api proxy to port 3001
```

**Local dev architecture:**

```
Browser (port 3000)
  └─ Vite dev server
       └─ /api/* → proxied to Express server (port 3001)
                         └─ GROQ API (AI)
                         └─ Firebase (auth + database)
```

---

## Deploying to Vercel

1. Push your code to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add the same environment variables from your `.env` under **Settings → Environment Variables** in the Vercel dashboard
4. Deploy — the `/api/*.ts` files run as Vercel Serverless Functions automatically

---

## AI Models Used (all free tier)

| Feature                 | Model                             | Provider |
| ----------------------- | --------------------------------- | -------- |
| Chat, weather, briefing | Llama 3.3 70B Versatile           | GROQ     |
| Plant disease detection | Llama 4 Scout 17B (multimodal)    | GROQ     |
| Image quality check     | Llama 4 Scout 17B (multimodal)    | GROQ     |

GROQ free tier limits: ~6000 tokens/minute. Sufficient for development and light usage. All endpoints fall back to mock responses if the quota is hit.

---

## Sharing / Distributing as a ZIP

To share this project pre-configured (no setup required for the recipient):

**Mac / Linux — run from inside the project folder:**
```bash
cd /path/to/Krishi_Shayak
zip -r ../krishi-shayak.zip . --exclude "*/dist/*" --exclude "*/.DS_Store"
```

**Windows — run from inside the project folder:**
```powershell
Compress-Archive -Path . -DestinationPath ..\krishi-shayak.zip
```

The recipient just unzips and runs:
```bash
npm run dev:all
```

That's it — no API key setup, no `npm install`, nothing else needed.

> All scripts work on both **Mac and Windows** without any changes.

---

## Troubleshooting

**`npm run dev:all` shows API errors or 500 responses**

- Check that `GROQ_API_KEY` is set in `.env` and the key is valid
- Make sure the API server (port 3001) started — look for `✅ Krishi Shayak API server` in the terminal

**Firebase auth not working**

- Confirm Email/Password is enabled in Firebase Console → Authentication → Sign-in method
- Double-check all six `VITE_FIREBASE_*` values in `.env` match your Firebase project settings exactly

**Port already in use**

- Mac/Linux: `lsof -ti:3001 | xargs kill` (API server) or `lsof -ti:3000 | xargs kill` (Vite)
- Windows: `netstat -ano | findstr :3001` to find the PID, then `taskkill /PID <pid> /F`

**Weather shows mock data**

- This is expected when `OPENWEATHER_API_KEY` is not set. Add it for live weather.

---

\*Built for Indian Farmers
