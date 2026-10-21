from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "safety.db"
PBKDF2_ITERATIONS = 310_000
SESSION_HOURS = 12


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def utc_after(hours: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime(
        "%Y-%m-%d %H:%M:%S"
    )


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {row["name"] for row in rows}


def _add_column_if_missing(
    conn: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    if column not in _table_columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return salt.hex(), digest.hex()


def verify_password(password: str, salt_hex: str, password_hash: str) -> bool:
    try:
        salt = bytes.fromhex(salt_hex)
    except ValueError:
        return False
    _, candidate = hash_password(password, salt)
    return secrets.compare_digest(candidate, password_hash)


def init_db(create_initial_admin: bool = True) -> dict[str, str] | None:
    """Create/migrate database and create the first supervisor when needed.

    Returns the initial account credentials only when a new first account was
    created. The plaintext password is never stored.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS supervisors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            display_name TEXT,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login_at DATETIME
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supervisor_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            FOREIGN KEY (supervisor_id)
                REFERENCES supervisors(id) ON DELETE CASCADE
        )
        """
    )

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS cameras (
            camera_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            location TEXT,
            source_type TEXT NOT NULL DEFAULT 'local',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    # Keep the original events table compatible with existing project DBs.
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            camera_id TEXT NOT NULL,
            track_id INTEGER,
            event_type TEXT NOT NULL,
            class_name TEXT,
            confidence REAL,
            start_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen_time DATETIME,
            end_time DATETIME,
            status TEXT NOT NULL DEFAULT 'open',
            is_improved INTEGER NOT NULL DEFAULT 0,
            improved_at DATETIME,
            improved_by INTEGER,
            image_path TEXT,
            message TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (camera_id)
                REFERENCES cameras(camera_id),
            FOREIGN KEY (improved_by)
                REFERENCES supervisors(id) ON DELETE SET NULL
        )
        """
    )

    # Migration from the project's earlier events schema.
    _add_column_if_missing(conn, "events", "last_seen_time", "DATETIME")
    _add_column_if_missing(conn, "events", "is_improved", "INTEGER NOT NULL DEFAULT 0")
    _add_column_if_missing(conn, "events", "improved_at", "DATETIME")
    _add_column_if_missing(conn, "events", "improved_by", "INTEGER")
    _add_column_if_missing(conn, "events", "message", "TEXT")
    _add_column_if_missing(conn, "events", "created_at", "DATETIME")
    _add_column_if_missing(conn, "events", "updated_at", "DATETIME")

    now = utc_now()
    cursor.execute(
        """
        UPDATE events
        SET status = 'open'
        WHERE status IS NULL OR status = '' OR status = 'active'
        """
    )
    cursor.execute(
        """
        UPDATE events
        SET created_at = COALESCE(created_at, start_time, ?),
            updated_at = COALESCE(updated_at, start_time, ?),
            last_seen_time = COALESCE(last_seen_time, start_time)
        """,
        (now, now),
    )

    cursor.execute(
        """
        INSERT OR IGNORE INTO cameras (
            camera_id, name, location, source_type, is_active
        ) VALUES (?, ?, ?, ?, 1)
        """,
        ("camera-01", "Camera 01", "Development Camera", "local"),
    )

    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_camera_time ON events(camera_id, start_time DESC)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_events_improved_time ON events(is_improved, start_time DESC)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)"
    )

    initial_credentials = None
    count = cursor.execute("SELECT COUNT(*) AS c FROM supervisors").fetchone()["c"]
    if create_initial_admin and count == 0:
        username = os.getenv("INITIAL_ADMIN_USERNAME")
        password = os.getenv("INITIAL_ADMIN_PASSWORD")
        if not username or not password:
            raise RuntimeError("請在 .env 設定 INITIAL_ADMIN_USERNAME 與 INITIAL_ADMIN_PASSWORD")
        salt, password_hash = hash_password(password)
        cursor.execute(
            """
            INSERT INTO supervisors (
                username, display_name, password_hash, password_salt, is_active
            ) VALUES (?, ?, ?, ?, 1)
            """,
            (username, "System Administrator", password_hash, salt),
        )
        initial_credentials = {"username": username, "password": password}

    conn.commit()
    conn.close()
    from v2_data import init_v2_db
    init_v2_db()
    return initial_credentials


# ---------------------------------------------------------------------------
# Cameras
# ---------------------------------------------------------------------------


def get_cameras() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT camera_id, name, location, source_type, is_active,
                   created_at, updated_at
            FROM cameras
            ORDER BY camera_id
            """
        ).fetchall()
    return [dict(row) for row in rows]


