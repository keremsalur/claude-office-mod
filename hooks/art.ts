// Piksel Ofis: pure pixel art. No `$`, no DOM. Everything is drawn by code
// into indexed layers and encoded as crisp SVG paths, so the same module runs
// under the engine and under plain node (the preview and the tests).

export const W = 190
export const H = 130

// name: [light, dark]
const PALETTE = {
  wall: ['#f0e4d0', '#3a3341'],
  wallShade: ['#e3d3b8', '#322c39'],
  base: ['#a98b68', '#221d27'],
  floor: ['#dcbc8e', '#4b3c37'],
  floorAlt: ['#d6b587', '#473833'],
  floorLine: ['#c5a374', '#3d302c'],
  tile: ['#eef0ee', '#4a5058'],
  tileAlt: ['#dde3e2', '#424850'],
  carpet: ['#b9c6d6', '#39424f'],
  carpetAlt: ['#adbccf', '#343d49'],
  wood: ['#a06d44', '#6f4b34'],
  woodDark: ['#7b5034', '#4f3424'],
  woodLight: ['#c08e60', '#8b6145'],
  shelfBack: ['#5d3d29', '#33221a'],
  metal: ['#a7b0ba', '#5f6872'],
  metalDark: ['#737c87', '#3f464f'],
  metalLight: ['#d2d8de', '#828b95'],
  white: ['#fbf7ef', '#cfc9c1'],
  paper: ['#ffffff', '#ece8e0'],
  ink: ['#2c2631', '#131016'],
  chair: ['#8e4a43', '#5e3531'],
  chairLight: ['#ab5f55', '#77453f'],
  glass: ['#c4e6ee', '#3d6470'],
  glassHi: ['#e8f7fa', '#5d8c99'],
  sky: ['#a5d8ec', '#1c2848'],
  skyHi: ['#e6f6fb', '#f2e7a6'],
  screen: ['#27333c', '#0f171c'],
  screenLit: ['#bfe3ff', '#8fc6ee'],
  term: ['#5bd67e', '#5bd67e'],
  plant: ['#5fa35c', '#3f7b46'],
  plantDark: ['#407c45', '#2b5a33'],
  pot: ['#cb7b4b', '#8d5536'],
  rug: ['#c9685c', '#7b403b'],
  rugLight: ['#e18b7c', '#97534c'],
  skin: ['#f3caa2', '#e2ba92'],
  skinShade: ['#dca97e', '#c99870'],
  hairDark: ['#3b2e2a', '#2a201d'],
  hairBrown: ['#7c4b2b', '#6a4026'],
  hairBlond: ['#e2ba5c', '#cfa850'],
  hairRed: ['#b65230', '#a3492b'],
  hairGray: ['#9b9ba4', '#86868f'],
  hairBlue: ['#3d5a8c', '#35507d'],
  purple: ['#7b50b6', '#7048a8'],
  purpleDark: ['#5a3990', '#4f3282'],
  orange: ['#f18b2f', '#e07f2a'],
  red: ['#d9443c', '#c53d36'],
  redDark: ['#a9302d', '#972a28'],
  teal: ['#30b9b1', '#2ba8a1'],
  tealDark: ['#208b87', '#1c7c78'],
  gold: ['#f3c331', '#e3b52c'],
  goldDark: ['#ca971b', '#b78818'],
  green: ['#4db052', '#45a04a'],
  greenDark: ['#367b3b', '#2f6e34'],
  yellow: ['#f8d53b', '#e8c636'],
  yellowDark: ['#d2a920', '#c09a1c'],
  blue: ['#5b90d9', '#5283c7'],
  blueDark: ['#406cb1', '#39609f'],
  gray: ['#a4a4a9', '#8f8f95'],
  grayDark: ['#78787e', '#66666c'],
  grayLight: ['#cacacf', '#adadb3'],
  pink: ['#e97aa9', '#d66e9a'],
  lens: ['#d9f1f7', '#b9dbe4'],
  doorDark: ['#3a2a22', '#120e0c'],
} as const

export type ColorName = keyof typeof PALETTE
export type Theme = 'auto' | 'light' | 'dark'

const NAMES = Object.keys(PALETTE) as ColorName[]
const INDEX = new Map<ColorName, number>(NAMES.map((name, i) => [name, i + 1]))

/** The `class` of a palette color, for an element drawn outside a layer. */
export function paint(c: ColorName): string {
  return `class="c${INDEX.get(c) ?? 0}"`
}

// ---------------------------------------------------------------- layers

export type Layer = { w: number; h: number; data: Uint8Array }

export function makeLayer(w: number = W, h: number = H): Layer {
  return { w, h, data: new Uint8Array(w * h) }
}

function put(l: Layer, x: number, y: number, c: ColorName): void {
  if (x < 0 || y < 0 || x >= l.w || y >= l.h) return
  l.data[y * l.w + x] = INDEX.get(c) ?? 0
}

function rect(l: Layer, x: number, y: number, w: number, h: number, c: ColorName): void {
  const index = INDEX.get(c) ?? 0
  const x0 = Math.max(0, x)
  const y0 = Math.max(0, y)
  const x1 = Math.min(l.w, x + w)
  const y1 = Math.min(l.h, y + h)
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) l.data[yy * l.w + xx] = index
  }
}

function clear(l: Layer, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= l.w || y >= l.h) return
  l.data[y * l.w + x] = 0
}

/**
 * Encodes a layer as one `<path>` per color: horizontal runs merged down into
 * rectangles, so a flat area is a handful of path commands, not one per pixel.
 */
