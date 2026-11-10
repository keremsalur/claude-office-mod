// Piksel Ofis: the office as data. Events go in, a plan of who walks where
// and does what comes out, every time in it absolute, so a drawing made at
// any moment shows the same office. Pure: no `$`, no clock of its own.

import { DESKS, LAB, LEADER_DESK, PRINTER, SHELF, folderColor, kindOf, starterBooks } from './art'
import type { ColorName, ModelKind } from './art'

export type Pt = { x: number; y: number }

// ---------------------------------------------------------------- floor plan

type NodeDef = Pt & {
  /** The row from which furniture is drawn over the legs of whoever is here. */
  cover?: number
}

const seat = (i: number): NodeDef => {
  const d = DESKS[i] ?? DESKS[0]
  return { x: d.x + 8, y: d.y + 11, cover: d.y + 8 }
}

/** Every point a character can stand on or turn at. */
export const NODES: Record<string, NodeDef> = {
  TL: { x: 57, y: 40 },
  TR: { x: 167, y: 40 },
  ML: { x: 57, y: 70 },
  MR: { x: 167, y: 70 },
  BL: { x: 57, y: 101 },
  BR: { x: 167, y: 101 },
  doorIn: { x: 167, y: 31 },
  shelf0: { x: 27, y: 40 },
  shelf1: { x: 15, y: 40 },
  shelf2: { x: 39, y: 40 },
  win0: { x: 94, y: 40 },
  win1: { x: 78, y: 40 },
  win2: { x: 111, y: 40 },
  d0: { x: 70, y: 40 },
  d1: { x: 103, y: 40 },
  d2: { x: 136, y: 40 },
  d3: { x: 70, y: 70 },
  d4: { x: 103, y: 70 },
  d5: { x: 136, y: 70 },
  seat0: seat(0),
  seat1: seat(1),
  seat2: seat(2),
  seat3: seat(3),
  seat4: seat(4),
  seat5: seat(5),
  leadA: { x: 57, y: 97 },
  leadB: { x: LEADER_DESK.x + 8, y: 97 },
  leadSeat: { x: LEADER_DESK.x + 8, y: LEADER_DESK.y + 11, cover: LEADER_DESK.y + 8 },
  prA: { x: PRINTER.x - 7, y: 101 },
  printer: { x: PRINTER.x - 7, y: 126 },
  labA: { x: LAB.x + 8, y: 101 },
  lab0: { x: LAB.x + 8, y: LAB.y + 3, cover: LAB.y },
  labB: { x: LAB.x + 22, y: 101 },
  lab1: { x: LAB.x + 22, y: LAB.y + 3, cover: LAB.y },
  st0a: { x: 167, y: 68 },
  st0: { x: 175, y: 68 },
  st1a: { x: 167, y: 92 },
  st1: { x: 175, y: 92 },
  fsA: { x: 62, y: 101 },
  fs0: { x: 62, y: 114 },
  fs2: { x: 62, y: 127 },
  fsB: { x: 127, y: 101 },
  fs1: { x: 127, y: 114 },
  fs3: { x: 127, y: 127 },
}

/** Straight lines of walkable floor: neighbours along one are joined. */
const LINES: readonly (readonly string[])[] = [
  ['shelf1', 'shelf0', 'shelf2', 'TL', 'd0', 'win1', 'win0', 'd1', 'win2', 'd2', 'TR'],
  ['ML', 'd3', 'd4', 'd5', 'MR'],
  ['BL', 'fsA', 'prA', 'fsB', 'labA', 'labB', 'BR'],
  ['TL', 'ML', 'leadA', 'BL'],
  ['doorIn', 'TR', 'st0a', 'MR', 'st1a', 'BR'],
  ['d0', 'seat0'],
  ['d1', 'seat1'],
  ['d2', 'seat2'],
  ['d3', 'seat3'],
  ['d4', 'seat4'],
  ['d5', 'seat5'],
  ['leadA', 'leadB', 'leadSeat'],
  ['prA', 'printer'],
  ['labA', 'lab0'],
  ['labB', 'lab1'],
  ['st0a', 'st0'],
  ['st1a', 'st1'],
  ['fsA', 'fs0', 'fs2'],
  ['fsB', 'fs1', 'fs3'],
]

