import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import { REMOTE_MARK } from '../hooks/charts'

test('pane draws a codex row with its columns on terminal and desktop', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra -c model_reasoning_effort=max "Review the diff please"', description: 'Diff review', run_in_background: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-radar', surface, component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
    expect(await ui.find({ type: 'Text', text: /TASK/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Diff review/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /gpt-6-astra/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /■■■■■/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a narrow pane draws two-line cards without the header', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review', run_in_background: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-radar', surface, component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 50 } as never })
    expect(await ui.find({ type: 'Text', text: /TASK/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Diff review/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /gpt-6-astra/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a narrow desktop pane nests a codex run under its subagent with a rail', async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'A1' }) as never)
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  await $.agent.spawn({ prompt: 'audit', description: 'Geometry audit', subagentType: 'general-purpose' } as never)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review', run_in_background: true, agentId: 'A1' } as never)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-radar', surface, component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 50 } as never })
    expect(await ui.find({ type: 'Text', text: /Geometry audit/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Diff review/ })).toBeDefined()
    await ui.unmount()
  }
})

test('details open under the pressed row with token chart on both surfaces', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review', run_in_background: true })
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-radar', surface, component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
    const title = await ui.find({ type: 'Button', text: /Diff review/ } as never)
    await ui.press({ key: (title as { key: string }).key })
    expect(await ui.find({ type: 'Text', text: /^Tokens/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /running/ })).toBeDefined()
    await ui.press({ key: (title as { key: string }).key })
    await ui.unmount()
  }
})

test('a background codex run can be stopped after a confirming second press', async ($, on) => {
  const calls: string[] = []
  on('tool.call', ($, e) => {
    calls.push(e.tool === 'TaskStop' ? 'stop:' + String((e as { task_id?: string }).task_id) : e.tool)
    return { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg7f3k2' } } as never
  })
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review', run_in_background: true })
  const ui = await $.ui.mount({ plugin: 'agent-radar', surface: 'desktop', component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
  const title = (await ui.find({ type: 'Button', text: /Diff review/ } as never)) as { key: string }
  await ui.press({ key: title.key })
  const stop = (await ui.find({ type: 'Button', text: /Stop/ } as never)) as { key: string }
  await ui.press({ key: stop.key })
  const yes = (await ui.find({ type: 'Button', text: /Sure/ } as never)) as { key: string }
  await ui.press({ key: yes.key })
  expect(calls).toContain('stop:bg7f3k2')
  expect(await ui.find({ type: 'Text', text: /CTX/ })).toBeDefined()
  await ui.unmount()
})

test('pinning marks the row with a star and offers to unpin', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bg1' } }) as never)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review', run_in_background: true })
  const ui = await $.ui.mount({ plugin: 'agent-radar', surface: 'desktop', component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
  const title = (await ui.find({ type: 'Button', text: /Diff review/ } as never)) as { key: string }
  await ui.press({ key: title.key })
  const pin = (await ui.find({ type: 'Button', text: /Pin/ } as never)) as { key: string }
  await ui.press({ key: pin.key })
  expect(await ui.find({ type: 'Text', text: /★/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /Unpin/ } as never)).toBeDefined()
  await ui.unmount()
})

test('the language option switches the pane to Russian', { options: { language: 'ru' } }, async ($, on) => {
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review', run_in_background: true })
  const ui = await $.ui.mount({ plugin: 'agent-radar', surface: 'desktop', component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
  expect(await ui.find({ type: 'Text', text: /ЗАДАЧА/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /TASK/ })).toBeUndefined()
  await ui.unmount()
})

test('hiding a root hides its whole tree, and a root folds and unfolds', async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'A1' }) as never)
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  await $.agent.spawn({ prompt: 'audit', description: 'Geometry audit', subagentType: 'general-purpose' } as never)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review', run_in_background: true, agentId: 'A1' } as never)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-radar', surface, component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
    // The run is listed among the background commands too: that section folded, the agent rows alone are read.
    if (surface === 'desktop') await ui.press({ key: 'sh-fold' })
    // The fold toggle, by its key ('v' and the root's id): its glyph differs between surfaces and states.
    const foldKey = ((await ui.findAll({ type: 'Button' } as never)) as { key?: string }[]).find(b => /^v[A-Z]/.test(b.key ?? ''))!.key!
    await ui.press({ key: foldKey })
    expect(await ui.find({ type: 'Text', text: /Diff review/ })).toBeUndefined()
    await ui.press({ key: foldKey })
    expect(await ui.find({ type: 'Text', text: /Diff review/ })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'agent-radar', surface: 'desktop', component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
  const title = (await ui.find({ type: 'Button', text: /Geometry audit/ } as never)) as { key: string }
  await ui.press({ key: title.key })
  const hide = (await ui.find({ type: 'Button', text: /Hide/ } as never)) as { key: string }
  await ui.press({ key: hide.key })
  expect(await ui.find({ type: 'Text', text: /Geometry audit/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Diff review/ })).toBeUndefined()
  await ui.unmount()
})

test('the Claude counter switches Claude agents off and a second press brings them back', async ($, on) => {
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'A1' }) as never)
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  await $.agent.spawn({ prompt: 'audit', description: 'Geometry audit', subagentType: 'general-purpose' } as never)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review', run_in_background: true })
  const ui = await $.ui.mount({ plugin: 'agent-radar', surface: 'desktop', component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
  const claude = (await ui.find({ type: 'Button', key: 'cb-claude' } as never)) as { key: string }
  await ui.press({ key: claude.key })
  expect(await ui.find({ type: 'Text', text: /Geometry audit/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Diff review/ })).toBeDefined()
  await ui.press({ key: claude.key })
  expect(await ui.find({ type: 'Text', text: /Geometry audit/ })).toBeDefined()
  await ui.unmount()
})