export function encode(l: Layer, dx: number = 0, dy: number = 0): string {
  type Run = { x: number; y: number; w: number; h: number; c: number }
  const done: Run[] = []
  let open = new Map<string, Run>()

  for (let y = 0; y < l.h; y++) {
    const next = new Map<string, Run>()
    let x = 0
    while (x < l.w) {
      const c = l.data[y * l.w + x] ?? 0
      if (c === 0) {
        x++
        continue
      }
      let end = x + 1
      while (end < l.w && l.data[y * l.w + end] === c) end++
      const key = `${x}:${end - x}:${c}`
      const above = open.get(key)
      if (above !== undefined) {
        above.h++
        next.set(key, above)
        open.delete(key)
      } else {
        next.set(key, { x, y, w: end - x, h: 1, c })
      }
      x = end
    }
    for (const run of open.values()) done.push(run)
    open = next
  }
  for (const run of open.values()) done.push(run)

  const byColor = new Map<number, string[]>()
  for (const r of done) {
    const d = `M${r.x + dx} ${r.y + dy}h${r.w}v${r.h}h${-r.w}z`
    const list = byColor.get(r.c)
    if (list === undefined) byColor.set(r.c, [d])
    else list.push(d)
  }

  let out = ''
  for (const [c, parts] of byColor) out += `<path class="c${c}" d="${parts.join('')}"/>`
  return out
}

/**
 * The palette as a stylesheet: one rule per color. Under `auto` the dark
 * palette takes over where the viewer prefers dark.
 */
export function themeCss(theme: Theme): string {
  const rules = (side: 0 | 1): string => NAMES.map((name, i) => `.c${i + 1}{fill:${PALETTE[name][side]}}`).join('')
  if (theme === 'dark') return rules(1)
  return theme === 'light' ? rules(0) : `${rules(0)}@media (prefers-color-scheme:dark){${rules(1)}}`
}

// ---------------------------------------------------------------- layout

/** Where things stand, in canvas pixels. Seats are the desk's own top-left. */
export const DESKS = [
  { x: 62, y: 46 },
  { x: 95, y: 46 },
  { x: 128, y: 46 },
  { x: 62, y: 76 },
  { x: 95, y: 76 },
  { x: 128, y: 76 },
] as const

export const LEADER_DESK = { x: 8, y: 92 } as const
export const SHELF = { x: 6, y: 3, slots: 36, perRow: 12 } as const
export const DOOR = { x: 158, y: 4 } as const
export const PRINTER = { x: 86, y: 104 } as const
export const LAB = { x: 138, y: 108 } as const
export const STAND_TABLES = [
  { x: 180, y: 52 },
  { x: 180, y: 76 },
] as const

// ---------------------------------------------------------------- room

function drawRoom(l: Layer): void {
  rect(l, 0, 0, W, 26, 'wall')
  rect(l, 0, 26, W, 4, 'wallShade')
  rect(l, 0, 30, W, 2, 'base')
  rect(l, 0, 32, W, H - 32, 'floor')
  for (let row = 0, y = 32; y < H; y += 7, row++) {
    if (row % 2 === 1) rect(l, 0, y, W, 6, 'floorAlt')
    rect(l, 0, y + 6, W, 1, 'floorLine')
    for (let x = (row % 2) * 13 + 9; x < W; x += 26) rect(l, x, y, 1, 6, 'floorLine')
  }
}

function drawWindow(l: Layer, x: number, y: number): void {
  rect(l, x, y, 28, 18, 'white')
  rect(l, x + 1, y + 1, 26, 16, 'sky')
  rect(l, x + 13, y + 1, 2, 16, 'white')
  rect(l, x + 1, y + 8, 26, 1, 'white')
  rect(l, x + 4, y + 4, 4, 1, 'skyHi')
  rect(l, x + 5, y + 3, 2, 1, 'skyHi')
  rect(l, x + 18, y + 12, 5, 1, 'skyHi')
  rect(l, x + 19, y + 11, 3, 1, 'skyHi')
  put(l, x + 22, y + 4, 'skyHi')
  put(l, x + 8, y + 13, 'skyHi')
  rect(l, x - 1, y + 18, 30, 1, 'white')
  rect(l, x - 1, y + 19, 30, 1, 'wallShade')
}

const BOOK_COLORS: readonly ColorName[] = [
  'red', 'teal', 'gold', 'blue', 'green', 'purple', 'orange', 'pink', 'blueDark', 'redDark',
]

/** The books a fresh office starts with: a color per filled slot, null empty. */
export function starterBooks(): (ColorName | null)[] {
  const books: (ColorName | null)[] = []
  for (let i = 0; i < SHELF.slots; i++) {
    const isEmpty = i % SHELF.perRow >= 9 || i % 7 === 5
    books.push(isEmpty ? null : (BOOK_COLORS[(i * 3 + Math.floor(i / 4)) % BOOK_COLORS.length] ?? 'red'))
  }
  return books
}

function drawShelf(l: Layer, books: readonly (ColorName | null)[]): void {
  const { x, y } = SHELF
  rect(l, x, y, 42, 29, 'woodDark')
  rect(l, x + 1, y + 1, 40, 27, 'shelfBack')
  rect(l, x + 1, y + 9, 40, 2, 'woodLight')
  rect(l, x + 1, y + 18, 40, 2, 'woodLight')
  rect(l, x, y + 27, 42, 2, 'wood')
  rect(l, x, y, 42, 1, 'wood')
  for (let i = 0; i < books.length; i++) {
    const color = books[i]
    if (color === null || color === undefined) continue
    const row = Math.floor(i / SHELF.perRow)
    const col = i % SHELF.perRow
    const height = 5 + ((i * 5 + row) % 3)
    const bottom = y + 8 + row * 9
    const bx = x + 3 + col * 3
    rect(l, bx, bottom - height + 1, 2, height, color)
    if (i % 3 === 0) rect(l, bx, bottom - height + 3, 2, 1, 'paper')
  }
}

