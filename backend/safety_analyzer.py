"""PPE association using normalized boxes and optional COCO-17 pose landmarks.
Unknown is explicit: a missing detector class or hidden body part is NOT a violation.
"""
import math

ALIASES={'helmet':{'helmet','hardhat','hard_hat','hard-hat'},'respirator':{'respirator','gas_mask','gasmask','gas-mask'},'glove':{'glove','gloves','heat_glove','heat_resistant_glove','aluminized_gloves','aluminized_glove'}}
LABELS={'helmet':'安全帽','respirator':'防毒面具','glove':'隔熱手套'}
# Event types stored in SQLite; must match simulated events and frontend labels.
EVENT_TYPES={'helmet':'no_helmet','respirator':'no_gas_mask','glove':'no_gloves'}
PPE_BY_EVENT={v:k for k,v in EVENT_TYPES.items()}
ALL_PPE=list(EVENT_TYPES)


def inside(x,y,b):return b['x1']<=x<=b['x2'] and b['y1']<=y<=b['y2']
def center(b):return ((b['x1']+b['x2'])/2,(b['y1']+b['y2'])/2)
def iou(a,b):
    x=max(0,min(a['x2'],b['x2'])-max(a['x1'],b['x1']))
    y=max(0,min(a['y2'],b['y2'])-max(a['y1'],b['y1']))
    inter=x*y
    ar=lambda q:(q['x2']-q['x1'])*(q['y2']-q['y1'])
    return inter/max(ar(a)+ar(b)-inter,1e-9)

def closest_pose(person, poses):
    if not poses:return None
    candidate=max(poses,key=lambda p:iou(person['bbox'],p['bbox']))
    return candidate['points'] if iou(person['bbox'],candidate['bbox'])>=0.25 else None

def visible(kps,index,threshold=.3):
    if not kps or len(kps)<=index:return None
    p=kps[index]
    return p if p['confidence']>=threshold and (p['x'] or p['y']) else None

class SafetyAnalyzer:
    def __init__(self,required_ppe=None,supported_classes=None):
        self.required_ppe=required_ppe if required_ppe is not None else list(ALL_PPE)
        self.supported_classes=set(str(x).strip().lower() for x in (supported_classes or []))
    def analyze(self,detections,poses=None):
        persons=[d for d in detections if d['className'].lower()=='person']
        items={key:[d for d in detections if d['className'].lower() in aliases] for key,aliases in ALIASES.items()}
        # Assign every PPE detection to at most one person to avoid sharing gear
        # between overlapping person boxes.
        owner={}
        for name,detected in items.items():
            for item in detected:
                cx,cy=center(item['bbox'])
                plausible=[]
                for index,p in enumerate(persons):
                    bx=p['bbox']
                    if inside(cx,cy,bx):
                        px,py=center(bx);bw=max(bx['x2']-bx['x1'],.01);bh=max(bx['y2']-bx['y1'],.01)
                        plausible.append((((cx-px)/bw)**2+((cy-py)/bh)**2,index))
                if plausible:owner[id(item)]=min(plausible)[1]
        people=[]; violations=[]
        for idx,person in enumerate(persons):
            box=person['bbox']; h=max(box['y2']-box['y1'],.01); w=max(box['x2']-box['x1'],.01)
            kps=closest_pose(person,poses)
            pid=person.get('trackId') if person.get('trackId') is not None else idx+1
            record={'personId':pid,'trackId':person.get('trackId'),'bbox':box,'personConfidence':person['confidence'],'ppe':{}}
            for name in self.required_ppe:
                if name not in ALIASES:continue
                supported=bool(self.supported_classes.intersection(ALIASES[name]))
                candidates=[]
                for item in items[name]:
                    if owner.get(id(item))!=idx:continue
                    cx,cy=center(item['bbox'])
                    if not inside(cx,cy,box):continue
                    # A coarse anatomical band excludes PPE held far away from head.
                    if name=='helmet' and cy>box['y1']+.34*h:continue
                    if name=='respirator' and not(box['y1']+.04*h<=cy<=box['y1']+.47*h):continue
                    candidates.append(item)
                score=max((c['confidence'] for c in candidates),default=None)
                result='unknown'; side_info={}
                if not supported:reason='model_unsupported'
                elif name=='helmet':
                    head_landmarks=[visible(kps,j) for j in (0,1,2,3,4)]
                    head_detected=any(d['className'].lower()=='head' and inside(*center(d['bbox']),box) for d in detections)
                    if candidates:result='normal';reason='helmet_detected'
                    elif any(head_landmarks) or head_detected:result='violation';reason='visible_head_without_helmet'
                    else:reason='head_obscured'
                elif name=='respirator':
                    nose=visible(kps,0)
                    if candidates and nose:
                        near=[c for c in candidates if math.hypot(*(a-b for a,b in zip(center(c['bbox']),(nose['x'],nose['y']))))<max(w,h)*.24]
                        result='normal' if near else 'unknown';reason='respirator_at_face' if near else 'uncertain_alignment'
                    elif candidates:
                        # Positive PPE evidence is valid without an optional pose model.
                        # The item has already been assigned to this person's face band.
                        result='normal';reason='respirator_detected_without_pose'
                    elif nose:result='violation';reason='visible_face_without_respirator'
                    else:reason='face_obscured'
                elif name=='glove':
                    wrists=[visible(kps,9),visible(kps,10)]
                    assigned=[]
                    for wrist in wrists:
                        if not wrist:assigned.append(None);continue
                        # Use distance relative to person bbox; prevent one glove passing both hands.
                        matching=sorted([(math.hypot(center(c['bbox'])[0]-wrist['x'],center(c['bbox'])[1]-wrist['y']),i) for i,c in enumerate(candidates)])
                        assigned.append(matching[0][1] if matching and matching[0][0]<max(.09*w,.09*h) else -1)
                    if assigned[0] is not None and assigned[1] is not None:
                        if assigned[0]>=0 and assigned[1]>=0 and assigned[0]!=assigned[1]:result='normal';reason='both_gloves_detected'
                        else:result='violation';reason='visible_hand_missing_glove'
                    elif len(candidates)>=2 and any(
                        iou(a['bbox'],b['bbox'])<.5
                        for j,a in enumerate(candidates) for b in candidates[j+1:]
                    ):
                        # If both wrists are unavailable, two spatially distinct
                        # detected gloves are still positive evidence. One glove
                        # without pose is insufficient to infer a violation.
                        result='normal';reason='two_gloves_detected_without_pose'
                    else:reason='hand_obscured'
                    side_info={'leftHand': 'unknown' if assigned[0] is None else 'normal' if assigned[0]>=0 else 'violation', 'rightHand':'unknown' if assigned[1] is None else 'normal' if assigned[1]>=0 else 'violation'}
                record['ppe'][name]={'status':result,'reason':reason,'confidence':score,**side_info}
                if result=='violation':
                    violations.append({'trackId':person.get('trackId'),'personId':pid,'eventType':EVENT_TYPES[name],'className':name,'confidence':person['confidence'],'message':f'人員 #{pid} 未正確穿戴{LABELS[name]}','bbox':box})
            people.append(record)
        return {'people':people,'violations':violations}
