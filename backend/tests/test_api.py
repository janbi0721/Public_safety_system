import sys,types
import pytest
import database
from fastapi.testclient import TestClient

@pytest.fixture
def client(tmp_path,monkeypatch):
    monkeypatch.setattr(database,'DB_PATH',tmp_path/'api_test.db')
    monkeypatch.setenv('INITIAL_ADMIN_USERNAME','testadmin')
    monkeypatch.setenv('INITIAL_ADMIN_PASSWORD','testpasslong123')
    database.init_db()
    fake=types.ModuleType('ultralytics'); fake.YOLO=object
    monkeypatch.setitem(sys.modules,'ultralytics',fake)
    # This test intentionally avoids lifespan so it does not open camera/GPU.
    import main
    return TestClient(main.app)

def headers(client):
    result=client.post('/api/auth/login',json={'username':'testadmin','password':'testpasslong123'})
    assert result.status_code==200, result.text
    return {'Authorization':'Bearer '+result.json()['access_token']}

def test_auth_required_and_config(client):
    assert client.get('/api/admin/engineering/config').status_code==401
    h=headers(client)
    assert client.get('/api/admin/engineering/config',headers=h).status_code==200
    a=client.get('/api/admin/analytics?start=2026-10-01&end=2026-10-31',headers=h)
    assert a.status_code==200 and a.json()['total']==0
    assert client.get('/api/admin/system/metrics',headers=h).status_code==200

def test_supervisor_blocked_engineer(client):
    admin=headers(client)
    created=client.post('/api/admin/supervisors',headers=admin,json={'username':'boss2','password':'some_password123','role':'supervisor'})
    assert created.status_code==201,created.text
    boss=client.post('/api/auth/login',json={'username':'boss2','password':'some_password123'}).json()
    h={'Authorization':'Bearer '+boss['access_token']}
    assert client.get('/api/admin/engineering/config',headers=h).status_code==403
    assert client.get('/api/admin/supervisors',headers=h).status_code==403
    assert client.get('/api/admin/ai/reports',headers=h).status_code==200

def test_report_no_key_and_no_automatic_generation(client):
    h=headers(client)
    assert client.get('/api/admin/ai/reports',headers=h).json()['reports']==[]
    r=client.post('/api/admin/ai/reports',headers=h,json={'start':'2026-10-18','end':'2026-10-19'})
    assert r.status_code==503
    assert client.get('/api/admin/ai/reports',headers=h).json()['reports']==[]