const HOMES = ['seat0', 'seat1', 'seat2', 'seat3', 'seat4', 'seat5', 'st0', 'st1', 'fs0', 'fs1', 'fs2', 'fs3'] as const
const STATIONS = {
  read: ['shelf0', 'shelf1', 'shelf2'],
  web: ['win0', 'win1', 'win2'],
  write: ['printer', 'fs0'],
  test: ['lab0', 'lab1'],
} as const

export function at(node: string): NodeDef {
  return NODES[node] ?? { x: 167, y: 40 }
}

function gap(a: string, b: string): number {
  const p = at(a)
  const q = at(b)
  return Math.abs(p.x - q.x) + Math.abs(p.y - q.y)
}

const NEIGHBOURS: Map<string, string[]> = (() => {
  const map = new Map<string, string[]>()
  const join = (a: string, b: string): void => {
    const list = map.get(a)
    if (list === undefined) map.set(a, [b])
    else if (!list.includes(b)) list.push(b)
  }
  for (const line of LINES) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]
      const b = line[i]
      if (a === undefined || b === undefined) continue
      join(a, b)
      join(b, a)
    }
  }
  return map
})()

/** The shortest walk between two nodes, both named in the answer. */
export function route(from: string, to: string): string[] {
  if (from === to) return [from]
  const cost = new Map<string, number>([[from, 0]])
  const via = new Map<string, string>()
  const open = new Set<string>([from])
  while (open.size > 0) {
    let best: string | undefined
    for (const n of open) {
      if (best === undefined || (cost.get(n) ?? Infinity) < (cost.get(best) ?? Infinity)) best = n
    }
    if (best === undefined || best === to) break
    open.delete(best)
    for (const n of NEIGHBOURS.get(best) ?? []) {
      const next = (cost.get(best) ?? 0) + gap(best, n)
      if (next < (cost.get(n) ?? Infinity)) {
        cost.set(n, next)
        via.set(n, best)
        open.add(n)
      }
    }
  }
  const path = [to]
  for (let n = via.get(to); n !== undefined; n = via.get(n)) path.unshift(n)
  return path[0] === from ? path : [from, to]
}

function lengthOf(path: readonly string[]): number {
  let sum = 0
  for (let i = 1; i < path.length; i++) sum += gap(path[i - 1] ?? '', path[i] ?? '')
  return sum
}

// ---------------------------------------------------------------- the world

export type ActKind =
  | 'idle'
  | 'read'
  | 'edit'
  | 'bash'
  | 'work'
  | 'write'
  | 'test'
  | 'web'
  | 'ask'
  | 'permission'
  | 'delegate'
  | 'leave'

/** One straight walk along an edge of the floor plan, a to b. */
export type Leg = {
  t0: number
  t1: number
  x0: number
  y0: number
  x1: number
  y1: number
  a: string
  b: string
}

/** One thing a character does: walk to a place, then be busy there. */
export type Stint = {
  act: ActKind
  /** The short text shown beside the character: a file's name, a command. */
  label: string
  tint: ColorName | null
  place: string
  legs: Leg[]
  /** When the character is there; the walk before it is `legs`. */
  arrive: number
  /** When the event behind it really happened. */
  eventAt: number
  /** When the busy pose ends and the character just stands there; null: not yet. */
  doneAt: number | null
  /** Not before this time, for a walk home planned ahead. */
  notBefore: number
  /** True for a walk back home: dropped as soon as real work comes. */
  isAuto: boolean
  /** The tool call or question it stands for. */
  key: string
}

export type ActorState = {
  id: string
  kind: ModelKind
  variant: number
  isLeader: boolean
  name: string
  model: string
  task: string
  home: string
  /** Never empty; the first that has begun and not been followed is in force. */
  stints: Stint[]
  bornAt: number
  goneAt: number | null
  recent: { at: number; text: string }[]
  files: string[]
  /** When the office last heard of it. */
  seenAt: number
  /** True for someone who was never announced: it turned up by doing something. */
  isGuest: boolean
}

