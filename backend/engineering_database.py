"""Restricted engineering SQLite browser.

No raw SQL execution, and no direct access to credentials, sessions or AI chats.
Events and camera metadata are editable; audit logs are read-only. All edits
use parameterized SQL and are recorded in the existing audit trail.
"""
from __future__ import annotations

import re
import sqlite3
from datetime import datetime
from typing import Any

from database import get_connection, utc_now


TABLES = {
    'events': {
        'label': '異常事件紀錄', 'pk': 'id', 'editable': True,
        'search': ('id', 'camera_id', 'event_type', 'message'),
        'columns': ('id', 'camera_id', 'event_type', 'track_id', 'message',
                    'confidence', 'start_time', 'end_time', 'status', 'review_status', 'updated_at'),
        'fields': (
            ('camera_id', '攝影機 ID', 'text', True),
            ('event_type', '事件類型', 'text', True),
            ('track_id', '人員追蹤 ID', 'integer', False),
            ('message', '事件說明', 'longtext', False),
            ('confidence', '辨識信心值 0–1', 'decimal', False),
            ('start_time', '開始時間（UTC）', 'datetime', False),
            ('end_time', '結束時間（UTC）', 'datetime', False),
            ('status', '事件狀態', 'select', False),
            ('review_status', '審核狀態', 'select', False),
        ),
    },
    'cameras': {
        'label': '攝影機資料', 'pk': 'camera_id', 'editable': True,
        'search': ('camera_id', 'name', 'location'),
        'columns': ('camera_id', 'name', 'location', 'source_type', 'is_active', 'created_at', 'updated_at'),
        'fields': (
            ('camera_id', '攝影機 ID', 'text', True),
            ('name', '名稱', 'text', True),
            ('location', '安裝位置', 'text', False),
            ('source_type', '來源類型', 'select', True),
            ('is_active', '啟用（資料庫標記）', 'boolean', False),
        ),
    },
    'audit_logs': {
        'label': '操作紀錄（唯讀）', 'pk': 'id', 'editable': False,
        'search': ('id', 'action'),
        'columns': ('id', 'supervisor_id', 'action', 'created_at'),
        'fields': (),
    },
}

CHOICES = {
    'status': ('open', 'closed', 'improved'),
    'review_status': ('pending', 'improved', 'false_positive'),
    'source_type': ('local', 'rtsp'),
}


def catalog() -> list[dict[str, Any]]:
    result = []
    for name, spec in TABLES.items():
        result.append({
            'name': name, 'label': spec['label'], 'primary_key': spec['pk'],
            'editable': spec['editable'], 'columns': list(spec['columns']),
            'fields': [
                {'name': key, 'label': label, 'type': kind, 'required': required,
                 'choices': list(CHOICES.get(key, ())),
                 'editable_on_create': True,
                 'editable_on_update': key != 'camera_id' or name != 'cameras'}
                for key, label, kind, required in spec['fields']
            ],
        })
    return result


def _spec(table: str) -> dict:
    if table not in TABLES:
        raise ValueError('不允許存取此資料表')
    return TABLES[table]


def browse(table: str, limit: int = 30, offset: int = 0, search: str = '') -> dict:
    spec = _spec(table)
    limit = min(100, max(1, int(limit)))
    offset = min(1000000, max(0, int(offset)))
    search = str(search).strip()[:100]
    where = ''
    args: list[Any] = []
    if search:
        # Identifiers here come from the fixed server-side allowlist only.
        where = ' WHERE (' + ' OR '.join(f'CAST("{field}" AS TEXT) LIKE ?' for field in spec['search']) + ')'
        args = [f'%{search}%'] * len(spec['search'])
    columns = ','.join(f'"{col}"' for col in spec['columns'])
    pk = spec['pk']
    with get_connection() as conn:
        total = conn.execute(f'SELECT count(*) FROM "{table}"{where}', args).fetchone()[0]
        rows = conn.execute(
            f'SELECT {columns} FROM "{table}"{where} ORDER BY "{pk}" DESC LIMIT ? OFFSET ?',
            [*args, limit, offset],
        ).fetchall()
    return {'table': table, 'total': total, 'offset': offset,
            'limit': limit, 'rows': [dict(row) for row in rows]}


