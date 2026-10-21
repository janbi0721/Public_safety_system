"""Engineer-only endpoints, test-event isolation, and safe env management."""
from pathlib import Path
import sys, types
import pytest
import database
from fastapi.testclient import TestClient

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path/'engineering_test.db')
    monkeypatch.setenv('INITIAL_ADMIN_USERNAME','new_admin')
    monkeypatch.setenv('INITIAL_ADMIN_PASSWORD','safe_password_123')
    database.init_db()
    fake=types.ModuleType('ultralytics')
    fake.YOLO=object
    monkeypatch.setitem(sys.modules,'ultralytics',fake)
    import main
    return TestClient(main.app)

def headers(client):
    response=client.post('/api/auth/login',json={'username':'new_admin','password':'safe_password_123'})
    assert response.status_code==200
    return {'Authorization':'Bearer '+response.json()['access_token']}
import environment_config


def test_engineer_route_authorization_and_no_model_mutation(client):
    admin=headers(client)
    created=client.post('/api/admin/supervisors',headers=admin,json={
        'username':'supervisor_test','password':'safe_password_123','role':'supervisor'
    })
    assert created.status_code==201
    login=client.post('/api/auth/login',json={'username':'supervisor_test','password':'safe_password_123'})
    supervisor={'Authorization':'Bearer '+login.json()['access_token']}
    protected=[
        ('GET','/api/admin/engineering/environment'),
        ('GET','/api/admin/engineering/voice'),
        ('PATCH','/api/admin/engineering/voice'),
        ('GET','/api/admin/engineering/test-events'),
        ('POST','/api/admin/engineering/test-events'),
        ('GET','/api/admin/system/metrics'),
    ]
    for method,path in protected:
        result=client.request(method,path,headers=supervisor)
        assert result.status_code==403,(method,path,result.text)
    assert client.get('/api/admin/engineering/voice',headers=admin).status_code==200
    # Removing handlers, not just hiding controls, prevents API-side model switching.
    assert client.post('/api/admin/engineering/models/upload',headers=admin).status_code==404
    assert client.post('/api/admin/engineering/models/1/activate',headers=admin).status_code==404


def test_engineer_can_maintain_but_not_manage_users(client):
    admin=headers(client)
    created=client.post('/api/admin/supervisors',headers=admin,json={
        'username':'engineer_test','password':'safe_password_123','role':'engineer'
    })
    assert created.status_code==201
    logged=client.post('/api/auth/login',json={'username':'engineer_test','password':'safe_password_123'})
    engineer={'Authorization':'Bearer '+logged.json()['access_token']}
    assert client.get('/api/admin/engineering/config',headers=engineer).status_code==200
    assert client.get('/api/admin/engineering/voice',headers=engineer).status_code==200
    assert client.get('/api/admin/engineering/environment',headers=engineer).status_code==200
    assert client.get('/api/admin/system/metrics',headers=engineer).status_code==200
    assert client.get('/api/admin/supervisors',headers=engineer).status_code==403


def test_public_volume_and_engineer_validation(client):
    admin=headers(client)
    assert client.get('/api/public/voice-settings').json()['volume']==80
    assert client.patch('/api/admin/engineering/voice',headers=admin,json={'volume':15}).status_code==200
    assert client.get('/api/public/voice-settings').json()['volume']==15
    assert client.patch('/api/admin/engineering/voice',headers=admin,json={'volume':101}).status_code==422
    assert client.get('/api/public/voice-settings').json()['volume']==15


