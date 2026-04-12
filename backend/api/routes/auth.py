"""
api/routes/auth.py — Google Sign-In and session endpoints.

Flow (Web Application OAuth via Expo auth proxy):
  1. Mobile opens Google auth via expo-auth-session using the Expo proxy redirect URI
     (https://auth.expo.io/@username/scope) — a valid https URL Google accepts.
  2. Google redirects to the proxy with an auth code; proxy deep-links back to the app.
  3. Mobile POSTs { code, code_verifier, redirect_uri } to POST /api/auth/google.
  4. Backend exchanges the code for tokens using client_id + client_secret (server-side).
  5. Backend verifies the id_token, upserts the user, stores refresh_token for Gmail scanning.
  6. Backend returns a JWT + access_token to the mobile.
"""

import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel

from core.auth import create_jwt, get_current_user
from core.database import upsert_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

_GOOGLE_CLIENT_ID     = os.environ.get("GOOGLE_CLIENT_ID", "")
_GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
_TOKEN_URL            = "https://oauth2.googleapis.com/token"


# ── Request / Response models ──────────────────────────────────────────────

class GoogleAuthRequest(BaseModel):
    code: str
    code_verifier: str
    redirect_uri: str


class UserOut(BaseModel):
    id: int
    email: str
    name: str | None
    gmail_sync_enabled: bool


class AuthResponse(BaseModel):
    jwt: str
    access_token: str
    user: UserOut


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/google", response_model=AuthResponse)
def google_sign_in(body: GoogleAuthRequest):
    """
    Exchange a Google authorization code for tokens, upsert the user,
    and return a session JWT + access_token for Google API calls.
    """
    if not _GOOGLE_CLIENT_ID or not _GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not configured",
        )

    # Exchange authorization code for tokens (server-side, keeps client_secret safe)
    try:
        token_resp = httpx.post(
            _TOKEN_URL,
            data={
                "code":          body.code,
                "code_verifier": body.code_verifier,
                "redirect_uri":  body.redirect_uri,
                "client_id":     _GOOGLE_CLIENT_ID,
                "client_secret": _GOOGLE_CLIENT_SECRET,
                "grant_type":    "authorization_code",
            },
            timeout=10,
        )
        token_resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google token exchange failed: {exc.response.text}",
        )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not reach Google token endpoint: {exc}",
        )

    token_data   = token_resp.json()
    raw_id_token = token_data.get("id_token", "")
    access_token = token_data.get("access_token", "")
    refresh_token = token_data.get("refresh_token")  # only present on first auth

    # Verify id_token to extract user identity
    try:
        id_info = google_id_token.verify_oauth2_token(
            raw_id_token,
            google_requests.Request(),
            _GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google id_token: {exc}",
        )

    google_sub = id_info["sub"]
    email      = id_info.get("email", "")
    name       = id_info.get("name")

    user  = upsert_user(google_sub, email, name, refresh_token)
    token = create_jwt(user["id"])

    return AuthResponse(
        jwt=token,
        access_token=access_token,
        user=UserOut(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            gmail_sync_enabled=bool(user["gmail_sync_enabled"]),
        ),
    )


@router.get("/me", response_model=UserOut)
def get_me(current_user: dict = Depends(get_current_user)):
    """Return the profile of the currently authenticated user."""
    return UserOut(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        gmail_sync_enabled=bool(current_user["gmail_sync_enabled"]),
    )