def _clean(table: str, incoming: dict, updating: bool) -> dict:
    spec = _spec(table)
    if not spec['editable']:
        raise PermissionError('這個資料表只能查詢')
    if not isinstance(incoming, dict) or not incoming:
        raise ValueError('至少需要一個欄位')
    fields = {row[0]: (row[2], row[3]) for row in spec['fields']}
    unknown = set(incoming) - set(fields)
    if unknown:
        raise ValueError('不允許修改欄位：' + ', '.join(sorted(unknown)))
    if updating and table == 'cameras' and 'camera_id' in incoming:
        raise ValueError('攝影機 ID 是主鍵，不能修改；可新增另一筆攝影機資料')
    result = {}
    for key, value in incoming.items():
        kind, required = fields[key]
        if isinstance(value, (list, dict)):
            raise ValueError(f'{key} 資料型態不正確')
        if value is None or (isinstance(value, str) and not value.strip()):
            if required:
                raise ValueError(f'{key} 不可為空')
            if kind == 'boolean':
                value = 0
            else:
                value = None
        elif kind == 'boolean':
            if value in (True, 1, '1', 'true', 'True'):
                value = 1
            elif value in (False, 0, '0', 'false', 'False'):
                value = 0
            else:
                raise ValueError(f'{key} 必須為布林值')
        elif kind == 'integer':
            if isinstance(value, bool) or not re.fullmatch(r'\d+', str(value).strip()):
                raise ValueError(f'{key} 必須為非負整數')
            value = int(value)
            if value > 999999999:
                raise ValueError(f'{key} 數值過大')
        elif kind == 'decimal':
            try: value = float(value)
            except (TypeError, ValueError, OverflowError): raise ValueError('信心值必須為數字')
            if not 0 <= value <= 1:
                raise ValueError('信心值必須介於 0 和 1')
        elif kind == 'select':
            if str(value) not in CHOICES[key]:
                raise ValueError(f'{key} 無效')
            value = str(value)
        elif kind == 'datetime':
            try:
                parsed = datetime.fromisoformat(str(value).strip().replace('Z', '+00:00'))
                if parsed.tzinfo is not None:
                    raise ValueError('時間請輸入 UTC 且不要包含時區')
                value = parsed.strftime('%Y-%m-%d %H:%M:%S')
            except (TypeError, ValueError) as error:
                raise ValueError(f'{key} 時間格式請使用 YYYY-MM-DD HH:MM:SS（UTC）') from error
        else:
            value = str(value).strip()
            max_length = 1500 if key == 'message' else 150 if key == 'location' else 120
            if not value or len(value) > max_length:
                raise ValueError(f'{key} 長度不正確（最多 {max_length} 字）')
            if '\x00' in value or '\n' in value and key != 'message':
                raise ValueError(f'{key} 包含不允許的字元')
            if key == 'camera_id' and not re.fullmatch(r'[a-zA-Z0-9_-]{1,48}', value):
                raise ValueError('攝影機 ID 只能使用英文字母、數字、底線和連字號')
        result[key] = value
    if not updating:
        for key, (_, required) in fields.items():
            if required and key not in result:
                raise ValueError(f'缺少必要欄位：{key}')
    return result


def _check_event_time(record: dict) -> None:
    if record.get('end_time') and record.get('start_time') and record['end_time'] < record['start_time']:
        raise ValueError('結束時間不能早於開始時間')


def _verify_camera(conn: sqlite3.Connection, camera_id: str) -> None:
    if not conn.execute('SELECT 1 FROM cameras WHERE camera_id=?', (camera_id,)).fetchone():
        raise ValueError('攝影機 ID 不存在，請先新增攝影機資料')


