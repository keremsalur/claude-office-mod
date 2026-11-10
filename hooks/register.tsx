// Piksel Ofis: the hooks module. It only listens and draws: no model call,
// no row appended to a conversation, no prompt submitted, no text returned
// for a model to read, no slash command to leave a record. Using it costs no
// tokens.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { H, W } from './art'
import type { Theme } from './art'
import { finishedAgent, permissionText, sortTool, succeeded } from './classify'
import type { Fields } from './classify'
import { DEMO, DEMO_LENGTH, DEMO_MODEL } from './demo'
import { renderWorld } from './scene'
import { MAIN, newWorld, reduce } from './sim'
import type { OfficeEvent, ToolKind, Tuning, World } from './sim'

const PANE = 'piksel-ofis'
const TITLE = 'Piksel Ofis'
const ALT = 'Piksel Ofis: ajanların çalışmasını gösteren piksel art bir ofis.'
/** A guess at a cell's width in CSS pixels, to fit the canvas to the pane. */
const CELL_PX = 8
const MAX_ZOOM = 8
/** The width asked for in the wide view, in columns; the app grants what it can. */
const WIDE_COLUMNS = 120
/** A picture is drawn a little ahead: about the time it takes to reach the screen. */
const LATENCY = 40
/** How long a new picture gets to load before it may be the one underneath. */
const SETTLE_MS = 450
/** This long after a new picture the one underneath is let go: the new one has long loaded. */
const REST_MS = SETTLE_MS + 300
/** This long after an event every walk and effect it started is over. */
const QUIET_MS = 10_000
/** Events that come closer together than this are drawn as one picture. */
const BATCH_MS = 200

const SOUND = {
  door: 'sounds/door.wav',
  pass: 'sounds/pass.wav',
  fail: 'sounds/fail.wav',
  alert: 'sounds/alert.wav',
  paper: 'sounds/paper.wav',
} as const

/** How a picture is drawn. Each picture keeps its own, so changing one never redraws another. */
type Look = {
  theme: Theme
  showLabels: boolean
  showBubbles: boolean
  reduceMotion: boolean
  speed: number
  selected: string | null
}

/**
 * The desktop app loads a drawing afresh whenever its source changes, and
 * leaves alone one whose source did not: a single picture redrawn per event
 * blinks. So the pane holds two, the newest over the one before it. The older
 * is the same document as last time and keeps running untouched while the
 * newer loads on top of it, and nothing is ever blank.
 */
type Shot = { world: World; at: number; look: Look }
type View = {
  cur: Shot
  prev: Shot | null
  /** While the demo plays: the session's own office, kept aside and kept up to date. */
  real: World | null
}
/** An event on its way to the office: a real one, or one of the demo's. */
type Mail = { event: OfficeEvent; isDemo: boolean }

type Prefs = {
  /** 0.5 slow, 1 normal, 2 fast. */
  speed: number
  showBubbles: boolean
  showLabels: boolean
  reduceMotion: boolean
  sound: boolean
  theme: Theme
}
type Panel = {
  selected: string | null
  isLogOpen: boolean
  isSettingsOpen: boolean
  isWide: boolean
}

const PREFS: Prefs = { speed: 1, showBubbles: true, showLabels: true, reduceMotion: false, sound: false, theme: 'auto' }
const LOOK: Look = { theme: 'auto', showLabels: true, showBubbles: true, reduceMotion: false, speed: 1, selected: null }

const zoom = atom({ plugin: 'piksel-ofis', key: 'zoom' } as const, 0)
const view = atom(
  { plugin: 'piksel-ofis', key: 'view' } as const,
  { cur: { world: newWorld(0), at: 0, look: LOOK }, prev: null, real: null },
  { shape: 'view-3' },
)
const prefs = atom({ plugin: 'piksel-ofis', key: 'prefs' } as const, PREFS, { shape: 'prefs-1' })
const panel = atom(
  { plugin: 'piksel-ofis', key: 'panel' } as const,
  { selected: null, isLogOpen: false, isSettingsOpen: false, isWide: false },
  { shape: 'panel-1' },
)

