"""Engineering DB CRUD and authorization regression tests."""
import sys
import types
from datetime import datetime, timezone

import pytest

import database


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'crud_test.db')
    monkeypatch.setenv('INITIAL_ADMIN_USERNAME', 'db_admin')
    monkeypatch.setenv('INITIAL_ADMIN_PASSWORD', 'strong_password_123')
    database.init_db()
    fake = types.ModuleType('ultralytics')
    fake.YOLO = object
    monkeypatch.setitem(sys.modules, 'ultralytics', fake)
    from fastapi.testclient import TestClient
    import main
    return TestClient(main.app)


def token(client, username='db_admin', password='strong_password_123'):
    response = client.post('/api/auth/login', json={'username': username, 'password': password})
    assert response.status_code == 200, response.text
    return {'Authorization': 'Bearer ' + response.json()['access_token']}


def path(table='events'):
    return '/api/admin/engineering/database/' + table


def test_schema_browse_crud_search_and_analytics(client):
    h = token(client)
    catalog = client.get(path('tables'), headers=h)
    assert catalog.status_code == 200
    assert {t['name'] for t in catalog.json()['tables']} == {'events', 'cameras', 'audit_logs'}
    created = client.post(path(), headers=h, json={'values': {
        'camera_id': 'camera-01', 'event_type': 'no_helmet',
        'message': '手動事件', 'status': 'closed',
        'start_time': '2026-10-19 12:00:00',
        'end_time': '2026-10-19 12:01:00',
    }})
    assert created.status_code == 201, created.text
    pk = created.json()['row']['id']
    with database.get_connection() as db:
        db_event = db.execute('SELECT * FROM events WHERE id=?', (pk,)).fetchone()
        assert db_event['message'] == '手動事件'
        assert db_event['is_test'] == 1

    response = client.get(path(), headers=h, params={'search': '手動', 'limit': 10, 'offset': 0})
    assert response.status_code == 200
    assert response.json()['total'] == 1
    assert response.json()['rows'][0]['id'] == pk
    stats = client.get('/api/admin/analytics?start=2026-10-19&end=2026-10-19', headers=h)
    assert stats.status_code == 200
    assert stats.json()['total'] == 1
    changed = client.patch(path() + '/' + str(pk), headers=h,
                           json={'values': {'message': '資料庫已編輯', 'review_status': 'improved'}})
    assert changed.status_code == 200, changed.text
    assert changed.json()['row']['review_status'] == 'improved'
    with database.get_connection() as db:
        assert db.execute('SELECT is_improved FROM events WHERE id=?', (pk,)).fetchone()[0] == 1
    assert client.request('DELETE', path() + '/' + str(pk), headers=h, json={'confirmed': False}).status_code == 400
    assert client.request('DELETE', path() + '/' + str(pk), headers=h, json={'confirmed': True}).status_code == 200
    assert client.get(path(), headers=h).json()['total'] == 0
    audit = client.get(path('audit_logs'), headers=h)
    assert audit.status_code == 200
    names = {entry['action'] for entry in audit.json()['rows']}
    assert {'database_row_created', 'database_row_updated', 'database_row_deleted'} <= names


