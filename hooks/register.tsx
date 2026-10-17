import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Agent, Stats, View } from '../types'
import { chip, CLAUDE_MARK, CODEX_MARK, meter, sparkline, stackBar } from './charts'
import { STRINGS, type Lang, type Strings } from './i18n'
import { SCAN_PY } from './scan'

type $ = EngineInterface
type Scan = { codex: Rec[]; claude: Rec[] }
type Rec = {
  path: string; mtime: number; tokIn: number; tokOut: number; cwd?: string; t0?: string
  model?: string; effort?: string; title?: string
  originator?: string; started?: number; done?: number
  entry?: string; meta?: { description?: string; agentType?: string; requestShape?: string }
  launch?: { path: string; cmd: string; title?: string; bg: boolean }
  id?: string; parent?: string; kind?: string
  desktop?: { id: string; kind: 'code' | 'work' } | null
  requests?: number; turns?: number; cacheRead?: number; cacheWrite?: number; reasoning?: number; ctx?: number
  ctxWindow?: number; limitPct?: number; limitWindow?: number; branch?: string; tools?: [string, number][]; series?: number[]
}

const PANE = 'agent-radar'
const agents = atom({ plugin: 'agent-radar', key: 'agents' } as const, [] as Agent[])
const others = atom({ plugin: 'agent-radar', key: 'others' } as const, [] as Agent[])
const viewA = atom({ plugin: 'agent-radar', key: 'view' } as const, { scope: 'proj', showDone: false } as View)
const tick = atom({ plugin: 'agent-radar', key: 'tick' } as const, 0)

const CODEX = /(^|[\s;&|(])codex\s+(exec|e)\b/
const ENDED = new Set(['completed', 'failed', 'killed'])
const EFF = ['low', 'medium', 'high', 'xhigh', 'max']
// low → max: white, yellow, green, blue, purple.
const EFF_COLOR = ['#e7e9ef', '#e8b23a', '#3fcf7f', '#5aa9e6', '#a98bf0']
const HOW: Record<string, string> = {
  'claude-desktop': 'Claude Desktop', cli: 'Claude Code CLI', 'sdk-ts': 'Agent SDK', 'sdk-py': 'Agent SDK',
  codex_exec: 'codex exec', 'Codex Desktop': 'Codex Desktop',
}

let root = ''
// The pane's texts, picked by the `language` option when the module loads.
let t: Strings = STRINGS.en
// Launcher icons: our own drawn marks for Claude and Codex, the same in the rows and the project pills. The apps'
// icon files blur or turn into a plate at 10-16 px, and drawn marks need no app installed, on any system.
const MARK: Record<'claude' | 'codex', string> = { claude: CLAUDE_MARK, codex: CODEX_MARK }
const ICONS: Record<string, string> = Object.fromEntries(Object.entries(MARK).map(([k, m]) =>
  [k, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">${m}</svg>`]))
let home = ''
// The system this runs on, read at session start; macOS has the app icons, Claude Desktop links and Terminal.
let os: 'mac' | 'linux' | 'win' = 'mac'
// The system's handler for a URL, folder or file; a file's folder where "show in Finder" has no equivalent.
const opener = (target: string) =>
  os === 'mac' ? ['open', target] : os === 'win' ? ['rundll32', 'url.dll,FileProtocolHandler', target] : ['xdg-open', target]
const reveal = (file: string) => (os === 'mac' ? ['open', '-R', file] : opener(file.replace(/[\\/][^\\/]*$/, '')))
let sessionId = ''
// The current session's context window, used for Claude rows whose journal does not record one.
// ponytail: one window for every Claude model; a per-model table if they diverge.
let claudeWindow = 0
// The compaction window (/context's "Auto-compact window"), which caps the context below the model's own limit when
// auto-compaction or CLAUDE_CODE_AUTO_COMPACT_WINDOW sets it; read from the context breakdown at most once a minute.
let compactWindow = 0
let compactAt = 0
// One poll at a time; the all-sessions scan re-reads every active journal, so it runs at most every 10 s.
let polling = false
let lastAll = 0

// Context fill: green under half, blue to 75%, yellow to 90%, red above.
export const ctxColor = (share: number) => (share < 0.5 ? '#3fcf7f' : share < 0.75 ? '#5aa9e6' : share < 0.9 ? '#e8b23a' : '#f06a5f')
const journalOf = (cwd: string, id: string) => `${home}/.claude/projects/${cwd.replace(/[^A-Za-z0-9]/g, '-')}/${id}.jsonl`
const enc = encodeURIComponent
// A new Claude Code session in the same folder that picks the work up from a journal.
export const handoffUrl = (cwd: string, title: string, journal: string) =>
  `claude://code/new?folder=${enc(cwd)}&q=${enc(t.handoffPrompt(title, journal))}&source=agent-radar`
// Quoting for a shell word inside an AppleScript string.
export const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
export const asq = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

export const projectOf = (cwd = '') => cwd.replace(/[\\/]\.(claude|codex)[\\/]worktrees[\\/].*$/, '').split(/[\\/]/).pop() || cwd
// A model as the rows show it: Codex's own models without the repeated "codex-" (codex-auto-review → auto-review), so
// the narrow model column is not spent on an ellipsis. The details keep the full name.
export const modelLabel = (m = '') => m.replace(/^codex-/, '')
// Without the tenth of a million, for the narrowed token column.
export const fmtKShort = (n: number) => (n >= 1e6 ? Math.round(n / 1e6) + 'M' : fmtK(n))
export const fmtK = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n))
export const fmtT = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1e3)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  if (s < 60) return s + t.sec
  if (h === 0) return m + t.min
  return h < 24 ? `${h}${t.hour}${String(m).padStart(2, '0')}${t.min}` : `${Math.floor(h / 24)}${t.day}${h % 24}${t.hour}`
}