function isPrefs(value: unknown): value is Prefs {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>

  return (
    (v.speed === 0.5 || v.speed === 1 || v.speed === 2) &&
    typeof v.showBubbles === 'boolean' &&
    typeof v.showLabels === 'boolean' &&
    typeof v.reduceMotion === 'boolean' &&
    typeof v.sound === 'boolean' &&
    (v.theme === 'auto' || v.theme === 'light' || v.theme === 'dark')
  )
}

/**
 * The newest picture moves underneath only once it has had time to load. What
 * goes underneath is only ever drawn, so it leaves its log and notices behind:
 * the state holds one log, not two.
 */
function below(v: View, now: number): Shot {
  if (now - v.cur.at < SETTLE_MS && v.prev !== null) return v.prev
  const { world, at, look } = v.cur

  return { world: { ...world, log: [], notices: [] }, at, look }
}

const run = (world: World, events: readonly OfficeEvent[], now: number, tune: Tuning): World =>
  events.reduce((acc, ev) => reduce(acc, ev, now, tune), world)

/**
 * The view after a batch of events. While the demo plays, the demo's events
 * are drawn and real ones go to the office kept aside; otherwise real ones are
 * drawn, and a demo event that strays in after the demo is dropped.
 */
function advance(v: View, mail: readonly Mail[], now: number, look: Look, tune: Tuning): View {
  const made = mail.filter(m => m.isDemo).map(m => m.event)
  const real = mail.filter(m => !m.isDemo).map(m => m.event)
  if (v.real !== null) {
    const aside = run(v.real, real, now, tune)
    if (made.length === 0) return { ...v, real: aside }

    return { cur: { world: run(v.cur.world, made, now, tune), at: now, look }, prev: below(v, now), real: aside }
  }
  if (real.length === 0) return v

  return { cur: { world: run(v.cur.world, real, now, tune), at: now, look }, prev: below(v, now), real: null }
}

// A picture's source for a shot never changes: kept, so a redraw that changes
// nothing hands the app the very same documents.
const drawn = new Map<string, string>()

function draw(shot: Shot): string {
  const key = `${shot.at}|${JSON.stringify(shot.look)}|${JSON.stringify({ ...shot.world, log: [], notices: [] })}`
  const known = drawn.get(key)
  if (known !== undefined) return known
  const source = renderWorld(shot.world, shot.at + LATENCY, shot.look)
  if (drawn.size >= 6) drawn.clear()
  drawn.set(key, source)

  return source
}

// Timers and the queue. A reload starts these over, and takes the timers with it.
let demoRun = 0
let demoTimer: Timer | undefined
let quietTimer: Timer | undefined
let restTimer: Timer | undefined
let drainTimer: Timer | undefined
let isDraining = false
/** When the last batch was drawn; long ago, so the first is drawn at once. */
let appliedAt = -BATCH_MS
const waiting: Mail[] = []
/** What is known of each agent that came in, for when it turns up again. */
const known = new Map<string, { model: string; task: string }>()
/** Agents with a permission request on screen. */
const asking = new Set<string>()
/**
 * Whether the pane is open. While it is closed the office is still kept up to
 * date, which costs a fraction of a millisecond an event, but no picture is
 * drawn or retaken and no sound is played.
 */
let isPaneOpen = true

/**
 * Lets the picture underneath go once the one over it has loaded: at rest one
 * picture runs, not two. The one on top is the same document as before, so it
 * is left as it is and only its neighbour goes.
 */
function rest($: EngineInterface): void {
  restTimer?.cancel()
  restTimer = $.clock.after(REST_MS, () => {
    restTimer = undefined
    void update($, view, v => ((v as View).prev === null ? v : { ...(v as View), prev: null })).catch(() => undefined)
  })
}