def test_simulated_event_included_in_normal_workflow_and_safe_deletion(client):
    admin=headers(client)
    request={'event_type':'no_helmet','camera_id':'camera-01','resolved':True,'note':'介面操作測試'}
    created=client.post('/api/admin/engineering/test-events',headers=admin,json=request)
    assert created.status_code==201,created.text
    test_id=created.json()['event_id']
    assert test_id>0
    item=client.get(f'/api/admin/events/{test_id}',headers=admin).json()
    assert item['is_test']==1
    assert item['message']=='未配戴安全帽 — 介面操作測試' 
    visible=client.get('/api/admin/events',headers=admin).json()['events']
    assert any(row['id']==test_id and row['is_test']==1 for row in visible)
    assert any(row['id']==test_id for row in client.get('/api/admin/engineering/test-events',headers=admin).json()['events'])
    from datetime import date
    today=str(date.today())
    real_stats=client.get(f'/api/admin/analytics?start={today}&end={today}',headers=admin).json()
    assert real_stats['total']==1
    assert real_stats['pending']==1
    assert real_stats['by_type']['no_helmet']==1
    assert client.post('/api/admin/engineering/test-events',headers=admin,json={**request,'event_type':'unknown'}).status_code==422
    assert client.post('/api/admin/engineering/test-events',headers=admin,json={**request,'camera_id':'no-camera'}).status_code==422
    import database
    real_id=database.create_event('camera-01','no_helmet','真實資料')
    assert client.delete(f'/api/admin/engineering/test-events/{real_id}',headers=admin).status_code==404
    assert database.get_event(real_id)
    assert client.delete(f'/api/admin/engineering/test-events/{test_id}',headers=admin).status_code==200
    assert client.get(f'/api/admin/events/{test_id}',headers=admin).status_code==404
    stats_after_deletion=client.get(f'/api/admin/analytics?start={today}&end={today}',headers=admin).json()
    assert stats_after_deletion['total']==1  # real event remains


def test_allowlist_secret_and_preserve_user_env(client,monkeypatch,tmp_path):
    env=tmp_path/'.env'
    env.write_text('CAMERA_SOURCE=0\nUNRELATED=unchanged\nGEMINI_API_KEY=actualsecretkey1234\n'
                   'OTHER_PPE_MODEL=do_not_change\n# do not touch this comment\n',encoding='utf-8')
    monkeypatch.setattr(environment_config,'ENV_PATH',env)
    admin=headers(client)
    result=client.get('/api/admin/engineering/environment',headers=admin)
    assert result.status_code==200
    fields={field['name']:field for field in result.json()['fields']}
    assert fields['GEMINI_API_KEY']['value']==''
    assert fields['GEMINI_API_KEY']['protected'] is True
    assert fields['GEMINI_API_KEY']['configured'] is True
    assert 'INITIAL_ADMIN_PASSWORD' not in fields and 'PPE_MODEL' not in fields
    assert client.patch('/api/admin/engineering/environment',headers=admin,json={'changes':{'INITIAL_ADMIN_PASSWORD':'x'}}).status_code==422
    changed=client.patch('/api/admin/engineering/environment',headers=admin,json={'changes':{'CAMERA_SOURCE':'rtsp://user:pass@127.0.0.1:8554/live'}})
    assert changed.status_code==200,changed.text
    assert 'UNRELATED=unchanged' in env.read_text()
    assert 'actualsecretkey1234' in env.read_text()
    fields={field['name']:field for field in client.get('/api/admin/engineering/environment',headers=admin).json()['fields']}
    assert fields['CAMERA_SOURCE']['protected'] is True
    assert fields['CAMERA_SOURCE']['value']==''
    assert client.patch('/api/admin/engineering/environment',headers=admin,json={'changes':{'CAMERA_SOURCE':'0\nPPE_MODEL=evil'}}).status_code==422
    assert 'PPE_MODEL=evil' not in env.read_text()


def test_simulation_is_included_in_gemini_report_context(client, monkeypatch):
    """Gemini receives the same aggregate (including simulated events) as analytics."""
    from datetime import datetime, timezone
    import json
    import main
    admin = headers(client)
    created = client.post('/api/admin/engineering/test-events', headers=admin,
                          json={'event_type':'no_gloves', 'camera_id':'camera-01', 'resolved':True})
    assert created.status_code == 201
    event_id = created.json()['event_id']
    assert client.get(f'/api/admin/events/{event_id}', headers=admin).json()['event_type'] == 'no_gloves'
    captures = []
    def fake_gemini(question, context='', history=None):
        captures.append(json.loads(context))
        return '報告已產生'
    monkeypatch.setattr(main, 'ask_gemini', fake_gemini)
    today = datetime.now(timezone.utc).date().isoformat()
    response = client.post('/api/admin/ai/reports', headers=admin,
                           json={'start':today, 'end':today})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['stats']['total'] == 1
    assert captures[0]['total'] == 1
    assert captures[0]['by_type']['no_gloves'] == 1
    assert client.get('/api/admin/ai/reports', headers=admin).json()['reports'][0]['id'] == result['id']
