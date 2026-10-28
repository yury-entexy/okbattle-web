# Exports a demo slice of the catalog (categories, questions, audio, images) into public/data.
# Usage: FIREBASE_API_KEY=... python3 scripts/snapshot/export.py public/data   (needs ffmpeg)
import sys, os, json, random, subprocess, urllib.request, hashlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fs import get, query  # noqa: E402
OUT = sys.argv[1]; os.makedirs(OUT+'/media', exist_ok=True)
PER = 12
MUSIC = {  # catId: [subIds]
 'ShBdmMnYdy0atpz5CDGk': ['EUnYSCpmDlajnHIqkjqX','zMYIchje10ZVlIVGlT65','9UuV6eUzOhYogb6YeEgA'],
 'aEmsvd3Ji8CK2Slxsx2Q': ['Kyic9UEVcg0R60Mttzff','7oXrBP33znr8EFf8fTRu','yqO3oNZ6izFoHD5E4O44'],
 '9mOnsWP6cA57mIaNIQxk': ['TDfuqztn6Ph6JBpSqBH2'],
 'GJkTyEtHWzmk4fMiFfFS': ['C7Zlg1D5sTvA95br17Cz'],
}
QUIZ = {
 '5HdbP0OInQ7KBBh3cWb4': ['9wfkEVmcU1PGr5EwcHKo','ojCBbZPeVjhWPSG3X60D','4Z5gAIh76L1UvKhIJTjX'],
 'fgeIIDThrTmtWA0V7LaS': ['VejIiMTrj9MS3E3QuU6f','KtkYJYhg53oknWqau6on'],
}
rnd = random.Random(42)
def dl(url, path):
    if os.path.exists(path): return True
    try:
        data = urllib.request.urlopen(url, timeout=90).read()
    except Exception as e:
        print('dl fail', url[:90], e); return False
    tmp = path + '.src'; open(tmp, 'wb').write(data)
    if path.endswith('.mp3'):
        cmd = ['ffmpeg','-loglevel','error','-y','-i',tmp,'-t','25','-ac','2','-b:a','96k','-map_metadata','-1','-vn',path]
    else:
        cmd = ['ffmpeg','-loglevel','error','-y','-i',tmp,'-vf',"scale='min(640,iw)':-2",'-q:v','70',path]
    r = subprocess.run(cmd); os.remove(tmp)
    return r.returncode == 0 and os.path.exists(path)
def name(d, loc):
    n = d.get('name')
    return n.get(loc) or n.get('en') or next(iter(n.values()),'') if isinstance(n, dict) else (n or '')
def h(s): return hashlib.sha1(s.encode()).hexdigest()[:12]
def opts(m): return [m.get(f'answer{i}','') for i in range(1,5)]
catalog = {'music': [], 'quiz': []}
for kind, spec, ccoll, qcoll in [('music', MUSIC, 'Categories', 'Sounds'), ('quiz', QUIZ, 'CommonQuestionCategories', 'CommonQuestions')]:
    cats = {c['_id']: c for c in get(ccoll)}
    for cid, subs in spec.items():
        c = cats[cid]
        subdocs = {s['_id']: s for s in get(f'{ccoll}/{cid}/Subcategories')}
        cat = {'id': cid, 'name': {'ru': name(c,'ru'), 'en': name(c,'en')}, 'subcategories': []}
        cimg = f'media/c_{h(cid)}.webp'
        if c.get('photo') and dl(c['photo'], OUT+'/'+cimg): cat['image'] = cimg
        for sid in subs:
            s = subdocs[sid]
            items = query(qcoll, 'subCatID', sid); rnd.shuffle(items)
            qs = []
            for it in items:
                if len(qs) >= PER: break
                if kind == 'music':
                    if not it.get('url') or not it.get('authorAnswers') or not it.get('titleAnswers'): continue
                    a = f'media/s_{h(it["_id"])}.mp3'
                    if not dl(it['url'], OUT+'/'+a): continue
                    q = {'id': it['_id'], 'level': it.get('level',1), 'audio': a, 'author': it['author'], 'title': it['title'],
                         'authorOptions': opts(it['authorAnswers']), 'titleOptions': opts(it['titleAnswers'])}
                    p = f'media/p_{h(it["_id"])}.webp'
                    if it.get('photo') and dl(it['photo'], OUT+'/'+p): q['photo'] = p
                else:
                    card = it.get('questionCard') or {}
                    ru, en = card.get('ru'), card.get('en')
                    if not ru or not ru.get('question'): continue
                    q = {'id': it['_id'], 'level': it.get('level',1),
                         'question': {'ru': ru['question'], 'en': (en or ru)['question']},
                         'options': {'ru': opts(ru), 'en': opts(en or ru)}}
                    cont = it.get('content') or {}
                    if cont.get('type') == 'image' and cont.get('data'):
                        p = f'media/q_{h(it["_id"])}.webp'
                        if dl(cont['data'][0]['url'], OUT+'/'+p): q['image'] = p
                    elif cont.get('type') not in (None, 'text', 'image'):
                        continue
                qs.append(q)
            cat['subcategories'].append({'id': sid, 'name': {'ru': name(s,'ru'), 'en': name(s,'en')}, 'questions': qs})
            print(kind, cat['name']['ru'], '/', name(s,'ru'), len(qs), flush=True)
        catalog[kind].append(cat)
json.dump(catalog, open(OUT+'/catalog.json','w'), ensure_ascii=False, separators=(',',':'))
