"""
core/auth.py — JWT creation, validation, and FastAPI dependency for authenticated routes.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from core.database import get_user_by_id

_bearer = HTTPBearer(auto_error=False)

_SECRET = os.environ.get("JWT_SECRET", "")
_ALGORITHM = "HS256"
_EXPIRE_DAYS = int(os.environ.get("JWT_EXPIRE_DAYS", "30"))


def create_jwt(user_id: int) -> str:
    """Return a signed JWT encoding the given user_id."""
    if not _SECRET:
        raise RuntimeError("JWT_SECRET environment variable is not set")
    payload = {
        "sub": str(user_id),
        "exp": datetime.now(timezone.utc) + timedelta(days=_EXPIRE_DAYS),
    }
    return jwt.encode(payload, _SECRET, algorithm=_ALGORITHM)


def decode_jwt(token: str) -> dict:
    """
    Decode and validate a JWT. Raises HTTP 401 on invalid or expired tokens.
    Returns the decoded payload dict on success.
    """
    if not _SECRET:
        raise RuntimeError("JWT_SECRET environment variable is not set")
    try:
        return jwt.decode(token, _SECRET, algorithms=[_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """
    FastAPI dependency that extracts and validates the Bearer JWT,
    then returns the corresponding user row from the database.
    Raises HTTP 401 if the token is missing, invalid, or the user no longer exists.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_jwt(credentials.credentials)
    user_id = int(payload["sub"])
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user
