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
}

declare module 'claude-code' {
  interface PluginState {
    'agent-radar': { agents: Agent[]; others: Agent[]; view: View; tick: number }
  }
}
