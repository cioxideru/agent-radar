"""Self-check of scan.py on fictional journals in a temporary home: quiet parents are read for their active children
(a session for its subagent, an agent for a nested one, a Codex thread for its child), a chat Remote Control holds
open stays listed while alive, the cache on stdin spares unchanged journals, a user line quoting an assistant line is still a turn, 'only' reads the rollouts it is given and the threads above them and nothing else, every live session's Desktop title comes with the scan of all, a session's own scan finds what it started, a Desktop record unchanged is not read again, a thread's name is its last, a git worktree anywhere names its repository, a session's thinking tokens are summed where its replies count them, a load's look back returns each journal read whole, and a chat another chat's shell started hangs under that chat by their processes, a day past its end too. Run: python3 -I tests/scan_test.py"""
import json, os, subprocess, sys, tempfile, time, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
now = time.time()
OLD, FRESH = now - 40 * 60, now - 30


def write(path, lines, mtime):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(''.join(json.dumps(l, separators=(',', ':')) + '\n' for l in lines))
    os.utime(path, (mtime, mtime))


def scan(home, *args, stdin='{}', cwd=None):
    r = subprocess.run([sys.executable, '-I', os.path.join(ROOT, 'scan.py'), *args], input=stdin, capture_output=True, text=True, env={**os.environ, 'HOME': home}, cwd=cwd)
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
    assert 'reasoning' not in paths['S1.jsonl'], paths['S1.jsonl']

    # Thinking tokens: summed over the replies that count them, a reply with no count adding nothing.
    thought = lambda mid, out, th: dict(reply, timestamp=iso(FRESH), message=dict(reply['message'], id=mid, usage={'input_tokens': 10, 'output_tokens': out, 'output_tokens_details': {'thinking_tokens': th}}))
    write(P + 'S3.jsonl', [user, thought('m2', 40, 30), thought('m3', 20, 5), thought('m4', 9, None), dict(reply, message=dict(reply['message'], id='m5'))], FRESH)
    s3 = next(r for r in scan(home, 'all', '15')['claude'] if r['path'].endswith('/S3.jsonl'))
    assert s3['reasoning'] == 35 and s3['tokOut'] == 74, s3
    # A load's look back reads the session's journal whole, and its subagents', for what the hooks have not seen.
    back = scan(home, 'ended', '0', P + 'S3.jsonl')['recs']
    assert [(r['tokIn'], r['tokOut'], r['reasoning']) for r in back] == [(40, 74, 35)], back
    assert {r['path'].split('/')[-1] for r in scan(home, 'ended', '0', P + 'S1.jsonl')['recs']} == {'S1.jsonl', 'agent-a1.jsonl', 'agent-a2.jsonl'}

    # A chat Remote Control holds open: listed while quiet, titled from beside its journal, and only while alive.
    # A Desktop chat with Remote Control on, and a record whose process is gone, stay out.
    write(P + 'R1.jsonl', [user], OLD)
    os.makedirs(P + 'R1')
    json.dump({'customTitle': 'Held'}, open(P + 'R1/custom-title.json', 'w'))
    write(P + 'R2.jsonl', [user], OLD)
    write(P + 'R3.jsonl', [user], OLD)
    # One that has ended keeps its marker beside the journal, and so its label.
    write(P + 'R4.jsonl', [user], FRESH)
    os.makedirs(P + 'R4')
    json.dump({'eventId': 'e'}, open(P + 'R4/ccr-tip.json', 'w'))
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
    assert not held['R4.jsonl']['live'] and held['R4.jsonl']['entry'] == 'remote-control', held['R4.jsonl']
    for f in os.listdir(home + '/.claude/sessions'):
        os.remove(home + '/.claude/sessions/' + f)
    assert 'R1.jsonl' not in {r['path'].split('/')[-1] for r in scan(home, 'all', '15', stdin=json.dumps({'claude': list(held.values())}))['claude']}

    # The cache: an unchanged journal's row comes back as given; a changed one is read anew.
    paths['S1.jsonl']['title'] = 'CACHED'
    write(P + 'S1/subagents/agent-a2.jsonl', [dict(user, timestamp=iso(FRESH)), reply], FRESH + 1)
    again = {r['path'].split('/')[-1]: r for r in scan(home, 'all', '15', stdin=json.dumps(out))['claude']}
    assert again['S1.jsonl']['title'] == 'CACHED', again['S1.jsonl']
    assert again['agent-a2.jsonl']['requests'] == 1 and 'title' not in again['agent-a2.jsonl'], again['agent-a2.jsonl']

    # 'only': the rollouts named, the threads above them, no journals and no Desktop records.
    one = scan(home, 'only', '5', C + 'rollout-2026-10-16T10-05-00-T2.jsonl')
    assert {r['id'] for r in one['codex']} == {'T1', 'T2'} and one['claude'] == [], one
    assert one['dirs'] == [home + '/.codex/sessions/' + d for d in sorted({day, (datetime.date.today() - datetime.timedelta(days=1)).strftime('%Y/%m/%d')})], one['dirs']

    # A live session's Desktop title and the folder its record lies in, whether or not its journal is listed.
    A = home + ('/Library/Application Support' if sys.platform == 'darwin' else '/.config') + '/Claude/claude-code-sessions/a/b/'
    os.makedirs(A)
    json.dump({'sessionId': 'local_1', 'cliSessionId': 'S2', 'title': 'Quiet chat', 'cwd': '/x/Proj'}, open(A + 'local_1.json', 'w'))
    json.dump({'sessionId': 'local_2', 'cliSessionId': 'S9', 'title': 'Not running', 'cwd': '/x/Proj'}, open(A + 'local_2.json', 'w'))
    json.dump({'sessionId': 'S2', 'pid': os.getpid()}, open(home + '/.claude/sessions/4.json', 'w'))
    both = scan(home, 'all', '15')
    assert both['titles'] == {'S2': 'Quiet chat'}, both['titles']
    # The folders the mod looks at between scans: Desktop's records, and the process records, which a new chat moves.
    assert both['watch'] == [A[:-1], home + '/.claude/sessions'], both['watch']
    assert 'S2.jsonl' not in {r['path'].split('/')[-1] for r in both['claude']}

    # A session's own scan: its Desktop title and the sessions it started, an archived one left out.
    json.dump({'sessionId': 'local_3', 'cliSessionId': 'S1', 'title': 'Child', 'cwd': '/x/Proj', 'spawnedFrom': {'sessionId': 'local_1'}}, open(A + 'local_3.json', 'w'))
    json.dump({'sessionId': 'local_4', 'cliSessionId': 'R1', 'title': 'Shelved', 'isArchived': True, 'spawnedFrom': {'sessionId': 'local_1'}}, open(A + 'local_4.json', 'w'))
    mine = scan(home, 'codex:S2', '5')
    assert mine['title'] == 'Quiet chat', mine['title']
    assert [(r['path'].split('/')[-1], r['desktop']['parent']) for r in mine['claude']] == [('S1.jsonl', 'S2')], mine['claude']

    # What a record said comes back in 'records': unchanged it is not read again; changed it is, and gone it is gone.
    kept = json.loads(json.dumps(mine['records']))
    assert set(kept) == {A + 'local_%d.json' % i for i in (1, 2, 3, 4)}, sorted(kept)
    kept[A + 'local_1.json']['title'] = 'CACHED'
    assert scan(home, 'all', '15', stdin=json.dumps({'records': kept}))['titles'] == {'S2': 'CACHED'}
    json.dump({'sessionId': 'local_1', 'cliSessionId': 'S2', 'title': 'Renamed', 'cwd': '/x/Proj'}, open(A + 'local_1.json', 'w'))
    os.remove(A + 'local_2.json')
    fresh = scan(home, 'all', '15', stdin=json.dumps({'records': kept}))
    assert fresh['titles'] == {'S2': 'Renamed'} and A + 'local_2.json' not in fresh['records'], fresh['titles']

    # A thread's name: the last line that gives its id; a line that is no JSON is passed over.
    with open(home + '/.codex/session_index.jsonl', 'w') as f:
        f.write('{"id":"T1","thread_name":"Old"}\nnot json\n{"id":"T2","thread_name":"Other"}\n{"id":"T1","thread_name":"New"}')
    assert {r['id']: r['title'] for r in scan(home, 'all', '15')['codex']} == {'T1': 'New', 'T2': 'Other'}

    # A worktree outside .claude/worktrees belongs to its repository, found from a folder inside it; a plain repository
    # and a folder in no repository are their own projects.
    W = os.path.realpath(home) + '/work'  # the folder Python finds itself in, /private/var on macOS
    os.makedirs(home + '/work/Repo/.git/worktrees/feat')
    os.makedirs(home + '/work/wt/feat/src')
    open(home + '/work/wt/feat/.git', 'w').write('gitdir: ../../Repo/.git/worktrees/feat\n')
    assert scan(home, 'only', '15', cwd=home + '/work/wt/feat/src')['repos'] == {W + '/wt/feat/src': W + '/Repo'}
    assert scan(home, 'only', '15', cwd=home + '/work/Repo')['repos'] == {}
    assert scan(home, 'only', '15', cwd=home + '/work')['repos'] == {}

    # A chat another chat's shell started: its process descends from that chat's, through what ran in the shell. Listed
    # while its process lives however quiet, its starter with it, at work as its record says; kept under the starter
    # once it ends, by the links the next scan is given, for a day; and found by the starter's own scan.
    if sys.platform != 'win32':
        tree = subprocess.Popen([sys.executable, '-c', 'import subprocess, sys, time; c = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"]); print(c.pid, flush=True); time.sleep(60)'],
                                stdout=subprocess.PIPE, text=True)
        kid = int(tree.stdout.readline())
        try:
            write(P + 'L0.jsonl', [user, reply], OLD)
            write(P + 'L1.jsonl', [user, reply], OLD)
            json.dump({'sessionId': 'L0', 'pid': tree.pid, 'hostSessionId': 'local_l0'}, open(home + '/.claude/sessions/5.json', 'w'))
            json.dump({'sessionId': 'L1', 'pid': kid, 'status': 'busy'}, open(home + '/.claude/sessions/6.json', 'w'))
            run = scan(home, 'all', '15')
            rows = {r['path'].split('/')[-1]: r for r in run['claude']}
            assert (rows['L1.jsonl']['by'], rows['L1.jsonl']['busy']) == ('L0', True), rows.get('L1.jsonl')
            assert rows['L0.jsonl']['by'] is None and not rows['L0.jsonl']['busy'], sorted(rows)
            assert list(run['spawned']) == ['L1'] and run['spawned']['L1'][0] == 'L0', run['spawned']
            # Its process lives, and the link tells when the process right under the starter began: the Bash call's shell.
            assert rows['L1.jsonl']['up'] and rows['L0.jsonl']['up'] and abs(rows['L1.jsonl']['shellAt'] - now) < 30, rows['L1.jsonl']
            assert run['spawned']['L1'][2] == rows['L1.jsonl']['shellAt']
            # A record left by a killed chat whose process id went to another process: it began at another time, so
            # it is no chat's; one that names its true start is.
            began = subprocess.run(['ps', '-p', str(kid), '-o', 'lstart='], capture_output=True, text=True, env=dict(os.environ, TZ='UTC', LC_ALL='C')).stdout.strip()
            json.dump({'sessionId': 'L1', 'pid': kid, 'status': 'busy', 'procStart': 'Mon Jan  1 00:00:00 2001'}, open(home + '/.claude/sessions/6.json', 'w'))
            assert scan(home, 'all', '15')['spawned'] == {}
            json.dump({'sessionId': 'L1', 'pid': kid, 'status': 'busy', 'procStart': began}, open(home + '/.claude/sessions/6.json', 'w'))
            assert list(scan(home, 'all', '15')['spawned']) == ['L1'], began
        finally:
            tree.kill()
            tree.wait()
            os.kill(kid, 9)
        for f in ('5', '6'):
            os.remove(home + '/.claude/sessions/' + f + '.json')
        write(P + 'L1.jsonl', [user, reply], FRESH)
        after = {r['path'].split('/')[-1]: r for r in scan(home, 'all', '15', stdin=json.dumps({'spawned': run['spawned']}))['claude']}
        assert (after['L1.jsonl']['by'], after['L1.jsonl']['busy'], after['L1.jsonl']['up']) == ('L0', False, False) and 'L0.jsonl' in after, after.get('L1.jsonl')
        assert after['L1.jsonl']['shellAt'] == run['spawned']['L1'][2]
        stale = {'L1': ['L0', now - 2 * 86400]}
        assert next(r for r in scan(home, 'all', '15', stdin=json.dumps({'spawned': stale}))['claude'] if r['path'].endswith('/L1.jsonl'))['by'] is None
        own = scan(home, 'codex:L0', '5', stdin=json.dumps({'spawned': run['spawned']}))['claude']
        assert [(r['path'].split('/')[-1], r['by'], r['up'], r['shellAt']) for r in own] == [('L1.jsonl', 'L0', False, run['spawned']['L1'][2])], own
    print('scan.py: ok')