test('the All scope reuses a fresh scan another chat left in the store', async ($, on) => {
  let runs = 0
  on('process.run', () => { runs++; return { value: { exitCode: 1, stdout: '', stderr: '' } } as never })
  const now = Date.now()
  mock.store(on, { allScan: { at: now, mins: 15, s: { codex: [], claude: [
    { path: '/p/s9.jsonl', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: new Date(now - 60e3).toISOString(), title: 'Shared scan row' },
  ] } } })
  const ui = await $.ui.mount({ plugin: 'agent-radar', surface: 'desktop', component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
  await ui.press({ key: 's-all' })
  expect(await ui.find({ type: 'Text', text: /Shared scan row/ })).toBeDefined()
  expect(runs).toBe(0)
  await ui.unmount()
})

test("this chat's own session title stands out on a tint", async ($, on) => {
  // The session's own row is written at session start, which a test does not fire: add it to the next write.
  const main = { id: 'main', project: 'Proj', title: 'Main session', model: 'opus-5-5', family: 'claude', tokIn: 1, tokOut: 1, t0: Date.now() - 60e3, status: 'running', how: 'Claude Code CLI', sid: 'S1' }
  on('state.set', { plugin: 'agent-radar', key: 'agents' } as never, (($: unknown, e: { value: unknown[] }, next: (e: unknown) => unknown) =>
    next({ ...e, value: [main, ...e.value.filter(a => (a as { id: string }).id !== 'main')] })) as never)
  // A fresh All scan holding this session's journal and another chat's.
  mock.store(on, { allScan: { at: Date.now(), mins: 15, s: { codex: [], claude: [
    { path: '/p/S1.jsonl', mtime: Date.now(), tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: new Date().toISOString(), title: 'Own journal row' },
    { path: '/p/S2.jsonl', mtime: Date.now(), tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: new Date().toISOString(), title: 'Other chat row' },
  ] } } })
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review', run_in_background: true })
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-radar', surface, component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
    const tint = async (text: RegExp) => ((await ui.findAll({ type: 'Box', text } as never)) as { props: { backgroundColor?: string } }[]).map(x => x.props.backgroundColor).includes('#5aa9e640')
    expect(await tint(/^Main session$/)).toBe(true)
    expect(await tint(/^Diff review$/)).toBe(false)
    await ui.unmount()
  }
  // Among all sessions, the row read from this session's own journal.
  const ui = await $.ui.mount({ plugin: 'agent-radar', surface: 'desktop', component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
  await ui.press({ key: 's-all' })
  const tint = async (text: RegExp) => ((await ui.findAll({ type: 'Box', text } as never)) as { props: { backgroundColor?: string } }[]).map(x => x.props.backgroundColor).includes('#5aa9e640')
  expect(await tint(/^Own journal row$/)).toBe(true)
  expect(await tint(/^Other chat row$/)).toBe(false)
  await ui.unmount()
})

test('a long list draws its newest rows and says how many older ones it left out', async ($, on) => {
  const now = Date.now()
  const old = Array.from({ length: 60 }, (_, i) => ({ id: 'cx:old' + i, parentId: 'main', project: 'Proj', title: 'Old run ' + i, model: 'gpt-6', family: 'codex', tokIn: 1, tokOut: 1, t0: now - 1e6, t1: now - i * 1e3, status: 'completed', how: 'codex exec' }))
  on('state.set', { plugin: 'agent-radar', key: 'agents' } as never, (($: unknown, e: { value: unknown[] }, next: (e: unknown) => unknown) =>
    next({ ...e, value: [...old, ...e.value.filter(a => !(a as { id: string }).id.startsWith('cx:old'))] })) as never)
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  // Any write of the list lays the sixty old runs in.
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review' })
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-radar', surface, component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
    // Finished rows on: the switch is pressed once and stays for the second surface.
    if (surface === 'desktop') await ui.press({ key: 'f-done' })
    expect(await ui.find({ text: /Old run 0\b/ } as never)).toBeDefined()
    expect(await ui.find({ text: /Old run 59\b/ } as never)).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^21 more finished/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a subagent quiet past the activity window waits for Finished, as among all sessions', async ($, on) => {
  const now = Date.now()
  const rows = [
    { id: 'A1', parentId: 'main', project: 'Proj', title: 'Quiet since yesterday', model: 'sonnet-5-5', family: 'claude', tokIn: 1, tokOut: 1, t0: now - 13 * 3600e3, status: 'waiting', how: 'Agent', stats: { lastAt: now - 13 * 3600e3 } },
    { id: 'A2', parentId: 'main', project: 'Proj', title: 'Busy a minute ago', model: 'sonnet-5-5', family: 'claude', tokIn: 1, tokOut: 1, t0: now - 3600e3, status: 'waiting', how: 'Agent', stats: { lastAt: now - 60e3 } },
  ]
  on('state.set', { plugin: 'agent-radar', key: 'agents' } as never, (($: unknown, e: { value: unknown[] }, next: (e: unknown) => unknown) =>
    next({ ...e, value: [...rows, ...e.value.filter(a => !['A1', 'A2'].includes((a as { id: string }).id))] })) as never)
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }) as never)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-astra "Review the diff please"', description: 'Diff review' })
  const ui = await $.ui.mount({ plugin: 'agent-radar', surface: 'desktop', component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
  expect(await ui.find({ text: /Busy a minute ago/ } as never)).toBeDefined()
  expect(await ui.find({ text: /Quiet since yesterday/ } as never)).toBeUndefined()
  expect(await ui.find({ text: /This session/ } as never)).toBeDefined()
  await ui.press({ key: 'f-done' })
  expect(await ui.find({ text: /Quiet since yesterday/ } as never)).toBeDefined()
  await ui.unmount()
})

test('background commands list the running ones by default, agent launches under their mark, each opening its details', async ($, on) => {
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'bgB1' } }) as never)
  await $.tool.call({ tool: 'Bash', command: 'npm run build -- --watch', description: 'Watch the build', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'claude -p "summarize the log"', description: 'Headless summary', run_in_background: true })
  await $.tool.call({ tool: 'Bash', command: 'ls -la', description: 'List files' })
  await $.tool.call({ tool: 'Monitor', command: 'tail -f server.log | grep ERROR', description: 'Errors in the server log', timeout_ms: 60000 } as never)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-radar', surface, component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
    expect(await ui.find({ text: /Active 3/ } as never)).toBeDefined()
    expect(await ui.find({ text: /Watch the build/ } as never)).toBeDefined()
    expect(await ui.find({ text: /Headless summary/ } as never)).toBeDefined()
    expect(await ui.find({ text: /Errors in the server log/ } as never)).toBeDefined()
    expect(await ui.find({ text: /List files/ } as never)).toBeUndefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg', alt: 'claude' } as never)).toBeDefined()
    const row = await ui.find({ type: 'Button', text: /Watch the build/ } as never)
    await ui.press({ key: (row as { key: string }).key })
    expect(await ui.find({ text: /npm run build -- --watch/ } as never)).toBeDefined()
    expect(await ui.find({ type: 'Button', text: /Stop/ } as never)).toBeDefined()
    await ui.press({ key: (row as { key: string }).key })
    await ui.unmount()
  }
  // Stopped after the confirming press: it leaves the running ones at once, with no notice of its end to wait for.
  const ui = await $.ui.mount({ plugin: 'agent-radar', surface: 'desktop', component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
  const press = async (text: RegExp) => ui.press({ key: ((await ui.find({ type: 'Button', text } as never)) as { key: string }).key })
  await press(/Watch the build/)
  await press(/Stop/)
  await press(/Sure\?/)
  expect(await ui.find({ text: /Active 2/ } as never)).toBeDefined()
  expect(await ui.find({ text: /Watch the build/ } as never)).toBeUndefined()
  await ui.unmount()
})

