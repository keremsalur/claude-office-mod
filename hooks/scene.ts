// Piksel Ofis: the office drawn as one animated SVG. Every motion is a CSS
// animation with a start time relative to the moment of drawing, a negative
// delay for what has already begun, so a drawing made at any moment picks the
// office up exactly where it is. Nothing here redraws on a timer.

import {
  DESKS, H, LAB, LEADER_DESK, TUBES, W,
  buildOf, copyRegion, drawArms, drawBang, drawBlink, drawBody, drawBook, drawCheck,
  drawCodeScreen, drawCross, drawGlobe, drawLaptop, drawLegs, drawOpenDoor, drawPlus,
  drawSmoke, drawStatic, drawTermScreen, encode, makeLayer, paint, put, rect, screenOf, themeCss,
} from './art'
import type { ArmPose, Layer, Theme } from './art'
import { at, departOf, inForce, positionAt } from './sim'
import type { ActKind, ActorState, Stint, World } from './sim'

export type ViewOptions = {
  /**
   * Whole CSS pixels per canvas pixel, written on the document as its size.
   * Left out, the document has no size of its own and fills what frames it:
   * the pane sizes its frame, so a zoom never changes the document.
   */
  scale?: number
  theme: Theme
  showLabels: boolean
  showBubbles: boolean
  /** No loops and no walking: people stand, and jump when they arrive. */
  reduceMotion: boolean
  /** How fast the loops run: 1 is the normal pace. Left out, 1. */
  speed?: number
  /** The id of the character picked out in the pane: it gets a mark over its head. */
  selected?: string | null
  /** Freezes every animation at the moment drawn: a still, for looking at. */
  isStill?: boolean
  /** 1 leaves out the cards shown on hover, 2 the labels and balloons as well. */
  lean?: 0 | 1 | 2
}

type Span = readonly [number, number | null]

/** Nothing in a picture changes more often than this: thirty times a second. */
export const FRAME_MS = 34
/** A picture past this size is drawn again with less on it; the app refuses one past 131072. */
const BUDGET = 118_000
const FONT = 4.5
const GLYPH = 2.7
const FONT_FAMILY = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
/** A sprite is drawn on its own small sheet, the feet at this point of it. */
const OX = 20
const OY = 40

const POSE: Partial<Record<ActKind, ArmPose>> = {
  read: 'book',
  edit: 'type',
  bash: 'type',
  work: 'type',
  write: 'paper',
  test: 'tube',
  web: 'binoculars',
  ask: 'raise',
  permission: 'card',
  delegate: 'point',
}

/** How long one loop of a pose's two frames takes; 0 for a pose that is still. */
const BEAT: Record<ArmPose, number> = {
  down: 0, type: 260, book: 900, paper: 0, binoculars: 800, raise: 560, card: 0, point: 640, tube: 520,
}