def get_camera(camera_id: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT camera_id, name, location, source_type, is_active,
                   created_at, updated_at
            FROM cameras
            WHERE camera_id = ?
            """,
            (camera_id,),
        ).fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------


def create_event(
    camera_id: str,
    event_type: str,
    message: str,
    track_id: int | None = None,
    class_name: str | None = None,
    confidence: float | None = None,
    image_path: str | None = None,
    event_time: str | None = None,
) -> int:
    event_time = event_time or utc_now()
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO events (
                camera_id, track_id, event_type, class_name, confidence,
                start_time, last_seen_time, status, is_improved,
                image_path, message, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 0, ?, ?, ?, ?)
            """,
            (
                camera_id,
                track_id,
                event_type,
                class_name,
                confidence,
                event_time,
                event_time,
                image_path,
                message,
                event_time,
                event_time,
            ),
        )
        event_id = cursor.lastrowid
    return int(event_id)


def update_event_last_seen(event_id: int, seen_time: str | None = None) -> None:
    seen_time = seen_time or utc_now()
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE events
            SET last_seen_time = ?, updated_at = ?
            WHERE id = ?
            """,
            (seen_time, seen_time, event_id),
        )


def end_event_detection(event_id: int, end_time: str | None = None) -> None:
    end_time = end_time or utc_now()
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE events
            SET end_time = COALESCE(end_time, ?), updated_at = ?
            WHERE id = ?
            """,
            (end_time, end_time, event_id),
        )


def get_events(
    limit: int = 100,
    offset: int = 0,
    camera_id: str | None = None,
    is_improved: bool | None = None,
) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))
    where: list[str] = []
    params: list[Any] = []

    if camera_id:
        where.append("e.camera_id = ?")
        params.append(camera_id)
    if is_improved is not None:
        where.append("e.is_improved = ?")
        params.append(1 if is_improved else 0)

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    params.extend([limit, offset])

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                e.*,
                s.username AS improved_by_username
            FROM events e
            LEFT JOIN supervisors s ON s.id = e.improved_by
            {where_sql}
            ORDER BY e.start_time DESC, e.id DESC
            LIMIT ? OFFSET ?
            """,
            params,
        ).fetchall()

    return [_normalize_event(dict(row)) for row in rows]


def get_events_by_camera(camera_id: str, limit: int = 100) -> list[dict[str, Any]]:
    return get_events(limit=limit, camera_id=camera_id)


def get_event(event_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT e.*, s.username AS improved_by_username
            FROM events e
            LEFT JOIN supervisors s ON s.id = e.improved_by
            WHERE e.id = ?
            """,
            (event_id,),
        ).fetchone()
    return _normalize_event(dict(row)) if row else None


def set_event_improved(
    event_id: int,
    is_improved: bool,
    supervisor_id: int,
) -> dict[str, Any] | None:
    now = utc_now()
    with get_connection() as conn:
        exists = conn.execute("SELECT id FROM events WHERE id = ?", (event_id,)).fetchone()
        if not exists:
            return None

        if is_improved:
            conn.execute(
                """
                UPDATE events
                SET is_improved = 1,
                    status = 'improved',
                    review_status = 'improved',
                    improved_at = ?,
                    improved_by = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (now, supervisor_id, now, event_id),
            )
        else:
            conn.execute(
                """
                UPDATE events
                SET is_improved = 0,
                    status = 'open',
                    review_status = 'pending',
                    improved_at = NULL,
                    improved_by = NULL,
                    updated_at = ?
                WHERE id = ?
                """,
                (now, event_id),
            )

    return get_event(event_id)


def _normalize_event(event: dict[str, Any]) -> dict[str, Any]:
    event["is_improved"] = bool(event.get("is_improved", 0))
    return event


# Backward-compatible function name used by older code.
def save_event(
    camera_id,
    event_type,
    class_name=None,
    confidence=None,
    image_path=None,
):
    return create_event(
        camera_id=camera_id,
        event_type=event_type,
        message=event_type,
        class_name=class_name,
        confidence=confidence,
        image_path=image_path,
    )


# ---------------------------------------------------------------------------
# Supervisors and authentication sessions
# ---------------------------------------------------------------------------


def get_supervisors() -> list[dict[str, Any]]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, username, display_name, is_active, role,
                   created_at, updated_at, last_login_at
            FROM supervisors
            ORDER BY id
            """
        ).fetchall()
    return [_normalize_supervisor(dict(row)) for row in rows]


