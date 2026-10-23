import json, os, re, sys, time, glob, datetime
mode, mins, extra = sys.argv[1], float(sys.argv[2]), sys.argv[3:]
# 'codex:<session id>' also reads the Desktop sessions that session started.
mode, _, me = mode.partition(':')
now = time.time()
# Paths use / on every system, so the mod can split them the same way on Windows.
H = os.path.expanduser('~').replace(os.sep, '/')
# The last scan's rows, by path, from stdin: a journal unchanged since (same mtime and size) is taken from it unread.
cache = {}
try:
    last = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    cache = {r['path']: r for k in ('codex', 'claude') for r in (last.get(k) or [])}
except (ValueError, OSError, AttributeError):
    pass

def files(pattern, **kw):
    return [p.replace(os.sep, '/') for p in glob.glob(pattern, **kw)]

def stats(paths):
    out = {}
    for p in paths:
        try:
            out[p] = os.stat(p)
        except OSError:
            continue
    return out

def recent(paths):
    return {p: st for p, st in stats(paths).items() if now - st.st_mtime <= mins * 60 or p in extra}

def parse(p, st, read):
    r = cache.get(p)
    if r and abs(r.get('mtime', 0) - st.st_mtime * 1000) < 1 and r.get('size') == st.st_size:
        return r
    r = read(p, st.st_mtime)
    r['size'] = st.st_size
    return r

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
    # launches: the codex exec Bash calls this journal made, kept with it so a cached journal still pairs its runs.
    r = {'path': p, 'mtime': mt * 1000, 'launches': []}
    usage, when, tools, turns = {}, {}, {}, 0
    with open(p, errors='replace') as f:
        for l in f:
            # The session's start and folder from its first lines, whatever kind they are: a session with no reply yet
            # still has a prompt with a cwd.
            if ('t0' not in r or 'cwd' not in r) and '"timestamp"' in l:
                d = load(l)
                if d.get('timestamp'):
                    r.setdefault('t0', d['timestamp'])
                if d.get('cwd'):
                    r.setdefault('cwd', d['cwd'])
            if '"type":"assistant"' in l:
                d = load(l)
                if d.get('type') != 'assistant':
                    # A user line quoting an assistant line (a journal read back into the chat).
                    turns += d.get('type') == 'user' and not d.get('isMeta') and '"tool_result"' not in l
                    continue
                m = d.get('message') or {}
                if m.get('usage'):
                    k = m.get('id') or d.get('requestId')
                    usage[k], when[k] = m['usage'], iso(d.get('timestamp'))
                r['branch'] = d.get('gitBranch') or r.get('branch')
                r['model'] = m.get('model') or r.get('model')
                r['effort'] = d.get('effort') or r.get('effort')
                r['entry'] = d.get('entrypoint') or r.get('entry')
                for b in m.get('content') if isinstance(m.get('content'), list) else []:
                    if not (isinstance(b, dict) and b.get('type') == 'tool_use'):
                        continue
                    tools[b.get('name')] = tools.get(b.get('name'), 0) + 1
                    cmd = str((b.get('input') or {}).get('command', '')) if isinstance(b.get('input'), dict) else ''
                    if 'codex' in cmd and ' exec' in cmd:
                        r['launches'].append({'ts': d.get('timestamp'), 'path': p, 'cmd': cmd[:600], 'title': b['input'].get('description'), 'bg': bool(b['input'].get('run_in_background'))})
            elif '"type":"user"' in l and '"isMeta":true' not in l and '"tool_result"' not in l:
                turns += 1
            elif '"custom-title"' in l[:40] or '"ai-title"' in l[:40]:
                d = load(l)
                r['title'] = d.get('customTitle') or d.get('aiTitle') or r.get('title')
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
    r['meta'] = meta(p)
    return r

def meta(p):
    # A subagent's record beside its journal: description, agent type, request shape, its parent agent when nested.
    try:
        return load(open(p[:-6] + '.meta.json', errors='replace').read())
    except OSError:
        return None

# Background tasks this journal was told have ended, by the tool call that started them, and the background shell
# commands it ran (newest last), so a load picks up what ran before it.
if mode == 'ended':
    done, at, bg = {}, {}, []
    # The session's own journal and its subagents': a subagent's background commands are the session's too.
    for p in [q for j in extra for q in [j] + files(j[:-6] + '/subagents/agent-*.jsonl')]:
        for l in open(p, errors='replace'):
            if ('"run_in_background":true' in l or '"name":"Monitor"' in l) and '"type":"assistant"' in l:
                d = load(l)
                for b in (d.get('message') or {}).get('content') or []:
                    if not (isinstance(b, dict) and b.get('type') == 'tool_use' and isinstance(b.get('input'), dict)):
                        continue
                    i = b['input']
                    if b.get('name') == 'Bash' and i.get('run_in_background') and i.get('command'):
                        bg.append({'id': b.get('id'), 'cmd': i['command'], 'title': i.get('description'), 'ts': d.get('timestamp')})
                    elif b.get('name') == 'Monitor' and i.get('command'):
                        bg.append({'id': b.get('id'), 'cmd': i['command'], 'title': i.get('description'), 'ts': d.get('timestamp'),
                                   'timeout': min(int(i.get('timeout_ms') or 300000), 1800000)})
            if '<task-notification>' not in l or '"type":"assistant"' in l:
                continue
            for n in re.findall(r'<task-notification>(.*?)</task-notification>', l):
                u, st = re.search(r'<tool-use-id>(\w+)<', n), re.search(r'<status>(\w+)<', n)
                if u and st:
                    done[u.group(1)] = st.group(1)
                    at[u.group(1)] = load(l).get('timestamp')
    print(json.dumps({'done': done, 'at': at, 'bg': bg}))
    sys.exit()

