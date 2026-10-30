"""Self-check of scan.py on fictional journals in a temporary home: quiet parents are read for their active children
(a session for its subagent, an agent for a nested one, a Codex thread for its child), a chat Remote Control holds
open stays listed while alive, the cache on stdin spares unchanged journals, and a user line quoting an assistant line is still a turn. Run: python3 -I tests/scan_test.py"""
import json, os, subprocess, sys, tempfile, time, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
now = time.time()
OLD, FRESH = now - 40 * 60, now - 30


def write(path, lines, mtime):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(''.join(json.dumps(l, separators=(',', ':')) + '\n' for l in lines))
    os.utime(path, (mtime, mtime))


def scan(home, *args, stdin='{}'):
    r = subprocess.run([sys.executable, '-I', os.path.join(ROOT, 'scan.py'), *args], input=stdin, capture_output=True, text=True, env={**os.environ, 'HOME': home})
    assert r.returncode == 0, r.stderr
    return json.loads(r.stdout)


def iso(t):
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).isoformat().replace('+00:00', 'Z')


with tempfile.TemporaryDirectory() as home:
    P = home + '/.claude/projects/-x-Proj/'
    user = {'type': 'user', 'cwd': '/x/Proj', 'timestamp': iso(OLD - 60), 'message': {'role': 'user', 'content': 'start'}}
    reply = {'type': 'assistant', 'cwd': '/x/Proj', 'timestamp': iso(OLD - 50), 'entrypoint': 'cli',
             'message': {'id': 'm1', 'model': 'claude-opus-5-5', 'usage': {'input_tokens': 10, 'output_tokens': 5}, 'content': []}}
    # A user line quoting an assistant line (a journal read back): a turn, not a reply.
    quote = {'type': 'user', 'timestamp': iso(OLD - 40), 'message': {'role': 'user', 'content': 'saw {"type":"assistant"} in the log'}}
    write(P + 'S1.jsonl', [user, reply, quote], OLD)
    write(P + 'S1/subagents/agent-a1.jsonl', [dict(user, timestamp=iso(OLD - 30))], OLD)
    json.dump({'description': 'Outer', 'agentType': 'Explore'}, open(P + 'S1/subagents/agent-a1.meta.json', 'w'))
    write(P + 'S1/subagents/agent-a2.jsonl', [dict(user, timestamp=iso(FRESH))], FRESH)
    json.dump({'description': 'Inner', 'parentAgentId': 'a1'}, open(P + 'S1/subagents/agent-a2.meta.json', 'w'))
    # A session nobody is waiting on: quiet, and no child of anything.
    write(P + 'S2.jsonl', [user, reply], OLD)
    day = datetime.date.today().strftime('%Y/%m/%d')
    C = home + '/.codex/sessions/' + day + '/'
    meta = lambda tid, parent=None, t=OLD: {'timestamp': iso(t), 'type': 'session_meta', 'payload': {'id': tid, 'cwd': '/x/Proj', 'originator': 'Codex Desktop', 'timestamp': iso(t), 'parent_thread_id': parent, 'thread_source': 'user'}}
    turn = {'timestamp': iso(FRESH), 'type': 'event_msg', 'payload': {'type': 'turn_context', 'model': 'gpt-6', 'effort': 'high'}}
    write(C + 'rollout-2026-10-16T10-00-00-T1.jsonl', [meta('T1'), turn], OLD)
    write(C + 'rollout-2026-10-16T10-05-00-T2.jsonl', [meta('T2', 'T1', FRESH), turn], FRESH)

    out = scan(home, 'all', '15')
    paths = {r['path'].split('/')[-1]: r for r in out['claude']}
    assert set(paths) == {'S1.jsonl', 'agent-a1.jsonl', 'agent-a2.jsonl'}, sorted(paths)
    assert paths['S1.jsonl']['turns'] == 2 and paths['S1.jsonl']['requests'] == 1, paths['S1.jsonl']
    assert paths['S1.jsonl']['cwd'] == '/x/Proj' and paths['S1.jsonl']['t0'] == iso(OLD - 60)
    assert paths['agent-a2.jsonl']['meta']['parentAgentId'] == 'a1'
    assert {r['id'] for r in out['codex']} == {'T1', 'T2'}, out['codex']

    # A chat Remote Control holds open: listed while quiet, titled from beside its journal, and only while alive.
    # A Desktop chat with Remote Control on, and a record whose process is gone, stay out.
    write(P + 'R1.jsonl', [user], OLD)
    os.makedirs(P + 'R1')
    json.dump({'customTitle': 'Held'}, open(P + 'R1/custom-title.json', 'w'))
    write(P + 'R2.jsonl', [user], OLD)
    write(P + 'R3.jsonl', [user], OLD)
    gone = subprocess.Popen([sys.executable, '-c', ''])
    gone.wait()
    os.makedirs(home + '/.claude/sessions')
    for name, rec in (('1', {'sessionId': 'R1', 'bridgeSessionId': 'b', 'pid': os.getpid()}),
                      ('2', {'sessionId': 'R2', 'bridgeSessionId': 'b', 'pid': os.getpid(), 'hostSessionId': 'local_x'}),
                      ('3', {'sessionId': 'R3', 'bridgeSessionId': 'b', 'pid': gone.pid})):
        json.dump(rec, open(home + '/.claude/sessions/' + name + '.json', 'w'))
    held = {r['path'].split('/')[-1]: r for r in scan(home, 'all', '15')['claude']}
    assert 'R2.jsonl' not in held and 'R3.jsonl' not in held, sorted(held)
    assert held['R1.jsonl']['live'] and held['R1.jsonl']['entry'] == 'remote-control' and held['R1.jsonl']['title'] == 'Held', held['R1.jsonl']
    assert not held['S1.jsonl']['live']
    for f in os.listdir(home + '/.claude/sessions'):
        os.remove(home + '/.claude/sessions/' + f)
    assert 'R1.jsonl' not in {r['path'].split('/')[-1] for r in scan(home, 'all', '15', stdin=json.dumps({'claude': list(held.values())}))['claude']}

    # The cache: an unchanged journal's row comes back as given; a changed one is read anew.
    paths['S1.jsonl']['title'] = 'CACHED'
    write(P + 'S1/subagents/agent-a2.jsonl', [dict(user, timestamp=iso(FRESH)), reply], FRESH + 1)
    again = {r['path'].split('/')[-1]: r for r in scan(home, 'all', '15', stdin=json.dumps(out))['claude']}
    assert again['S1.jsonl']['title'] == 'CACHED', again['S1.jsonl']
    assert again['agent-a2.jsonl']['requests'] == 1 and 'title' not in again['agent-a2.jsonl'], again['agent-a2.jsonl']
    print('scan.py: ok')
