from __future__ import annotations
from datetime import datetime,timezone
import time
from database import create_event,end_event_detection,update_event_last_seen
from v2_data import set_close_reason

def stamp(t):return datetime.fromtimestamp(t,tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

class EventManager:
    def __init__(self,camera_id,trigger_seconds=1.5,recovery_seconds=2.0,occlusion_seconds=3.0,on_transition=None):
        self.camera_id=camera_id;self.trigger_seconds=trigger_seconds
        self.recovery_seconds=recovery_seconds;self.occlusion_seconds=occlusion_seconds
        self.on_transition=on_transition
        self.pending={};self.active={};self.missing_since={};self.missing_reason={};self.last_violation={}
    def process(self,violations,timestamp=None,people=None):
        t=time.time() if timestamp is None else timestamp
        people=people or []
        vmap={}
        for violation in violations:
            ident=violation.get('trackId')
            if ident is None:continue  # no stable identity: do not open persistent DB events
            vmap[(ident,violation['eventType'])]=violation
        person_map={p['trackId']:p for p in people if p.get('trackId') is not None}
        alerts=[]
        for key,v in vmap.items():
            self.last_violation[key]=v;self.missing_since.pop(key,None);self.missing_reason.pop(key,None)
            since=self.pending.setdefault(key,t)
            if t-since<self.trigger_seconds:continue
            event_id=self.active.get(key)
            if event_id is None:
                event_id=create_event(camera_id=self.camera_id,track_id=v['trackId'],event_type=v['eventType'],class_name=v.get('className'),confidence=v.get('confidence'),message=v['message'],event_time=stamp(t))
                self.active[key]=event_id
                if self.on_transition:self.on_transition('start',event_id,t,v)
            else:update_event_last_seen(event_id,stamp(t))
            alerts.append({**v,'eventId':event_id,'durationSeconds':round(t-since,2)})
        # Only end after repeated visible normal, unknown pauses (does not imply compliance).
        for key in set(self.pending)|set(self.active):
            if key in vmap:continue
            track_id,event_type=key
            person=person_map.get(track_id)
            ppe=event_type.removeprefix('no_')
            status=person.get('ppe',{}).get(ppe,{}).get('status','unknown') if person else 'unknown'
            if status=='normal':delay=self.recovery_seconds;reason='recovered'
            else:delay=self.occlusion_seconds;reason='tracking_lost' if person is None else 'unknown'
            if self.missing_reason.get(key)!=reason:
                self.missing_since[key]=t
                self.missing_reason[key]=reason
            first=self.missing_since[key]
            if t-first<delay:continue
            event_id=self.active.pop(key,None)
            self.pending.pop(key,None);self.missing_since.pop(key,None);self.missing_reason.pop(key,None)
            if event_id is not None:
                end_event_detection(event_id,stamp(t));set_close_reason(event_id,reason)
                if self.on_transition:self.on_transition('end',event_id,t,self.last_violation.get(key,{}))
            self.last_violation.pop(key,None)
        return alerts