def create_row(table: str, values: dict) -> dict:
    spec = _spec(table)
    data = _clean(table, values, updating=False)
    timestamp = utc_now()
    with get_connection() as conn:
        if table == 'events':
            _verify_camera(conn, data['camera_id'])
            data.setdefault('start_time', timestamp)
            data.setdefault('review_status', 'pending')
            data.setdefault('status', 'closed' if data.get('end_time') else 'open')
            if data['review_status'] == 'improved': data['status'] = 'improved'
            _check_event_time(data)
            data['is_test'] = 1  # provenance only; included in normal reports and stats
            data['is_improved'] = int(data['review_status'] == 'improved')
            data['last_seen_time'] = data.get('end_time') or data['start_time']
            if data['is_improved']: data['improved_at'] = timestamp
            if data.get('end_time'): data['close_reason'] = 'manual_end'
        elif table == 'cameras':
            data.setdefault('is_active', 1)
        keys = list(data)
        placeholders = ','.join(['?'] * len(keys))
        columns = ','.join(f'"{key}"' for key in keys)
        try:
            cursor = conn.execute(
                f'INSERT INTO "{table}" ({columns}) VALUES ({placeholders})',
                [data[key] for key in keys],
            )
        except sqlite3.IntegrityError as error:
            raise ValueError('新增失敗：主鍵重複或關聯資料不正確') from error
        row_id = cursor.lastrowid if table == 'events' else data['camera_id']
        row = conn.execute(f'SELECT * FROM "{table}" WHERE "{spec["pk"]}"=?', (row_id,)).fetchone()
    return {key: row[key] for key in spec['columns']}


def update_row(table: str, row_id: str, values: dict) -> dict | None:
    spec = _spec(table)
    data = _clean(table, values, updating=True)
    if table == 'events' and not re.fullmatch(r'\d{1,12}', str(row_id)):
        raise ValueError('事件 ID 必須為數字')
    with get_connection() as conn:
        current = conn.execute(f'SELECT * FROM "{table}" WHERE "{spec["pk"]}"=?', (row_id,)).fetchone()
        if current is None:
            return None
        if table == 'events':
            if 'camera_id' in data: _verify_camera(conn, data['camera_id'])
            merged = dict(current) | data
            _check_event_time(merged)
            if 'review_status' in data:
                data['is_improved'] = int(data['review_status'] == 'improved')
                data['improved_at'] = utc_now() if data['is_improved'] else None
                data['improved_by'] = None
                if data['is_improved']: data['status'] = 'improved'
            if 'end_time' in data:
                data['last_seen_time'] = data['end_time'] or merged['start_time']
                data['close_reason'] = 'manual_end' if data['end_time'] else None
                if 'status' not in data: data['status'] = 'closed' if data['end_time'] else 'open'
        data['updated_at'] = utc_now()
        pairs = ', '.join(f'"{column}"=?' for column in data)
        try:
            conn.execute(f'UPDATE "{table}" SET {pairs} WHERE "{spec["pk"]}"=?',
                         [*data.values(), row_id])
        except sqlite3.IntegrityError as error:
            raise ValueError('修改失敗：資料關聯或欄位內容不正確') from error
        row = conn.execute(f'SELECT * FROM "{table}" WHERE "{spec["pk"]}"=?', (row_id,)).fetchone()
    return {key: row[key] for key in spec['columns']}


def delete_row(table: str, row_id: str) -> bool:
    spec = _spec(table)
    if not spec['editable']:
        raise PermissionError('這個資料表不能刪除')
    if table == 'events' and not re.fullmatch(r'\d{1,12}', str(row_id)):
        raise ValueError('事件 ID 必須為數字')
    with get_connection() as conn:
        current = conn.execute(f'SELECT 1 FROM "{table}" WHERE "{spec["pk"]}"=?', (row_id,)).fetchone()
        if not current:
            return False
        if table == 'events':
            evidence = conn.execute('SELECT count(*) FROM event_snapshots WHERE event_id=?', (row_id,)).fetchone()[0]
            if evidence:
                raise ValueError('事件仍有截圖證據，請先於事件紀錄中刪除截圖，避免留下孤兒檔案')
        if table == 'cameras':
            if row_id == 'camera-01':
                raise ValueError('目前預設使用中的 camera-01 不允許直接刪除')
            count = conn.execute('SELECT count(*) FROM events WHERE camera_id=?', (row_id,)).fetchone()[0]
            if count:
                raise ValueError('攝影機已有關聯事件，請保留攝影機資料或先處理關聯事件')
        try:
            conn.execute(f'DELETE FROM "{table}" WHERE "{spec["pk"]}"=?', (row_id,))
        except sqlite3.IntegrityError as error:
            raise ValueError('刪除失敗：其他資料仍參照這筆紀錄') from error
    return True