export type Bubble = { actor: string; text: string; full: string; at: number; until: number }
export type Effect = { kind: 'plus' | 'check' | 'fail'; x: number; y: number; at: number; until: number }
export type Notice = { actor: string; key: string; kind: 'ask' | 'permission'; text: string; at: number }
export type LogEntry = { at: number; who: string; text: string }

export type World = {
  v: 1
  actors: ActorState[]
  books: (ColorName | null)[]
  newBooks: { slot: number; color: ColorName; at: number }[]
  door: { from: number; until: number }[]
  bubbles: Bubble[]
  effects: Effect[]
  notices: Notice[]
  log: LogEntry[]
  /** How many books were ever added: where the next goes once the shelf is full. */
  written: number
}

export type ToolKind = 'read' | 'edit' | 'write' | 'test' | 'bash' | 'web' | 'work'

/** What the office hears about. `id` is an agent's id, `main` for the lead. */
export type OfficeEvent =
  | { type: 'reset'; model: string }
  /** Nothing happened: only what is over is cleared away. */
  | { type: 'tick' }
  | { type: 'session'; model: string }
  | { type: 'spawn'; id: string; model: string; task: string }
  | { type: 'finish'; id: string }
  | { type: 'tool'; id: string; key: string; kind: ToolKind; label: string; path?: string }
  | { type: 'done'; id: string; key: string; kind: ToolKind; ok: boolean }
  | { type: 'message'; from: string; to: string; text: string }
  | { type: 'ask'; id: string; key: string; text: string }
  | { type: 'permission'; id: string; key: string; text: string }
  | { type: 'resolved'; id: string; key: string }

export const MAIN = 'main'
export const LOG_LIMIT = 200
/** No animation starts later than this after the event it shows. */
export const MAX_LAG = 2000

export type Tuning = {
  /** 1 is the normal pace; 2 walks and works twice as fast. */
  speed: number
}

const PACE = {
  msPerPixel: 22,
  haikuMsPerPixel: 13,
  maxWalk: 1400,
  minWalk: 220,
  /** How long a pose is held before the next walk may begin. */
  minHold: 700,
  /** How long a tool's pose shows even when the tool was instant. */
  minShow: 1500,
  homeAfter: 3500,
  bubble: 4500,
  effect: 2600,
  point: 2600,
  /** An unannounced guest nobody has heard from for this long is shown out. */
  guestIdle: 300_000,
} as const

const KIND_NAME: Record<ModelKind, string> = {
  opus: 'Opus',
  fable: 'Fable',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  other: 'Ajan',
}

