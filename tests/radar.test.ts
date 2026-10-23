import { expect, test } from 'claude-code/testing'
import { chip, CLAUDE_MARK, CODEX_MARK, meter, sparkline, stackBar } from '../hooks/charts'

import type { Agent, Shell } from '../types'
import { asq, ctxColor, fmtT, fromScan, handoffUrl, mechanism, mergeProject, modelLabel, ordered, parseCodex, pastShells, projectOf, ranNothing, shq, taskEnded, trimShells } from '../hooks/register'

test('parses a codex exec command line', () => {
  const p = parseCodex(`codex exec -m gpt-6-astra -c model_reasoning_effort=max -s read-only "Review the PaymentService diff"`)
  expect(p.model).toBe('gpt-6-astra')
  expect(p.effort).toBe('max')
  expect(p.prompt).toBe('Review the PaymentService diff')
  expect(parseCodex('codex exec -p agent-sol-high "write tests please"').effort).toBe('high')
})

test('maps worktrees to their project', () => {
  expect(projectOf('/a/orbit-shop/.claude/worktrees/x/y')).toBe('orbit-shop')
  expect(projectOf('/a/orbit-shop')).toBe('orbit-shop')
  expect(projectOf('C:\\dev\\orbit-shop\\.codex\\worktrees\\x')).toBe('orbit-shop')
  expect(modelLabel('codex-auto-review')).toBe('auto-review')
  expect(modelLabel('opus-5-5')).toBe('opus-5-5')
  expect(mechanism('codex exec · bg')).toBe('exec · bg')
  expect(mechanism('Claude Code CLI')).toBe('CLI')
  expect(mechanism('Agent · Explore')).toBe('Agent · Explore')
})

test('builds a tree from a disk scan: subagent under its session, codex done', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const rows = fromScan({
    claude: [
      { path: '/p/s1.jsonl', mtime: now - 5e3, tokIn: 100, tokOut: 10, cwd: '/x/Proj', t0: '2026-10-16T11:00:00Z', model: 'claude-opus-5-5', entry: 'cli' },
      { path: '/p/s1/subagents/agent-a.jsonl', mtime: now - 5e3, tokIn: 5, tokOut: 1, cwd: '/x/Proj', meta: { description: 'Audit', agentType: 'Explore', requestShape: 'background' } },
    ],
    codex: [{ path: '/c/r.jsonl', mtime: now - 600e3, tokIn: 7, tokOut: 3, cwd: '/x/Proj', originator: 'codex_exec', started: 1, done: 1, model: 'gpt-6-astra', effort: 'xhigh' }],
  }, now)
  const tree = ordered(rows)
  const sub = rows.find(r => r.title === 'Audit')!
  expect(sub.parentId).toBe('/p/s1.jsonl')
  expect(sub.how).toBe('Agent · bg · Explore')
  expect(rows.find(r => r.family === 'codex')!.status).toBe('completed')
  expect(rows.find(r => r.title === 'Proj')!.how).toBe('Claude Code CLI')
  expect(tree.findIndex(r => r.a.title === 'Audit')).toBe(tree.findIndex(r => r.a.title === 'Proj') + 1)
})

test('draws tree guides and nests a codex run under the session that launched it', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const rows = fromScan({
    claude: [{ path: '/p/s.jsonl', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: '2026-10-16T11:00:00Z' }],
    codex: [
      { path: '/c/a.jsonl', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj/.claude/worktrees/w', t0: '2026-10-16T11:10:00Z', originator: 'codex_exec', launch: { path: '/p/s.jsonl', cmd: 'codex exec x', title: 'Review A', bg: true } },
      { path: '/c/b.jsonl', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: '2026-10-16T11:20:00Z', originator: 'codex_exec', launch: { path: '/p/s.jsonl', cmd: 'codex exec y', title: 'Review B', bg: false } },
    ],
  }, now)
  expect(ordered(rows).map(r => r.guide + r.a.title)).toEqual(['Proj', '├─ Review A', '└─ Review B'])
  expect(rows.find(r => r.title === 'Review A')!.how).toBe('codex exec · bg')
})

test('nests a codex subagent under its parent thread and shortens times', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const rows = fromScan({ claude: [], codex: [
    { path: '/c/p.jsonl', id: 'T1', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: '2026-10-16T11:00:00Z', originator: 'Codex Desktop', title: 'Main thread' },
    { path: '/c/k.jsonl', id: 'T2', parent: 'T1', kind: 'guardian_review', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Other', t0: '2026-10-16T11:05:00Z', originator: 'Codex Desktop' },
  ] }, now)
  expect(ordered(rows).map(r => r.guide + r.a.title)).toEqual(['Main thread', '└─ Auto-review'])
  expect(rows[1]!.project).toBe('Proj')
  expect([fmtT(42e3), fmtT(26 * 60e3), fmtT(21.5 * 3600e3), fmtT(25 * 3600e3)]).toEqual(['42s', '26m', '21h30m', '1d1h'])
})