function drawDoorClosed(l: Layer): void {
  const { x, y } = DOOR
  rect(l, x, y, 20, 28, 'woodDark')
  rect(l, x + 2, y + 2, 16, 26, 'wood')
  rect(l, x + 4, y + 4, 12, 9, 'woodLight')
  rect(l, x + 4, y + 16, 12, 9, 'woodLight')
  rect(l, x + 15, y + 14, 2, 2, 'gold')
}

function drawDoorOpen(l: Layer): void {
  const { x, y } = DOOR
  rect(l, x, y, 20, 28, 'woodDark')
  rect(l, x + 2, y + 2, 16, 26, 'doorDark')
  rect(l, x + 2, y + 2, 4, 26, 'woodLight')
  rect(l, x + 6, y + 2, 1, 26, 'woodDark')
  rect(l, x + 7, y + 24, 11, 4, 'floorLine')
}

function drawDoorMat(l: Layer): void {
  rect(l, DOOR.x + 1, DOOR.y + 29, 18, 4, 'rug')
  rect(l, DOOR.x + 3, DOOR.y + 30, 14, 2, 'rugLight')
}

function drawPlant(l: Layer, x: number, bottom: number): void {
  rect(l, x + 1, bottom - 4, 6, 5, 'pot')
  rect(l, x, bottom - 5, 8, 2, 'pot')
  rect(l, x + 2, bottom - 14, 4, 9, 'plant')
  rect(l, x, bottom - 11, 8, 5, 'plant')
  rect(l, x + 1, bottom - 13, 6, 2, 'plant')
  put(l, x + 3, bottom - 15, 'plant')
  put(l, x + 2, bottom - 9, 'plantDark')
  put(l, x + 5, bottom - 11, 'plantDark')
  put(l, x + 4, bottom - 7, 'plantDark')
  put(l, x + 1, bottom - 8, 'plantDark')
  put(l, x + 6, bottom - 9, 'plantDark')
  put(l, x + 3, bottom - 12, 'plantDark')
}

function drawClock(l: Layer, x: number, y: number): void {
  rect(l, x + 2, y, 5, 9, 'metalDark')
  rect(l, x, y + 2, 9, 5, 'metalDark')
  rect(l, x + 1, y + 1, 7, 7, 'metalDark')
  rect(l, x + 2, y + 1, 5, 7, 'paper')
  rect(l, x + 1, y + 2, 7, 5, 'paper')
  rect(l, x + 4, y + 2, 1, 3, 'ink')
  rect(l, x + 4, y + 4, 3, 1, 'ink')
}

function drawPicture(l: Layer, x: number, y: number): void {
  rect(l, x, y, 10, 9, 'woodDark')
  rect(l, x + 1, y + 1, 8, 7, 'sky')
  rect(l, x + 1, y + 5, 8, 3, 'plant')
  rect(l, x + 3, y + 4, 3, 1, 'plant')
  put(l, x + 4, y + 3, 'plant')
  rect(l, x + 6, y + 2, 2, 2, 'gold')
}

function drawChairBack(l: Layer, x0: number, y0: number): void {
  rect(l, x0 + 5, y0, 7, 1, 'chair')
  rect(l, x0 + 4, y0 + 1, 9, 1, 'chair')
  rect(l, x0 + 3, y0 + 2, 11, 7, 'chair')
  rect(l, x0 + 5, y0 + 2, 7, 5, 'chairLight')
  rect(l, x0 + 7, y0 + 9, 3, 6, 'metalDark')
}

function drawDesk(l: Layer, x0: number, y0: number, width: number): void {
  // top
  rect(l, x0, y0 + 8, width, 5, 'woodLight')
  rect(l, x0, y0 + 8, width, 1, 'wall')
  // front panel and legs
  rect(l, x0, y0 + 13, width, 6, 'wood')
  rect(l, x0, y0 + 13, width, 1, 'woodDark')
  rect(l, x0, y0 + 19, 2, 2, 'woodDark')
  rect(l, x0 + width - 2, y0 + 19, 2, 2, 'woodDark')
  // monitor, on the right half, facing the viewer
  const mx = x0 + width - 12
  rect(l, mx, y0 - 1, 11, 8, 'ink')
  rect(l, mx + 1, y0, 9, 6, 'screen')
  rect(l, mx + 4, y0 + 7, 3, 2, 'metalDark')
  rect(l, mx + 2, y0 + 9, 7, 1, 'metalDark')
  // keyboard, in front of the seat
  rect(l, x0 + 4, y0 + 10, 9, 2, 'metalLight')
  rect(l, x0 + 5, y0 + 10, 7, 1, 'grayLight')
}

/** Where a desk's 9x6 screen starts, for whatever is shown on it. */
export function screenOf(x0: number, y0: number, width: number = 28): { x: number; y: number } {
  return { x: x0 + width - 11, y: y0 }
}

function drawIdleScreen(l: Layer, x: number, y: number): void {
  rect(l, x + 1, y + 1, 4, 1, 'screenLit')
  rect(l, x + 1, y + 3, 6, 1, 'screenLit')
}