export function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(1, max - 1))}…`
}

function stand(place: string, now: number): Stint {
  return {
    act: 'idle', label: '', tint: null, place, legs: [], arrive: now, eventAt: now,
    doneAt: null, notBefore: 0, isAuto: false, key: '',
  }
}

function leaderOf(model: string, now: number): ActorState {
  const kind = kindOf(model)
  return {
    id: MAIN, kind, variant: 0, isLeader: true, name: `Lider (${KIND_NAME[kind]})`, model,
    task: 'Ana ajan', home: 'leadSeat', stints: [stand('leadSeat', now)], bornAt: now,
    goneAt: null, recent: [], files: [], seenAt: now, isGuest: false,
  }
}

export function newWorld(now: number, model: string = ''): World {
  return {
    v: 1, actors: [leaderOf(model, now)], books: starterBooks(), newBooks: [], door: [],
    bubbles: [], effects: [], notices: [], log: [], written: 0,
  }
}

// ---------------------------------------------------------------- time

export function departOf(s: Stint): number {
  return s.legs[0]?.t0 ?? s.arrive
}

/** The index of the stint in force at `now`: the last that has set out. */
export function inForce(a: ActorState, now: number): number {
  let index = 0
  for (let i = 0; i < a.stints.length; i++) {
    const s = a.stints[i]
    if (s !== undefined && departOf(s) <= now) index = i
  }
  return index
}

function alongLeg(leg: Leg, now: number): Pt {
  const steps = Math.abs(leg.x1 - leg.x0) + Math.abs(leg.y1 - leg.y0)
  const span = leg.t1 - leg.t0
  const part = span <= 0 ? 1 : Math.min(1, Math.max(0, (now - leg.t0) / span))
  const done = Math.min(steps, Math.floor(part * steps))
  return {
    x: leg.x0 + Math.sign(leg.x1 - leg.x0) * done,
    y: leg.y0 + Math.sign(leg.y1 - leg.y0) * done,
  }
}

function legAt(s: Stint, now: number): Leg | undefined {
  for (const leg of s.legs) if (now < leg.t1) return leg
  return undefined
}

/** Where a character's feet are at `now`, on the pixel grid. */
export function positionAt(a: ActorState, now: number): Pt {
  const s = a.stints[inForce(a, now)]
  const leg = s === undefined || now >= s.arrive ? undefined : legAt(s, now)
  if (leg === undefined) {
    const node = at(s === undefined ? a.home : s.place)
    return { x: node.x, y: node.y }
  }
  return now <= leg.t0 ? { x: leg.x0, y: leg.y0 } : alongLeg(leg, now)
}

// ---------------------------------------------------------------- planning

type Pending = Omit<Stint, 'legs' | 'arrive'>

function pendingOf(s: Stint): Pending {
  const { legs: _legs, arrive: _arrive, ...rest } = s
  return rest
}

function walkTime(a: ActorState, pixels: number, tune: Tuning): number {
  if (pixels === 0) return 0
  const per = a.kind === 'haiku' ? PACE.haikuMsPerPixel : PACE.msPerPixel
  return Math.round(Math.min(PACE.maxWalk, Math.max(PACE.minWalk, pixels * per)) / tune.speed)
}

/** Legs along `path`, the time shared out by length; `first` is a part edge. */
function legsOf(path: readonly string[], t0: number, span: number, first?: { from: Pt; a: string; b: string }): Leg[] {
  type Raw = { from: Pt; to: Pt; a: string; b: string; size: number }
  const raw: Raw[] = []
  if (first !== undefined) {
    const to = at(path[0] ?? first.b)
    raw.push({ from: first.from, to, a: first.a, b: first.b, size: Math.abs(to.x - first.from.x) + Math.abs(to.y - first.from.y) })
  }
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] ?? ''
    const b = path[i] ?? ''
    raw.push({ from: at(a), to: at(b), a, b, size: gap(a, b) })
  }
  const walked = raw.filter(r => r.size > 0)
  const total = walked.reduce((sum, r) => sum + r.size, 0)
  const legs: Leg[] = []
  let t = t0
  let covered = 0
  for (const r of walked) {
    covered += r.size
    const t1 = Math.round(t0 + (span * covered) / total)
    legs.push({ t0: t, t1, x0: r.from.x, y0: r.from.y, x1: r.to.x, y1: r.to.y, a: r.a, b: r.b })
    t = t1
  }
  return legs
}

/**
 * Lays the queue out after the stint in force. When that would leave the
 * newest later than MAX_LAG behind its event, the oldest waiting ones go, and
 * with one left the character sets out at once from wherever it is.
 */
function schedule(a: ActorState, add: Pending | null, now: number, tune: Tuning): void {
  const index = inForce(a, now)
  const base = a.stints[index]
  if (base === undefined) return
  let queue: Pending[] = a.stints
    .slice(index + 1)
    .filter(s => !(s.isAuto && add !== null))
    .map(pendingOf)
  if (add !== null) queue.push(add)
  if (queue.length === 0) {
    a.stints = [base]
    return
  }

  const hold = PACE.minHold / tune.speed
  const layOut = (isUrgent: boolean): Stint[] => {
    const planned: Stint[] = []
    let node = base.place
    let time = isUrgent ? now : Math.max(now, base.arrive + hold)
    let part: { from: Pt; a: string; b: string } | undefined
    if (isUrgent && now < base.arrive) {
      // mid-walk: turn round on this edge, to whichever end is nearer the goal
      const leg = legAt(base, now)
      const first = queue[0]
      if (leg !== undefined && first !== undefined) {
        const here = now <= leg.t0 ? { x: leg.x0, y: leg.y0 } : alongLeg(leg, now)
        const viaA = Math.abs(here.x - at(leg.a).x) + Math.abs(here.y - at(leg.a).y) + lengthOf(route(leg.a, first.place))
        const viaB = Math.abs(here.x - at(leg.b).x) + Math.abs(here.y - at(leg.b).y) + lengthOf(route(leg.b, first.place))
        node = viaA < viaB ? leg.a : leg.b
        part = { from: here, a: leg.a, b: leg.b }
      }
    }
    for (const q of queue) {
      const path = route(node, q.place)
      const extra = part === undefined ? 0 : Math.abs(part.from.x - at(node).x) + Math.abs(part.from.y - at(node).y)
      const depart = Math.max(time, q.notBefore)
      let span = walkTime(a, lengthOf(path) + extra, tune)
      if (isUrgent && !q.isAuto) span = Math.min(span, Math.max(PACE.minWalk / tune.speed, q.eventAt + MAX_LAG - depart))
      const legs = span === 0 ? [] : legsOf(path, depart, span, part)
      planned.push({ ...q, legs, arrive: depart + span })
      node = q.place
      time = depart + span + hold
      part = undefined
    }
    return planned
  }

  for (;;) {
    const planned = layOut(false)
    const last = planned[planned.length - 1]
    if (last === undefined || last.isAuto || last.arrive - last.eventAt <= MAX_LAG) {
      a.stints = [base, ...planned]
      return
    }
    if (queue.length > 1) {
      queue = queue.slice(1)
      continue
    }
    const urgent = layOut(true)
    a.stints = now < base.arrive ? urgent : [base, ...urgent]
    return
  }
}

// ---------------------------------------------------------------- upkeep

/** Drops what is over: past stints, people who left, effects that ended. */
function settle(w: World, now: number): void {
  w.actors = w.actors.filter(a => a.goneAt === null || a.goneAt > now)
  for (const a of w.actors) {
    const index = inForce(a, now)
    a.stints = a.stints.slice(index)
    const s = a.stints[0]
    if (s === undefined) a.stints = [stand(a.home, now)]
    else if (now >= s.arrive) s.legs = []
    else s.legs = s.legs.filter(leg => leg.t1 > now)
  }
  for (const b of w.newBooks) if (b.at <= now) w.books[b.slot] = b.color
  w.newBooks = w.newBooks.filter(b => b.at > now)
  w.door = w.door.filter(d => d.until > now)
  w.bubbles = w.bubbles.filter(b => b.until > now)
  w.effects = w.effects.filter(e => e.until > now)
  w.notices = w.notices.filter(n => w.actors.some(a => a.id === n.actor))
}

function note(w: World, a: ActorState | undefined, text: string, now: number): void {
  const line = clip(text, 120)
  w.log.push({ at: now, who: a?.name ?? 'Ofis', text: line })
  if (w.log.length > LOG_LIMIT) w.log = w.log.slice(-LOG_LIMIT)
  if (a !== undefined) a.recent = [...a.recent, { at: now, text: line }].slice(-5)
}

/** A balloon over a character from `from`; whatever it was saying ends there. */
function say(w: World, actor: string, text: string, from: number): void {
  for (const b of w.bubbles) if (b.actor === actor) b.until = Math.min(b.until, from)
  w.bubbles = w.bubbles.filter(b => b.until > b.at)
  w.bubbles.push({ actor, text: clip(text, 22), full: text, at: from, until: from + PACE.bubble })
}

function freeOf(w: World, spots: readonly string[], except: string): string {
  const taken = new Set<string>()
  for (const a of w.actors) {
    if (a.id === except) continue
    const last = a.stints[a.stints.length - 1]
    if (last !== undefined) taken.add(last.place)
  }
  return spots.find(s => !taken.has(s)) ?? spots[0] ?? 'TL'
}

function enter(w: World, id: string, model: string, task: string, now: number, tune: Tuning): ActorState {
  const kind = kindOf(model)
  const same = w.actors.filter(a => a.kind === kind).length
  const homes = new Set(w.actors.map(a => a.home))
  const home = HOMES.find(h => !homes.has(h)) ?? HOMES[w.actors.length % HOMES.length] ?? 'st0'
  const appear = now + Math.round(250 / tune.speed)
  const a: ActorState = {
    id, kind, variant: same, isLeader: false,
    name: same === 0 ? KIND_NAME[kind] : `${KIND_NAME[kind]} ${same + 1}`,
    model, task, home, stints: [stand('doorIn', appear)], bornAt: appear, goneAt: null,
    recent: [], files: [], seenAt: now, isGuest: false,
  }
  w.actors.push(a)
  schedule(a, { ...pendingOf(stand(home, now)), notBefore: appear + Math.round(150 / tune.speed) }, now, tune)
  const settled = a.stints[a.stints.length - 1]?.arrive ?? appear
  w.door.push({ from: now, until: Math.min(settled, appear + 1200 / tune.speed) })
  return a
}

function whoIs(w: World, id: string, now: number, tune: Tuning): ActorState {
  const known = w.actors.find(a => a.id === id)
  if (known !== undefined) {
    known.seenAt = now
    return known
  }
  if (id === MAIN) return adopt(w, now)
  const guest = enter(w, id, '', '', now, tune)
  guest.isGuest = true
  return guest
}

/** Walks someone to the door and out. */
function showOut(w: World, a: ActorState, now: number, tune: Tuning): void {
  const s = begin(a, { act: 'leave', place: 'doorIn', key: `leave:${a.id}` }, now, tune)
  const out = s?.arrive ?? now
  a.goneAt = out + Math.round(150 / tune.speed)
  w.door.push({ from: out - Math.round(600 / tune.speed), until: out + Math.round(700 / tune.speed) })
  w.notices = w.notices.filter(n => n.actor !== a.id)
}

function adopt(w: World, now: number): ActorState {
  const lead = leaderOf('', now)
  w.actors.unshift(lead)
  return lead
}

const VERB: Record<ToolKind, string> = {
  read: 'okuyor',
  edit: 'düzenliyor',
  write: 'yeni dosya',
  test: 'test çalıştırıyor',
  bash: 'komut',
  web: 'web',
  work: 'çalışıyor',
}

/** Where the last thing planned for a character leaves it standing. */
function restingPlace(a: ActorState): string {
  for (let i = a.stints.length - 1; i >= 0; i--) {
    const s = a.stints[i]
    if (s !== undefined && !s.isAuto) return s.place
  }
  return a.home
}

function begin(a: ActorState, part: Partial<Stint> & { act: ActKind; place: string }, now: number, tune: Tuning): Stint | undefined {
  schedule(a, { ...pendingOf(stand(part.place, now)), ...part, eventAt: now }, now, tune)
  return part.key === undefined || part.key === '' ? a.stints[a.stints.length - 1] : a.stints.find(s => s.key === part.key)
}

// ---------------------------------------------------------------- reduce

/** The office after one event at `now`. The world given is not changed. */
export function reduce(world: World, ev: OfficeEvent, now: number, tune: Tuning = { speed: 1 }): World {
  if (ev.type === 'reset') return newWorld(now, ev.model)

  const w = JSON.parse(JSON.stringify(world)) as World
  settle(w, now)

  switch (ev.type) {
    case 'tick':
      break
    case 'session': {
      const lead = whoIs(w, MAIN, now, tune)
      lead.model = ev.model
      lead.kind = kindOf(ev.model)
      lead.name = `Lider (${KIND_NAME[lead.kind]})`
      break
    }
    case 'spawn': {
      const here = w.actors.find(a => a.id === ev.id)
      if (here !== undefined) {
        here.seenAt = now
        break
      }
      const lead = w.actors.find(a => a.isLeader)
      const a = enter(w, ev.id, ev.model, ev.task, now, tune)
      note(w, a, `içeri girdi · ${ev.task}`, now)
      if (lead !== undefined) {
        const s = begin(lead, { act: 'delegate', place: lead.home, key: `spawn:${ev.id}` }, now, tune)
        if (s !== undefined) {
          s.doneAt = s.arrive + Math.round(PACE.point / tune.speed)
          say(w, lead.id, ev.task, s.arrive)
        }
      }
      break
    }
    case 'finish': {
      const a = w.actors.find(one => one.id === ev.id)
      if (a === undefined || a.isLeader || a.goneAt !== null) break
      showOut(w, a, now, tune)
      note(w, a, 'işini bitirdi, çıktı', now)
      break
    }
    case 'tool': {
      const a = whoIs(w, ev.id, now, tune)
      const stations: Partial<Record<ToolKind, readonly string[]>> = STATIONS
      const spots = stations[ev.kind]
      const place = spots === undefined ? a.home : freeOf(w, spots, a.id)
      const tint = ev.path !== undefined ? folderColor(ev.path) : ev.kind === 'test' ? 'green' : null
      const s = begin(a, { act: ev.kind, place, label: clip(ev.label, 18), tint, key: ev.key }, now, tune)
      if (ev.path !== undefined) a.files = [ev.path, ...a.files.filter(f => f !== ev.path)].slice(0, 5)
      if (ev.kind === 'write' && s !== undefined) {
        const free = w.books.findIndex((b, i) => b === null && !w.newBooks.some(n => n.slot === i))
        const slot = free >= 0 ? free : w.written % SHELF.slots
        w.written++
        w.newBooks.push({ slot, color: tint ?? 'red', at: s.arrive + Math.round(900 / tune.speed) })
        const p = at('printer')
        w.effects.push({ kind: 'plus', x: p.x + 18, y: PRINTER.y - 11, at: s.arrive + 150, until: s.arrive + 150 + PACE.effect })
      }
      note(w, a, `${VERB[ev.kind]} · ${ev.label}`, now)
      break
    }
    case 'done': {
      const a = w.actors.find(one => one.id === ev.id)
      const s = a?.stints.find(one => one.key === ev.key)
      const shown = s === undefined ? now : Math.max(now, s.arrive + Math.round(PACE.minShow / tune.speed))
      if (s !== undefined) s.doneAt = shown
      if (ev.kind === 'test') {
        w.effects.push({ kind: ev.ok ? 'check' : 'fail', x: LAB.x + 30, y: LAB.y - 22, at: shown, until: shown + PACE.effect })
        note(w, a, ev.ok ? 'test geçti' : 'test başarısız', now)
      } else if (!ev.ok) {
        note(w, a, `başarısız · ${s?.label ?? VERB[ev.kind]}`, now)
      }
      // after a while with nothing to do, back home
      if (a !== undefined && s !== undefined && a.stints[a.stints.length - 1] === s && s.place !== a.home && a.goneAt === null) {
        const back = shown + Math.round(PACE.homeAfter / tune.speed)
        schedule(a, { ...pendingOf(stand(a.home, back)), notBefore: back, isAuto: true }, now, tune)
      }
      break
    }
    case 'message': {
      const from = whoIs(w, ev.from, now, tune)
      const to = w.actors.find(a => a.id === ev.to)
      say(w, from.id, ev.text, now)
      note(w, from, `→ ${to?.name ?? ev.to}: ${ev.text}`, now)
      break
    }
    case 'ask':
    case 'permission': {
      const a = whoIs(w, ev.id, now, tune)
      if (w.notices.some(n => n.key === ev.key)) break
      const s = begin(a, { act: ev.type, place: restingPlace(a), label: ev.type === 'permission' ? clip(ev.text, 18) : '', key: ev.key }, now, tune)
      w.notices = [...w.notices.filter(n => n.key !== ev.key), { actor: a.id, key: ev.key, kind: ev.type, text: clip(ev.text, 160), at: now }]
      if (ev.type === 'ask' && s !== undefined) say(w, a.id, ev.text, s.arrive)
      note(w, a, ev.type === 'ask' ? `soru soruyor: ${ev.text}` : `izin bekliyor: ${ev.text}`, now)
      break
    }
    case 'resolved': {
      const a = w.actors.find(one => one.id === ev.id)
      const s = a?.stints.find(one => one.key === ev.key)
      const notice = w.notices.find(n => n.key === ev.key)
      if (s !== undefined) s.doneAt = Math.max(now, s.arrive + Math.round(400 / tune.speed))
      w.notices = w.notices.filter(n => n.key !== ev.key)
      if (notice !== undefined) note(w, a, notice.kind === 'ask' ? 'yanıt aldı' : 'izin sonuçlandı', now)
      break
    }
  }
  for (const a of w.actors) {
    if (a.isGuest && a.goneAt === null && now - a.seenAt > PACE.guestIdle) showOut(w, a, now, tune)
  }
  return w
}
