import json, os, sys, urllib.request, urllib.parse

K=os.environ['FIREBASE_API_KEY']
B='https://firestore.googleapis.com/v1/projects/sound-guess-95889/databases/(default)/documents'
def val(v):
    t,x=next(iter(v.items()))
    if t=='mapValue': return {k:val(y) for k,y in x.get('fields',{}).items()}
    if t=='arrayValue': return [val(y) for y in x.get('values',[])]
    if t=='integerValue': return int(x)
    if t=='nullValue': return None
    return x
def doc(d): r={k:val(v) for k,v in d.get('fields',{}).items()}; r['_id']=d['name'].split('/')[-1]; return r
def get(path, **q):
    out=[];tok=None
    while True:
        qs={'pageSize':300,'key':K}
        if tok: qs['pageToken']=tok
        u=B+'/'+urllib.parse.quote(path)+'?'+urllib.parse.urlencode(qs)
        d=json.load(urllib.request.urlopen(u,timeout=60))
        out+= [doc(x) for x in d.get('documents',[])]
        tok=d.get('nextPageToken')
        if not tok: return out
def query(coll, field, value, parent=''):
    body={'structuredQuery':{'from':[{'collectionId':coll}],'where':{'fieldFilter':{'field':{'fieldPath':field},'op':'EQUAL','value':{'stringValue':value}}}}}
    u=B+(('/'+urllib.parse.quote(parent)) if parent else '')+':runQuery?key='+K
    r=urllib.request.Request(u,data=json.dumps(body).encode(),headers={'content-type':'application/json'})
    d=json.load(urllib.request.urlopen(r,timeout=60))
    return [doc(x['document']) for x in d if 'document' in x]
