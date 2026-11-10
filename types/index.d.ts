// Piksel Ofis: what the mod keeps in `$.state`. Self-contained: the hooks
// module's own types (hooks/sim.ts) are narrower spellings of these.

export type PikselOfisLeg = {
  t0: number
  t1: number
  x0: number
  y0: number
  x1: number
  y1: number
  a: string
  b: string
}

export type PikselOfisStint = {
  act: string
  label: string
  tint: string | null
  place: string
  legs: PikselOfisLeg[]
  arrive: number
  eventAt: number
  doneAt: number | null
  notBefore: number
  isAuto: boolean
  key: string
}

export type PikselOfisActor = {
  id: string
  kind: 'opus' | 'fable' | 'sonnet' | 'haiku' | 'other'
  variant: number
  isLeader: boolean
  name: string
  model: string
  task: string
  home: string
  stints: PikselOfisStint[]
  bornAt: number
  goneAt: number | null
  recent: { at: number; text: string }[]
  files: string[]
  seenAt: number
  isGuest: boolean
}

/** The whole office: who is in it, what each is doing, and the event log. */
export type PikselOfisWorld = {
  v: 1
  actors: PikselOfisActor[]
  books: (string | null)[]
  newBooks: { slot: number; color: string; at: number }[]
  door: { from: number; until: number }[]
  bubbles: { actor: string; text: string; full: string; at: number; until: number }[]
  effects: { kind: 'plus' | 'check' | 'fail'; x: number; y: number; at: number; until: number }[]
  notices: { actor: string; key: string; kind: 'ask' | 'permission'; text: string; at: number }[]
  log: { at: number; who: string; text: string }[]
  written: number
}

/** How one picture is drawn: the settings and the pick it was taken with. */
export type PikselOfisLook = {
  theme: 'auto' | 'light' | 'dark'
  showLabels: boolean
  showBubbles: boolean
  reduceMotion: boolean
  speed: number
  selected: string | null
}

/** The office at the moment `at`: one picture's worth. */
export type PikselOfisShot = { world: PikselOfisWorld; at: number; look: PikselOfisLook }

/** The person's settings; kept across sessions in the store as well. */
export type PikselOfisPrefs = {
  speed: number
  showBubbles: boolean
  showLabels: boolean
  reduceMotion: boolean
  sound: boolean
  theme: 'auto' | 'light' | 'dark'
}

/** What the pane itself is showing: who is picked, what is unfolded. */
export type PikselOfisPanel = {
  selected: string | null
  isLogOpen: boolean
  isSettingsOpen: boolean
  isWide: boolean
}

export type PikselOfisView = {
  cur: PikselOfisShot
  prev: PikselOfisShot | null
  /** The session's own office, kept aside and kept up to date while the demo plays; else null. */
  real: PikselOfisWorld | null
}

declare module 'claude-code' {
  interface PluginState {
    'piksel-ofis': {
      /** Canvas pixels per CSS pixel; 0 fits the pane's width. */
      zoom: number
      /**
       * The office as last drawn, and as drawn before that. The pane lays the
       * newer picture over the older, so the older shows while the newer loads.
       */
      view: Shaped<PikselOfisView>
      prefs: Shaped<PikselOfisPrefs>
      panel: Shaped<PikselOfisPanel>
    }
  }
}
