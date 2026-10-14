"""Kanji Golf course generator.
Mines JMdict common-word compound graph for 9-hole courses.
Requires: pip install jamdict-data  (or any 2-kanji common word list)
Usage: python3 generate_course.py [seed]
"""
import json, random, re, sqlite3, sys
from collections import defaultdict, deque

def load_words():
    import jamdict_data, os
    db = sqlite3.connect(os.path.join(os.path.dirname(jamdict_data.__file__),'jamdict.db'))
    rows = db.execute("SELECT DISTINCT k.text FROM Kanji k JOIN KJP p ON k.ID=p.kid").fetchall()
    r2, rL = re.compile(r'^[\u4e00-\u9fff]{2}$'), re.compile(r'^[\u4e00-\u9fff]{3,4}$')
    w2 = sorted({t for (t,) in rows if r2.match(t) and t[0]!=t[1]})
    wL = sorted({t for (t,) in rows if rL.match(t)})
    return w2, wL

def build(w2):
    adj, radj = defaultdict(set), defaultdict(set)
    for w in w2: adj[w[0]].add(w[1]); radj[w[1]].add(w[0])
    return adj, radj

def bfs(adj, src):
    dist={src:0}; q=deque([src])
    while q:
        u=q.popleft()
        for v in adj[u]:
            if v not in dist: dist[v]=dist[u]+1; q.append(v)
    return dist

def route_count(radj, src, dst, dist):
    L=dist[dst]; layers=defaultdict(list)
    for k,v in dist.items():
        if v<=L: layers[v].append(k)
    cnt={src:1}
    for d in range(1,L+1):
        for v in layers[d]:
            cnt[v]=sum(cnt.get(u,0) for u in radj[v] if dist.get(u)==d-1)
    return cnt.get(dst,0)

def one_path(adj, src, dst):
    prev={src:None}; q=deque([src])
    while q:
        u=q.popleft()
        for v in adj[u]:
            if v in prev: continue
            prev[v]=u
            if v==dst:
                p=[v]
                while prev[p[-1]] is not None: p.append(prev[p[-1]])
                p=p[::-1]; return [p[i]+p[i+1] for i in range(len(p)-1)]
            q.append(v)

def generate(seed=0, par_layout=(3,4,4,3,5,4,3,4,5), deg_min=8, deg_max=60, routes_rng=(2,12)):
    w2, wL = load_words()
    adj, radj = build(w2)
    deg = {k: len(adj[k])+len(radj[k]) for k in set(adj)|set(radj)}
    cands = [k for k,d in deg.items() if deg_min<=d<=deg_max]
    rng = random.Random(seed); holes=[]
    while len(holes) < len(par_layout):
        s,t = rng.sample(cands,2)
        dist = bfs(adj, s)
        if t not in dist or dist[t]!=par_layout[len(holes)]: continue
        rc = route_count(radj, s, t, dist)
        if not (routes_rng[0]<=rc<=routes_rng[1]): continue
        holes.append({"hole":len(holes)+1,"start":s,"goal":t,"par":dist[t],
                      "routes":rc,"sample_path":one_path(adj,s,t)})
    return {"holes":holes}

if __name__=='__main__':
    seed = int(sys.argv[1]) if len(sys.argv)>1 else 0
    print(json.dumps(generate(seed), ensure_ascii=False, indent=1))
