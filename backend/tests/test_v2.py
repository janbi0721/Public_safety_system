from pathlib import Path
import pytest
import database
from safety_analyzer import SafetyAnalyzer
from event_manager import EventManager
from v2_data import event_statistics,review_event,list_snapshots

@pytest.fixture
def db(tmp_path,monkeypatch):
    monkeypatch.setattr(database,'DB_PATH',tmp_path/'test.db')
    monkeypatch.setenv('INITIAL_ADMIN_USERNAME','unit_admin')
    monkeypatch.setenv('INITIAL_ADMIN_PASSWORD','unique_test_pass_123')
    database.init_db()
    return tmp_path

def box(x1,y1,x2,y2):return dict(x1=x1,y1=y1,x2=x2,y2=y2)
def sample(name,b,track=None,conf=.94):return {'className':name,'bbox':b,'confidence':conf,'trackId':track}

def pose(b,wrist_left=True,wrist_right=True):
    points=[{'x':0,'y':0,'confidence':0} for _ in range(17)]
    points[0]={'x':.3,'y':.16,'confidence':.9}
    if wrist_left:points[9]={'x':.2,'y':.54,'confidence':.9}
    if wrist_right:points[10]={'x':.4,'y':.54,'confidence':.9}
    return [{'bbox':b,'points':points}]

def test_person_and_helmet(db):
    person=sample('person',box(.1,.1,.5,.9),track=7)
    helmet=sample('helmet',box(.2,.11,.36,.23))
    analyzer=SafetyAnalyzer(['helmet'],['person','helmet'])
    ok=analyzer.analyze([person,helmet],pose(person['bbox']))
    assert ok['people'][0]['ppe']['helmet']['status']=='normal'
    missing=analyzer.analyze([person],pose(person['bbox']))
    assert missing['violations'][0]['eventType']=='no_helmet'

def test_unknown_not_violation(db):
    person=sample('person',box(.1,.1,.5,.9),track=2)
    a=SafetyAnalyzer(['helmet','respirator','glove'],['person','helmet','respirator','glove'])
    x=a.analyze([person],[])
    assert not x['violations']
    assert all(v['status']=='unknown' for v in x['people'][0]['ppe'].values())

def test_unsupported_ppe_is_unknown(db):
    person=sample('person',box(.1,.1,.5,.9),track=2)
    a=SafetyAnalyzer(['glove'],['person','helmet'])
    result=a.analyze([person],pose(person['bbox']))
    assert result['people'][0]['ppe']['glove']['reason']=='model_unsupported'
    assert not result['violations']

def test_gloves_both_hands_and_single(db):
    person=sample('person',box(.1,.1,.5,.9),track=9)
    left=sample('glove',box(.18,.49,.23,.56))
    right=sample('glove',box(.38,.49,.43,.56))
    a=SafetyAnalyzer(['glove'],['person','glove'])
    assert a.analyze([person,left,right],pose(person['bbox']))['people'][0]['ppe']['glove']['status']=='normal'
    only=a.analyze([person,left],pose(person['bbox']))
    assert only['people'][0]['ppe']['glove']['status']=='violation'

def test_event_lifecycle(db):
    events=[]
    m=EventManager('camera-01',trigger_seconds=1.5,recovery_seconds=2,occlusion_seconds=3,on_transition=lambda *args:events.append(args))
    v={'trackId':13,'personId':13,'eventType':'no_helmet','className':'helmet','confidence':.8,'message':'未戴'}
    absent={'trackId':13,'ppe':{'helmet':{'status':'violation'}}}
    normal={'trackId':13,'ppe':{'helmet':{'status':'normal'}}}
    unknown={'trackId':13,'ppe':{'helmet':{'status':'unknown'}}}
    assert not m.process([v],100,[absent])
    assert not m.process([v],101,[absent])
    assert len(m.process([v],102,[absent]))==1
    assert len(events)==1 and events[0][0]=='start'
    m.process([],103,[unknown]);m.process([],104,[unknown]);assert len(events)==1
    m.process([],105,[normal]);m.process([],106,[normal]);assert len(events)==1
    m.process([],107.1,[normal]);assert len(events)==2 and events[1][0]=='end'
    assert database.get_events()[0]['close_reason']=='recovered'

def test_event_statistics_and_review(db):
    event=database.create_event(camera_id='camera-01',event_type='no_helmet',message='test',track_id=1,event_time='2026-10-19 08:00:00')
    stats=event_statistics('2026-10-18','2026-10-20')
    assert stats['total']==1 and stats['by_type']['no_helmet']==1
    admin=database.get_supervisors()[0]['id']
    assert review_event(event,'false_positive',admin,'oops')
    assert event_statistics('2026-10-18','2026-10-20')['total']==0


def test_first_account_admin_and_legacy_role(db):
    rows=database.get_supervisors()
    assert rows[0]['role']=='admin'
    new=database.create_supervisor('worker_manager','password5678',role='supervisor')
    assert new['role']=='supervisor'
    assert database.verify_password('password5678',database.get_supervisor_auth_by_username('worker_manager')['password_salt'],database.get_supervisor_auth_by_username('worker_manager')['password_hash'])

def test_evidence_same_frame_and_metadata(db,monkeypatch):
    import cv2,numpy as np,snapshot_service
    monkeypatch.setattr(snapshot_service,'ROOT',db/'shots')
    eid=database.create_event('camera-01','no_helmet','not wearing')
    raw=np.zeros((80,120,3),dtype=np.uint8)
    annotated=raw.copy();annotated[10:30,10:30]=[0,0,255]
    snapshot_service.capture(eid,'start',raw,annotated,44,1234.56)
    snaps=list_snapshots(eid)
    assert len(snaps)==2 and {x['kind'] for x in snaps}=={'raw','annotated'}
    assert all(x['frame_id']==44 and x['captured_at']==1234.56 for x in snaps)
    assert all((db/'shots'/x['filename']).is_file() for x in snaps)

def test_ppe_not_shared_across_people(db):
    p1=sample('person',box(.10,.08,.49,.88),track=1)
    p2=sample('person',box(.45,.08,.90,.88),track=2)
    hat=sample('helmet',box(.19,.10,.32,.25))
    a=SafetyAnalyzer(['helmet'],['person','helmet','head'])
    both=a.analyze([p1,p2,hat],poses=[*pose(p1['bbox']),*pose(p2['bbox'])])
    assert both['people'][0]['ppe']['helmet']['status']=='normal'
    assert both['people'][1]['ppe']['helmet']['status']=='violation'