/** How the next picture is to be drawn, from the settings as they stand. */
async function styleNow($: EngineInterface): Promise<{ look: Look; tune: Tuning; hasSound: boolean }> {
  const chosen = (await read($, prefs)) as Prefs
  const { selected } = await read($, panel)

  return {
    hasSound: chosen.sound,
    tune: { speed: chosen.speed },
    look: {
      theme: chosen.theme,
      showLabels: chosen.showLabels,
      showBubbles: chosen.showBubbles,
      reduceMotion: chosen.reduceMotion,
      speed: chosen.speed,
      selected,
    },
  }
}

/**
 * A picture taken now of the office as it stands: one in which whatever has
 * finished is simply over, so it is right whenever the pane draws it afresh.
 * It is also how a change of settings or of who is picked reaches the screen.
 */
async function retake($: EngineInterface): Promise<void> {
  quietTimer?.cancel()
  quietTimer = undefined
  const { look, tune } = await styleNow($)
  const now = await $.clock.now()
  await update($, view, v => {
    const held = v as View
    const world = reduce(held.cur.world, { type: 'tick' }, now, tune)

    return { cur: { world, at: now, look }, prev: below(held, now), real: held.real }
  })
  rest($)
}

/** Plays a sound effect, now or a little later. A sound that cannot play is skipped. */
function chime($: EngineInterface, name: keyof typeof SOUND, delay: number): void {
  const play = (): void => {
    void $.audio.play({ asset: SOUND[name] }, { gain: 0.6 }).catch(() => undefined)
  }
  if (delay <= 0) play()
  else $.clock.after(delay, play)
}

/** The sounds a batch of events makes: one of each kind at most. */
function soundsOf(mail: readonly Mail[]): Map<keyof typeof SOUND, number> {
  const sounds = new Map<keyof typeof SOUND, number>()
  for (const { event } of mail) {
    if (event.type === 'spawn') sounds.set('door', 0)
    else if (event.type === 'finish') sounds.set('door', 900)
    else if (event.type === 'ask' || event.type === 'permission') sounds.set('alert', 0)
    else if (event.type === 'tool' && event.kind === 'write') sounds.set('paper', 1200)
    else if (event.type === 'done' && event.kind === 'test') sounds.set(event.ok ? 'pass' : 'fail', 1200)
  }

  return sounds
}

/**
 * Applies what is waiting, as one picture, and no more often than every
 * BATCH_MS: a burst of events is one redraw, not one each.
 */
async function drain($: EngineInterface): Promise<void> {
  if (isDraining) return
  isDraining = true
  try {
    while (waiting.length > 0) {
      const now = await $.clock.now()
      if (appliedAt > now) appliedAt = now - BATCH_MS
      const wait = appliedAt + BATCH_MS - now
      if (wait > 0) {
        drainTimer ??= $.clock.after(wait, () => {
          drainTimer = undefined
          void drain($)
        })

        return
      }
      const { look, tune, hasSound } = await styleNow($)
      const batch = waiting.splice(0)
      appliedAt = now
      let isPlaying = false
      await update($, view, v => {
        isPlaying = (v as View).real !== null

        return advance(v as View, batch, now, look, tune)
      })
      rest($)
      if (hasSound && isPaneOpen) {
        // only what is on screen is heard: the demo's while it plays, else the session's
        for (const [name, delay] of soundsOf(batch.filter(m => m.isDemo === isPlaying))) chime($, name, delay)
      }
      quietTimer?.cancel()
      quietTimer = isPaneOpen ? $.clock.after(QUIET_MS, () => void retake($)) : undefined
    }
  } catch {
    // The office is a picture, never a dependency: what cannot be drawn is dropped.
    waiting.length = 0
  } finally {
    isDraining = false
  }
}

/**
 * Hands events to the office and returns at once. Nothing here is awaited by
 * the hook that calls it, and nothing it does can fail that hook.
 */