function drawLeaderRoom(l: Layer): void {
  rect(l, 0, 76, 51, H - 76, 'carpet')
  for (let y = 80; y < H; y += 6) {
    for (let x = (y % 12 === 8 ? 3 : 7); x < 50; x += 8) put(l, x, y, 'carpetAlt')
  }
  // back glass wall
  rect(l, 0, 63, 53, 12, 'glass')
  for (const px of [0, 13, 26, 39]) {
    for (let i = 0; i < 5; i++) put(l, px + 3 + i, 72 - i, 'glassHi')
    for (let i = 0; i < 3; i++) put(l, px + 7 + i, 73 - i, 'glassHi')
  }
  rect(l, 0, 62, 53, 1, 'metalDark')
  rect(l, 0, 75, 53, 1, 'metalDark')
  for (const px of [0, 13, 26, 39, 52]) rect(l, px, 62, 1, 14, 'metal')
  // side wall, seen edge-on, with a gap for its door
  rect(l, 51, 76, 2, 6, 'metal')
  rect(l, 51, 101, 2, 29, 'metal')
  rect(l, 52, 76, 1, 6, 'metalDark')
  rect(l, 52, 101, 1, 29, 'metalDark')
  // rug under the desk
  rect(l, 4, 104, 43, 22, 'rug')
  rect(l, 6, 106, 39, 18, 'rugLight')
  rect(l, 8, 108, 35, 14, 'rug')
}

function drawPrinter(l: Layer): void {
  const { x, y } = PRINTER
  // cabinet
  rect(l, x, y + 8, 22, 14, 'metal')
  rect(l, x, y + 8, 22, 1, 'metalDark')
  rect(l, x, y + 15, 22, 1, 'metalDark')
  rect(l, x + 9, y + 11, 4, 1, 'metalLight')
  rect(l, x + 9, y + 18, 4, 1, 'metalLight')
  rect(l, x, y + 22, 22, 1, 'metalDark')
  // printer
  rect(l, x + 2, y, 18, 8, 'white')
  rect(l, x + 2, y + 5, 18, 3, 'grayLight')
  rect(l, x + 5, y - 1, 12, 1, 'metalDark')
  rect(l, x + 5, y + 6, 12, 1, 'metalDark')
  put(l, x + 17, y + 2, 'green')
  put(l, x + 15, y + 2, 'grayDark')
  // paper in the feed
  rect(l, x + 6, y - 5, 10, 4, 'paper')
  rect(l, x + 7, y - 4, 6, 1, 'grayLight')
  rect(l, x + 7, y - 2, 8, 1, 'grayLight')
  // filing cabinet beside it
  rect(l, x + 24, y + 2, 11, 20, 'metal')
  rect(l, x + 24, y + 2, 11, 1, 'metalLight')
  for (const dy of [8, 14]) rect(l, x + 24, y + dy, 11, 1, 'metalDark')
  for (const dy of [5, 11, 17]) rect(l, x + 28, y + dy, 3, 1, 'metalLight')
  rect(l, x + 24, y + 22, 11, 1, 'metalDark')
}

function drawLabFloor(l: Layer): void {
  for (let y = 98; y < H; y++) {
    for (let x = 134; x < W; x++) {
      const isEven = (Math.floor((x - 134) / 7) + Math.floor((y - 98) / 7)) % 2 === 0
      put(l, x, y, isEven ? 'tile' : 'tileAlt')
    }
  }
  rect(l, 134, 97, W - 134, 1, 'metal')
  rect(l, 133, 97, 1, H - 97, 'metal')
}

/** One test tube, 3 wide, standing on the bench: `level` rows of liquid. */
function drawTube(l: Layer, x: number, level: number, liquid: ColorName): void {
  const bottom = LAB.y - 1
  rect(l, x, bottom - 9, 3, 10, 'glass')
  rect(l, x, bottom - 10, 3, 1, 'glassHi')
  rect(l, x, bottom - level + 1, 3, level, liquid)
  put(l, x, bottom - level + 1, 'glassHi')
}

export const TUBES = [
  { x: LAB.x + 27, level: 5, liquid: 'green' },
  { x: LAB.x + 32, level: 7, liquid: 'blue' },
  { x: LAB.x + 37, level: 4, liquid: 'pink' },
  { x: LAB.x + 42, level: 6, liquid: 'purple' },
] as const

function drawLabBench(l: Layer): void {
  const { x, y } = LAB
  // glassware first, the rack's bars over it
  for (const t of TUBES) drawTube(l, t.x, t.level, t.liquid)
  rect(l, x + 25, y - 5, 22, 1, 'woodDark')
  rect(l, x + 25, y - 1, 22, 1, 'wood')
  // flask
  rect(l, x + 18, y - 10, 2, 4, 'glass')
  rect(l, x + 17, y - 11, 4, 1, 'glassHi')
  rect(l, x + 17, y - 6, 4, 2, 'glass')
  rect(l, x + 16, y - 4, 6, 1, 'glass')
  rect(l, x + 15, y - 3, 8, 3, 'orange')
  put(l, x + 15, y - 3, 'glassHi')
  // bench
  rect(l, x, y, 50, 5, 'metalLight')
  rect(l, x, y, 50, 1, 'white')
  rect(l, x, y + 5, 50, 13, 'metal')
  rect(l, x, y + 5, 50, 1, 'metalDark')
  for (const dx of [12, 25, 37]) rect(l, x + dx, y + 6, 1, 12, 'metalDark')
  for (const dx of [9, 15, 22, 28, 34, 40]) rect(l, x + dx, y + 10, 1, 3, 'metalLight')
  rect(l, x, y + 18, 50, 1, 'metalDark')
}

