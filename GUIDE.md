# Google Cloud Setup Guide

This guide walks through everything needed to enable Google Sign-In, Gmail scanning, and Google Calendar integration in Scope.

---

## Prerequisites

- A Google account
- The Scope backend and mobile app cloned locally
- Node/npm and Python installed

---

## Step 1 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click the project dropdown at the top → **New Project**
3. Name it `Scope` (or anything you like) → **Create**
4. Make sure the new project is selected in the dropdown before continuing

---

## Step 2 — Enable the Required APIs

You need to enable three APIs. Do this for each one:

1. In the left sidebar go to **APIs & Services → Library**
2. Search for the API name, click it, then click **Enable**

Enable all three:
- **Gmail API**
- **Google Calendar API**
- **Google People API**

---

## Step 3 — Configure the OAuth Consent Screen

Before creating credentials, Google requires you to set up a consent screen (the page users see when signing in).

1. Go to **APIs & Services → OAuth consent screen**
2. Choose **External** → **Create**
3. Fill in the required fields:
   - **App name**: `Scope`
   - **User support email**: your email
   - **Developer contact email**: your email
4. Click **Save and Continue** through the Scopes page (you don't need to add scopes here)
5. On the **Test users** page, click **Add Users** and add any Google accounts you want to test with during development. While the app is in "Testing" mode, only these accounts can sign in.
6. Click **Save and Continue** → **Back to Dashboard**

> **Note:** The app stays in "Testing" mode until you publish it. For a campus app with a small user base, testing mode is fine indefinitely — just add each user's Google account to the test users list.

---

## Step 4 — Create the OAuth 2.0 Client

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth 2.0 Client ID**
3. For **Application type**, choose **Web application**
4. Name it `Scope Web Client`
5. Under **Authorized redirect URIs**, click **Add URI**
6. Leave it blank for now — you'll fill it in after Step 5
7. Click **Create**

Google will show you a dialog with your **Client ID** and **Client Secret**. Copy both — you'll need them shortly. You can also find them later under **APIs & Services → Credentials**.

---

## Step 5 — Find Your Expo Redirect URI

The mobile app uses the Expo auth proxy as the OAuth redirect target. You need to find the exact URL it generates for your project.

1. Open `mobile/contexts/AuthContext.js`
2. Add this line temporarily right after the `REDIRECT_URI` constant (around line 34):
   ```js
   console.log('Redirect URI:', REDIRECT_URI);
   ```
3. Start the Expo dev server:
   ```bash
   cd mobile
   npx expo start
   ```
4. Open the app in Expo Go on your phone or an emulator
5. Check the terminal output — you'll see a line like:
   ```
   Redirect URI: https://auth.expo.io/@your-username/scope
   ```
6. Copy that full URL
7. Remove the `console.log` line you added

> If you're not logged into an Expo account, the URL will look like `https://auth.expo.io/@anonymous/scope`. Either URL works — just register whichever one you see.

---

## Step 6 — Register the Redirect URI in Google Cloud

1. Go back to **APIs & Services → Credentials**
2. Click the **Scope Web Client** you created in Step 4
3. Under **Authorized redirect URIs**, click **Add URI**
4. Paste the URL you copied in Step 5 (e.g. `https://auth.expo.io/@your-username/scope`)
5. Click **Save**

---

## Step 7 — Fill in the Backend `.env`

In `backend/`, copy the example file if you haven't already:

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in these values:

```env
GEMINI_API_KEY=your_gemini_api_key

GOOGLE_CLIENT_ID=your_client_id_from_step_4
GOOGLE_CLIENT_SECRET=your_client_secret_from_step_4

JWT_SECRET=run_this_to_generate_one
JWT_EXPIRE_DAYS=30
```

To generate `JWT_SECRET`, run:

```bash
openssl rand -hex 32
```

---

## Step 8 — Fill in the Mobile `.env`

Open `mobile/.env` and fill in:

```env
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your_client_id_from_step_4

EXPO_PUBLIC_API_BASE_URL=http://YOUR_MACHINE_IP:8000
```

> The `EXPO_PUBLIC_GOOGLE_CLIENT_ID` is the same Client ID as the backend — both use the same Web Application client.

To find your machine's local IP (for `API_BASE_URL`):
- **Mac/Linux**: run `ifconfig | grep "inet "` and look for your local network IP (starts with `192.168.` or `10.`)
- **Windows**: run `ipconfig` and look for IPv4 Address

---

## Step 9 — Install Dependencies and Run

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

**Mobile:**
```bash
cd mobile
npx expo start
```

---

## Step 10 — Test Sign-In

1. Open the app and go to the **Intel** tab
2. Tap **Connect** next to Gmail
3. A browser window opens showing Google's sign-in screen
4. Sign in with one of the test user accounts from Step 3
5. After approving, you should be returned to the app with the Gmail row showing your email address and a green checkmark

---

## Troubleshooting

**"Error 400: redirect_uri_mismatch"**
The redirect URI in your app doesn't match what's registered in Google Cloud. Double-check Step 5 and Step 6 — the URL must be an exact match, including the username and slug.

**"Access blocked: This app's request is invalid"**
Your app is in Testing mode and the account you're signing in with isn't on the test users list. Add it in **OAuth consent screen → Test users**.

**"GOOGLE_CLIENT_ID is not configured"**
The backend `.env` is missing or the variable name is wrong. Make sure the file is at `backend/.env` (not `backend/.env.example`) and that `GOOGLE_CLIENT_ID` is set.

**Gmail not syncing events**
The Gmail sync worker runs every 15 minutes and only processes unread emails from the past 24 hours. To trigger it immediately for testing, restart the backend server — the first sync runs on startup.

**Calendar button shows "Sign in to Save" even when signed in**
The `access_token` may have expired (Google access tokens last 1 hour). Sign out and sign back in from the Intel tab to get a fresh token.