function post($: EngineInterface, events: readonly OfficeEvent[], isDemo: boolean = false): void {
  for (const event of events) waiting.push({ event, isDemo })
  if (waiting.length > 400) waiting.splice(0, waiting.length - 400)
  if (!isDraining && drainTimer === undefined) void drain($)
}

function stopDemoTimers(): void {
  demoRun++
  demoTimer?.cancel()
  demoTimer = undefined
}

/** Ends the demo: the session's own office, as it now stands, is drawn again. */
async function stopDemo($: EngineInterface): Promise<void> {
  stopDemoTimers()
  const model = await $.session.model()
  const { look, tune } = await styleNow($)
  const now = await $.clock.now()
  await update($, view, v => {
    const held = v as View
    const world = reduce(held.real ?? newWorld(now, model), { type: 'tick' }, now, tune)

    return { cur: { world, at: now, look }, prev: below(held, now), real: null }
  })
  rest($)
}

/** Plays the script of made-up events, each at its own time. */
async function startDemo($: EngineInterface): Promise<void> {
  stopDemoTimers()
  const mine = demoRun
  const { look } = await styleNow($)
  const t0 = await $.clock.now()
  await update($, view, v => {
    const held = v as View

    return {
      cur: { world: newWorld(t0, DEMO_MODEL), at: t0, look: { ...look, selected: null } },
      prev: below(held, t0),
      real: held.real ?? held.cur.world,
    }
  })
  rest($)

  let index = 0
  const step = async (): Promise<void> => {
    if (mine !== demoRun) return
    const elapsed = (await $.clock.now()) - t0
    const due: OfficeEvent[] = []
    for (let s = DEMO[index]; s !== undefined && s.at <= elapsed; s = DEMO[++index]) {
      due.push(s.event)
    }
    post($, due, true)
    const next = DEMO[index]
    demoTimer =
      next === undefined
        ? $.clock.after(Math.max(1, DEMO_LENGTH - elapsed), () => void stopDemo($))
        : $.clock.after(Math.max(1, next.at - elapsed), () => void step())
  }
  demoTimer = $.clock.after(DEMO[0]?.at ?? 1, () => void step())
}

/** Opens the pane on the person's ask, with a picture taken at that moment. */
async function openPane($: EngineInterface, isWide: boolean): Promise<void> {
  await $.ui.open(isWide ? { id: PANE, title: TITLE, columns: WIDE_COLUMNS } : { id: PANE, title: TITLE })
  isPaneOpen = true
  $.ui.invalidate('ui.render')
  await retake($)
}

/** Changes a setting, keeps it for later sessions, and takes a picture with it. */
async function choose($: EngineInterface, change: Partial<Prefs>): Promise<void> {
  let chosen = PREFS
  await update($, prefs, p => {
    chosen = { ...(p as Prefs), ...change }

    return chosen
  })
  void $.store.set('prefs', chosen).catch(() => undefined)
  await retake($)
}

async function resize($: EngineInterface, to: number): Promise<void> {
  // A new size loads both pictures afresh, so they are retaken first.
  await retake($)
  await update($, zoom, () => to)
  void $.store.set('zoom', to).catch(() => undefined)
}

/** Picks a character out, or lets it go when it is picked already. */
async function pick($: EngineInterface, id: string): Promise<void> {
  await update($, panel, s => ({ ...s, selected: s.selected === id ? null : id }))
  await retake($)
}

/** Brings the conversation of whoever is waiting into view. */
async function goTo($: EngineInterface, actor: string): Promise<void> {
  const moved = await $.ui.view(actor === MAIN ? {} : { agentId: actor })
  if (moved.deny !== undefined) $.ui.toast(`Sohbete geçilemedi: ${moved.deny}`)
}