// Parses a `codex exec ...` command line into what the row shows before the rollout appears.
export function parseCodex(cmd: string) {
  const model = /(?:\s-m|--model)[=\s]+["']?([\w.\-]+)/.exec(cmd)?.[1]
  const effort = /reasoning_effort["'\s]*=["'\s]*(\w+)/.exec(cmd)?.[1] ?? /(?:\s-p|--profile)[=\s]+\S*?(low|medium|high|xhigh|max)\b/.exec(cmd)?.[1]
  const prompt = /["']([^"']{8,})["']\s*$/.exec(cmd.trim())?.[1]
  return { model, effort, prompt }
}

async function upsert($: $, id: string, patch: Partial<Agent>, base?: Agent) {
  await update($, agents, list => {
    const i = list.findIndex(a => a.id === id)
    if (i < 0) return base ? [...list, { ...base, ...patch }].slice(-300) : list
    return list.map((a, j) => (j === i ? { ...a, ...patch } : a))
  })
}

const blank = (id: string, now: number): Agent => ({
  id, parentId: id === 'main' ? undefined : 'main', project: projectOf(root), title: t.agent + id.slice(0, 8),
  model: '', family: 'claude', tokIn: 0, tokOut: 0, t0: now, status: 'running', how: 'Agent',
})

async function scan($: $, mode: 'codex' | 'all', mins: number, extra: string[]): Promise<Scan> {
  const r = await $.process.run([os === 'win' ? 'python' : 'python3', '-I', '-c', SCAN_PY, mode, String(mins), ...extra], { timeoutMs: 20000 })
  return r.exitCode === 0 ? (JSON.parse(r.stdout) as Scan) : { codex: [], claude: [] }
}

const inRoot = (cwd = '') => cwd === root || cwd.startsWith(root + '/') || cwd.startsWith(root + '\\')
const codexStatus = (r: Rec, now: number) =>
  (r.started ?? 0) > 0 && (r.done ?? 0) >= (r.started ?? 0) ? 'completed' : now - r.mtime < 60e3 ? 'running' : 'idle'

async function pollProject($: $) {
  const now = Date.now()
  const live = new Map((await $.agent.list()).map(a => [a.id, a.status as string]))
  const list = await read($, agents)
  const extra = list.filter(a => a.rollout && !ENDED.has(a.status)).map(a => a.rollout!)
  const { codex } = await scan($, 'codex', 5, extra)
  const byPath = new Map(codex.map(r => [r.path, r]))
  const claimed = new Set(list.map(a => a.rollout).filter(Boolean))

  await update($, agents, cur => {
    let next = cur.map(a => {
      const st = live.get(a.id)
      if (a.family === 'claude' && st) return { ...a, status: st, t1: ENDED.has(st) ? a.t1 ?? now : undefined }
      if (a.family !== 'codex') return a
      let r = a.rollout ? byPath.get(a.rollout) : undefined
      if (!a.rollout) {
        // ponytail: pairs a codex launch with the first new codex_exec rollout by time; two launches in the same second may swap.
        r = codex
          .filter(c => c.originator === 'codex_exec' && !claimed.has(c.path) && c.t0 && Date.parse(c.t0) >= a.t0 - 3e3 && Date.parse(c.t0) <= a.t0 + 120e3)
          .sort((x, y) => Date.parse(x.t0!) - Date.parse(y.t0!))[0]
        if (r) claimed.add(r.path)
      }
      // No rollout within the pairing window (an ephemeral run, a failed start): stop counting it as running.
      if (!r) return !a.rollout && a.how.endsWith(t.bg) && a.status === 'running' && now - a.t0 > 120e3 ? { ...a, status: 'idle' } : a
      const ended = ENDED.has(a.status)
      const cs = ended ? a.status : codexStatus(r, now)
      return {
        ...a, rollout: r.path, journal: r.path, sid: r.id ?? a.sid, stats: statsOf(r), model: r.model ?? a.model, effort: r.effort ?? a.effort, tokIn: r.tokIn, tokOut: r.tokOut,
        status: cs, t1: a.t1 ?? (ENDED.has(cs) ? r.mtime : undefined),
      }
    })
    // Codex sessions in this project nobody here launched (Codex Desktop, another terminal).
    for (const r of codex) {
      if (claimed.has(r.path) || !inRoot(r.cwd) || codexStatus(r, now) === 'completed') continue
      const row = recToCodex(r, now)
      const i = next.findIndex(a => a.id === row.id)
      next = i < 0 ? [...next, row] : next.map((a, j) => (j === i ? row : a))
    }
    return next
  })

  const usage = await $.session.usage(now - compactAt > 60e3 ? { breakdown: 'summary' } : undefined).catch(() => undefined)
  if (usage) {
    const raw = usage.context.breakdown?.rawMaxTokens
    if (raw) (compactWindow = raw), (compactAt = now)
    claudeWindow = compactWindow || usage.context.window
    await upsert($, 'main', { stats: { ctx: usage.context.tokens, ctxWindow: claudeWindow, lastAt: now } })
  }
  const rows = await read($, agents)
  const running = rows.filter(a => a.status === 'running' && a.id !== 'main').length
  const tok = rows.reduce((s, a) => s + a.tokIn + a.tokOut, 0)
  $.ui.status(running ? t.statusLine(running, fmtK(tok)) : undefined)
}

const statsOf = (r: Rec): Stats => ({
  requests: r.requests, turns: r.turns, cacheRead: r.cacheRead, cacheWrite: r.cacheWrite, reasoning: r.reasoning, ctx: r.ctx,
  ctxWindow: r.ctxWindow, limitPct: r.limitPct, limitWindow: r.limitWindow, branch: r.branch, tools: r.tools, series: r.series,
  lastAt: r.mtime,
})

function recToCodex(r: Rec, now: number): Agent {
  const t0 = r.t0 ? Date.parse(r.t0) : r.mtime
  const st = codexStatus(r, now)
  return {
    id: r.path, project: projectOf(r.cwd), title: r.title || (r.kind === 'guardian_review' ? t.autoReview : projectOf(r.cwd)), model: r.model ?? '?',
    family: 'codex', effort: r.effort, tokIn: r.tokIn, tokOut: r.tokOut, t0, t1: st === 'completed' ? r.mtime : undefined,
    cwd: r.cwd, sid: r.id, journal: r.path,
    stats: statsOf(r), status: st, how: r.parent ? (r.kind === 'guardian_review' ? t.codexReview : t.codexSub) : HOW[r.originator ?? ''] ?? r.originator ?? 'codex', rollout: r.path,
  }
}

// Claude Desktop's own deep links: a Code session by its local_ id, a Cowork task through the waiting-for-you route.
export const openUrl = (id: string, kind: 'code' | 'work') =>
  `claude://code/${kind === 'code' ? 'continue' : 'needs-input'}?session=${encodeURIComponent(id)}&source=agent-radar`

export function fromScan(s: Scan, now: number): Agent[] {
  const claude = s.claude.map((r): Agent => {
    const sub = r.path.includes('/subagents/')
    const fresh = now - r.mtime < 60e3
    return {
      id: r.path, parentId: sub ? r.path.split('/subagents/')[0] + '.jsonl' : undefined, project: projectOf(r.cwd),
      title: r.meta?.description ?? r.title ?? projectOf(r.cwd), model: (r.model ?? '?').replace(/^claude-/, ''),
      family: 'claude', effort: r.effort, tokIn: r.tokIn, tokOut: r.tokOut, t0: r.t0 ? Date.parse(r.t0) : r.mtime,
      t1: fresh ? undefined : r.mtime, status: fresh ? 'running' : 'idle', stats: statsOf(r),
      cwd: r.cwd, sid: sub ? undefined : r.path.split('/').pop()!.replace('.jsonl', ''), journal: r.path,
      open: r.desktop && !sub ? { kind: r.desktop.kind, url: openUrl(r.desktop.id, r.desktop.kind) } : undefined,
      how: sub ? (r.meta?.requestShape === 'background' ? 'Agent · ' + t.bg : 'Agent') + (r.meta?.agentType ? ' · ' + r.meta.agentType : '') : HOW[r.entry ?? ''] ?? r.entry ?? '?',
    }
  })
  const byThread = new Map(s.codex.map(r => [r.id, r.path]))
  const codex = s.codex.map(r => {
    const row = recToCodex(r, now)
    const l = r.launch
    const up = r.parent && byThread.get(r.parent)
    if (up) return { ...row, parentId: up, project: projectOf(s.codex.find(c => c.path === up)?.cwd ?? r.cwd) }
    const parent = claude.find(c => c.id === l?.path)
    return l ? { ...row, project: parent?.project ?? row.project, parentId: l.path, title: l.title || row.title, how: l.bg ? 'codex exec · ' + t.bg : 'codex exec', cmd: l.cmd } : row
  })
  return [...claude, ...codex]
}

async function pollAll($: $) {
  const view = await read($, viewA)
  if (view.scope !== 'all') return
  lastAll = Date.now()
  const s = await scan($, 'all', view.showDone ? 120 : 15, [])
  await update($, others, () => fromScan(s, Date.now()))
}

// Depth-first order with each child under its parent; a row whose parent is not shown becomes a root.
export function ordered(list: Agent[]) {
  const ids = new Set(list.map(a => a.id))
  const out: { a: Agent; depth: number; guide: string; cont: string; hasKids: boolean; root: string }[] = []
  const walk = (a: Agent, depth: number, guide: string, cont: string, root: string) => {
    const kids = list.filter(c => c.parentId === a.id).sort((x, y) => x.t0 - y.t0)
    out.push({ a, depth, guide, cont, hasKids: kids.length > 0, root })
    kids.forEach((c, i) => {
      const last = i === kids.length - 1
      walk(c, depth + 1, cont + (last ? '└─ ' : '├─ '), cont + (last ? '   ' : '│  '), root)
    })
  }
  list.filter(a => !a.parentId || !ids.has(a.parentId)).sort((x, y) => x.t0 - y.t0).forEach(a => walk(a, 0, '', '', a.id))
  return out
}

// Dark-first palette from the concept page; status and family read by color alone.
const C: Record<string, string> = {
  claude: '#a98bf0', codex: '#3cc4ae', running: '#3fcf7f', waiting: '#e8b23a', idle: '#6c7284', pending: '#e8b23a',
  completed: '#6c7284', failed: '#f06a5f', killed: '#f06a5f', muted: '#8a90a0', work: '#e0a46e', fresh: '#5aa9e6', cache: '#5c6378', rail: '#8a90a066',
}
const SOFT: Record<string, string> = { claude: '#a98bf026', codex: '#3cc4ae26', sel: '#a98bf01f' }
// Boxes have no corner radius of their own: a round border in the fill's own color draws the fill with rounded corners.
const BAR = '#8a90a01a'
const ROUND_SEL = { borderStyle: 'round', borderColor: SOFT.sel }
// Each project header bar's color: Claude in its logo's orange there, since purple squares already mean max effort.
const BAR_COLOR = { claude: '#D97757', codex: '#3cc4ae' }
// Launchers drawn as their app: icon (graphical surfaces) and the logo's color.
const APPS: Record<string, { app: string; color: string; short: string }> = {
  'Claude Desktop': { app: 'claude', color: '#D97757', short: 'Claude' },
  'Claude Code CLI': { app: 'claude', color: '#D97757', short: 'CLI' },
  'Codex Desktop': { app: 'codex', color: '#8B8CF8', short: 'Codex' },
}
// `field`: one cell of the details grid on a wide pane, sized to its longest usual value ("120 · 45 turns", "high" with its squares).
const W = { model: 11, modelShort: 9, cmodel: 11, eff: 6, effShort: 2, tok: 6, bar: 5, ctx: 5, time: 6, how: 16, field: 16 }


// The pane opens with this session's details showing, as if its row had been pressed.
async function openPane($: $) {
  await update($, viewA, v => ({ ...v, sel: 'main', note: undefined, confirm: undefined }))
  await $.ui.open({ id: PANE, title: 'Agent Radar' })
}

// Whether the pane is wanted, shared by every chat through the store: opened or closed by hand in one, the others follow
// on their next poll. Never set means wanted, so a first session opens it.
const wanted = async ($: $) => (await $.store.get('open')) !== false
// The wanted state this chat last acted on: only a change made in another chat opens or closes the pane here, so a
// pane put up some other way stays, and a session with no surface does not retry its open on every poll.
let synced: boolean | undefined
async function syncPane($: $) {
  const want = await wanted($)
  if (want === synced) return
  synced = want
  const up = (await $.ui.panes()).some(p => p.id === PANE)
  if (want && !up) await openPane($)
  if (!want && up) await $.ui.close({ id: PANE })
}

export const register: Register = (on, options) => {
  t = STRINGS[(options.language as Lang) in STRINGS ? (options.language as Lang) : 'en']
  on('session.start', async ($, e, next) => {
    root = await $.session.cwd()
    home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''
    sessionId = await $.session.id()
    const now = Date.now()
    await upsert($, 'main', { project: projectOf(root) }, { ...blank('main', now), title: t.mainSession, how: t.claudeSession, status: 'idle', cwd: root, sid: sessionId, journal: journalOf(root, sessionId) })
    // Right after the session's own row exists (its first draw is not an empty list) and before the slower setup below.
    synced = await wanted($)
    if (synced) void openPane($)
    os = (await $.env.get('OS')) === 'Windows_NT' ? 'win'
      : (await $.process.run(['uname', '-s']).catch(() => undefined))?.stdout.trim() === 'Linux' ? 'linux' : 'mac'
    await $.command.register({ name: 'agent-radar', description: t.cmdDescription })
    $.clock.every(3000, () => {
      void syncPane($).catch(() => {})
      if (polling) return
      polling = true
      void Promise.allSettled([pollProject($), Date.now() - lastAll >= 10e3 ? pollAll($) : undefined]).finally(() => (polling = false))
    })
    $.clock.every(1000, () => void read($, agents).then(l => { if (l.some(a => a.status === "running")) return update($, tick, n => n + 1) }).catch(() => {}))
    return next(e)
  })

  on('command.run', { command: 'agent-radar' }, async $ => {
    await $.store.set('open', true)
    await openPane($)
    return { text: t.opened }
  })

  // Closed by hand: the other chats close it too. Closes made by this mod (syncPane) or an unload change nothing.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind === 'person') await $.store.set('open', false)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny || !r.agentId) return r
    const how = e.workflow ? 'Workflow' : e.isTeammate ? 'Teammate' : e.fork ? 'Fork' : e.background ? 'Agent · ' + t.bg : 'Agent'
    await upsert(
      $, r.agentId,
      {
        parentId: e.parentAgentId ?? 'main', title: e.description || e.subagentType, model: r.model.replace(/^claude-/, ''),
        how: how + ' · ' + e.subagentType, prompt: e.prompt, atype: e.subagentType, cwd: e.cwd ?? root,
        cmd: `Agent({ subagent_type: "${e.subagentType}", model: "${e.model ?? 'inherit'}", background: ${e.background}${e.cwd ? `, cwd: "${e.cwd}"` : ''} })`,
      },
      blank(r.agentId, Date.now()),
    )
    return r
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await upsert($, 'main', { status: 'running', t1: undefined })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId ?? 'main'
    // A listed agent's status is corrected by the next poll; a workflow agent is never listed, so this is its end.
    const listed = id === 'main' ? undefined : (await $.agent.list()).find(a => a.id === id)
    await upsert($, id, id === 'main' ? { status: 'idle' }
      : listed ? { status: listed.status, t1: ENDED.has(listed.status) ? Date.now() : undefined }
      : { status: e.isAborted ? 'killed' : 'completed', t1: Date.now() })
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r.usage
    if (u) {
      const id = e.agentId ?? 'main'
      await update($, agents, list => {
        const found = list.some(a => a.id === id)
        const base = found ? list : [...list, blank(id, Date.now())]
        return base.map(a =>
          a.id !== id ? a : {
            ...a, model: (u.model || e.model).replace(/^claude-/, ''), effort: typeof e.effort === 'string' ? e.effort : a.effort,
            tokIn: a.tokIn + u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens,
            tokOut: a.tokOut + u.output_tokens,
          })
      })
    }
    return r
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const cmd = e.command
    if (!CODEX.test(cmd)) return next(e)
    const id = 'cx:' + e.tool_use_id
    const bg = !!e.run_in_background
    const p = parseCodex(cmd)
    await upsert($, id, {}, {
      id, parentId: e.agentId ?? 'main', project: projectOf(root), title: e.description || p.prompt || 'codex exec',
      model: p.model ?? 'codex', family: 'codex', effort: p.effort, tokIn: 0, tokOut: 0, t0: Date.now(),
      status: 'running', how: bg ? 'codex exec · ' + t.bg : 'codex exec', cmd, cwd: root,
    })
    const r = await next(e)
    if (!bg) await upsert($, id, { status: r.deny || r.isError ? 'failed' : 'completed', t1: Date.now() })
    else {
      const taskId = (r.result as { backgroundTaskId?: string } | undefined)?.backgroundTaskId
      if (taskId) await upsert($, id, { taskId })
    }
    return r
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const Svg = 'Svg' in els ? els.Svg : undefined
    const view = await read($, viewA)
    await read($, tick)
    const all = view.scope === 'proj' ? await read($, agents) : await read($, others)
    const hidden = new Set(view.hidden ?? [])
    const pinned = new Set(view.pinned ?? [])
    const collapsed = new Set(view.collapsed ?? [])
    // Hiding an agent hides everything it launched, so a hidden root takes its whole tree with it.
    const allById = new Map(all.map(a => [a.id, a]))
    const isHidden = (a?: Agent): boolean => !!a && (hidden.has(a.id) || isHidden(a.parentId ? allById.get(a.parentId) : undefined))
    const list = all.filter(a => (view.showDone || !ENDED.has(a.status) || a.id === 'main') && !isHidden(a))
    const ctxOf = (a: Agent) => {
      const w = a.stats?.ctxWindow ?? (a.family === 'claude' ? claudeWindow : 0)
      return a.stats?.ctx && w ? Math.min(1, a.stats.ctx / w) : undefined
    }
    const now = Date.now()
    const cols = e.props.bodyColumns ?? 100
    const web = e.surface !== 'terminal'
    // Narrowing steps: the launch column goes first, then effort shrinks to one square under a short header, and only
    // then do rows become two-line cards.
    const compact = cols < 56, tight = cols < 88, showHow = cols >= 96, showEff = true
    const effW = tight ? W.effShort : W.eff, modelW = tight ? W.modelShort : W.model
    // Token column: count over a bar (desktop), count beside a bar (terminal); narrowed with the effort column.
    const barW = web ? (tight ? W.bar : W.bar + 2) : W.bar, numW = tight ? 4 : W.tok
    const fmtTok = tight ? fmtKShort : fmtK
    // A card's second line still has room for the five-square effort meter down to this width: padding, dot, model,
    // meter, tokens, context, their gaps and a few cells of tree indent.
    const cardEffLong = cols >= 2 + 2 + W.cmodel + W.eff + barW + W.ctx + 5 + 6
    const setView = (p: Partial<View>) => update($, viewA, v => ({ ...v, ...p }))
    const running = list.filter(a => a.status === 'running').length
    const nCodex = list.filter(a => a.family === 'codex').length
    const tokIn = list.reduce((s, a) => s + a.tokIn, 0), tokOut = list.reduce((s, a) => s + a.tokOut, 0), tok = tokIn + tokOut
    // The counters double as switches, all on by default: one switched off leaves its agents out of the list.
    // The counts stay those of the whole list.
    const off = new Set(view.off ?? [])
    const shown = list.filter(a => !off.has(a.family as 'claude' | 'codex') && (!view.runningOnly || a.status === 'running'))
    const maxTok = Math.max(1, ...shown.map(a => a.tokIn + a.tokOut))
    // 'main' stands for this session: in "All" it is the scanned row carrying this session's id.
    const selId = view.sel === 'main' && view.scope === 'all' ? shown.find(a => a.family === 'claude' && a.sid === sessionId)?.id : view.sel
    const sel = shown.find(a => a.id === selId)
    // A pinned agent and everything under it form the first group; the rest group by project.
    const byId = new Map(shown.map(a => [a.id, a]))
    const rootOf = (a: Agent): Agent => (a.parentId && byId.has(a.parentId) ? rootOf(byId.get(a.parentId)!) : a)
    const PINNED = ' pinned'
    const groupOf = (a: Agent) => (pinned.has(rootOf(a).id) ? PINNED : a.project.toLowerCase())
    const projects = [...new Map(shown.map(a => [groupOf(a), groupOf(a) === PINNED ? t.pinnedGroup : a.project])).entries()].sort(([x], [y]) => x.localeCompare(y))

    const head = (
      <Box key="head" flexDirection="row" gap={1} paddingX={1} width="100%">
        <Box width={2} flexShrink={0}><Text> </Text></Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0}><Text dimColor bold>{t.head.task}</Text></Box>
        <Box width={modelW} flexShrink={0} overflow="hidden"><Text dimColor bold>{t.head.model}</Text></Box>
        {showEff && <Box width={effW} flexShrink={0} overflow="hidden"><Text dimColor bold>{tight ? t.head.effortShort : t.head.effort}</Text></Box>}
        <Box width={web ? barW : numW + 1 + barW} flexShrink={0} overflow="hidden" justifyContent={web ? 'center' : 'flex-end'}><Text dimColor bold>{tight ? t.head.tokensShort : t.head.tokens}</Text></Box>
        <Box width={W.ctx} flexShrink={0} overflow="hidden" justifyContent={web ? 'center' : 'flex-end'}><Text dimColor bold>{t.head.ctx}</Text></Box>
        <Box width={W.time} flexShrink={0} overflow="hidden" justifyContent="flex-end"><Text dimColor bold>{t.head.time}</Text></Box>
        {showHow && <Box width={W.how} flexShrink={0} overflow="hidden"><Text dimColor bold>{t.head.how}</Text></Box>}
      </Box>
    )

    // A 3 px bar stretched across its cell, so the number above sits close and the row stays one line plus a hair.
    const thinBar = (share: number, color: string) =>
      Svg && <Svg source={meter(share, color, 360, 4).replace('<svg ', '<svg preserveAspectRatio="none" ')} alt={Math.round(share * 100) + '%'} height={3} />
    // Share of the context window in use: the percent over a bar, colored by how full it is.
    const ctxCell = (a: Agent) => {
      const s = ctxOf(a)
      const pct = s === undefined ? '—' : Math.round(s * 100) + '%'
      const color = s === undefined ? C.muted : ctxColor(s)
      const fill = s === undefined ? 0 : Math.max(1, Math.round(s * W.ctx))
      return web ? (
        <Box key={'x' + a.id.slice(-40)} width={W.ctx} flexShrink={0} flexDirection="column" alignItems="center">
          <Text mono size="footnote" color={color}>{pct}</Text>
          {Svg
            ? <Box width={W.ctx} flexShrink={0}>{thinBar(s ?? 0, color!)}</Box>
            : <Box width={W.ctx} flexShrink={0} overflow="hidden">
                <Text mono color={color}>{'━'.repeat(fill)}</Text>
                <Text mono color={C.muted} dimColor>{'━'.repeat(W.ctx - fill)}</Text>
              </Box>}
        </Box>
      ) : (
        <Box key={'x' + a.id.slice(-40)} width={W.ctx} flexShrink={0} justifyContent="flex-end"><Text color={color}>{pct}</Text></Box>
      )
    }
    // Tokens spent: the count in small type over a bar scaled to the busiest agent shown (desktop); count and bar side by side (terminal).
    const tokCell = (a: Agent) => {
      const t = a.tokIn + a.tokOut
      const filled = Math.max(t ? 1 : 0, Math.round((t / maxTok) * barW))
      return web ? (
        <Box key={'k' + a.id.slice(-40)} width={barW} flexShrink={0} flexDirection="column" alignItems="center">
          <Text mono size="footnote">{fmtTok(t)}</Text>
          {Svg
            ? <Box width={barW} flexShrink={0}>{thinBar(t / maxTok, C[a.family]!)}</Box>
            : <Box width={barW} flexShrink={0} overflow="hidden">
                <Text mono color={C[a.family]}>{'━'.repeat(filled)}</Text>
                <Text mono color={C.muted} dimColor>{'━'.repeat(barW - filled)}</Text>
              </Box>}
        </Box>
      ) : (
        <Box key={'k' + a.id.slice(-40)} flexDirection="row" gap={1} flexShrink={0}>
          <Box width={numW} flexShrink={0} overflow="hidden" justifyContent="flex-end"><Text>{fmtTok(t)}</Text></Box>
          <Box width={barW} flexShrink={0} overflow="hidden">
            <Text color={C[a.family]}>{'━'.repeat(filled)}</Text>
            <Text color={C.muted} dimColor>{'━'.repeat(barW - filled)}</Text>
          </Box>
        </Box>
      )
    }
    // Effort as five squares, the filled ones all in the level's color: low one white, medium two yellow, high three
    // green, xhigh four blue, max five purple.
    const effText = (effort?: string) => {
      const n = EFF.indexOf(effort ?? '') + 1
      return (
        <Text mono={web || undefined}>
          <Text color={n ? EFF_COLOR[n - 1] : C.muted}>{n ? '■'.repeat(n) : '—'}</Text>
          <Text color={C.muted}>{n ? '□'.repeat(5 - n) : ''}</Text>
        </Text>
      )
    }
    // One large square in the level's color instead of five, for a pane too narrow for the full meter.
    const effCube = (effort?: string) => (
      <Text size="heading" color={EFF_COLOR[EFF.indexOf(effort ?? '')] ?? C.muted}>{effort ? '■' : '—'}</Text>
    )
    // A project's agents as one low pill per family next to its name (left out when the family has none there):
    // a square per agent, running in the family's color, the rest gray. When the squares would not fit on the
    // header line, each pill holds two bold numbers instead: running in color, then the others in gray.
    const groupCubes = (list: Agent[], name: string) => {
      const fams = (['claude', 'codex'] as const).filter(f => list.some(a => a.family === f))
      // Name, its gap, and per pill its squares plus about five cells of icon, padding and gap; the pane's padding.
      const counts = name.length + 1 + list.length + fams.length * 5 + 4 > cols
      return fams.map(f => {
        const mine = list.filter(a => a.family === f)
        const live = mine.filter(a => a.status === 'running').length, rest = mine.length - live
        const color = BAR_COLOR[f]
        // Graphical surfaces: a rounded gray pill drawn as an image; the terminal: plain colored text.
        if (Svg) {
          const c = chip([{ n: live, color }, { n: rest, color: C.muted! }], counts, MARK[f])
          return <Svg key={'q-' + f} source={c.source} alt={`${f} ${live}/${mine.length}`} width={c.w} height={c.h} />
        }
        return counts
          ? <Text key={'q-' + f} bold><Text color={color}>{String(live)}</Text>{rest ? <Text color={C.muted}>{' ' + rest}</Text> : ''}</Text>
          : <Text key={'q-' + f}><Text color={color}>{'■'.repeat(live)}</Text><Text color={C.muted}>{'■'.repeat(rest)}</Text></Text>
      })
    }
    // Fold toggle on a root row with children: a heavy chevron, ᐯ open and ᐳ folded with the number of agents under it in its
    // own color; body size, so the chevron stands as tall as that number.
    const foldBtn = (a: Agent, n: number) => n > 0 && (
      <Button key={'v' + a.id.slice(-48)} plain onPress={() => void update($, viewA, v => ({
        ...v, collapsed: collapsed.has(a.id) ? (v.collapsed ?? []).filter(x => x !== a.id) : [...(v.collapsed ?? []), a.id],
      }))}>
        <Text bold color={C.muted}>{collapsed.has(a.id) ? 'ᐳ' : 'ᐯ'}</Text>
        {collapsed.has(a.id) ? <Text bold color={C.fresh}>{' ' + n}</Text> : ''}
        {' '}
      </Button>
    )
    const row = (a: Agent, guide: string, fold?: ReturnType<typeof foldBtn>) => {
      const k = a.id.slice(-48)
      const isSel = a.id === selId
      return (
        <Box key={'r' + k} flexDirection="row" gap={1} paddingX={1} width="100%" alignItems="center" backgroundColor={isSel && web ? SOFT.sel : undefined} {...(isSel && web ? ROUND_SEL : {})}>
          <Box width={2} flexShrink={0}><Text color={C[a.status] ?? C.muted}>●</Text></Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden" flexDirection="row" alignItems="center">
            {guide && <Text mono={web || undefined} color={C.muted}>{guide}</Text>}
            {fold}
            {/* The title alone gives way to a long name, so the ↗ after it keeps its place and never runs into the model. */}
            <Box flexShrink={1} minWidth={0} overflow="hidden">
              <Button key={'t' + k} plain onPress={() => void setView({ sel: isSel ? undefined : a.id, note: undefined, confirm: undefined })}>
                <Text bold={isSel} wrap="truncate-end">{pinned.has(a.id) && <Text color={C.waiting}>★ </Text>}{a.title}</Text>
              </Button>
            </Box>
            {a.open && <Box flexShrink={0}>{openBtn(a)}</Box>}
          </Box>
          <Box width={modelW} flexShrink={0} overflow="hidden">
            <Text color={C[a.family]} backgroundColor={web ? SOFT[a.family] : undefined} wrap="truncate-end">{' ' + (modelLabel(a.model) || '…') + ' '}</Text>
          </Box>
          {showEff && (
            <Box width={effW} flexShrink={0} overflow="hidden">
              {tight ? effCube(a.effort) : effText(a.effort)}
            </Box>
          )}
          {tokCell(a)}
          {ctxCell(a)}
          <Box width={W.time} flexShrink={0} overflow="hidden" justifyContent="flex-end"><Text mono={web || undefined} dimColor={!!a.t1}>{fmtT((a.t1 ?? now) - a.t0)}</Text></Box>
          {showHow && <Box width={W.how} flexShrink={0} overflow="hidden">{howCell(a)}</Box>}
        </Box>
      )
    }
    // A press on it opens that session's chat in Claude Desktop.
    const howCell = (a: Agent) => {
      const app = APPS[a.how]
      if (!app) return <Text dimColor wrap="truncate-end">{a.how}</Text>
      const icon = ICONS[app.app]
      if (!Svg || !icon) return <Text color={app.color} wrap="truncate-end">{a.how}</Text>
      return (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Svg source={icon} alt={a.how} width={16} height={16} />
          <Text color={app.color} wrap="truncate-end">{app.short}</Text>
        </Box>
      )
    }
    const openBtn = (a: Agent) =>
      a.open && (
        <Button key={'o' + a.id.slice(-48)} plain onPress={() => run(opener(a.open!.url), t.chatOpened)}>
          {/* The same mark as the Chat action: ↗ in Claude's color for Code, in Cowork's for a task. */}
          <Text color={a.open.kind === 'code' ? C.claude : C.work}>{' ↗'}</Text>
        </Button>
      )
    // Narrow pane: one agent is two lines, task and time on top, model, effort and tokens under it.
    // `guide` and `cont` draw the tree in text where the surface joins box glyphs (the terminal); `pad` is their width.
    const card = (a: Agent, guide: string, cont: string, pad: number, fold?: ReturnType<typeof foldBtn>) => {
      const k = a.id.slice(-48)
      const isSel = a.id === selId
      // A launcher with an app icon shows the icon alone beside the title; text launchers stay on the second line.
      const app = APPS[a.how]
      const icon = Svg && app && ICONS[app.app]
      return (
        <Box key={'c' + k} flexDirection="column" paddingX={1} width="100%" backgroundColor={isSel && web ? SOFT.sel : undefined} {...(isSel && web ? ROUND_SEL : {})}>
          <Box flexDirection="row" gap={1} width="100%">
            {pad > 0 && <Box width={pad} flexShrink={0}><Text color={C.muted}>{guide}</Text></Box>}
            <Box width={2} flexShrink={0}><Text color={C[a.status] ?? C.muted}>●</Text></Box>
            <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden" flexDirection="row" alignItems="center">
              {fold}
              <Button key={'t' + k} plain onPress={() => void setView({ sel: isSel ? undefined : a.id, note: undefined, confirm: undefined })}>
                <Text bold={isSel} wrap="truncate-end">{pinned.has(a.id) && <Text color={C.waiting}>★ </Text>}{a.title}</Text>
              </Button>
            </Box>
            {/* Outside the shrinking title, so a squeezed card truncates the title instead of piling these up. */}
            {(a.open || icon) && (
              <Box flexShrink={0} flexDirection="row" gap={1} alignItems="center">
                {openBtn(a)}
                {icon && <Svg source={icon} alt={a.how} width={16} height={16} />}
              </Box>
            )}
            <Box width={W.time} flexShrink={0} justifyContent="flex-end"><Text mono={web || undefined} dimColor={!!a.t1}>{fmtT((a.t1 ?? now) - a.t0)}</Text></Box>
          </Box>
          {/* Second line: the same fixed cells on every card, so models, effort and tokens line up down the list. */}
          <Box flexDirection="row" gap={1} width="100%">
            {pad > 0 && <Box width={pad} flexShrink={0}><Text color={C.muted}>{cont}</Text></Box>}
            <Box width={2} flexShrink={0} />
            <Box width={W.cmodel} flexShrink={0} overflow="hidden">
              <Text color={C[a.family]} backgroundColor={web ? SOFT[a.family] : undefined} wrap="truncate-end">{' ' + (modelLabel(a.model) || '…') + ' '}</Text>
            </Box>
            {cardEffLong
              ? <Box width={W.eff} flexShrink={0} alignItems="center">{effText(a.effort)}</Box>
              : <Box width={2} flexShrink={0} alignItems="center">{effCube(a.effort)}</Box>}
            {tokCell(a)}
            {ctxCell(a)}
            <Box flexGrow={1} flexShrink={1} minWidth={0}>{!icon && howCell(a)}</Box>
          </Box>
        </Box>
      )
    }
    // Details grid cell: half the box on a narrow pane, so there are always two columns however far it is squeezed;
    // a fixed width on a wide one, so the cells flow three or four to a row.
    const fw = compact ? '50%' : W.field
    const field = (label: string, value: string) => (
      <Box key={'f' + label} flexDirection="column" width={fw} paddingRight={1}>
        <Text dimColor>{label}</Text>
        <Text wrap="truncate-end">{value}</Text>
      </Box>
    )
    const ago = (ms?: number) => (ms ? fmtT(now - ms) + t.ago : '—')
    // A chart on graphical surfaces, a glyph bar in the terminal.
    const chart = (source: string, alt: string, share?: number, color?: string) =>
      Svg ? <Svg source={source} alt={alt} /> : share !== undefined
        ? <Text><Text color={color}>{'━'.repeat(Math.round(share * 30))}</Text><Text color={C.muted}>{'━'.repeat(30 - Math.round(share * 30))}</Text></Text>
        : <Text dimColor>{alt}</Text>
    const legend = (items: [string, number | undefined, string][]) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
        {items.filter(([, v]) => (v ?? 0) > 0).map(([label, v, color]) => (
          <Text key={'l' + label}><Text color={color}>● </Text>{label + ' '}<Text bold>{fmtK(v ?? 0)}</Text></Text>
        ))}
      </Box>
    )
    // What can be done with an agent, by what the mod can reach: this session's own subagents and runs through
    // its tools, Claude Desktop sessions through the app's links, Codex through the shell.
    const say = (note: string) => update($, viewA, v => ({ ...v, note, confirm: undefined }))
    const run = (argv: string[], done: string) =>
      void $.process.run(argv).then(r => say(r.exitCode === 0 ? done : t.failed + (r.stderr || r.exitCode).toString().slice(0, 200)), () => say(t.cannotRun + argv[0]))
    const tool = (args: Parameters<typeof $.tool.call>[0], done: string) =>
      void $.tool.call(args).then(r => say('deny' in r && r.deny ? t.denied + r.deny : done), err => say(t.failed + String(err).slice(0, 200)))
    const copy = (text: string, what: string) =>
      void $.ui.copy({ text, surface: e.surface }).then(r => say(r.isCopied ? t.copied(what) : t.noClipboard))
    // Terminal.app on macOS; elsewhere terminals differ too much to drive, so the command goes to the clipboard.
    const terminal = (cwd: string, cmd: string, done: string) => os === 'mac'
      ? run(['osascript', '-e', `tell application "Terminal" to do script "${asq(`cd ${shq(cwd)} && ${cmd}`)}"`, '-e', 'tell application "Terminal" to activate'], done)
      : copy(`cd ${shq(cwd)}${os === 'win' ? ';' : ' &&'} ${cmd}`, t.launchWhat)
    // One colored glyph and one word per action.
    const btn = (key: string, icon: string, word: string, color: string, onPress: () => void, primary?: boolean) => (
      <Button key={key + sel?.id.slice(-32)} variant={primary ? 'primary' : undefined} onPress={onPress}>
        <Text color={primary ? undefined : color}>{icon}</Text>{' ' + word}
      </Button>
    )
    const actions = (a: Agent) => {
      const mine = view.scope === 'proj'
      const sub = mine && a.family === 'claude' && a.id !== 'main'
      const stopId = sub ? a.id : a.taskId
      const out: ReturnType<typeof Button>[] = []
      if (a.open) out.push(btn('a-open', '↗', t.btn.chat, C.claude!, () => run(opener(a.open!.url), t.chatOpened), true))
      // Only the session this mod runs in can be compacted from here; in "All sessions" it is the row with its id.
      if (a.family === 'claude' && a.sid === sessionId)
        out.push(btn('a-compact', '⇊', t.btn.compact, C.fresh!, () => void $.session.compact().then(r => say('skip' in r && r.skip ? t.compactSkipped + r.skip : t.compacted), err => say(t.compactFailed + String(err).slice(0, 200)))))
      // Handoff opens Claude Desktop, which has no Linux build.
      if (os !== 'linux' && a.cwd && a.journal && (a.family === 'codex' || !a.parentId || a.id === 'main'))
        out.push(btn('a-hand', '⇄', t.btn.handoff, C.work!, () => run(opener(handoffUrl(a.cwd!, a.title, a.journal!)), t.handedOff)))
      if (stopId && !ENDED.has(a.status))
        out.push(view.confirm === a.id
          ? btn('a-stop-yes', '■', t.btn.sure, C.failed!, () => tool({ tool: 'TaskStop', task_id: stopId }, t.stopped), true)
          : btn('a-stop', '■', t.btn.stop, C.failed!, () => void update($, viewA, v => ({ ...v, confirm: a.id, note: t.confirmStop }))))
      if (sub && !ENDED.has(a.status))
        out.push(btn('a-ask', '?', t.btn.status, C.fresh!, () => tool({ tool: 'SendMessage', to: a.id, summary: 'Agent Radar', message: t.askStatus }, t.asked)))
      if (sub && a.prompt && a.atype)
        out.push(btn('a-again', '↻', t.btn.again, C.running!, () => void $.agent.spawn({ prompt: a.prompt!, description: a.title, subagentType: a.atype! }).then(r => say('deny' in r && r.deny ? t.denied + r.deny : t.restarted), err => say(t.failed + String(err).slice(0, 200)))))
      // The same session opened in its own CLI in Terminal: `claude --resume` or `codex resume`.
      if (a.sid && a.cwd && (a.family === 'codex' || !a.parentId || a.id === 'main'))
        out.push(btn('a-cli', '❯_', t.btn.cli, a.family === 'codex' ? C.codex! : C.claude!, () =>
          terminal(a.cwd!, a.family === 'codex' ? `codex resume ${shq(a.sid!)}` : `claude --resume ${shq(a.sid!)}`, t.inTerminal)))
      if (a.cwd) out.push(btn('a-dir', '🗀', t.btn.folder, C.work!, () => run(opener(a.cwd!), t.folderOpened)))
      if (a.journal) out.push(btn('a-log', '≡', t.btn.logs, C.muted!, () => run(reveal(a.journal!), t.logShown)))
      if (a.cmd) out.push(btn('a-cmd', '⧉', t.btn.cmd, C.muted!, () => copy(a.cmd!, t.launchWhat)))
      out.push(btn('a-id', '⧉', t.btn.id, C.muted!, () => copy(a.sid ?? a.id, t.idWhat)))
      out.push(btn('a-pin', pinned.has(a.id) ? '★' : '☆', pinned.has(a.id) ? t.btn.unpin : t.btn.pin, C.waiting!, () =>
        void update($, viewA, v => ({ ...v, pinned: pinned.has(a.id) ? (v.pinned ?? []).filter(x => x !== a.id) : [...(v.pinned ?? []), a.id] }))))
      out.push(btn('a-hide', '⊘', t.btn.hide, C.muted!, () => void update($, viewA, v => ({ ...v, hidden: [...(v.hidden ?? []), a.id], sel: undefined, note: undefined }))))
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>{out}</Box>
          {sub && !ENDED.has(a.status) && Input && (
            <Input key={'msg' + a.id.slice(-32)} placeholder={t.messagePlaceholder} submitLabel={t.send}
              onSubmit={text => text.trim() && tool({ tool: 'SendMessage', to: a.id, summary: 'Agent Radar', message: text }, t.messageSent)} />
          )}
        </Box>
      )
    }
    const detail = sel && (() => {
      const st = sel.stats ?? {}
      const fam = C[sel.family]!
      const cr = st.cacheRead ?? 0, cw = st.cacheWrite ?? 0
      const fresh = Math.max(0, sel.tokIn - cr - cw)
      const n = EFF.indexOf(sel.effort ?? '') + 1
      const ctxShare = ctxOf(sel)
      const win = st.ctxWindow ?? (sel.family === 'claude' ? claudeWindow : 0)
      return (
        <Box key="detail" flexDirection="column" gap={1} borderStyle="round" borderColor={fam} paddingX={2} paddingY={1} marginY={1}>
          <Box flexDirection="row" gap={1} alignItems="center">
            <Text color={C[sel.status] ?? C.muted}>●</Text>
            <Text bold>{sel.title}</Text>
            {openBtn(sel)}
            <Box flexGrow={1} />
            <Text color={C[sel.status] ?? C.muted} backgroundColor={web ? (C[sel.status] ?? C.muted) + '26' : undefined}>{' ' + (t.status[sel.status] ?? sel.status) + ' '}</Text>
          </Box>
          <Box flexDirection="row" flexWrap="wrap" columnGap={compact ? 0 : 2} rowGap={1}>
            <Box flexDirection="column" width={fw} paddingRight={1}>
              <Text dimColor>{t.f.model}</Text>
              <Text color={fam} backgroundColor={web ? SOFT[sel.family] : undefined} wrap="truncate-end">{' ' + (sel.model || '—') + ' '}</Text>
            </Box>
            <Box flexDirection="column" width={fw} paddingRight={1}>
              <Text dimColor>{t.f.effort}</Text>
              <Text>{effText(sel.effort)}<Text color={n ? EFF_COLOR[n - 1] : undefined}>{' ' + (sel.effort ?? '')}</Text></Text>
            </Box>
            {field(t.f.running, fmtT((sel.t1 ?? now) - sel.t0))}
            {field(t.f.activity, ago(st.lastAt))}
            {st.requests !== undefined && field(t.f.requests, String(st.requests) + (st.turns ? ` · ${st.turns} ${t.f.turns}` : ''))}
            <Box flexDirection="column" width={fw} paddingRight={1}>
              <Text dimColor>{t.f.launch}</Text>
              {howCell(sel)}
            </Box>
            {field(t.f.project, sel.project + (st.branch && st.branch !== 'HEAD' ? ' · ' + st.branch : ''))}
          </Box>
          <Box flexDirection="column">
            <Text><Text dimColor>{t.tokens}</Text><Text bold>{fmtK(sel.tokIn + sel.tokOut)}</Text></Text>
            {chart(stackBar([
              { v: fresh, color: C.fresh! }, { v: cr, color: C.cache! }, { v: cw, color: C.waiting! }, { v: sel.tokOut, color: fam },
            ]), t.breakdown)}
            {legend([[t.legend.fresh, fresh, C.fresh!], [t.legend.cacheRead, cr, C.cache!], [t.legend.cacheWrite, cw, C.waiting!], [t.legend.out, sel.tokOut, fam], [t.legend.reasoning, st.reasoning, C.muted!]])}
          </Box>
          {st.ctx !== undefined && (
            <Box flexDirection="column">
              <Text>
                <Text dimColor>{t.context}</Text><Text bold>{fmtK(st.ctx)}</Text>
                {ctxShare !== undefined && <Text dimColor>{`${t.of}${fmtK(win)} · `}<Text color={ctxColor(ctxShare)} bold>{Math.round(ctxShare * 100) + '%'}</Text></Text>}
              </Text>
              {ctxShare !== undefined && chart(meter(ctxShare, ctxColor(ctxShare)), t.ctxAlt, ctxShare, ctxColor(ctxShare))}
            </Box>
          )}
          {st.limitPct !== undefined && (
            <Box flexDirection="column">
              <Text><Text dimColor>{t.codexLimit}</Text><Text bold>{Math.round(st.limitPct) + '%'}</Text><Text dimColor>{st.limitWindow === 10080 ? t.weekWindow : st.limitWindow ? t.hWindow(Math.round(st.limitWindow / 60)) : ''}</Text></Text>
              {chart(meter(st.limitPct / 100, ctxColor(st.limitPct / 100)), t.limitAlt, st.limitPct / 100, ctxColor(st.limitPct / 100))}
            </Box>
          )}
          {(st.series?.length ?? 0) > 1 && (
            <Box flexDirection="column">
              <Text dimColor>{t.activityTitle}</Text>
              {chart(sparkline(st.series!, fam), t.activityAlt)}
            </Box>
          )}
          {(st.tools?.length ?? 0) > 0 && (
            <Box flexDirection="column">
              <Text dimColor>{t.tools}</Text>
              <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
                {st.tools!.map(([name, count]) => (
                  <Text key={'tool' + name} backgroundColor={web ? '#8a90a026' : undefined}>{' ' + name.replace(/^mcp__[^_]+(?:_[^_]+)*?__/, '') + ' '}<Text color={fam} bold>{String(count) + ' '}</Text></Text>
                ))}
              </Box>
            </Box>
          )}
          {actions(sel)}
          {view.note && <Text color={C.muted}>{view.note}</Text>}
          {sel.cmd && <Text color={C.muted} wrap="wrap">{sel.cmd}</Text>}
          {sel.rollout && <Text dimColor wrap="truncate-start">{sel.rollout}</Text>}
        </Box>
      )
    })()
    // One block per root agent with everything it launched. Graphical surfaces draw the nesting as one solid
    // rail beside the children; the terminal joins box glyphs. A selected agent's details open after its whole
    // root block, so a tree is never split.
    const rows = (items: Agent[]) => {
      const ids = new Set(items.map(a => a.id))
      const kids = (id?: string) =>
        items
          .filter(c => (id ? c.parentId === id : !c.parentId || !ids.has(c.parentId)))
          .sort((x, y) => (id ? 0 : Number(pinned.has(y.id)) - Number(pinned.has(x.id))) || x.t0 - y.t0)
      const holds = (a: Agent, id?: string): boolean => !!id && (a.id === id || kids(a.id).some(c => holds(c, id)))
      const count = (a: Agent): number => kids(a.id).reduce((n, c) => n + 1 + count(c), 0)
      const node = (a: Agent, fold?: ReturnType<typeof foldBtn>, shut?: boolean): ReturnType<typeof Box> => {
        const ch = shut ? [] : kids(a.id)
        return (
          <Box key={'n' + a.id.slice(-48)} flexDirection="column" width="100%">
            {compact ? card(a, '', '', 0, fold) : row(a, '', fold)}
            {ch.length > 0 && (
              <Box flexDirection="row" width="100%">
                <Box width={2} flexShrink={0} marginLeft={1} flexDirection="row" justifyContent="center">
                  <Box width="12%" backgroundColor={C.rail} />
                </Box>
                <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>{ch.map(c => node(c))}</Box>
              </Box>
            )}
          </Box>
        )
      }
      const flat = web ? [] : ordered(items)
      return kids().flatMap(r => {
        const shut = collapsed.has(r.id)
        const fold = foldBtn(r, count(r))
        return [
          ...(web
            ? [node(r, fold, shut)]
            : flat.filter(x => x.root === r.id && (!shut || x.a === r)).map(({ a, guide, cont, hasKids }) => {
                const open = hasKids && !(shut && a === r)
                const f = a === r ? fold : undefined
                return compact ? card(a, guide, cont + (open ? '│' : ''), guide.length || (open ? 1 : 0), f) : row(a, guide, f)
              })),
          ...(detail && holds(r, selId) && (!shut || selId === r.id) ? [detail] : []),
        ]
      })
    }

    // Counters that filter the list. Running keeps its green circle outside the Button and shows only running agents
    // while pressed, its label on a light green tint;
    // Claude and Codex each switch their family off and on. The name keeps its color outside the Button (a desktop
    // draws a Button's text in its own color); the count is the Button, with a checkbox showing the switch. Off, the
    // name turns gray and the Button dims.
    const family = (f: 'claude' | 'codex', name: string, n: number) => (
      <Box key={'c-' + f} flexDirection="row" alignItems="center" gap={1}>
        <Text color={off.has(f) ? C.muted : C[f]}>{name}</Text>
        <Button key={'cb-' + f} dimColor={off.has(f)} onPress={() => void update($, viewA, v => ({
          ...v, off: off.has(f) ? (v.off ?? []).filter(x => x !== f) : [...(v.off ?? []), f],
        }))}>
          {off.has(f) ? '☐ ' : '☑ '}<Text bold>{String(n)}</Text>
        </Button>
      </Box>
    )
    return (
      <Box flexDirection="column" gap={1}>
        {/* The switches sit on one full-width panel, set apart from the list of sessions under it: a tint on graphical
            surfaces, a rounded frame in the terminal. */}
        <Box key="bar" flexDirection="column" gap={1} width="100%" paddingX={1} paddingY={1}
          backgroundColor={web ? BAR : undefined} borderStyle="round" borderColor={web ? BAR : C.muted}>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {/* The scope is a choice of one, drawn as radio buttons a space apart with the chosen one primary; finished
                agents are a switch, drawn as a checkbox like the Claude and Codex counters, set apart by a rule. */}
            <Box key="scope" flexDirection="row" gap={1}>
              <Button key="s-proj" variant={view.scope === 'proj' ? 'primary' : undefined} onPress={() => void setView({ scope: 'proj' })}>
                {(view.scope === 'proj' ? '◉ ' : '○ ') + t.scope.proj}
              </Button>
              <Button key="s-all" variant={view.scope === 'all' ? 'primary' : undefined} onPress={() => void setView({ scope: 'all' }).then(() => pollAll($))}>
                {(view.scope === 'all' ? '◉ ' : '○ ') + t.scope.all}
              </Button>
            </Box>
            <Box key="rule" alignItems="center"><Text color={C.muted}>│</Text></Box>
            <Button key="f-done" onPress={() => void setView({ showDone: !view.showDone }).then(() => pollAll($))}>
              {(view.showDone ? '☑ ' : '☐ ') + t.finished}
            </Button>
            {hidden.size > 0 && (
              <Button key="f-hidden" onPress={() => void setView({ hidden: [] })}><Text color={C.muted}>⊘</Text>{t.hidden(hidden.size)}</Button>
            )}
          </Box>
          <Box flexDirection="row" gap={1} flexWrap="wrap" paddingX={1}>
            <Box key="c-running" flexDirection="row" alignItems="center">
              <Text color={C.running}>●</Text>
              {/* The tint hugs the Button itself, so it never reaches past what a press lands on. No round border here:
                a desktop draws a border a whole cell wide, which would make this one control taller than its row. */}
            <Box marginLeft={1} backgroundColor={view.runningOnly ? C.running + '40' : undefined}>
                <Button key="cb-running" plain onPress={() => void setView({ runningOnly: !view.runningOnly })}>{t.runningN(running)}</Button>
              </Box>
            </Box>
            {family('claude', 'Claude', list.length - nCodex)}
            {family('codex', 'Codex', nCodex)}
            {/* Token sums by width: in, out and total on a wide pane, the total alone as it narrows, nothing on a
                narrow one rather than a line of its own. */}
            {!compact && (
              <Text>
                {!tight && <Text><Text dimColor>{t.sumIn + ' '}</Text>{fmtK(tokIn) + '  '}<Text dimColor>{t.sumOut + ' '}</Text>{fmtK(tokOut) + '  '}</Text>}
                <Text dimColor>{t.sumTotal + ' '}</Text>{fmtK(tok)}
              </Text>
            )}
          </Box>
        </Box>
        <Box flexDirection="column">
          {!compact && head}
          {shown.length === 0 && <Box paddingX={1}><Text dimColor>{view.scope === 'all' ? t.scanning : t.none}</Text></Box>}
          {view.scope === 'proj'
            ? rows(shown)
            : projects.flatMap(([g, p]) => [
                <Box key={'p' + p} flexDirection="row" gap={1} alignItems="center" paddingX={1} marginTop={1}>
                  <Text color={C.muted} bold>{p}</Text>
                  {groupCubes(shown.filter(a => groupOf(a) === g), p)}
                </Box>,
                ...rows(shown.filter(a => groupOf(a) === g)),
              ])}
        </Box>
      </Box>
    )
  })
}
