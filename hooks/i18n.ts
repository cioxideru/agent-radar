// Every text the pane shows, per language. The plugin option `language` picks one (English by default).
const en = {
  sec: 's', min: 'm', hour: 'h', day: 'd', ago: ' ago',
  agent: 'Agent ', mainSession: 'Main session', claudeSession: 'Claude Code session',
  autoReview: 'Auto-review', codexReview: 'Codex · review', codexSub: 'Codex · subagent', bg: 'bg',
  statusLine: (n: number, tok: string) => `Agents: ${n} running · ${tok} tok.`,
  cmdDescription: 'Agents pane: Claude subagents and the Codex runs they launch',
  opened: 'Agent Radar opened.',
  pinnedGroup: '★ Pinned',
  head: { task: 'TASK', model: 'MODEL', effort: 'EFFORT', effortShort: 'EF', tokens: 'TOKENS', tokensShort: 'TKNS', ctx: 'CTX', time: 'TIME', how: 'LAUNCH' },
  status: { running: 'running', waiting: 'waiting', idle: 'inactive', pending: 'queued', completed: 'done', failed: 'failed', killed: 'stopped' } as Record<string, string>,
  failed: 'Failed: ', cannotRun: 'Could not run ', denied: 'Denied: ', copied: (w: string) => w + ' copied', noClipboard: 'Clipboard unavailable',
  chatOpened: 'Chat opened in Claude Desktop', compactSkipped: 'Compact skipped: ', compacted: 'Context compacted', compactFailed: 'Compact failed: ',
  handedOff: 'New session opened with the handoff', stopped: 'Stopped', confirmStop: 'Press again to stop',
  askStatus: 'Briefly: what are you doing now and how much is left?', asked: 'Question sent', restarted: 'Started again',
  inTerminal: 'Session opened in Terminal', folderOpened: 'Folder opened', logShown: 'Journal shown',
  launchWhat: 'Command', idWhat: 'ID', messageSent: 'Message sent', messagePlaceholder: 'Message to the agent…', send: 'Send',
  btn: { chat: 'Chat', compact: 'Compact', handoff: 'Handoff', stop: 'Stop', sure: 'Sure?', status: 'Status', again: 'Restart', cli: 'CLI', folder: 'Folder', logs: 'Logs', cmd: 'Command', id: 'ID', pin: 'Pin', unpin: 'Unpin', hide: 'Hide' },
  f: { model: 'Model', effort: 'Effort', running: 'Running', activity: 'Activity', requests: 'Requests', turns: 'turns', launch: 'Launch', project: 'Project' },
  tokens: 'Tokens ', breakdown: 'token breakdown',
  legend: { fresh: 'new input', cacheRead: 'from cache', cacheWrite: 'to cache', out: 'output', reasoning: 'reasoning' },
  context: 'Context ', of: ' of ', ctxAlt: 'context fill',
  codexLimit: 'Codex limit ', weekWindow: ' of the weekly window', hWindow: (h: number) => ` of a ${h}h window`, limitAlt: 'Codex limit',
  activityTitle: 'Activity · output tokens over time', activityAlt: 'activity chart', tools: 'Tools',
  scope: { proj: 'This project', all: 'All' }, finished: 'Finished', sumIn: 'In', sumOut: 'Out', sumTotal: 'Total', hidden: (n: number) => ` Hidden ${n}`,
  runningN: (n: number) => `${n} Work`, scanning: 'Scanning journals…', none: 'No agents yet.',
  moreRows: (n: number) => `${n} more finished, older ones not drawn`,
  handoffPrompt: (title: string, journal: string) =>
    `Continue the work from the session "${title}". Its journal: ${journal}\nRead the end of the journal, recover the task, what is done and what is left, summarize briefly and carry on.`,
}

export type Strings = typeof en