function escapeXml(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** The stylesheet being built: rules by generated class, keyframes once each. */
class Sheet {
  private readonly rules: string[] = []
  private readonly made = new Map<string, string>()
  private count = 0

  readonly now: number
  readonly isReduced: boolean
  readonly speed: number

  constructor(now: number, isReduced: boolean, speed: number) {
    this.now = now
    this.isReduced = isReduced
    this.speed = speed > 0 ? speed : 1
  }

  /** A rule written as given, for what a generated class cannot say. */
  raw(text: string): void {
    this.rules.push(text)
  }

  rule(body: string): string {
    const known = this.made.get(body)
    if (known !== undefined) return known
    const name = `r${this.count++}`
    this.rules.push(`.${name}{${body}}`)
    this.made.set(body, name)
    return name
  }

  keyframes(body: string): string {
    const known = this.made.get(`@${body}`)
    if (known !== undefined) return known
    const name = `k${this.count++}`
    this.rules.push(`@keyframes ${name}{${body}}`)
    this.made.set(`@${body}`, name)
    return name
  }

  /**
   * A class that shows an element during the spans only: '' when it is simply
   * always shown, null when every span is already over (draw nothing).
   */
  during(spans: readonly Span[], how: 'visibility' | 'opacity' = 'visibility'): string | null {
    const live = spans.filter(([from, until]) => until === null || (until > this.now && until > from))
    if (live.length === 0) return null
    if (live.length === 1 && live[0] !== undefined && live[0][0] <= this.now && live[0][1] === null) return ''
    const on = how === 'visibility' ? 'von' : 'oon'
    const off = how === 'visibility' ? 'voff' : 'ooff'
    const parts: string[] = []
    for (const [from, until] of live) {
      parts.push(`${on} 1ms linear ${Math.round(from - this.now) - 1}ms forwards`)
      if (until !== null) parts.push(`${off} 1ms linear ${Math.round(until - this.now) - 1}ms forwards`)
    }
    return this.rule(`${how === 'visibility' ? 'visibility:hidden' : 'opacity:0'};animation:${parts.join(',')}`)
  }

  /** The reverse: shown except during the spans. */
  except(spans: readonly Span[]): string {
    const live = spans.filter(([from, until]) => until === null || (until > this.now && until > from))
    if (live.length === 0) return ''
    const parts: string[] = []
    for (const [from, until] of live) {
      parts.push(`voff 1ms linear ${Math.round(from - this.now) - 1}ms forwards`)
      if (until !== null) parts.push(`von 1ms linear ${Math.round(until - this.now) - 1}ms forwards`)
    }
    return this.rule(`animation:${parts.join(',')}`)
  }

  /** The class of frame `index` of a loop of `count` frames, `period` ms round. */
  frame(index: number, count: number, beat: number): string {
    const shown = index === 0 ? 1 : 0
    const period = Math.max(FRAME_MS * count, Math.round(beat / this.speed))
    if (this.isReduced || beat <= 0 || count < 2) return this.rule(`opacity:${shown}`)
    const from = (index / count) * 100
    const to = ((index + 1) / count) * 100
    const name = this.keyframes(
      `0%{opacity:${shown}}` + (index > 0 ? `${from}%{opacity:1}` : '') + (index < count - 1 ? `${to}%{opacity:0}` : ''),
    )
    const phase = Math.round(this.now % period)
    return this.rule(`opacity:${shown};animation:${name} ${period}ms step-end -${phase}ms infinite`)
  }

  css(): string {
    return (
      '@keyframes von{to{visibility:visible}}@keyframes voff{to{visibility:hidden}}' +
      '@keyframes oon{to{opacity:1}}@keyframes ooff{to{opacity:0}}' +
      `text{font:${FONT}px ${FONT_FAMILY}}` +
      // a card or a balloon's whole text: shown while pointed at, or after a click
      '.tip,.full{visibility:hidden}.who,.say{outline:none}' +
      '.say:hover .full,.say:focus .full{visibility:visible}' +
      this.rules.join('')
    )
  }
}

function group(cls: string | null, inner: string, extra: string = ''): string {
  if (cls === null || inner === '') return ''
  const names = [cls, extra].filter(n => n !== '').join(' ')
  return names === '' ? `<g>${inner}</g>` : `<g class="${names}">${inner}</g>`
}

// ---------------------------------------------------------------- still parts

let cache: { key: string; layer: Layer; svg: string } | undefined

function staticPart(world: World, theme: Theme): { layer: Layer; svg: string } {
  const key = `${theme}|${world.books.join(',')}`
  if (cache === undefined || cache.key !== key) {
    const layer = drawStatic(world.books)
    cache = { key, layer, svg: encode(layer) }
  }
  return cache
}

function sprite(theme: Theme, draw: (l: Layer) => void): string {
  const l = makeLayer(OX * 2, OY + 4)
  draw(l)
  return encode(l, -OX, -OY)
}

function canvas(theme: Theme, draw: (l: Layer) => void): string {
  const l = makeLayer()
  draw(l)
  return encode(l)
}

function screenFor(place: string): { x: number; y: number } | null {
  if (place === 'leadSeat') return screenOf(LEADER_DESK.x, LEADER_DESK.y, 35)
  const match = /^seat(\d)$/.exec(place)
  const desk = match === null ? undefined : DESKS[Number(match[1])]
  return desk === undefined ? null : screenOf(desk.x, desk.y)
}

// ---------------------------------------------------------------- text

function pill(text: string, x: number, y: number, theme: Theme): string {
  const width = text.length * GLYPH
  return (
    `<rect x="${x}" y="${y}" width="${width + 3}" height="6.5" rx="1" opacity=".86" ${paint('ink')}/>` +
    `<text x="${x + 1.5}" y="${y + 4.8}" textLength="${width.toFixed(1)}" ${paint('paper')}>${escapeXml(text)}</text>`
  )
}

function balloon(text: string, x: number, y: number, tailX: number, theme: Theme): string {
  const width = text.length * GLYPH + 4
  return (
    `<rect x="${x - 1}" y="${y - 1}" width="${width + 2}" height="9" ${paint('ink')}/>` +
    `<rect x="${x}" y="${y}" width="${width}" height="7" ${paint('paper')}/>` +
    `<rect x="${tailX - 1}" y="${y + 8}" width="3" height="1" ${paint('ink')}/>` +
    `<rect x="${tailX}" y="${y + 9}" width="1" height="1" ${paint('ink')}/>` +
    `<rect x="${tailX}" y="${y + 7}" width="1" height="1" ${paint('paper')}/>` +
    `<text x="${x + 2}" y="${y + 5.2}" textLength="${(width - 4).toFixed(1)}" ${paint('ink')}>${escapeXml(text)}</text>`
  )
}

/** A small card of text lines: a tooltip, or a balloon's whole text. */
function card(lines: readonly string[], x: number, y: number, theme: Theme): string {
  const width = Math.max(...lines.map(l => l.length)) * GLYPH + 4
  const height = lines.length * 6 + 2
  let out =
    `<rect x="${x - 1}" y="${y - 1}" width="${width + 2}" height="${height + 2}" ${paint('ink')}/>` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${paint('paper')}/>`
  lines.forEach((line, i) => {
    out += `<text x="${x + 2}" y="${(y + 5.2 + i * 6).toFixed(1)}" textLength="${(line.length * GLYPH).toFixed(1)}" ${paint('ink')}>${escapeXml(line)}</text>`
  })
  return out
}

function cardSize(lines: readonly string[]): { width: number; height: number } {
  return { width: Math.max(...lines.map(l => l.length)) * GLYPH + 6, height: lines.length * 6 + 4 }
}

/** Breaks text into lines of at most `width` characters, `most` lines at most. */
export function wrap(text: string, width: number, most: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    let rest = word
    while (rest.length > width) {
      if (line !== '') lines.push(line)
      lines.push(rest.slice(0, width))
      rest = rest.slice(width)
      line = ''
    }
    if (line === '') line = rest
    else if (line.length + 1 + rest.length <= width) line += ` ${rest}`
    else {
      lines.push(line)
      line = rest
    }
  }
  if (line !== '') lines.push(line)
  if (lines.length <= most) return lines
  const kept = lines.slice(0, most)
  const last = kept[most - 1] ?? ''
  kept[most - 1] = `${last.slice(0, Math.max(1, width - 1))}…`
  return kept
}

function shorten(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value))
}

// ---------------------------------------------------------------- one actor

type Drawn = {
  /** Sort key: who stands lower is drawn later, in front. */
  depth: number
  /** Screens, sheets: what belongs under every character. */
  under: string
  body: string
  /** Labels, balloons, marks: over every character. */
  over: string
}

function holdEnd(stints: readonly Stint[], index: number): number | null {
  const next = stints[index + 1]
  return next === undefined ? null : departOf(next)
}

function drawActor(a: ActorState, index: number, world: World, now: number, o: ViewOptions, sheet: Sheet, still: Layer): Drawn {
  const theme = o.theme
  const stints = a.stints.slice(inForce(a, now))
  const here = positionAt(a, now)
  const seed = [...a.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0)

  // --- movement: one keyframe list for the whole plan. A walk is a row of
  // moments, never closer together than a frame, at each of which the feet
  // are on a whole pixel of the path; between two of them nothing moves.
  type Knot = { t: number; x: number; y: number }
  const knots: Knot[] = [{ t: now, x: here.x, y: here.y }]
  const walks: Span[] = []
  for (const s of stints) {
    const legs = s.legs.filter(leg => leg.t1 > now)
    const first = legs[0]
    const final = legs[legs.length - 1]
    if (first === undefined || final === undefined) continue
    const start = first.t0 <= now ? here : { x: first.x0, y: first.y0 }
    const t0 = Math.max(first.t0, now)
    walks.push([t0, s.arrive])
    // the path still ahead, corner by corner, with how far along each corner is
    const corners = [{ x: start.x, y: start.y, far: 0 }]
    for (const leg of legs) {
      const last = corners[corners.length - 1] ?? { x: start.x, y: start.y, far: 0 }
      corners.push({ x: leg.x1, y: leg.y1, far: last.far + Math.abs(leg.x1 - last.x) + Math.abs(leg.y1 - last.y) })
    }
    const far = corners[corners.length - 1]?.far ?? 0
    const span = final.t1 - t0
    const steps = o.reduceMotion ? 1 : Math.max(1, Math.min(far, Math.floor(span / FRAME_MS)))
    if ((knots[knots.length - 1]?.t ?? now) < t0) knots.push({ t: t0, x: start.x, y: start.y })
    for (let j = 1; j <= steps; j++) {
      const gone = Math.round((far * j) / steps)
      let n = 1
      while (n < corners.length - 1 && (corners[n]?.far ?? 0) < gone) n++
      const from = corners[n - 1] ?? corners[0]
      const to = corners[n] ?? from
      if (from === undefined || to === undefined) continue
      const along = gone - from.far
      knots.push({
        t: t0 + (span * j) / steps,
        x: from.x + Math.sign(to.x - from.x) * along,
        y: from.y + Math.sign(to.y - from.y) * along,
      })
    }
  }
  const total = (knots[knots.length - 1]?.t ?? now) - now
  let move = sheet.rule(`transform:translate(${here.x}px,${here.y}px)`)
  if (knots.length > 1 && total > 0) {
    let frames = ''
    for (const k of knots) {
      frames += `${(((k.t - now) / total) * 100).toFixed(3)}%{transform:translate(${k.x}px,${k.y}px)}`
    }
    move = sheet.rule(
      `transform:translate(${here.x}px,${here.y}px);animation:${sheet.keyframes(frames)} ${Math.round(total)}ms step-end forwards`,
    )
  }
  const alive = sheet.during([[a.bornAt, a.goneAt]], 'opacity')
  if (alive === null) return { depth: 0, under: '', body: '', over: '' }

  // --- the body and what it holds
  const look = a
  const b = buildOf(look, 0, 0)
  const headTop = b.top - (a.isLeader ? 4 : 0) - (a.kind === 'sonnet' ? 1 : 0)
  const busy: Span[] = []
  let poses = ''
  let covers = ''
  let under = ''
  let over = ''

  stints.forEach((s, i) => {
    const end = holdEnd(stints, i)
    const hold: Span = [s.arrive, end]
    const activeEnd = s.doneAt === null ? end : end === null ? s.doneAt : Math.min(s.doneAt, end)
    const active: Span = [s.arrive, activeEnd]
    const node = at(s.place)
    const screen = screenFor(s.place)

    if (node.cover !== undefined) {
      const cover = sheet.during([hold])
      const patch = copyRegion(still, node.x - 6, node.cover, 13, node.y - node.cover + 1)
      covers += group(cover, encode(patch, -node.x, -node.y))
    }

    const pose = POSE[s.act]
    const shown = sheet.during([active])
    if (pose !== undefined && shown !== null) {
      busy.push(active)
      const tint = s.tint ?? 'red'
      const hasLaptop = pose === 'type' && screen === null
      const one = (frame: 0 | 1): string =>
        sprite(theme, l => {
          if (hasLaptop) drawLaptop(l, OX, OY, look)
          drawArms(l, OX, OY, look, pose, frame, tint)
        })
      const beat = BEAT[pose]
      const inner =
        beat === 0
          ? one(0)
          : group(sheet.frame(0, 2, beat), one(0)) + group(sheet.frame(1, 2, beat), one(1))
      poses += group(shown, inner, `a-${s.act}`)
    }

    // what the place itself shows while the work goes on
    if (shown !== null && screen !== null && (s.act === 'edit' || s.act === 'bash' || s.act === 'work')) {
      const count = s.act === 'edit' ? 4 : 2
      const period = s.act === 'edit' ? 720 : s.act === 'bash' ? 900 : 1800
      let frames = ''
      for (let f = 0; f < count; f++) {
        frames += group(
          sheet.frame(f, count, period),
          canvas(theme, l => {
            if (s.act === 'bash') drawTermScreen(l, screen.x, screen.y, f === 0 ? 0 : 1)
            else drawCodeScreen(l, screen.x, screen.y, s.act === 'edit' ? f : f * 3)
          }),
        )
      }
      under += group(shown, frames, `scr-${s.act}`)
    }
    if (shown !== null && s.act === 'test') {
      let frames = ''
      for (let f = 0; f < 2; f++) {
        frames += group(
          sheet.frame(f, 2, 440),
          canvas(theme, l => {
            TUBES.forEach((t, n) => {
              const rise = (n + f) % 2 === 0 ? 2 : 4
              put(l, t.x + 1, LAB.y - rise, 'paper')
              if (f === 1) put(l, t.x + (n % 2), LAB.y - rise - 3, 'glassHi')
            })
          }),
        )
      }
      under += group(shown, frames, 'bubbles')
    }

    // marks over the head, in the character's own coordinates
    if (shown !== null) {
      let marks = ''
      if (o.showLabels && s.label !== '') {
        const width = s.label.length * GLYPH + 3
        const x = clamp(node.x - width / 2, 1, W - width - 1) - node.x
        marks += `<g class="lab">${pill(s.label, Number(x.toFixed(1)), headTop - 8, theme)}</g>`
      }
      if (s.act === 'ask') {
        marks += group(sheet.frame(0, 2, 700), sprite(theme, l => drawBang(l, OX + 7, OY + headTop - 9)), 'bang')
      }
      if (s.act === 'web') {
        marks +=
          group(sheet.frame(0, 2, 900), sprite(theme, l => drawGlobe(l, OX + 6, OY + headTop - 16, 0))) +
          group(sheet.frame(1, 2, 900), sprite(theme, l => drawGlobe(l, OX + 6, OY + headTop - 16, 1)))
      }
      over += group(shown, marks, `m-${s.act}`)
    }
  })

  if (o.showBubbles) {
    for (const bubble of world.bubbles) {
      if (bubble.actor !== a.id) continue
      const shown = sheet.during([[bubble.at, bubble.until]])
      if (shown === null) continue
      const spot = positionAt(a, Math.max(now, bubble.at))
      const width = bubble.text.length * GLYPH + 4
      const x = clamp(spot.x - width / 2, 2, W - width - 2) - spot.x
      let said = balloon(bubble.text, Number(x.toFixed(1)), headTop - 19, 0, theme)
      if ((o.lean ?? 0) === 0 && bubble.full.replace(/\s+/g, ' ').trim() !== bubble.text) {
        const lines = wrap(bubble.full, 34, 6)
        const size = cardSize(lines)
        const fx = clamp(spot.x - size.width / 2, 2, W - size.width - 2) - spot.x
        const fy = clamp(spot.y + headTop - 12 - size.height, 2, H - size.height - 2) - spot.y
        said += `<g class="full">${card(lines, Number(fx.toFixed(1)), Number(fy.toFixed(1)), theme)}</g>`
      }
      over += shown === '' ? `<g class="bub say" tabindex="0">${said}</g>` : `<g class="${shown} bub say" tabindex="0">${said}</g>`
    }
  }

  const standing = sheet.except(walks)
  const walking = sheet.during(walks)
  const legs =
    group(standing, sprite(theme, l => drawLegs(l, OX, OY, look, 'stand'))) +
    (o.reduceMotion
      ? ''
      : group(
          walking,
          group(sheet.frame(0, 2, 300), sprite(theme, l => drawLegs(l, OX, OY, look, 'stepA'))) +
            group(sheet.frame(1, 2, 300), sprite(theme, l => drawLegs(l, OX, OY, look, 'stepB'))),
        ))

  const breath = o.reduceMotion
    ? ''
    : sheet.rule(
        `animation:${sheet.keyframes('0%{transform:translate(0,0)}58%{transform:translate(0,1px)}94%{transform:translate(0,0)}')} 3200ms step-end -${(now + seed * 370) % 3200}ms infinite`,
      )
  const blink = o.reduceMotion
    ? null
    : sheet.rule(
        `opacity:0;animation:${sheet.keyframes('0%{opacity:0}95%{opacity:1}98%{opacity:0}')} 4300ms step-end -${(now + seed * 530) % 4300}ms infinite`,
      )

  const upper =
    sprite(theme, l => drawBody(l, OX, OY, look)) +
    group(blink, sprite(theme, l => drawBlink(l, OX, OY, look))) +
    group(sheet.except(busy), sprite(theme, l => drawArms(l, OX, OY, look, 'down'))) +
    poses

  const last = stints[stints.length - 1]
  const rest = last === undefined ? here : at(last.place)

  // a card about the character, shown while it is pointed at or after a click
  const isLean = (o.lean ?? 0) >= 1
  const did = a.recent[a.recent.length - 1]
  const lines = [
    shorten(a.model === '' ? a.name : `${a.name} · ${a.model}`, 30),
    ...(a.task === '' ? [] : [shorten(a.task, 30)]),
    ...(did === undefined ? [] : [shorten(did.text, 30)]),
  ]
  const size = cardSize(lines)
  const above = rest.y + headTop - 4 - size.height
  const tx = clamp(rest.x - size.width / 2, 2, W - size.width - 2) - rest.x
  const ty = (above >= 2 ? above : Math.min(rest.y + 4, H - size.height - 2)) - rest.y
  if (!isLean) {
    over += `<g class="tip t${index}">${card(lines, Number(tx.toFixed(1)), ty, theme)}</g>`
    sheet.raw(`svg:has(.w${index}:hover) .t${index},svg:has(.w${index}:focus) .t${index}{visibility:visible}`)
  }

  if (o.selected === a.id) {
    const mark = (frame: number): string =>
      sprite(theme, l => {
        const y = OY + headTop - 7 - frame
        for (let row = 0; row < 3; row++) {
          rect(l, OX - 3 + row, y + row - 1, 7 - row * 2, 2, 'ink')
          rect(l, OX - 2 + row, y + row - 1, 5 - row * 2, 1, 'gold')
        }
      })
    over += `<g class="sel">${group(sheet.frame(0, 2, 700), mark(0))}${group(sheet.frame(1, 2, 700), mark(1))}</g>`
  }

  const inner = group(move, legs + group(breath, upper) + covers)
  const body = `<g class="${[alive, 'actor', `k-${a.kind}`, 'who', `w${index}`].filter(n => n !== '').join(' ')}" tabindex="0">${inner}</g>`
  const top = group(alive, group(move, over))
  return { depth: rest.y, under, body, over: top }
}

// ---------------------------------------------------------------- the scene

/**
 * The office at `now`, as one SVG document. One that comes out too big for the
 * app to take is drawn again with less on it: first without the hover cards,
 * then without labels and balloons too.
 */
export function renderWorld(world: World, now: number, o: ViewOptions): string {
  const whole = compose(world, now, o)
  if (whole.length <= BUDGET || (o.lean ?? 0) >= 2) return whole
  const lighter = compose(world, now, { ...o, lean: 1 })
  if (lighter.length <= BUDGET) return lighter

  return compose(world, now, { ...o, lean: 2, showLabels: false, showBubbles: false })
}

function compose(world: World, now: number, o: ViewOptions): string {
  const theme = o.theme
  const sheet = new Sheet(now, o.reduceMotion, o.speed ?? 1)
  const still = staticPart(world, theme)

  let under = ''
  under += group(
    sheet.during(world.door.map(d => [d.from, d.until] as const)),
    canvas(theme, l => drawOpenDoor(l)),
    'door-open',
  )
  for (const book of world.newBooks) {
    under += group(sheet.during([[book.at, null]]), canvas(theme, l => drawBook(l, book.slot, book.color)), 'new-book')
  }

  const drawn = world.actors
    .map((a, index) => drawActor(a, index, world, now, o, sheet, still.layer))
    .sort((p, q) => p.depth - q.depth)
  for (const d of drawn) under += d.under

  let effects = ''
  for (const e of world.effects) {
    const shown = sheet.during([[e.at, e.until]])
    if (shown === null) continue
    if (e.kind === 'plus') {
      effects += group(
        shown,
        group(sheet.frame(0, 2, 360), canvas(theme, l => drawPlus(l, e.x, e.y, 0))) +
          group(sheet.frame(1, 2, 360), canvas(theme, l => drawPlus(l, e.x, e.y, 1))),
        'fx-plus',
      )
    } else if (e.kind === 'check') {
      effects += group(shown, canvas(theme, l => drawCheck(l, e.x, e.y)), 'fx-check')
    } else {
      const span = Math.round(e.until - e.at)
      const drift = o.reduceMotion
        ? ''
        : sheet.rule(
            `animation:${sheet.keyframes('to{transform:translate(0,-9px);opacity:.2}')} ${Math.max(span, FRAME_MS * 9)}ms steps(9) ${Math.round(e.at - now)}ms forwards`,
          )
      effects += group(
        shown,
        group(drift, canvas(theme, l => drawSmoke(l, e.x - 9, e.y + 6))) + canvas(theme, l => drawCross(l, e.x, e.y)),
        'fx-fail',
      )
    }
  }

  const css =
    themeCss(theme) + sheet.css() + (o.isStill === true ? '*{animation-play-state:paused!important}' : '')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ` +
    (o.scale === undefined ? '' : `width="${W * o.scale}" height="${H * o.scale}" `) +
    `shape-rendering="crispEdges"><style>${css}</style>` +
    `<g>${still.svg}</g><g>${under}</g>` +
    `<g>${drawn.map(d => d.body).join('')}</g>` +
    `<g>${effects}${drawn.map(d => d.over).join('')}</g></svg>`
  )
}