function drawStandTable(l: Layer, x: number, y: number): void {
  rect(l, x + 1, y, 8, 1, 'woodLight')
  rect(l, x, y + 1, 10, 3, 'woodLight')
  rect(l, x, y + 3, 10, 1, 'wood')
  rect(l, x + 4, y + 4, 2, 11, 'metalDark')
  rect(l, x + 2, y + 15, 6, 1, 'metalDark')
  // a laptop waiting on it
  rect(l, x + 2, y - 4, 6, 4, 'ink')
  rect(l, x + 3, y - 3, 4, 2, 'screen')
  rect(l, x + 1, y, 8, 1, 'metalLight')
}

// ---------------------------------------------------------------- characters

export type ModelKind = 'opus' | 'fable' | 'sonnet' | 'haiku' | 'other'

export type Look = {
  kind: ModelKind
  /** 0 for the first agent of a model; each further one differs by it. */
  variant: number
  isLeader: boolean
}

const HAIR: Record<ModelKind, readonly ColorName[]> = {
  opus: ['hairDark', 'hairGray', 'hairBrown', 'hairBlond', 'hairRed'],
  fable: ['hairBlond', 'hairRed', 'hairDark', 'hairBrown', 'hairBlue'],
  sonnet: ['hairBrown', 'hairDark', 'hairRed', 'hairBlond', 'hairBlue'],
  haiku: ['hairDark', 'hairBrown', 'hairRed', 'hairBlond', 'hairBlue'],
  other: ['hairGray', 'hairDark', 'hairBrown', 'hairBlond', 'hairRed'],
}

/** A badge color for the second and later agents of one model. */
const BADGE: readonly ColorName[] = ['white', 'gold', 'pink', 'blue', 'orange']

/** Which model family an id or alias names. */
export function kindOf(model: string | undefined): ModelKind {
  const id = (model ?? '').toLowerCase()
  if (id.includes('opus')) return 'opus'
  if (id.includes('fable') || id.includes('mythos')) return 'fable'
  if (id.includes('sonnet')) return 'sonnet'
  if (id.includes('haiku')) return 'haiku'
  return 'other'
}

type Outfit = { body: ColorName; arm: ColorName; legs: ColorName; shoes: ColorName }

const OUTFIT: Record<ModelKind, Outfit> = {
  opus: { body: 'purple', arm: 'purpleDark', legs: 'purpleDark', shoes: 'ink' },
  fable: { body: 'teal', arm: 'tealDark', legs: 'tealDark', shoes: 'redDark' },
  sonnet: { body: 'green', arm: 'greenDark', legs: 'blueDark', shoes: 'white' },
  haiku: { body: 'blue', arm: 'blueDark', legs: 'woodDark', shoes: 'ink' },
  other: { body: 'gray', arm: 'grayDark', legs: 'grayDark', shoes: 'ink' },
}

/**
 * Where a character's parts are, feet at (cx, footY). Haiku is the short one;
 * every pose is written against these numbers, so it fits both builds.
 */
type Build = {
  cx: number
  footY: number
  /** Top row of the head (hat or hair). */
  top: number
  /** Arm columns, left and right of the torso. */
  armL: number
  armR: number
  /** First arm row, and the hand's row. */
  shoulder: number
  hand: number
  eyeY: number
  /** Eyes are at cx - eye and cx + eye. */
  eye: number
  /** The torso spans cx - half .. cx + half. */
  half: number
}

export function buildOf(look: Look, cx: number, footY: number): Build {
  if (look.kind === 'haiku') {
    return { cx, footY, top: footY - 12, armL: cx - 3, armR: cx + 3, shoulder: footY - 5, hand: footY - 3, eyeY: footY - 8, eye: 1, half: 2 }
  }
  return { cx, footY, top: footY - 16, armL: cx - 4, armR: cx + 4, shoulder: footY - 7, hand: footY - 4, eyeY: footY - 12, eye: 2, half: 3 }
}

function drawCrown(l: Layer, cx: number, top: number): void {
  put(l, cx - 2, top - 3, 'gold')
  put(l, cx, top - 3, 'gold')
  put(l, cx + 2, top - 3, 'gold')
  rect(l, cx - 2, top - 2, 5, 1, 'gold')
  rect(l, cx - 2, top - 1, 5, 1, 'goldDark')
  put(l, cx, top - 2, 'red')
}