def test_camera_fk_delete_protection_and_readonly_tables(client):
    h = token(client)
    cam = client.post(path('cameras'), headers=h, json={'values': {
        'camera_id': 'camera-secondary', 'name': '工廠攝影機', 'source_type': 'rtsp', 'is_active': 1,
    }})
    assert cam.status_code == 201, cam.text
    assert client.patch(path('cameras')+'/camera-secondary', headers=h,
                        json={'values': {'name': '工廠二號', 'is_active': 0}}).status_code == 200
    assert client.patch(path('cameras')+'/camera-secondary', headers=h,
                        json={'values': {'camera_id': 'new-id'}}).status_code == 422
    event = client.post(path(), headers=h, json={'values': {'camera_id': 'camera-secondary', 'event_type': 'no_gloves'}})
    assert event.status_code == 201, event.text
    assert client.request('DELETE', path('cameras')+'/camera-secondary', headers=h,
                         json={'confirmed': True}).status_code == 409
    pk = event.json()['row']['id']
    with database.get_connection() as db:
        db.execute('INSERT INTO event_snapshots (event_id,phase,kind,filename) VALUES (?,?,?,?)',
                   (pk,'start','raw','test.jpg'))
    assert client.request('DELETE', path()+'/'+str(pk), headers=h, json={'confirmed': True}).status_code == 409
    with database.get_connection() as db:
        db.execute('DELETE FROM event_snapshots WHERE event_id=?', (pk,))
    assert client.request('DELETE', path()+'/'+str(pk), headers=h, json={'confirmed': True}).status_code == 200
    assert client.request('DELETE', path('cameras')+'/camera-secondary', headers=h,
                         json={'confirmed': True}).status_code == 200
    assert client.request('DELETE', path('cameras')+'/camera-01', headers=h, json={'confirmed': True}).status_code == 409
    assert client.post(path('audit_logs'), headers=h, json={'values': {'action':'fake'}}).status_code == 403
    assert client.patch(path('audit_logs')+'/1', headers=h, json={'values': {'action': 'fake'}}).status_code == 403
    assert client.request('DELETE', path('audit_logs')+'/1', headers=h, json={'confirmed': True}).status_code == 403


def test_restrict_privileges_injection_and_validation(client):
    h = token(client)
    assert client.get(path()).status_code == 401
    created = client.post('/api/admin/supervisors', headers=h, json={
        'username': 'boss_db', 'password': 'strong_password_123', 'role': 'supervisor'})
    assert created.status_code == 201
    supervisor = token(client,'boss_db','strong_password_123')
    for method, url, payload in [
        ('GET', path('tables'), None), ('GET', path(), None),
        ('POST',path(), {'values': {'camera_id':'camera-01','event_type':'no_gloves'}}),
        ('PATCH',path()+'/1', {'values': {'message':'overwrite'}}),
        ('DELETE',path()+'/1', {'confirmed':True}),
    ]:
        assert client.request(method,url,headers=supervisor,json=payload).status_code == 403
    assert client.get(path('supervisors'), headers=h).status_code == 422
    assert client.get(path('sessions'), headers=h).status_code == 422
    for invalid in [
        {'camera_id': 'camera-01', 'event_type': 'x', 'password_hash': 'evil'},
        {'camera_id': 'missing', 'event_type':'no_helmet'},
        {'camera_id': 'camera-01', 'event_type': 'x', 'confidence': 9},
        {'camera_id': 'camera-01', 'event_type': 'x', 'start_time': 'yesterday'},
        {'camera_id': 'camera-01', 'event_type': 'x', 'start_time':'2026-10-19 14:00:00','end_time':'2026-10-19 13:00:00'},
    ]:
        assert client.post(path(), headers=h, json={'values':invalid}).status_code == 422
    malicious = "'); DROP TABLE supervisors; --"
    response = client.post(path(), headers=h, json={'values':{'camera_id': 'camera-01', 'event_type': malicious}})
    assert response.status_code == 201, response.text
    assert client.get('/api/admin/supervisors', headers=h).status_code == 200
    assert client.get(path(), headers=h, params={'search': malicious}).json()['total'] == 1


def test_engineer_is_allowed_admin_only_supervisor_controls_stay_protected(client):
    admin = token(client)
    created = client.post('/api/admin/supervisors', headers=admin,json={
        'username':'engineer_db','password':'strong_password_123','role':'engineer'})
    assert created.status_code == 201
    h = token(client,'engineer_db','strong_password_123')
    assert client.get(path(), headers=h).status_code == 200
    assert client.post(path(), headers=h, json={'values':{'camera_id':'camera-01','event_type':'no_helmet'}}).status_code == 201
    assert client.get('/api/admin/supervisors', headers=h).status_code == 403