test('a chat Remote Control holds open stays listed under its own mark, past the row budget too', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
  const now = Date.now()
  const quiet = { tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: new Date(now - 864e5).toISOString(), mtime: now - 3600e3 }
  mock.store(on, { allScan: { at: now, mins: 15, s: { codex: [], claude: [
    { ...quiet, path: '/p/R.jsonl', title: 'Held chat', entry: 'remote-control', live: true },
    { ...quiet, path: '/p/E.jsonl', title: 'Ended chat', entry: 'remote-control' },
    ...Array.from({ length: 50 }, (_, i) => ({ path: `/p/n${i}.jsonl`, mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: new Date(now - 60e3).toISOString(), title: 'Newer ' + i })),
  ] } } })
  for (const [surface, bodyColumns] of [['desktop', 110], ['desktop', 50], ['terminal', 110]] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-radar', surface, component: 'Pane', requestId: 'agent-radar', props: { bodyColumns } as never })
    await ui.press({ key: 's-all' })
    expect(await ui.find({ text: /Held chat/ } as never)).toBeDefined()
    expect(await ui.find({ text: /Ended chat/ } as never)).toBeUndefined()
    // find() ignores alt, so the drawings are picked out by hand.
    const marks = (await ui.findAll({ type: 'Svg' } as never)) as unknown as { props: { alt?: string; source: string } }[]
    if (surface === 'desktop') expect(marks.filter(m => m.props.alt === 'Remote Control' && m.props.source.includes(REMOTE_MARK)).length).toBe(1)
    expect(await ui.find({ type: 'Text', text: /Remote Control/ })).toBeDefined()
    await ui.unmount()
  }
})

