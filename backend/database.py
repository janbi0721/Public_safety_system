import sqlite3


DB_PATH = "safety.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            camera_id TEXT NOT NULL,

            track_id INTEGER,

            event_type TEXT NOT NULL,

            class_name TEXT,

            confidence REAL,

            start_time DATETIME
                DEFAULT CURRENT_TIMESTAMP,

            end_time DATETIME,

            status TEXT
                DEFAULT 'active',

            image_path TEXT
        )
    """)

    conn.commit()
    conn.close()


def save_event(
    camera_id,
    event_type,
    class_name,
    confidence,
    image_path=None
):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        INSERT INTO events (
            camera_id,
            event_type,
            class_name,
            confidence,
            image_path
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            camera_id,
            event_type,
            class_name,
            confidence,
            image_path
        )
    )

    conn.commit()
    conn.close()


def get_events(limit=100):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT *
        FROM events
        ORDER BY start_time DESC
        LIMIT ?
        """,
        (limit,)
    )

    rows = cursor.fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]


def get_events_by_camera(
    camera_id,
    limit=100
):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """
        SELECT *
        FROM events
        WHERE camera_id = ?
        ORDER BY start_time DESC
        LIMIT ?
        """,
        (
            camera_id,
            limit
        )
    )

    rows = cursor.fetchall()

    conn.close()

    return [
        dict(row)
        for row in rows
    ]