const ru: Strings = {
  sec: 'с', min: 'м', hour: 'ч', day: 'д', ago: ' назад',
  agent: 'Агент ', mainSession: 'Основная сессия', claudeSession: 'сессия Claude Code',
  autoReview: 'Авто-ревью', codexReview: 'Codex · ревью', codexSub: 'Codex · субагент', bg: 'фон',
  statusLine: (n, tok) => `Агенты: ${n} работают · ${tok} ток.`,
  cmdDescription: 'Панель агентов: Claude-субагенты и запущенные ими Codex',
  opened: 'Agent Radar открыт.',
  pinnedGroup: '★ Закреплено',
  head: { task: 'ЗАДАЧА', model: 'МОДЕЛЬ', effort: 'УСИЛИЕ', effortShort: 'УС', tokens: 'ТОКЕНЫ', tokensShort: 'ТОК.', ctx: 'КОНТ.', time: 'ВРЕМЯ', how: 'ЗАПУСК' },
  status: { running: 'работает', waiting: 'ждёт', idle: 'неактивна', pending: 'в очереди', completed: 'завершён', failed: 'ошибка', killed: 'остановлен' },
  failed: 'Не получилось: ', cannotRun: 'Не получилось запустить ', denied: 'Отказано: ', copied: w => w + ' скопирован', noClipboard: 'Буфер обмена недоступен',
  chatOpened: 'Чат открыт в Claude Desktop', compactSkipped: 'Compact пропущен: ', compacted: 'Контекст сжат', compactFailed: 'Compact не удался: ',
  handedOff: 'Открыта новая сессия с передачей работы', stopped: 'Остановлен', confirmStop: 'Нажмите ещё раз, чтобы остановить',
  askStatus: 'Коротко: что сейчас делаешь и сколько осталось?', asked: 'Вопрос отправлен', restarted: 'Запущен заново',
  inTerminal: 'Сессия открыта в Terminal', folderOpened: 'Папка открыта', logShown: 'Журнал показан',
  launchWhat: 'Запуск', idWhat: 'ID', messageSent: 'Сообщение отправлено', messagePlaceholder: 'Сообщение агенту…', send: 'Отправить',
  btn: { chat: 'Чат', compact: 'Сжать', handoff: 'Передать', stop: 'Стоп', sure: 'Точно?', status: 'Статус', again: 'Заново', cli: 'CLI', folder: 'Папка', logs: 'Logs', cmd: 'Команда', id: 'ID', pin: 'Закрепить', unpin: 'Открепить', hide: 'Скрыть' },
  f: { model: 'Модель', effort: 'Усилие', running: 'Работает', activity: 'Активность', requests: 'Запросы', turns: 'ход.', launch: 'Запуск', project: 'Проект' },
  tokens: 'Токены ', breakdown: 'разбивка токенов',
  legend: { fresh: 'новый вход', cacheRead: 'из кэша', cacheWrite: 'в кэш', out: 'выход', reasoning: 'рассуждения' },
  context: 'Контекст ', of: ' из ', ctxAlt: 'заполнение контекста',
  codexLimit: 'Лимит Codex ', weekWindow: ' недельного окна', hWindow: h => ` окна ${h}ч`, limitAlt: 'лимит Codex',
  activityTitle: 'Активность · выходные токены по времени', activityAlt: 'график активности', tools: 'Инструменты',
  scope: { proj: 'Этот проект', all: 'Все' }, finished: 'Завершённые', sumIn: 'Вход', sumOut: 'Выход', sumTotal: 'Всего', hidden: n => ` Скрытые ${n}`,
  runningN: n => `${n} в работе`, scanning: 'Сканирую журналы…', none: 'Агентов пока нет.',
  moreRows: n => `Ещё ${n} завершённых, старые не показаны`,
  handoffPrompt: (title, journal) =>
    `Продолжи работу из сессии «${title}». Её журнал: ${journal}\nПрочитай конец журнала, восстанови задачу, что сделано и что осталось, коротко перескажи и продолжай.`,
}

export const STRINGS = { en, ru }
export type Lang = keyof typeof STRINGS
