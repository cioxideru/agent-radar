import { expect, test } from 'claude-code/testing'
import { meter, sparkline, stackBar } from '../hooks/charts'

import { asq, ctxColor, fmtT, fromScan, handoffUrl, ordered, parseCodex, projectOf, shq } from '../hooks/register'

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
