// The test scenario: the demo's script, which fires every kind of event at
// least once, replayed through the simulation and drawn every quarter second.
import { expect, test } from 'claude-code/testing'

import { DEMO, DEMO_LENGTH, DEMO_MODEL } from '../hooks/demo'
import { renderWorld } from '../hooks/scene'
import { LOG_LIMIT, MAIN, MAX_LAG, at, newWorld, positionAt, reduce } from '../hooks/sim'
import type { OfficeEvent, World } from '../hooks/sim'

const T0 = 1_700_000_000_000
const VIEW = { theme: 'light', showLabels: true, showBubbles: true, reduceMotion: false } as const
const SVG_LIMIT = 131072

function marksOf(svg: string): Set<string> {
  const marks = new Set<string>()
  for (const m of svg.matchAll(/class="([^"]*)"/g)) {
    for (const name of (m[1] ?? '').split(' ')) marks.add(name)
  }
  return marks
}

test('the demo fires every kind of event, and each one is drawn', async () => {
  const kinds = new Set<string>()
  const tools = new Set<string>()
  for (const step of DEMO) {
    kinds.add(step.event.type)
    if (step.event.type === 'tool') tools.add(step.event.kind)
  }
  for (const kind of ['spawn', 'finish', 'tool', 'done', 'message', 'ask', 'permission', 'resolved']) {
    expect(kinds.has(kind), `the script has no ${kind} event`).toBe(true)
  }
  for (const tool of ['read', 'edit', 'write', 'test', 'bash', 'web', 'work']) {
    expect(tools.has(tool), `the script has no ${tool} tool`).toBe(true)
  }

  const seen = new Set<string>()
  let biggest = 0
  let most = 0
  let world = newWorld(T0, DEMO_MODEL)
  let next = 0
  for (let t = 0; t <= DEMO_LENGTH; t += 250) {
    for (let s = DEMO[next]; s !== undefined && s.at <= t; s = DEMO[++next]) {
      world = reduce(world, s.event, T0 + s.at)
    }
    const svg = renderWorld(world, T0 + t, VIEW)
    biggest = Math.max(biggest, svg.length)
    most = Math.max(most, world.actors.length)
    for (const mark of marksOf(svg)) seen.add(mark)
  }

  const expected = [
    // a pose for each activity
    'a-read', 'a-edit', 'a-bash', 'a-work', 'a-write', 'a-test', 'a-web', 'a-ask', 'a-permission', 'a-delegate',
    // what the room shows: monitors, test tubes, door, shelf
    'scr-edit', 'scr-bash', 'scr-work', 'bubbles', 'door-open', 'new-book',
    // results and marks
    'fx-plus', 'fx-check', 'fx-fail', 'bub', 'bang', 'm-read', 'm-permission',
    // one character per model, and the plain one
    'k-opus', 'k-fable', 'k-sonnet', 'k-haiku', 'k-other',
  ]
  for (const mark of expected) expect(seen.has(mark), `never drawn: ${mark}`).toBe(true)

  expect(biggest).toBeLessThan(SVG_LIMIT)
  expect(most).toBe(6)
  // everyone who came in has left by the door; the lead is back at its desk
  expect(world.actors.map(a => a.id)).toEqual([MAIN])
  expect(positionAt(world.actors[0]!, T0 + DEMO_LENGTH)).toEqual({ x: at('leadSeat').x, y: at('leadSeat').y })
})

test('a burst of events never leaves the picture more than two seconds behind', async () => {
  const kinds = ['read', 'edit', 'write', 'test', 'web', 'bash'] as const
  let world = newWorld(T0, DEMO_MODEL)
  for (let i = 0; i < 40; i++) {
    const now = T0 + 1000 + i * 60
    const event: OfficeEvent = { type: 'tool', id: MAIN, key: `k${i}`, kind: kinds[i % kinds.length]!, label: `f${i}.ts` }
    world = reduce(world, event, now)
    const lead = world.actors[0]!
    const newest = lead.stints[lead.stints.length - 1]!
    expect(newest.key).toBe(`k${i}`)
    expect(newest.arrive - newest.eventAt).toBeLessThanOrEqual(MAX_LAG)
    // the plan runs forward in time, on straight legs joined end to end
    let clock = 0
    for (const s of lead.stints) {
      for (const leg of s.legs) {
        expect(leg.t0).toBeGreaterThanOrEqual(clock)
        expect(leg.t1).toBeGreaterThanOrEqual(leg.t0)
        expect(leg.x0 === leg.x1 || leg.y0 === leg.y1).toBe(true)
        clock = leg.t1
      }
      expect(s.arrive).toBeGreaterThanOrEqual(clock)
      clock = s.arrive
    }
    // wherever it is, it is on the pixel grid
    const p = positionAt(lead, now + 137)
    expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true)
  }
})

test('the log keeps only the last 200 events', async () => {
  let world = newWorld(T0, DEMO_MODEL)
  for (let i = 0; i < 450; i++) {
    world = reduce(world, { type: 'tool', id: MAIN, key: `k${i}`, kind: 'read', label: `f${i}.ts` }, T0 + i * 10)
  }
  expect(world.log.length).toBe(LOG_LIMIT)
  expect(world.log[world.log.length - 1]?.text).toBe('okuyor · f449.ts')
})

