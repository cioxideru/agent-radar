export type Agent = {
  id: string
  parentId?: string
  project: string
  title: string
  model: string
  family: 'claude' | 'codex'
  effort?: string
  tokIn: number
  tokOut: number
  t0: number
  t1?: number
  status: string
  how: string
  cmd?: string
  rollout?: string
  open?: { url: string; kind: 'code' | 'work' }
  cwd?: string
  sid?: string
  journal?: string
  live?: boolean
  prompt?: string
  atype?: string
  taskId?: string
  stats?: Stats
}

export type Stats = {
  requests?: number
  turns?: number
  cacheRead?: number
  cacheWrite?: number
  reasoning?: number
  ctx?: number
  ctxWindow?: number
  limitPct?: number
  limitWindow?: number
  branch?: string
  tools?: [string, number][]
  series?: number[]
  lastAt?: number
}

// A background command of this session: a build, a watcher, a wait, or an agent launch (`codex exec`, `claude -p`).
export type Shell = {
  id: string
  cmd: string
  title?: string
  t0: number
  t1?: number
  status: string
  taskId?: string
  // A Monitor watch: it reports no end of its own, so it counts as running until its deadline.
  until?: number
  // What it is, for its mark: an agent launch by family, a Monitor watch, or a plain shell command (absent).
  kind?: 'codex' | 'claude' | 'monitor'
}

export type View = {
  scope: 'proj' | 'all'
  showDone: boolean
  sel?: string
  hidden?: string[]
  pinned?: string[]
  collapsed?: string[]
  // Only running agents instead of all of them.
  runningOnly?: boolean
  // Families switched off in the pane: their agents are left out of the list.
  off?: ('claude' | 'codex')[]
  confirm?: string
  note?: string
  // The background commands section folded (open by default), and the command whose details are open.
  shellsFolded?: boolean
  shellSel?: string
  // Every background command instead of the running ones only (the default).
  shellsAll?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-radar': { agents: Agent[]; others: Agent[]; view: View; tick: number; shells: Shell[] }
  }
}