/** Head, torso and what a model wears: everything but the arms and legs. */
export function drawBody(l: Layer, cx: number, footY: number, look: Look): void {
  const kind = look.kind
  const hair = HAIR[kind][look.variant % HAIR[kind].length] ?? 'hairDark'
  const outfit = OUTFIT[kind]
  const badge = BADGE[look.variant % BADGE.length] ?? 'white'

  if (kind === 'haiku') {
    const x = cx - 4
    const y = footY - 12
    rect(l, x + 2, y, 5, 1, 'yellow')
    rect(l, x + 1, y + 1, 7, 1, 'yellow')
    rect(l, x, y + 2, 9, 1, 'yellowDark')
    rect(l, x + 2, y + 3, 5, 3, 'skin')
    put(l, x + 1, y + 3, hair)
    put(l, x + 7, y + 3, hair)
    put(l, x + 3, y + 4, 'ink')
    put(l, x + 5, y + 4, 'ink')
    rect(l, x + 2, y + 6, 5, 4, outfit.body)
    if (look.variant > 0) put(l, x + 3, y + 7, badge)
    if (look.isLeader) drawCrown(l, cx, y)
    return
  }

  const x = cx - 5
  const y = footY - 16
  if (kind === 'fable') {
    // the cape, behind everything else
    rect(l, x + 1, y + 8, 9, 4, 'red')
    rect(l, x, y + 12, 11, 4, 'red')
    rect(l, x, y + 12, 1, 4, 'redDark')
    rect(l, x + 10, y + 12, 1, 4, 'redDark')
  }
  rect(l, x + 3, y, 5, 1, hair)
  rect(l, x + 2, y + 1, 7, 1, hair)
  put(l, x + 2, y + 2, hair)
  put(l, x + 8, y + 2, hair)
  rect(l, x + 3, y + 2, 5, 1, 'skin')
  rect(l, x + 2, y + 3, 7, 3, 'skin')
  rect(l, x + 3, y + 6, 5, 1, 'skin')
  put(l, x + 3, y + 4, 'ink')
  put(l, x + 7, y + 4, 'ink')
  rect(l, x + 4, y + 7, 3, 1, 'skinShade')
  rect(l, x + 2, y + 8, 7, 5, outfit.body)

  if (kind === 'opus') {
    // suit lapels, white collar, orange tie, glasses
    put(l, x + 3, y + 8, 'purpleDark')
    put(l, x + 7, y + 8, 'purpleDark')
    put(l, x + 4, y + 8, 'white')
    put(l, x + 6, y + 8, 'white')
    rect(l, x + 5, y + 8, 1, 3, 'orange')
    rect(l, x + 2, y + 4, 7, 1, 'lens')
    put(l, x + 3, y + 4, 'ink')
    put(l, x + 7, y + 4, 'ink')
    put(l, x + 5, y + 4, 'ink')
    rect(l, x + 2, y + 3, 3, 1, 'ink')
    rect(l, x + 6, y + 3, 3, 1, 'ink')
  } else if (kind === 'fable') {
    // gold band on the hair, clasp, a star on the chest
    rect(l, x + 2, y + 1, 7, 1, 'gold')
    put(l, x + 5, y + 7, 'gold')
    put(l, x + 5, y + 9, 'gold')
    rect(l, x + 4, y + 10, 3, 1, 'gold')
    put(l, x + 4, y + 11, 'gold')
    put(l, x + 6, y + 11, 'gold')
  } else if (kind === 'sonnet') {
    // hood down on the shoulders, strings, pocket, headphones
    rect(l, x + 2, y + 7, 2, 1, 'greenDark')
    rect(l, x + 7, y + 7, 2, 1, 'greenDark')
    put(l, x + 4, y + 9, 'white')
    put(l, x + 6, y + 9, 'white')
    rect(l, x + 4, y + 11, 3, 2, 'greenDark')
    rect(l, x + 3, y - 1, 5, 1, 'ink')
    put(l, x + 2, y, 'ink')
    put(l, x + 8, y, 'ink')
    rect(l, x + 1, y + 1, 1, 2, 'ink')
    rect(l, x + 9, y + 1, 1, 2, 'ink')
    rect(l, x + 1, y + 3, 1, 2, 'orange')
    rect(l, x + 9, y + 3, 1, 2, 'orange')
  }
  if (look.variant > 0) put(l, x + 3, y + 10, badge)
  if (look.isLeader) drawCrown(l, cx, kind === 'sonnet' ? y - 1 : y)
}

/** The eyelids: what covers the eyes for a blink. */
export function drawBlink(l: Layer, cx: number, footY: number, look: Look): void {
  const b = buildOf(look, cx, footY)
  const lid: ColorName = look.kind === 'opus' ? 'lens' : 'skinShade'
  put(l, cx - b.eye, b.eyeY, lid)
  put(l, cx + b.eye, b.eyeY, lid)
}

export type LegFrame = 'stand' | 'stepA' | 'stepB'

export function drawLegs(l: Layer, cx: number, footY: number, look: Look, frame: LegFrame): void {
  const outfit = OUTFIT[look.kind]
  const isShort = look.kind === 'haiku'
  const length = isShort ? 2 : 2
  if (!isShort) rect(l, cx - 2, footY - 3, 5, 1, outfit.legs)
  const legTop = footY - length
  for (const side of [-1, 1] as const) {
    const lx = side === -1 ? cx - 2 : cx + 1
    const isLifted = (frame === 'stepA' && side === 1) || (frame === 'stepB' && side === -1)
    if (isLifted) {
      rect(l, lx, legTop, 2, length - 1, outfit.legs)
      rect(l, lx, footY - 1, 2, 1, outfit.shoes)
    } else {
      rect(l, lx, legTop, 2, length, outfit.legs)
      rect(l, lx, footY, 2, 1, outfit.shoes)
    }
  }
}

export type ArmPose =
  | 'down'
  | 'type'
  | 'book'
  | 'paper'
  | 'binoculars'
  | 'raise'
  | 'card'
  | 'point'
  | 'tube'

/**
 * The arms and what the hands hold, in one of two frames. `tint` colors the
 * book's cover or the tube's liquid.
 */