test('among all sessions a quiet session still heads its running subagent, so the subagent is never a root', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }) as never)
  const now = Date.now()
  mock.store(on, { allScan: { at: now, mins: 15, s: { codex: [], claude: [
    { path: '/p/Q.jsonl', mtime: now - 40 * 60e3, tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: new Date(now - 3600e3).toISOString(), title: 'Quiet lead' },
    { path: '/p/Q/subagents/agent-b1.jsonl', mtime: now, tokIn: 1, tokOut: 1, cwd: '/x/Proj', t0: new Date(now - 60e3).toISOString(), meta: { description: 'Busy helper' } },
  ] } } })
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-radar', surface, component: 'Pane', requestId: 'agent-radar', props: { bodyColumns: 110 } as never })
    await ui.press({ key: 's-all' })
    expect(await ui.find({ text: /Quiet lead/ } as never)).toBeDefined()
    expect(await ui.find({ text: /Busy helper/ } as never)).toBeDefined()
    // The terminal draws the nesting as a guide before the child's title.
    if (surface === 'terminal') expect(await ui.find({ type: 'Text', text: /└─ / })).toBeDefined()
    // The project header carries its folder mark in the project's color.
    expect(await ui.find(surface === 'desktop' ? { type: 'Svg', alt: 'proj' } as never : { type: 'Text', text: /^■$/ })).toBeDefined()
    await ui.unmount()
  }
})

