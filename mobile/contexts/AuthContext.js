import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';

// Required to dismiss the auth browser on Android after the redirect
WebBrowser.maybeCompleteAuthSession();

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.173.67.106:8000';
const JWT_KEY         = 'scope_jwt';
const ACCESS_TOKEN_KEY = 'scope_access_token';

const GOOGLE_SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.readonly',
];

// Google's OAuth discovery document endpoints
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint:         'https://oauth2.googleapis.com/token',
};

// Native redirect URI for iOS OAuth client.
// Google iOS client validates against the Bundle ID (edu.umd.scope), not an explicit URI list.
// This scheme is registered in app.json as the app's URL scheme.
const REDIRECT_URI = AuthSession.makeRedirectUri({
  native: 'edu.umd.scope:/oauth2redirect/google',
});
console.log('[auth] Redirect URI:', REDIRECT_URI);

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(null);   // { id, email, name, gmail_sync_enabled }
  const [jwt,         setJwt]         = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading,     setLoading]     = useState(true);   // true while restoring session on mount

  // PKCE code flow — backend exchanges the code server-side using client_secret
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId:     process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
      scopes:       GOOGLE_SCOPES,
      redirectUri:  REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      usePKCE:      true,
    },
    GOOGLE_DISCOVERY,
  );


  // ── Handle OAuth response ────────────────────────────────────────────────
  useEffect(() => {
    if (response?.type !== 'success') return;
    const code         = response.params.code;
    const codeVerifier = request?.codeVerifier;
    if (!code || !codeVerifier) return;

    _exchangeWithBackend(code, codeVerifier);
  }, [response]);

  // ── Restore session on app launch ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const storedJwt         = await SecureStore.getItemAsync(JWT_KEY);
        const storedAccessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
        if (!storedJwt) return;

        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${storedJwt}` },
        });

        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
          setJwt(storedJwt);
          setAccessToken(storedAccessToken);
        } else {
          await _clearStorage();
        }
      } catch {
        // Network error — stay signed in optimistically
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Send code to backend for server-side token exchange ──────────────────
  async function _exchangeWithBackend(code, codeVerifier) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          code,
          code_verifier: codeVerifier,
          redirect_uri:  REDIRECT_URI,
        }),
      });

      if (!res.ok) {
        console.warn('Auth: backend exchange failed', await res.text());
        return;
      }

      const { jwt: newJwt, access_token: newAccessToken, user: userData } = await res.json();

      await SecureStore.setItemAsync(JWT_KEY, newJwt);
      if (newAccessToken) {
        await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, newAccessToken);
      }
      setJwt(newJwt);
      setUser(userData);
      setAccessToken(newAccessToken ?? null);
    } catch (e) {
      console.warn('Auth: backend exchange error', e);
    }
  }

  async function _clearStorage() {
    await SecureStore.deleteItemAsync(JWT_KEY).catch(() => {});
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {});
  }

  // ── Public API ────────────────────────────────────────────────────────────
  const signIn = useCallback(() => {
    promptAsync({ showInRecents: true });
  }, [promptAsync]);

  const signOut = useCallback(async () => {
    await _clearStorage();
    setUser(null);
    setJwt(null);
    setAccessToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, jwt, accessToken, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