test('charts draw sized SVG documents', () => {

  expect(stackBar([{ v: 3, color: '#111' }, { v: 0, color: '#222' }, { v: 1, color: '#333' }])).toContain('fill="#333"')
  expect(stackBar([{ v: 0, color: '#222' }])).not.toContain('#222')
  expect(meter(0.5, '#0f0')).toContain('width="180.0"')
  expect(sparkline([0, 5, 2], '#0f0')).toContain('<circle')
  expect(chip([{ n: 2, color: '#f00' }, { n: 1, color: '#999' }], false).source.match(/<rect/g)).toHaveLength(4)
  expect(chip([{ n: 12, color: '#f00' }, { n: 0, color: '#999' }], true).source).toContain('>12</text>')
  expect(chip([{ n: 0, color: '#f00' }, { n: 7, color: '#999' }], true).source).toContain('#f00">0</text>')
  expect(chip([{ n: 1, color: '#f00' }], false, CODEX_MARK).source).toContain('viewBox="0 0 16 16"')
  expect(chip([{ n: 1, color: '#f00' }], false, CLAUDE_MARK).source).toContain('#D97757')
})

test('context colors follow the fill thresholds and handoff links carry folder and journal', () => {
  expect([0.3, 0.6, 0.8, 0.95].map(ctxColor)).toEqual(['#3fcf7f', '#5aa9e6', '#e8b23a', '#f06a5f'])
  const url = new URL(handoffUrl('/x/My Proj', 'Task', '/j/s.jsonl'))
  expect(url.protocol + url.host + url.pathname).toBe('claude:code/new')
  expect(url.searchParams.get('folder')).toBe('/x/My Proj')
  expect(url.searchParams.get('q')).toContain('/j/s.jsonl')
  expect(shq("it's")).toBe(`'it'\\''s'`)
  expect(asq('a "b" \\c')).toBe('a \\"b\\" \\\\c')
})

test('codex shells that never ran a turn are left out of all sessions', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const rows = fromScan({ claude: [], codex: [
    { path: '/c/shell.jsonl', id: 'T9', mtime: now, tokIn: 0, tokOut: 0, cwd: '/x/Proj', originator: 'Codex Desktop', kind: 'guardian_review', parent: 'T1' },
    { path: '/c/real.jsonl', id: 'T1', mtime: now, tokIn: 5, tokOut: 1, cwd: '/x/Proj', originator: 'Codex Desktop', model: 'gpt-6' },
  ] }, now)
  expect(rows.map(r => r.id)).toEqual(['/c/real.jsonl'])
  expect(ranNothing({ model: '?', tokIn: 0, tokOut: 0 })).toBe(true)
  expect(ranNothing({ model: 'gpt-6', tokIn: 0, tokOut: 0 })).toBe(false)
})