// A session under a test clock: the folders in `disk` (path → size and time, a folder's files by their full path),
// the pane as `pane` says, and every Python start in `runs`. The scanner's answer is what `scan` holds.
const DAY = '/h/.codex/sessions/2026/11/01'
const SID = 'S1'
function session(on: On) {
  const world = {
    disk: {} as Record<string, [number, number]>,
    pane: { id: 'agent-radar', title: 'Agent Radar', isShown: true, isFocused: false, isPlaced: true },
    runs: [] as string[][],
    lists: 0,
    statuses: 0,
    scan: { codex: [], claude: [], dirs: [DAY] } as Record<string, unknown>,
  }
  const entry = (p: string) => ({ name: p.split('/').pop()!, kind: 'file', size: world.disk[p]![0], mtimeMs: world.disk[p]![1], isLink: false })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: '/x/Proj' }))
  on('session.id', () => ({ value: SID }))
  on('session.usage', () => ({ value: { context: { tokens: 10, window: 100 } } }) as never)
  on('command.register', () => ({ value: { command: 'agent-radar' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [world.pane] }))
  on('ui.status', () => { world.statuses++; return { value: undefined } as never })
  on('agent.list', () => ({ value: [] }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/h' : undefined }) as never)
  on('fs.read', () => ({ value: '{"version":"1"}' }) as never)
  on('fs.list', (_, e) => {
    const dir = (e as { path: string }).path
    world.lists++
    if (dir !== DAY) throw new Error('ENOENT')
    return { value: Object.keys(world.disk).filter(p => p.startsWith(dir + '/')).map(entry) } as never
  })
  on('fs.stat', (_, e) => {
    const p = (e as { path: string }).path
    if (!world.disk[p]) throw new Error('ENOENT')
    return { value: entry(p) } as never
  })
  on('process.run', (_, e) => {
    const argv = (e as { argv: string[] }).argv
    if (argv[0] === 'uname') return { value: { exitCode: 0, stdout: 'Darwin', stderr: '' } } as never
    world.runs.push(argv.slice(4))
    return { value: { exitCode: 0, stdout: JSON.stringify(argv[4] === 'ended' ? { done: {}, at: {}, bg: [] } : world.scan), stderr: '' } } as never
  })
  return world
}
const START = { cwd: '/x/Proj', surface: 'desktop', isInteractive: true } as never

test('a quiet session starts Python once a minute, and a changed file within one beat', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)
  const w = session(on)
  await $.session.start(START)
  // Load: the scan and one look back through the journal.
  await clock.advance(6000)
  const scans = () => w.runs.filter(r => r[0] !== 'ended').length
  expect(scans()).toBe(1)
  expect(w.runs).toHaveLength(2)
  await clock.advance(30000)
  expect(scans()).toBe(1)
  // A new rollout is seen at the next beat.
  w.disk[DAY + '/rollout-a.jsonl'] = [10, Date.now()]
  await clock.advance(3000)
  expect(scans()).toBe(2)
  await clock.advance(21000)
  expect(scans()).toBe(2)
  // The minute since the last scan: what no file tells, a new day or a rollout leaving the window.
  await clock.advance(39000)
  expect(scans()).toBe(3)
})

