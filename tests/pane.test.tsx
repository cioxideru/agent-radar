import { expect, test } from 'claude-code/testing'

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
