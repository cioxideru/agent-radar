// Generated from ../scan.py (embed with: { echo 'export const SCAN_PY = String.raw`'; cat scan.py; echo '`'; }). Edit scan.py, then regenerate.
export const SCAN_PY = String.raw`
import json, os, re, sys, time, glob, datetime
mode, mins, extra = sys.argv[1], float(sys.argv[2]), sys.argv[3:]
# 'codex:<session id>' also reads the Desktop sessions that session started.
mode, _, me = mode.partition(':')
now = time.time()
# Paths use / on every system, so the mod can split them the same way on Windows.
H = os.path.expanduser('~').replace(os.sep, '/')

def files(pattern, **kw):
    return [p.replace(os.sep, '/') for p in glob.glob(pattern, **kw)]

def recent(paths):
    out = {}
    for p in paths:
        try:
            mt = os.stat(p).st_mtime
        except OSError:
            continue
        if now - mt <= mins * 60 or p in extra:
            out[p] = mt
    return out

BINS = 32

def iso(t):
    try:
        return datetime.datetime.fromisoformat(t.replace('Z', '+00:00')).timestamp()
    except (AttributeError, ValueError):
        return None

def series(points):
    # points: (unix time, value); returns BINS sums from the first point to the last.
    pts = [(t, v) for t, v in points if t]
    if not pts:
        return []
    a, b = min(t for t, _ in pts), max(t for t, _ in pts)
    out = [0] * BINS
    for t, v in pts:
        out[min(BINS - 1, int((t - a) / max(b - a, 1) * BINS))] += v
    return out

def load(l):
    try:
        return json.loads(l)
    except ValueError:
        return {}

def codex(p, mt):
    r = {'path': p, 'mtime': mt * 1000, 'tokIn': 0, 'tokOut': 0, 'started': 0, 'done': 0}
    tools, pts, prev = {}, [], 0
    with open(p, errors='replace') as f:
        for l in f:
            head = l[:160]
            if '"session_meta"' in head:
                m = load(l).get('payload', {})
                r.update(id=m.get('id'), cwd=m.get('cwd'), originator=m.get('originator'), t0=m.get('timestamp'),
                         parent=m.get('parent_thread_id'), kind=m.get('thread_source'))
                spawn = ((m.get('source') or {}).get('subagent') or {}) if isinstance(m.get('source'), dict) else {}
                spawn = spawn.get('thread_spawn') if isinstance(spawn, dict) else None
                if isinstance(spawn, dict) and spawn.get('agent_path'):
                    r['title'] = spawn['agent_path'].rsplit('/', 1)[-1].replace('_', ' ')
            elif '"turn_context"' in head:
                c = load(l).get('payload', {})
                r['model'] = c.get('model')
                r['effort'] = c.get('effort') or c.get('reasoning_effort')
            elif '"token_count"' in head:
                d = load(l)
                pl = d.get('payload', {})
                info = pl.get('info') or {}
                u = info.get('total_token_usage') or {}
                if not u:
                    continue
                r['tokIn'], r['tokOut'] = u.get('input_tokens', 0), u.get('output_tokens', 0)
                r['cacheRead'], r['reasoning'] = u.get('cached_input_tokens', 0), u.get('reasoning_output_tokens', 0)
                r['ctx'] = (info.get('last_token_usage') or {}).get('input_tokens')
                r['ctxWindow'] = info.get('model_context_window')
                lim = (pl.get('rate_limits') or {}).get('primary') or {}
                if lim.get('used_percent') is not None:
                    r['limitPct'], r['limitWindow'] = lim['used_percent'], lim.get('window_minutes')
                pts.append((iso(d.get('timestamp')), r['tokOut'] - prev))
                prev = r['tokOut']
            elif '"function_call"' in head or '"custom_tool_call"' in head:
                n = load(l).get('payload', {}).get('name') or '?'
                tools[n] = tools.get(n, 0) + 1
            elif '"task_started"' in head:
                r['started'] += 1
            elif '"task_complete"' in head:
                r['done'] += 1
            elif '"user_message"' in head and 'title' not in r:
                r['title'] = str(load(l).get('payload', {}).get('message', ''))[:140]
    r['tools'] = sorted(tools.items(), key=lambda x: -x[1])[:6]
    r['series'] = series(pts)
    r['requests'] = len(pts)
    return r

def claude(p, mt):
    r = {'path': p, 'mtime': mt * 1000}
    usage, when, tools, turns = {}, {}, {}, 0
    with open(p, errors='replace') as f:
        for l in f:
            if '"type":"assistant"' in l:
                d = load(l)
                m = d.get('message') or {}
                if m.get('usage'):
                    k = m.get('id') or d.get('requestId')
                    usage[k], when[k] = m['usage'], iso(d.get('timestamp'))
                r['branch'] = d.get('gitBranch') or r.get('branch')
                r['model'] = m.get('model') or r.get('model')
                r['effort'] = d.get('effort') or r.get('effort')
                r['entry'] = d.get('entrypoint') or r.get('entry')
                # The folder the session started in: a later cd moves each line's cwd, not the session's project.
                if d.get('cwd'):
                    r.setdefault('cwd', d['cwd'])
                r.setdefault('t0', d.get('timestamp'))
                for b in m.get('content') if isinstance(m.get('content'), list) else []:
                    i = (b.get('input') or {}) if isinstance(b, dict) else {}
                    if isinstance(b, dict) and b.get('type') == 'tool_use':
                        tools[b.get('name')] = tools.get(b.get('name'), 0) + 1
                    if isinstance(b, dict) and b.get('type') == 'tool_use' and 'codex' in str(i.get('command', '')) and ' exec' in str(i.get('command', '')):
                        launches.append({'ts': d.get('timestamp'), 'path': p, 'cmd': i['command'][:600], 'title': i.get('description'), 'bg': bool(i.get('run_in_background'))})
            elif '"type":"user"' in l and '"isMeta":true' not in l and '"tool_result"' not in l:
                turns += 1
            elif '"custom-title"' in l[:40] or '"ai-title"' in l[:40]:
                d = load(l)
                r['title'] = d.get('customTitle') or d.get('aiTitle') or r.get('title')
            elif 't0' not in r and '"timestamp"' in l:
                r['t0'] = load(l).get('timestamp')
    r['tokIn'] = sum(u.get('input_tokens', 0) + u.get('cache_creation_input_tokens', 0) + u.get('cache_read_input_tokens', 0) for u in usage.values())
    r['tokOut'] = sum(u.get('output_tokens', 0) for u in usage.values())
    r['cacheRead'] = sum(u.get('cache_read_input_tokens', 0) for u in usage.values())
    r['cacheWrite'] = sum(u.get('cache_creation_input_tokens', 0) for u in usage.values())
    if usage:
        last = usage[max(usage, key=lambda k: when.get(k) or 0)]
        r['ctx'] = last.get('input_tokens', 0) + last.get('cache_read_input_tokens', 0) + last.get('cache_creation_input_tokens', 0)
    r['tools'] = sorted(tools.items(), key=lambda x: -x[1])[:6]
    r['series'] = series([(when.get(k), u.get('output_tokens', 0)) for k, u in usage.items()])
    r['requests'], r['turns'] = len(usage), turns
    meta = p[:-6] + '.meta.json'
    if os.path.exists(meta):
        r['meta'] = load(open(meta).read())
    return r

# Background tasks this journal was told have ended, by the tool call that started them.
if mode == 'ended':
    done = {}
    for p in extra:
        for l in open(p, errors='replace'):
            if '<task-notification>' not in l or '"type":"assistant"' in l:
                continue
            for n in re.findall(r'<task-notification>(.*?)</task-notification>', l):
                u, st = re.search(r'<tool-use-id>(\w+)<', n), re.search(r'<status>(\w+)<', n)
                if u and st:
                    done[u.group(1)] = st.group(1)
    print(json.dumps(done))
    sys.exit()

def desktop():
    # Claude Desktop keeps one record per session: its own id (what claude:// links take), the CLI transcript id, the
    # folder it was opened in and the session that started it.
    A = {'darwin': H + '/Library/Application Support', 'win32': os.environ.get('APPDATA', '').replace(os.sep, '/')}.get(sys.platform, H + '/.config') + '/Claude/'
    recs, cli = [], {}
    for p in files(A + 'claude-code-sessions/*/*/local_*.json') + files(A + 'local-agent-mode-sessions/**/local_*.json', recursive=True):
        d = load(open(p, errors='replace').read())
        if d.get('cliSessionId'):
            cli[d.get('sessionId')] = d['cliSessionId']
            recs.append((d, 'code' if 'claude-code-sessions' in p else 'work'))
    return {d['cliSessionId']: {'id': d.get('sessionId'), 'kind': k, 'cwd': d.get('cwd'), 'parent': cli.get((d.get('spawnedFrom') or {}).get('sessionId'))}
            for d, k in recs if not d.get('isArchived')}

def withDesk(r, desk):
    r['desktop'] = desk.get(os.path.basename(r['path'].split('/subagents/')[0])[:36].replace('.jsonl', ''))
    if r['desktop'] and r['desktop']['cwd'] and '/subagents/' not in r['path']:
        r['cwd'] = r['desktop']['cwd']
    return r

launches = []
out = {'codex': [], 'claude': []}
days = {(datetime.date.today() - datetime.timedelta(days=i)).strftime('%Y/%m/%d') for i in (0, 1)}
cx = [p for d in days for p in files(H + '/.codex/sessions/' + d + '/rollout-*.jsonl')] + extra
for p, mt in recent(set(cx)).items():
    out['codex'].append(codex(p, mt))
names = {}
try:
    for l in open(H + '/.codex/session_index.jsonl', errors='replace'):
        d = load(l)
        if d.get('thread_name'):
            names[d.get('id')] = d['thread_name']
except OSError:
    pass
for r in out['codex']:
    if names.get(r.get('id')):
        r['title'] = names[r['id']]
if mode == 'all':
    desk = desktop()
    cl = files(H + '/.claude/projects/*/*.jsonl') + files(H + '/.claude/projects/*/*/subagents/agent-*.jsonl')
    for p, mt in recent(cl).items():
        out['claude'].append(withDesk(claude(p, mt), desk))
elif me:
    # ponytail: every child journal is read on each poll; an mtime cache if a session starts dozens of them.
    desk = desktop()
    for sid, d in desk.items():
        for p in files(H + '/.claude/projects/*/' + sid + '.jsonl') if d['parent'] == me else []:
            out['claude'].append(withDesk(claude(p, os.stat(p).st_mtime), desk))
# A codex_exec rollout starts within two minutes of the Bash call that launched it.
for r in out['codex']:
    t = iso(r.get('t0'))
    near = [l for l in launches if t and iso(l['ts']) and 0 <= t - iso(l['ts']) <= 120 and r.get('originator') == 'codex_exec']
    if near:
        r['launch'] = max(near, key=lambda l: iso(l['ts']))
print(json.dumps(out))
`