function clockOf(at: number): string {
  const d = new Date(at)
  const two = (n: number): string => String(n).padStart(2, '0')

  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void $.ui.open({ id: PANE, title: TITLE })
    isPaneOpen = true

    // A reload keeps the office but not the demo's timers: a demo cut short
    // would leave its people standing there for good.
    stopDemoTimers()
    try {
      const saved = await $.store.get('prefs')
      if (isPrefs(saved)) await update($, prefs, () => saved)
      const level = await $.store.get('zoom')
      if (typeof level === 'number' && Number.isInteger(level) && level >= 0 && level <= MAX_ZOOM) {
        await update($, zoom, () => level)
      }
    } catch {
      // settings that cannot be read are the defaults
    }
    if (((await read($, view)) as View).real !== null) await stopDemo($)
    post($, [{ type: 'session', model: await $.session.model() }])

    return next(e)
  })

  // ---- what the office listens to. Each hook hands the call on unchanged and
  // returns exactly what came back: nothing is added for a model to read.

  on('tool.call', async ($, e, next) => {
    const id = e.agentId ?? MAIN
    const key = e.tool_use_id
    let kind: ToolKind | undefined
    let hasAsked = false
    try {
      const sorted = sortTool(String(e.tool), e as unknown as Fields)
      const who = known.get(id)
      const first: OfficeEvent[] = who === undefined ? [] : [{ type: 'spawn', id, ...who }]
      if (sorted.as === 'tool') {
        kind = sorted.kind
        post($, [...first, { type: 'tool', id, key, kind, label: sorted.label, path: sorted.path }])
      } else if (sorted.as === 'ask') {
        hasAsked = true
        post($, [...first, { type: 'ask', id, key, text: sorted.text }])
      }
    } catch {
      // the picture misses this call; the call itself goes on
    }

    const after = (ran: Fields | undefined): void => {
      try {
        const events: OfficeEvent[] = []
        if (asking.delete(id)) events.push({ type: 'resolved', id, key: `perm:${id}` })
        if (hasAsked) events.push({ type: 'resolved', id, key })
        if (kind !== undefined) events.push({ type: 'done', id, key, kind, ok: ran !== undefined && succeeded(ran) })
        const ended = ran === undefined ? undefined : finishedAgent(ran)
        if (ended !== undefined) events.push({ type: 'finish', id: ended })
        if (events.length > 0) post($, events)
      } catch {
        // as above
      }
    }

    try {
      const ran = await next(e)
      after(ran as unknown as Fields)

      return ran
    } catch (error) {
      after(undefined)
      throw error
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    try {
      if (started.deny === undefined && started.agentId !== undefined) {
        const who = { model: started.model, task: e.description }
        known.set(started.agentId, who)
        if (known.size > 200) known.delete(known.keys().next().value ?? '')
        post($, [{ type: 'spawn', id: started.agentId, ...who }])
      }
    } catch {
      // as above
    }

    return started
  })

  on('classic.SubagentStop', ($, e, next) => {
    try {
      post($, [{ type: 'finish', id: e.agent_id }])
    } catch {
      // as above
    }

    return next(e)
  })

  on('classic.PermissionRequest', ($, e, next) => {
    try {
      const id = e.agent_id ?? MAIN
      asking.add(id)
      const input = typeof e.tool_input === 'object' && e.tool_input !== null ? (e.tool_input as Fields) : {}
      post($, [{ type: 'permission', id, key: `perm:${id}`, text: permissionText(e.tool_name, input) }])
    } catch {
      // as above
    }

    return next(e)
  })

  on('session.send', ($, e, next) => {
    try {
      post($, [{ type: 'message', from: e.agentId ?? MAIN, to: e.to, text: e.text }])
    } catch {
      // as above
    }

    return next(e)
  })

  on('classic.PostModelSwitch', ($, e, next) => {
    try {
      post($, [{ type: 'session', model: e.to_model }])
    } catch {
      // as above
    }

    return next(e)
  })

  on('session.end', ($, e, next) => {
    stopDemoTimers()
    quietTimer?.cancel()
    restTimer?.cancel()
    drainTimer?.cancel()
    quietTimer = undefined
    restTimer = undefined
    drainTimer = undefined
    waiting.length = 0

    return next(e)
  })

  // ---- the pane, and the way back to it

  // When the person closes the pane, the band above the prompt offers it again.
  on('ui.close', async ($, e, next) => {
    const closed = await next(e)
    if (e.id === PANE) {
      isPaneOpen = false
      quietTimer?.cancel()
      quietTimer = undefined
      $.ui.invalidate('ui.render')
    }

    return closed
  })

  // A button, not a slash command: a command typed into the prompt leaves a
  // record in the conversation, and a press leaves none.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)
    if (e.props.hasSurvey) return beneath
    const panes = await $.ui.panes()
    if (panes.some(p => p.id === PANE)) return beneath
    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {beneath}
        <Box>
          <Button key="piksel-ofis-open" plain label="▸ Piksel Ofis" onPress={() => openPane($, false)} />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const level = await read($, zoom)
    const shown = (await read($, view)) as View
    const chosen = (await read($, prefs)) as Prefs
    const state = (await read($, panel)) as Panel
    const isDemo = shown.real !== null
    const office = shown.cur.world
    const last = office.log[office.log.length - 1]
    const line = last === undefined ? 'Henüz olay yok.' : `${last.who}: ${last.text}`
    const picked = office.actors.find(a => a.id === state.selected)

    const { Box, Button, Text } = $.ui.resolve(e)
    const fit = Math.floor((e.props.bodyColumns * CELL_PX) / W)
    const scale = Math.max(1, Math.min(MAX_ZOOM, level === 0 || state.isWide ? fit : level))

    let picture
    if (e.surface === 'terminal') {
      picture = (
        <Box flexDirection="column">
          <Text bold>{TITLE}</Text>
          <Text dimColor>Piksel görünümü masaüstü uygulamasında çizilir.</Text>
          {office.actors.map(a => {
            const did = a.recent[a.recent.length - 1]

            return <Text>{`${a.name}: ${did === undefined ? 'boşta' : did.text}`}</Text>
          })}
        </Box>
      )
    } else {
      const { Svg } = $.ui.resolve(e)
      const frame = (shot: Shot) => (
        <Svg source={draw(shot)} alt={ALT} width={W * scale} height={H * scale} isInteractive />
      )
      picture =
        shown.prev === null ? (
          <Box flexDirection="column">
            <Box>{frame(shown.cur)}</Box>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Box>{frame(shown.prev)}</Box>
            <Box position="absolute">{frame(shown.cur)}</Box>
          </Box>
        )
    }

    const notices = office.notices.map(n => (
      <Box gap={1}>
        <Text color="warning">
          {n.kind === 'ask' ? '! Soru bekliyor: ' : '! İzin bekliyor: '}
          {n.text}
        </Text>
        <Button key={`go-${n.key}`} plain label="Sohbete git" onPress={() => goTo($, n.actor)} />
      </Box>
    ))

    // The wide view: the office and nothing beside it.
    if (state.isWide) {
      return (
        <Box flexDirection="column" gap={1}>
          {picture}
          {notices}
          <Box gap={1}>
            <Button
              key="wide"
              label="Küçült"
              onPress={async () => {
                await update($, panel, s => ({ ...s, isWide: false }))
                await openPane($, false)
              }}
            />
          </Box>
        </Box>
      )
    }

    const flip = (key: keyof Panel & ('isLogOpen' | 'isSettingsOpen')): Promise<unknown> =>
      update($, panel, s => ({ ...s, [key]: !s[key] }))
    const onOff = (key: 'showBubbles' | 'showLabels' | 'reduceMotion' | 'sound', label: string) => (
      <Box gap={1}>
        <Text>{label}</Text>
        <Button
          key={`set-${key}`}
          label={chosen[key] ? 'Açık' : 'Kapalı'}
          variant={chosen[key] ? 'primary' : 'secondary'}
          onPress={() => choose($, { [key]: !chosen[key] })}
        />
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {picture}
        {notices}
        <Text dimColor wrap="truncate-end">
          {line}
        </Text>
        <Box gap={1} flexWrap="wrap">
          {office.actors.map(a => (
            <Button
              key={`who-${a.id}`}
              label={a.name}
              variant={a.id === state.selected ? 'primary' : 'secondary'}
              onPress={() => pick($, a.id)}
            />
          ))}
        </Box>
        {picked !== undefined && (
          <Box flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold>{picked.name}</Text>
            <Text>{`Model: ${picked.model === '' ? 'bilinmiyor' : picked.model}`}</Text>
            <Text>{`Görev: ${picked.task === '' ? 'belirtilmedi' : picked.task}`}</Text>
            <Text dimColor>Son işlemler</Text>
            {picked.recent.length === 0 && <Text>· henüz yok</Text>}
            {[...picked.recent].reverse().map(r => (
              <Text>{`· ${r.text}`}</Text>
            ))}
            <Text dimColor>Son dokunduğu dosyalar</Text>
            {picked.files.length === 0 && <Text>· henüz yok</Text>}
            {picked.files.map(f => (
              <Text wrap="truncate-start">{`· ${f}`}</Text>
            ))}
          </Box>
        )}
        <Box gap={1} flexWrap="wrap">
          <Button
            key="demo"
            label={isDemo ? 'Demoyu durdur' : 'Demo'}
            onPress={() => (isDemo ? stopDemo($) : startDemo($))}
          />
          <Button key="zoom-out" label="−" onPress={() => resize($, Math.max(1, scale - 1))} />
          <Text dimColor>{scale}×</Text>
          <Button key="zoom-in" label="+" onPress={() => resize($, Math.min(MAX_ZOOM, scale + 1))} />
          <Button key="zoom-fit" label="Sığdır" onPress={() => resize($, 0)} />
          <Button
            key="wide"
            label="Büyüt"
            onPress={async () => {
              await update($, panel, s => ({ ...s, isWide: true }))
              await openPane($, true)
            }}
          />
          <Button
            key="log"
            label={state.isLogOpen ? 'Günlüğü kapat' : 'Günlük'}
            onPress={() => flip('isLogOpen')}
          />
          <Button
            key="settings"
            label={state.isSettingsOpen ? 'Ayarları kapat' : 'Ayarlar'}
            onPress={() => flip('isSettingsOpen')}
          />
        </Box>
        {state.isSettingsOpen && (
          <Box flexDirection="column">
            <Box gap={1}>
              <Text>Animasyon hızı</Text>
              {([0.5, 1, 2] as const).map(speed => (
                <Button
                  key={`speed-${speed}`}
                  label={speed === 0.5 ? 'Yavaş' : speed === 1 ? 'Normal' : 'Hızlı'}
                  variant={chosen.speed === speed ? 'primary' : 'secondary'}
                  onPress={() => choose($, { speed })}
                />
              ))}
            </Box>
            {onOff('showBubbles', 'Konuşma balonları')}
            {onOff('showLabels', 'Dosya adı etiketleri')}
            {onOff('reduceMotion', 'Hareketi azalt')}
            {onOff('sound', 'Ses efektleri')}
            <Box gap={1}>
              <Text>Tema</Text>
              {(['auto', 'light', 'dark'] as const).map(theme => (
                <Button
                  key={`theme-${theme}`}
                  label={theme === 'auto' ? 'Otomatik' : theme === 'light' ? 'Açık' : 'Koyu'}
                  variant={chosen.theme === theme ? 'primary' : 'secondary'}
                  onPress={() => choose($, { theme })}
                />
              ))}
            </Box>
          </Box>
        )}
        {state.isLogOpen && (
          <Box flexDirection="column">
            <Text dimColor>{`Günlük: son ${office.log.length} olay, en yenisi üstte`}</Text>
            {[...office.log].reverse().map(entry => (
              <Text>{`${clockOf(entry.at)}  ${entry.who}: ${entry.text}`}</Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