export function drawArms(
  l: Layer,
  cx: number,
  footY: number,
  look: Look,
  pose: ArmPose,
  frame: 0 | 1 = 0,
  tint: ColorName = 'red',
): void {
  const b = buildOf(look, cx, footY)
  const arm = OUTFIT[look.kind].arm
  const reach = b.hand - b.shoulder
  const down = (x: number): void => {
    rect(l, x, b.shoulder, 1, reach, arm)
    put(l, x, b.hand, 'skin')
  }
  const stub = (x: number): void => rect(l, x, b.shoulder, 1, 2, arm)

  switch (pose) {
    case 'down':
      down(b.armL)
      down(b.armR)
      break
    case 'type':
      stub(b.armL)
      stub(b.armR)
      put(l, b.armL + 1, b.hand - (frame === 0 ? 0 : 1), 'skin')
      put(l, b.armR - 1, b.hand - (frame === 0 ? 1 : 0), 'skin')
      break
    case 'book': {
      stub(b.armL)
      stub(b.armR)
      const width = b.half * 2 + 1
      rect(l, cx - b.half, b.hand - 3, width, 4, tint)
      rect(l, cx - b.half + 1, b.hand - 3, width - 2, 3, 'paper')
      rect(l, cx, b.hand - 3, 1, 3, 'grayLight')
      if (frame === 1) rect(l, cx + 1, b.hand - 3, 1, 2, 'grayLight')
      else rect(l, cx - 1, b.hand - 2, 1, 1, 'grayLight')
      put(l, b.armL, b.hand - 1, 'skin')
      put(l, b.armR, b.hand - 1, 'skin')
      break
    }
    case 'paper':
      stub(b.armL)
      stub(b.armR)
      rect(l, cx - 2, b.hand - 4, 5, 5, 'paper')
      rect(l, cx - 1, b.hand - 3, 3, 1, 'grayLight')
      rect(l, cx - 1, b.hand - 1, 2, 1, 'grayLight')
      put(l, cx - 3, b.hand - 1, 'skin')
      put(l, cx + 3, b.hand - 1, 'skin')
      break
    case 'binoculars': {
      const lift = b.shoulder - b.eyeY
      rect(l, b.armL, b.eyeY + 1, 1, lift + 1, arm)
      rect(l, b.armR, b.eyeY + 1, 1, lift + 1, arm)
      const span = b.eye === 1 ? 2 : 3
      rect(l, cx - b.half, b.eyeY - 1, span, 2, 'ink')
      rect(l, cx + b.half - span + 1, b.eyeY - 1, span, 2, 'ink')
      put(l, cx - b.eye, b.eyeY, frame === 0 ? 'lens' : 'screenLit')
      put(l, cx + b.eye, b.eyeY, frame === 0 ? 'lens' : 'screenLit')
      break
    }
    case 'raise':
      down(b.armL)
      rect(l, b.armR, b.eyeY - 1 - frame, 1, b.shoulder - b.eyeY + 3 + frame, arm)
      put(l, b.armR, b.eyeY - 2 - frame, 'skin')
      break
    case 'card':
      down(b.armL)
      rect(l, b.armR, b.eyeY + 2, 1, b.shoulder - b.eyeY, arm)
      put(l, b.armR, b.eyeY + 1, 'skin')
      rect(l, b.armR - 1, b.eyeY - 5, 5, 6, 'orange')
      rect(l, b.armR, b.eyeY - 4, 3, 1, 'white')
      rect(l, b.armR, b.eyeY - 2, 2, 1, 'white')
      break
    case 'point':
      down(b.armL)
      rect(l, b.armR, b.shoulder - frame, 4, 1, arm)
      put(l, b.armR + 4, b.shoulder - frame, 'skin')
      break
    case 'tube':
      down(b.armL)
      stub(b.armR)
      put(l, b.armR, b.shoulder - 1, 'skin')
      rect(l, b.armR, b.shoulder - 6 - frame, 2, 5, 'glass')
      rect(l, b.armR, b.shoulder - 4 - frame, 2, 3, tint)
      break
  }
}

/** A character standing still, whole: the still picture and the tests' one. */
export function drawCharacter(l: Layer, cx: number, footY: number, look: Look): void {
  drawBody(l, cx, footY, look)
  drawLegs(l, cx, footY, look, 'stand')
  drawArms(l, cx, footY, look, 'down')
}

// ---------------------------------------------------------------- props

/** A 9x6 monitor screen of code: `shift` scrolls its lines. */
export function drawCodeScreen(l: Layer, x: number, y: number, shift: number): void {
  rect(l, x, y, 9, 6, 'screen')
  const lines = [5, 7, 3, 6, 4, 7, 2, 5]
  for (let row = 0; row < 3; row++) {
    const width = lines[(row + shift) % lines.length] ?? 4
    rect(l, x + 1 + ((row + shift) % 2), y + row * 2, Math.min(width, 7), 1, 'screenLit')
  }
}

/** A 9x6 terminal: green text, a cursor on the last line in one frame. */
export function drawTermScreen(l: Layer, x: number, y: number, frame: 0 | 1): void {
  rect(l, x, y, 9, 6, 'ink')
  rect(l, x + 1, y + 1, 5, 1, 'term')
  rect(l, x + 1, y + 3, 3, 1, 'term')
  if (frame === 1) put(l, x + 5, y + 3, 'term')
}

/** A laptop held in front of someone working on their feet. */
export function drawLaptop(l: Layer, cx: number, footY: number, look: Look): void {
  const b = buildOf(look, cx, footY)
  rect(l, cx - 3, b.hand - 3, 7, 4, 'metalDark')
  rect(l, cx - 2, b.hand - 2, 5, 2, 'metalLight')
  put(l, cx, b.hand - 1, 'white')
}

export function drawPlus(l: Layer, x: number, y: number, frame: 0 | 1): void {
  rect(l, x - 2, y, 5, 1, 'green')
  rect(l, x, y - 2, 1, 5, 'green')
  const far = frame === 0 ? 3 : 4
  put(l, x - far, y - far, 'green')
  put(l, x + far, y - far, 'green')
  put(l, x - far, y + far, 'green')
  put(l, x + far, y + far, 'green')
}