def get_supervisor(supervisor_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT id, username, display_name, is_active, role,
                   created_at, updated_at, last_login_at
            FROM supervisors
            WHERE id = ?
            """,
            (supervisor_id,),
        ).fetchone()
    return _normalize_supervisor(dict(row)) if row else None


def get_supervisor_auth_by_username(username: str) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM supervisors WHERE username = ?",
            (username,),
        ).fetchone()
    return dict(row) if row else None


def create_supervisor(
    username: str,
    password: str,
    display_name: str | None = None,
    role: str = "supervisor",
) -> dict[str, Any]:
    if role not in ("supervisor", "engineer", "admin"):
        raise ValueError("invalid role")
    salt, password_hash = hash_password(password)
    now = utc_now()
    with get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO supervisors (
                username, display_name, password_hash, password_salt,
                is_active, created_at, updated_at, role
            ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
            """,
            (username, display_name, password_hash, salt, now, now, role),
        )
        supervisor_id = cursor.lastrowid
    return get_supervisor(int(supervisor_id))


def update_supervisor(
    supervisor_id: int,
    *,
    display_name: str | None = None,
    password: str | None = None,
    is_active: bool | None = None,
    role: str | None = None,
) -> dict[str, Any] | None:
    if not get_supervisor(supervisor_id):
        return None
    existing = get_supervisor(supervisor_id)
    if existing.get("role") == "admin" and (role and role != "admin" or is_active is False):
        with get_connection() as db:
            remaining = db.execute("SELECT COUNT(*) FROM supervisors WHERE role='admin' AND is_active=1").fetchone()[0]
        if remaining <= 1: raise ValueError("至少保留一名啟用中的系統管理員")

    updates: list[str] = []
    params: list[Any] = []

    if display_name is not None:
        updates.append("display_name = ?")
        params.append(display_name)

    if password is not None:
        salt, password_hash = hash_password(password)
        updates.extend(["password_hash = ?", "password_salt = ?"])
        params.extend([password_hash, salt])

    if is_active is not None:
        updates.append("is_active = ?")
        params.append(1 if is_active else 0)

    if role is not None:
        if role not in ("supervisor", "engineer", "admin"):
            raise ValueError("invalid role")
        updates.append("role = ?")
        params.append(role)

    if updates:
        updates.append("updated_at = ?")
        params.append(utc_now())
        params.append(supervisor_id)
        with get_connection() as conn:
            conn.execute(
                f"UPDATE supervisors SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            if is_active is False:
                conn.execute("DELETE FROM sessions WHERE supervisor_id = ?", (supervisor_id,))

    return get_supervisor(supervisor_id)


def delete_supervisor(supervisor_id: int) -> bool:
    with get_connection() as db:
        r=db.execute("SELECT role,is_active FROM supervisors WHERE id=?",(supervisor_id,)).fetchone()
        if r and r["role"]=="admin" and r["is_active"]:
            n=db.execute("SELECT COUNT(*) FROM supervisors WHERE role='admin' AND is_active=1").fetchone()[0]
            if n<=1: raise ValueError("至少保留一名啟用中的系統管理員")
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM supervisors WHERE id = ?", (supervisor_id,))
        return cursor.rowcount > 0


def count_active_supervisors() -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS c FROM supervisors WHERE is_active = 1"
        ).fetchone()
    return int(row["c"])


def create_session(supervisor_id: int) -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires_at = utc_after(SESSION_HOURS)
    now = utc_now()

    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
        conn.execute(
            """
            INSERT INTO sessions (supervisor_id, token_hash, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (supervisor_id, token_hash, now, expires_at),
        )
        conn.execute(
            "UPDATE supervisors SET last_login_at = ?, updated_at = ? WHERE id = ?",
            (now, now, supervisor_id),
        )

    return token, expires_at


def get_supervisor_by_token(token: str) -> dict[str, Any] | None:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = utc_now()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT s.id, s.username, s.display_name, s.is_active, s.role,
                   s.created_at, s.updated_at, s.last_login_at
            FROM sessions sess
            JOIN supervisors s ON s.id = sess.supervisor_id
            WHERE sess.token_hash = ?
              AND sess.expires_at > ?
              AND s.is_active = 1
            """,
            (token_hash, now),
        ).fetchone()
    return _normalize_supervisor(dict(row)) if row else None


def delete_session(token: str) -> None:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    with get_connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash,))


def _normalize_supervisor(supervisor: dict[str, Any]) -> dict[str, Any]:
    supervisor["is_active"] = bool(supervisor.get("is_active", 0))
    supervisor["role"] = supervisor.get("role", "supervisor")
    return supervisor


def get_schema() -> dict[str, list[dict[str, Any]]]:
    """Return the actual SQLite schema in a JSON-friendly form."""
    tables = ["cameras", "supervisors", "sessions", "events", "event_snapshots", "ai_conversations", "ai_messages", "safety_reports", "system_settings", "model_versions", "audit_logs"]
    result: dict[str, list[dict[str, Any]]] = {}
    with get_connection() as conn:
        for table in tables:
            rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
            result[table] = [dict(row) for row in rows]
    return result