test('a Desktop session started from another sits under it, and a task notification names the call that ended', () => {
  const now = Date.now()
  const rows = fromScan({ codex: [], claude: [
    { path: '/p/Proj/aaa.jsonl', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj', title: 'Lead', desktop: { id: 'local_a', kind: 'code', cwd: '/x/Proj' } },
    { path: '/p/Proj/bbb.jsonl', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Other', title: 'Side', desktop: { id: 'local_b', kind: 'code', parent: 'aaa' } },
  ] }, now)
  expect(ordered(rows).map(r => r.guide + r.a.title)).toEqual(['Lead', '└─ Side'])
  expect(taskEnded('<task-id>b1</task-id>\n<tool-use-id>toolu_01X</tool-use-id>\n<status>killed</status>')).toEqual({ toolUseId: 'toolu_01X', status: 'killed' })
  expect(taskEnded('<tool-use-id>toolu_01X</tool-use-id><status>done</status>')!.status).toBe('completed')
  expect(taskEnded('no notification here')).toBeUndefined()
})

test('a load picks up the background commands the journal ran, agent launches by family, ended where told', () => {
  const past = {
    done: { tu1: 'completed' }, at: { tu1: '2026-01-02T10:05:00Z' },
    bg: [
      { id: 'tu1', cmd: 'npm run build', title: 'Build', ts: '2026-01-02T10:00:00Z' },
      { id: 'tu2', cmd: 'codex exec "review"', ts: '2026-01-02T10:01:00Z' },
      { id: 'tu3', cmd: 'claude -p "sum up"', ts: '2026-01-02T10:02:00Z' },
      { id: 'tu4', cmd: 'tail -f server.log', ts: '2026-01-02T10:03:00Z' },
      { id: 'tu5', cmd: 'until [ -f done ]; do sleep 5; done', ts: '2026-01-02T10:04:00Z', timeout: 60000 },
    ],
  }
  const l = pastShells([{ id: 'tu4', cmd: 'tail -f server.log', t0: 1, status: 'running', taskId: 'b4' }], past)
  expect(l.map(s => [s.id, s.status, s.kind])).toEqual([
    ['tu4', 'running', undefined], ['tu1', 'completed', undefined], ['tu2', 'running', 'codex'], ['tu3', 'running', 'claude'], ['tu5', 'running', 'monitor'],
  ])
  expect(l[1]!.t1).toBe(Date.parse('2026-01-02T10:05:00Z'))
  expect(l[4]!.until).toBe(Date.parse('2026-01-02T10:04:00Z') + 60000)
})

test('a nested subagent sits under the agent that spawned it, and a trailing slash is no project name', () => {
  const now = Date.now()
  const rows = fromScan({ codex: [], claude: [
    { path: '/p/s.jsonl', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj/', title: 'Lead' },
    { path: '/p/s/subagents/agent-a1.jsonl', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj', meta: { description: 'Outer' } },
    { path: '/p/s/subagents/agent-a2.jsonl', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj', meta: { description: 'Inner', parentAgentId: 'a1' } },
  ] }, now)
  expect(ordered(rows).map(r => r.guide + r.a.title)).toEqual(['Lead', '└─ Outer', '   └─ Inner'])
  expect(rows[0]!.project).toBe('Proj')
  expect(projectOf('/a/orbit-shop/')).toBe('orbit-shop')
})

test("this session's poll: a child thread under the run launched here, a child session's run under it, a stranger only while it runs", () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const at = (ms: number) => new Date(now - ms).toISOString()
  const cx: Agent = { id: 'cx:tu1', parentId: 'main', project: 'Proj', title: 'Review', model: 'codex', family: 'codex', tokIn: 0, tokOut: 0, t0: now - 60e3, status: 'running', how: 'codex exec · bg' }
  // A child thread listed on an earlier poll, before the run here had paired with its rollout.
  const early: Agent = { id: '/c/child.jsonl', parentId: '/c/run.jsonl', project: 'Proj', title: 'Auto-review', model: 'gpt-6', family: 'codex', tokIn: 1, tokOut: 1, t0: now - 40e3, status: 'running', how: 'Codex · review', rollout: '/c/child.jsonl' }
  const kid: Agent = { id: '/p/kid.jsonl', parentId: 'main', project: 'Other', title: 'Side', model: 'opus', family: 'claude', tokIn: 1, tokOut: 1, t0: now - 300e3, status: 'running', how: 'Claude Desktop', journal: '/p/kid.jsonl' }
  const s = { claude: [], codex: [
    { path: '/c/run.jsonl', id: 'T1', mtime: now, tokIn: 5, tokOut: 2, cwd: '/x/Proj', t0: at(50e3), originator: 'codex_exec', model: 'gpt-6' },
    { path: '/c/child.jsonl', id: 'T2', parent: 'T1', kind: 'guardian_review', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: at(40e3), originator: 'codex_exec', model: 'gpt-6' },
    { path: '/c/kidrun.jsonl', id: 'T3', mtime: now - 600e3, tokIn: 1, tokOut: 1, cwd: '/x/Other', t0: at(700e3), originator: 'codex_exec', model: 'gpt-6', started: 1, done: 1, launch: { path: '/p/kid.jsonl', cmd: 'codex exec z', title: 'Kid review', bg: false } },
    { path: '/c/stranger.jsonl', id: 'T4', mtime: now - 600e3, tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: at(700e3), originator: 'Codex Desktop', model: 'gpt-6', started: 1, done: 1 },
    { path: '/c/idle.jsonl', id: 'T5', mtime: now - 120e3, tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: at(700e3), originator: 'Codex Desktop', model: 'gpt-6' },
  ] }
  const out = mergeProject([cx, early], s, [kid], new Map(), {}, now)
  const by = (id: string) => out.find(a => a.id === id)!
  expect(by('cx:tu1').rollout).toBe('/c/run.jsonl')
  expect(by('/c/child.jsonl').parentId).toBe('cx:tu1')
  expect([by('/c/kidrun.jsonl').parentId, by('/c/kidrun.jsonl').title, by('/c/kidrun.jsonl').status, by('/c/kidrun.jsonl').project]).toEqual(['/p/kid.jsonl', 'Kid review', 'completed', 'Other'])
  expect(out.find(a => a.id === '/c/stranger.jsonl')).toBeUndefined()
  expect([by('/c/idle.jsonl').status, by('/c/idle.jsonl').t1]).toEqual(['idle', now - 120e3])
  expect(out[out.length - 1]!.id).toBe('/p/kid.jsonl')
  // The same scan again adds nothing twice.
  expect(mergeProject(out, s, [kid], new Map(), {}, now).map(a => a.id)).toEqual(out.map(a => a.id))
})

test('past the budget the oldest ended commands go first; running ones stay', () => {
  const l = Array.from({ length: 23 }, (_, i): Shell => ({ id: 's' + i, cmd: 'c', t0: i, status: i % 2 ? 'completed' : 'running' }))
  const out = trimShells(l)
  expect(out).toHaveLength(20)
  expect(out.filter(s => s.status === 'running')).toHaveLength(12)
  expect(out.map(s => s.id).slice(0, 3)).toEqual(['s0', 's2', 's4'])
})