export function drawCheck(l: Layer, x: number, y: number): void {
  const marks: readonly (readonly [number, number])[] = [[0, 3], [1, 4], [2, 5], [3, 4], [4, 3], [5, 2], [6, 1], [7, 0]]
  for (const [dx, dy] of marks) {
    put(l, x + dx, y + dy, 'green')
    put(l, x + dx, y + dy + 1, 'greenDark')
  }
}

export function drawCross(l: Layer, x: number, y: number): void {
  for (let i = 0; i < 6; i++) {
    rect(l, x + i, y + i, 2, 1, 'red')
    rect(l, x + 5 - i, y + i, 2, 1, 'red')
  }
}

export function drawSmoke(l: Layer, x: number, y: number): void {
  rect(l, x + 1, y, 4, 1, 'grayLight')
  rect(l, x, y + 1, 7, 2, 'grayLight')
  rect(l, x + 2, y + 3, 4, 1, 'gray')
  put(l, x + 3, y + 1, 'gray')
}

/** The yellow "!" over someone who asked the person a question. */
export function drawBang(l: Layer, x: number, y: number): void {
  rect(l, x - 2, y - 1, 5, 9, 'ink')
  rect(l, x - 1, y, 3, 4, 'yellow')
  rect(l, x, y + 4, 1, 1, 'yellow')
  rect(l, x - 1, y + 6, 3, 1, 'yellow')
  rect(l, x, y + 6, 1, 1, 'yellow')
}

export function drawGlobe(l: Layer, x: number, y: number, frame: 0 | 1): void {
  rect(l, x + 2, y, 3, 7, 'blue')
  rect(l, x, y + 2, 7, 3, 'blue')
  rect(l, x + 1, y + 1, 5, 5, 'blue')
  if (frame === 0) {
    rect(l, x + 1, y + 2, 2, 2, 'green')
    put(l, x + 4, y + 4, 'green')
    put(l, x + 3, y + 1, 'green')
  } else {
    rect(l, x + 3, y + 2, 2, 2, 'green')
    put(l, x + 1, y + 4, 'green')
    put(l, x + 5, y + 1, 'green')
  }
}

/** A sheet coming out of the printer. */
export function drawSheet(l: Layer, x: number, y: number): void {
  rect(l, x, y, 8, 4, 'paper')
  rect(l, x + 1, y + 1, 5, 1, 'grayLight')
}

/** The open door, to lay over the closed one. */
export function drawOpenDoor(l: Layer): void {
  drawDoorOpen(l)
}

/** One book in a shelf slot. */
export function drawBook(l: Layer, slot: number, color: ColorName): void {
  const row = Math.floor(slot / SHELF.perRow)
  const col = slot % SHELF.perRow
  const height = 5 + ((slot * 5 + row) % 3)
  const bottom = SHELF.y + 8 + row * 9
  const bx = SHELF.x + 3 + col * 3
  rect(l, bx, bottom - height + 1, 2, height, color)
  if (slot % 3 === 0) rect(l, bx, bottom - height + 3, 2, 1, 'paper')
}

/** A color for a folder: the same folder is always the same book. */
export function folderColor(path: string): ColorName {
  const cut = path.lastIndexOf('/')
  const folder = cut <= 0 ? '' : path.slice(0, cut)
  let hash = 7
  for (let i = 0; i < folder.length; i++) hash = (hash * 31 + folder.charCodeAt(i)) % 9973
  return BOOK_COLORS[hash % BOOK_COLORS.length] ?? 'red'
}

// ---------------------------------------------------------------- still scene

/** Everything that never moves: the room and its furniture, door closed. */
export function drawStatic(books: readonly (ColorName | null)[]): Layer {
  const l = makeLayer()
  drawRoom(l)
  drawPicture(l, 51, 7)
  drawWindow(l, 64, 5)
  drawWindow(l, 97, 5)
  drawClock(l, 132, 8)
  drawShelf(l, books)
  drawDoorClosed(l)
  drawDoorMat(l)
  drawPlant(l, 146, 34)
  drawLabFloor(l)
  drawLeaderRoom(l)
  drawPlant(l, 2, 129)
  for (const d of DESKS) drawChairBack(l, d.x, d.y)
  drawChairBack(l, LEADER_DESK.x, LEADER_DESK.y)
  drawPrinter(l)
  for (const t of STAND_TABLES) drawStandTable(l, t.x, t.y)
  for (const d of DESKS) {
    drawDesk(l, d.x, d.y, 28)
    const s = screenOf(d.x, d.y)
    drawIdleScreen(l, s.x, s.y)
  }
  drawDesk(l, LEADER_DESK.x, LEADER_DESK.y, 35)
  const s = screenOf(LEADER_DESK.x, LEADER_DESK.y, 35)
  drawIdleScreen(l, s.x, s.y)
  rect(l, LEADER_DESK.x + 13, LEADER_DESK.y + 15, 9, 2, 'gold')
  drawLabBench(l)
  return l
}

/** A copy of one rectangle of a layer: the furniture drawn over someone's legs. */
export function copyRegion(from: Layer, x: number, y: number, w: number, h: number): Layer {
  const l = makeLayer(from.w, from.h)
  for (let yy = Math.max(0, y); yy < Math.min(from.h, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(from.w, x + w); xx++) {
      l.data[yy * l.w + xx] = from.data[yy * from.w + xx] ?? 0
    }
  }
  return l
}

export { clear, put, rect }