def desktop(only=None):
    # Claude Desktop keeps one record per session: its own id (what claude:// links take), the CLI transcript id, the
    # folder it was opened in and the session that started it. With only (a CLI session id), just that session's
    # record and the records of the sessions it started are read, which keeps the 3 s poll light.
    A = {'darwin': H + '/Library/Application Support', 'win32': os.environ.get('APPDATA', '').replace(os.sep, '/')}.get(sys.platform, H + '/.config') + '/Claude/'
    texts = [(p, open(p, errors='replace').read()) for p in files(A + 'claude-code-sessions/*/*/local_*.json') + files(A + 'local-agent-mode-sessions/**/local_*.json', recursive=True)]
    if only is not None:
        ids = {only} | {load(s).get('sessionId') for p, s in texts if only in s}
        texts = [(p, s) for p, s in texts if any(i and i in s for i in ids)]
    recs, cli = [], {}
    for p, s in texts:
        d = load(s)
        if d.get('cliSessionId'):
            cli[d.get('sessionId')] = d['cliSessionId']
            recs.append((d, 'code' if 'claude-code-sessions' in p else 'work'))
    return {d['cliSessionId']: {'id': d.get('sessionId'), 'kind': k, 'cwd': d.get('cwd'), 'title': d.get('title'), 'parent': cli.get((d.get('spawnedFrom') or {}).get('sessionId'))}
            for d, k in recs if not d.get('isArchived')}

def withDesk(r, desk):
    r['desktop'] = desk.get(os.path.basename(r['path'].split('/subagents/')[0])[:36].replace('.jsonl', ''))
    if r['desktop'] and r['desktop']['cwd'] and '/subagents/' not in r['path']:
        r['cwd'] = r['desktop']['cwd']
    return r

def parents(paths, desk):
    # The journals the given ones hang under: a subagent's session and, when nested, its parent agent; a Desktop
    # session's starter. Read even when quiet, so no child is drawn as a root of its own.
    out = set()
    for p in paths:
        if '/subagents/' in p:
            s = p.split('/subagents/')[0]
            out.add(s + '.jsonl')
            up = (meta(p) or {}).get('parentAgentId')
            if up:
                out.add(s + '/subagents/agent-' + str(up) + '.jsonl')
        else:
            d = desk.get(os.path.basename(p)[:36])
            if d and d.get('parent'):
                out.update(files(H + '/.claude/projects/*/' + d['parent'] + '.jsonl'))
    return out - set(paths)

out = {'codex': [], 'claude': []}
days = {(datetime.date.today() - datetime.timedelta(days=i)).strftime('%Y/%m/%d') for i in (0, 1)}
cx = [p for d in days for p in files(H + '/.codex/sessions/' + d + '/rollout-*.jsonl')] + extra
for p, st in recent(set(cx)).items():
    out['codex'].append(parse(p, st, codex))
# A child thread's parent rollout, read even when quiet; the rollout's name ends in its thread id.
seen = {r.get('id') for r in out['codex']}
want = {r['parent'] for r in out['codex'] if r.get('parent') and r['parent'] not in seen}
while want:
    found = stats(q for pid in want for q in files(H + '/.codex/sessions/*/*/*/rollout-*-' + pid + '.jsonl'))
    seen |= want
    out['codex'] += [parse(p, st, codex) for p, st in found.items()]
    want = {r['parent'] for r in out['codex'] if r.get('parent') and r['parent'] not in seen}
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
    cl = recent(files(H + '/.claude/projects/*/*.jsonl') + files(H + '/.claude/projects/*/*/subagents/agent-*.jsonl'))
    add = parents(cl, desk)
    while add:
        add = stats(add)
        cl.update(add)
        add = parents(add, desk)
    for p, st in cl.items():
        out['claude'].append(withDesk(parse(p, st, claude), desk))
elif me:
    desk = desktop(me)
    # The title Claude Desktop gives this session, so its row reads as it does among all sessions.
    out['title'] = (desk.get(me) or {}).get('title')
    for sid, d in desk.items():
        for p, st in stats(files(H + '/.claude/projects/*/' + sid + '.jsonl') if d['parent'] == me else []).items():
            out['claude'].append(withDesk(parse(p, st, claude), desk))
# A codex_exec rollout starts within two minutes of the Bash call that launched it.
launches = [l for r in out['claude'] for l in r.get('launches') or []]
for r in out['codex']:
    t = iso(r.get('t0'))
    near = [l for l in launches if t and iso(l['ts']) and 0 <= t - iso(l['ts']) <= 120 and r.get('originator') == 'codex_exec']
    if near:
        r['launch'] = max(near, key=lambda l: iso(l['ts']))
print(json.dumps(out))