test("another project's rollout is no reason to start Python; this project's is", async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)
  const w = session(on)
  const rec = (name: string, cwd: string) => ({ path: `${DAY}/${name}`, id: name, cwd, mtime: Date.now(), tokIn: 1, tokOut: 1, model: 'gpt-6' })
  w.scan.codex = [rec('other.jsonl', '/x/Other'), rec('here.jsonl', '/x/Proj/sub')]
  w.disk[`${DAY}/other.jsonl`] = [1, Date.now()]
  w.disk[`${DAY}/here.jsonl`] = [1, Date.now()]
  await $.session.start(START)
  await clock.advance(9000)
  const before = w.runs.length
  w.disk[`${DAY}/other.jsonl`] = [2, Date.now()]
  await clock.advance(3000)
  expect(w.runs.length).toBe(before)
  w.disk[`${DAY}/here.jsonl`] = [2, Date.now()]
  await clock.advance(3000)
  expect(w.runs.length).toBe(before + 1)
})

test('an unfinished rollout outside the day folders is read as it grows', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)
  const w = session(on)
  const old = '/h/.codex/sessions/2026/10/20/rollout-old.jsonl'
  w.disk[old] = [1, Date.now() - 3600e3]
  on('tool.call', () => ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }) as never)
  await $.session.start(START)
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6 "Review the diff please"', description: 'Diff review', run_in_background: true })
  w.scan.codex = [{ path: old, id: 'T1', cwd: '/x/Proj', mtime: Date.now(), tokIn: 1, tokOut: 1, model: 'gpt-6', originator: 'codex_exec', t0: new Date().toISOString() }]
  await clock.advance(9000)
  const before = w.runs.length
  await clock.advance(9000)
  expect(w.runs.length).toBe(before)
  w.disk[old] = [2, Date.now()]
  await clock.advance(3000)
  expect(w.runs.length).toBe(before + 1)
  // The extra rollout went in to the scan that read it.
  expect(w.runs.at(-1)!.includes(old)).toBe(true)
})

test('a pane no surface draws reads nothing, and one behind a tab looks every fifth beat while nothing goes on', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)
  const w = session(on)
  w.pane = { ...w.pane, isPlaced: false, isShown: false }
  await $.session.start(START)
  await clock.advance(120000)
  expect(w.runs).toHaveLength(0)
  expect(w.lists).toBe(0)
  // Placed behind another pane: the disk is looked at every fifth beat.
  w.pane = { ...w.pane, isPlaced: true }
  await clock.advance(30000)
  expect(w.lists).toBeLessThanOrEqual(2)
  // Back on show: every beat.
  w.pane = { ...w.pane, isShown: true }
  const before = w.lists
  await clock.advance(15000)
  expect(w.lists - before).toBeGreaterThanOrEqual(5)
})

test('with nothing changed nothing is written, the status is not sent again, and a shown pane still moves its clocks', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  mock.store(on)
  const w = session(on)
  const writes: Record<string, number> = {}
  on('state.set', (($: unknown, e: { key: string }, next: (e: unknown) => unknown) => { writes[e.key] = (writes[e.key] ?? 0) + 1; return next(e) }) as never)
  await $.session.start(START)
  await clock.advance(12000)
  const agentsBefore = writes.agents ?? 0, tickBefore = writes.tick ?? 0, statusBefore = w.statuses
  await clock.advance(30000)
  expect(writes.agents ?? 0).toBe(agentsBefore)
  expect(w.statuses).toBe(statusBefore)
  // An idle list's minutes: every fifth beat, the one write there is.
  expect((writes.tick ?? 0) - tickBefore).toBe(2)
})

test('closing the pane in another chat arrives within twelve seconds, and the store is asked no oftener', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const w = session(on)
  let open: unknown = true, gets = 0, closes = 0
  on('store.get', () => { gets++; return { value: open } })
  on('store.set', () => ({ value: undefined }) as never)
  on('ui.close', () => { closes++; return { value: undefined } as never })
  await $.session.start(START)
  await clock.advance(36000)
  gets = 0
  await clock.advance(36000)
  expect(gets).toBe(3)
  open = false
  await clock.advance(12000)
  expect(closes).toBe(1)
})