test('agents of one model are told apart, and an unknown model is the plain one', async () => {
  let world = newWorld(T0, 'claude-fable-5')
  world = reduce(world, { type: 'spawn', id: 'a', model: 'claude-opus-5', task: 'bir' }, T0 + 100)
  world = reduce(world, { type: 'spawn', id: 'b', model: 'opus', task: 'iki' }, T0 + 200)
  world = reduce(world, { type: 'spawn', id: 'c', model: 'baska-bir-model', task: 'üç' }, T0 + 300)
  const [lead, a, b, c] = world.actors
  expect(lead?.kind).toBe('fable')
  expect(lead?.isLeader).toBe(true)
  expect([a?.name, a?.variant]).toEqual(['Opus', 0])
  expect([b?.name, b?.variant]).toEqual(['Opus 2', 1])
  expect(c?.kind).toBe('other')
  expect(new Set([a?.home, b?.home, c?.home]).size).toBe(3)
})

test('an agent comes in by the door and leaves by it', async () => {
  let world = newWorld(T0, DEMO_MODEL)
  world = reduce(world, { type: 'spawn', id: 'a', model: 'claude-haiku-5', task: 'tara' }, T0)
  expect(world.door.length).toBe(1)
  expect(positionAt(world.actors[1]!, T0 + 300)).toEqual({ x: at('doorIn').x, y: at('doorIn').y })

  world = reduce(world, { type: 'finish', id: 'a' }, T0 + 5000)
  const gone = world.actors[1]!.goneAt!
  expect(gone).toBeGreaterThan(T0 + 5000)
  expect(gone - (T0 + 5000)).toBeLessThanOrEqual(MAX_LAG + 200)
  expect(world.door.some(d => d.from < gone && d.until > gone)).toBe(true)
  expect(positionAt(world.actors[1]!, gone)).toEqual({ x: at('doorIn').x, y: at('doorIn').y })

  world = reduce(world, { type: 'session', model: DEMO_MODEL }, gone + 1)
  expect(world.actors.map(a => a.id)).toEqual([MAIN])
})

test('a test result, a question and a new file each leave their trace', async () => {
  let world: World = newWorld(T0, DEMO_MODEL)
  const books = world.books.filter(b => b !== null).length

  world = reduce(world, { type: 'tool', id: MAIN, key: 't', kind: 'test', label: 'npm test' }, T0)
  world = reduce(world, { type: 'done', id: MAIN, key: 't', kind: 'test', ok: false }, T0 + 100)
  expect(world.effects.map(e => e.kind)).toEqual(['fail'])
  world = reduce(world, { type: 'tool', id: MAIN, key: 'u', kind: 'test', label: 'npm test' }, T0 + 4000)
  world = reduce(world, { type: 'done', id: MAIN, key: 'u', kind: 'test', ok: true }, T0 + 4100)
  expect(world.effects.map(e => e.kind)).toContain('check')

  world = reduce(world, { type: 'ask', id: MAIN, key: 'q', text: 'Hangisi?' }, T0 + 9000)
  expect(world.notices.map(n => n.kind)).toEqual(['ask'])
  world = reduce(world, { type: 'resolved', id: MAIN, key: 'q' }, T0 + 9500)
  expect(world.notices).toEqual([])

  world = reduce(world, { type: 'tool', id: MAIN, key: 'w', kind: 'write', label: 'yeni.ts', path: 'src/yeni.ts' }, T0 + 12000)
  world = reduce(world, { type: 'session', model: DEMO_MODEL }, T0 + 20000)
  expect(world.books.filter(b => b !== null).length).toBe(books + 1)
})

test('a full office still fits one drawing', async () => {
  let world = newWorld(T0, DEMO_MODEL)
  const kinds = ['read', 'edit', 'write', 'test', 'web', 'bash', 'work'] as const
  const models = ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-5', 'claude-fable-5', 'x']
  for (let i = 0; i < 13; i++) {
    world = reduce(world, { type: 'spawn', id: `a${i}`, model: models[i % models.length]!, task: `görev ${i}` }, T0 + i * 50)
  }
  for (let i = 0; i < 13; i++) {
    world = reduce(
      world,
      { type: 'tool', id: `a${i}`, key: `k${i}`, kind: kinds[i % kinds.length]!, label: 'uzun-bir-dosya-adi.ts', path: `src/d${i}/uzun-bir-dosya-adi.ts` },
      T0 + 3000 + i * 40,
    )
    world = reduce(world, { type: 'message', from: `a${i}`, to: MAIN, text: 'Bu oldukça uzun bir mesaj metni, kısaltılmalı.' }, T0 + 3600 + i * 40)
  }
  expect(world.actors.length).toBe(14)
  for (const view of [VIEW, { ...VIEW, theme: 'auto' } as const, { ...VIEW, reduceMotion: true }]) {
    expect(renderWorld(world, T0 + 4500, view).length).toBeLessThan(SVG_LIMIT)
  }
})
