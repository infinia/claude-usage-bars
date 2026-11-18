import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, Timer } from 'claude-code'

import type { Meter, SessionFigures, Usage } from '../types'

const usage = atom({ plugin: 'usage-bars', key: 'usage' } as const, null)

// Hidden with /usage_bars: stays hidden until the command shows it again.
// This session's own figures: its context fill and what it has cost so far.
const sessionFigures = atom({ plugin: 'usage-bars', key: 'session' } as const, {} as SessionFigures)

const isHidden = atom({ plugin: 'usage-bars', key: 'isHidden' } as const, false)

// The limits are the account's, not the session's: the last reading is kept in
// the store so a new session draws it before its own first response arrives.
const STORE_KEY = 'lastLimits'
const REFRESH_MS = 60_000

const BAR_WIDTH = 14
const BAR_HEIGHT = 6

const EMPTY: Usage = { session: {}, weekly: {} }

// One accent per window, as session-band gives each stat its own; amber and red
// take over near the limit.
const CONTEXT = '#4fb3a9'
const SESSION = '#8b8cf8'
const WEEKLY = '#5fa8d3'
const MONEY = '#4caf6e'
// The cost's icon, drawn at the height of the text beside it.
const COST_ICON = 14
const MONEY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="10" fill="none" stroke="${MONEY}" stroke-width="2"/><text x="12" y="16.5" text-anchor="middle" font-family="-apple-system,sans-serif" font-size="13" font-weight="600" fill="${MONEY}">$</text></svg>`
const WARN = '#e2a94e'
const ALERT = '#e0846b'
const MUTED = '#8a8f8c'
// MUTED at 0.3 opacity: the empty part of each bar.
const TRACK = 'rgba(138,143,140,0.3)'

// Density by the band's width in cells, so the row shrinks instead of wrapping:
// 0 everything; 1 no labels; 2 no bars or cost either. Each is the least bodyColumns it needs.
const TIER_MIN = [90, 64] as const
const tierFor = (columns: number) => {
  const i = TIER_MIN.findIndex(min => columns >= min)
  return i === -1 ? TIER_MIN.length : i
}

// The desktop draws an SVG only at a fixed pixel width (neither an empty Box nor
// a widthless SVG stretches to fill), so the bar is one pill sized per tier.
const PILL_WIDTHS = [80, 56] as const

// A rounded track with its filled part, rounded at both ends.
function pill(percent: number | undefined, color: string, width: number): string {
  const r = BAR_HEIGHT / 2
  const share = Math.min(percent ?? 0, 100) / 100
  const fill = share > 0 ? Math.max(BAR_HEIGHT, share * width) : 0
  const filled =
    fill > 0
      ? `<rect width="${fill.toFixed(1)}" height="${BAR_HEIGHT}" rx="${r}" fill="${color}"/>`
      : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BAR_HEIGHT}" viewBox="0 0 ${width} ${BAR_HEIGHT}"><rect width="${width}" height="${BAR_HEIGHT}" rx="${r}" fill="${TRACK}"/>${filled}</svg>`
}

// Null when the reading carries neither window (off a subscription, or before
// the first response), so an empty reading never wipes a good one.
function toUsage(rateLimits: SessionRateLimit[]): Usage | null {
  const limit = (kind: string): Meter => {
    const found = rateLimits.find(r => r.kind === kind)

    return found ? { percent: found.percentUsed, resetsAt: found.resetsAt } : {}
  }
  const figures = { session: limit('five_hour'), weekly: limit('seven_day') }

  return figures.session.percent === undefined && figures.weekly.percent === undefined
    ? null
    : figures
}

function isUsage(value: unknown): value is Usage {
  return typeof value === 'object' && value !== null && 'session' in value && 'weekly' in value
}

// A window whose reset time has passed starts over at 0%, until a reading says otherwise.
function current(m: Meter, now: number): Meter {
  return m.resetsAt !== undefined && Date.parse(m.resetsAt) <= now ? { percent: 0 } : m
}

function bar(percent: number): string {
  const filled = Math.round((Math.min(percent, 100) / 100) * BAR_WIDTH)

  return '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled)
}

// The window's accent, or amber then red as it nears the limit.
function colorFor(percent: number | undefined, accent: string): string {
  if (percent === undefined) return MUTED
  if (percent >= 90) return ALERT
  if (percent >= 70) return WARN
  return accent
}

function resetIn(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const minutes = Math.max(0, Math.round((Date.parse(resetsAt) - now) / 60000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

async function save($: EngineInterface, figures: Usage) {
  await update($, usage, () => figures)
  await $.store.set(STORE_KEY, figures)
}

// Reads the live figures; falls back to the saved ones, then to empty meters,
// so the band always has something to draw. Each call also redraws the countdowns.
async function refresh($: EngineInterface) {
  const reading = await $.session.usage()
  await update($, sessionFigures, previous => ({
    context: reading.context.percent ?? previous.context,
    cost: reading.cost?.usd ?? previous.cost,
  }))

  const live = toUsage(reading.rateLimits)

  if (live !== null) {
    await save($, live)
    return
  }

  const saved = await $.store.get(STORE_KEY)
  await update($, usage, previous => ({ ...(previous ?? (isUsage(saved) ? saved : EMPTY)) }))
}

export const register: Register = on => {
  let timer: Timer | undefined

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($).catch(() => update($, usage, previous => previous ?? EMPTY))

    timer?.cancel()
    timer = $.clock.every(REFRESH_MS, () => void refresh($).catch(() => {}))

    await $.command.register({
      name: 'usage_bars',
      description: 'Show or hide the context, session and weekly bars',
    })

    return result
  })

  on('command.run', { command: 'usage_bars' }, async $ => {
    const hidden = !(await read($, isHidden))
    await update($, isHidden, () => hidden)

    return { text: hidden ? 'Usage bars hidden.' : 'Usage bars shown.' }
  })

  on('session.measure', async ($, e, next) => {
    await update($, sessionFigures, previous => ({
      context: e.context.percent ?? previous.context,
      cost: e.cost?.usd ?? previous.cost,
    }))

    const live = toUsage(e.rateLimits)

    if (live !== null) {
      await save($, live)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    // Before any reading lands the band still draws, with empty meters.
    const figures = (await read($, usage)) ?? EMPTY
    const own = await read($, sessionFigures)
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
    const now = await $.clock.now()
    const tier = tierFor(e.props.bodyColumns)

    // Desktop: a fixed-width rounded pill, PILL_WIDTHS by tier.
    // Terminal: a block-character bar. (A Box is sized in rows and columns, never pixels.)
    const track = (m: Meter, color: string) => {
      if (Svg === undefined) {
        return (
          <Text color={color}>
            {m.percent === undefined ? '░'.repeat(BAR_WIDTH) : bar(m.percent)}
          </Text>
        )
      }

      const width = PILL_WIDTHS[tier] ?? PILL_WIDTHS[1]
      const alt = m.percent === undefined ? 'no reading yet' : `${Math.round(m.percent)}% used`

      return (
        <Svg source={pill(m.percent, color, width)} alt={alt} width={width} height={BAR_HEIGHT} />
      )
    }

    // One window on one line: its name in bold in the bar's colour, the bar, the
    // share in bold, the reset dimmed. Where the bars are dropped, the initial alone.
    const meter = (label: string, reading: Meter, accent: string) => {
      const m = current(reading, now)
      const color = colorFor(m.percent, accent)
      const reset = resetIn(m.resetsAt, now)
      const share = m.percent === undefined ? '—' : `${Math.round(m.percent)}%`

      return (
        <Box
          key={label}
          flexGrow={1}
          flexShrink={0}
          flexDirection="row"
          flexWrap="nowrap"
          alignItems="center"
        >
          {/* The bar sits in a nested group, never beside an empty Box: so placed,
              the desktop drops it (an SVG in a nested row is what it draws). */}
          <Box flexDirection="row" flexWrap="nowrap" alignItems="center" gap="sm">
            <Text bold color={color}>
              {tier <= 1 ? label : label[0]}
            </Text>
            {tier <= 1 ? track(m, color) : null}
            <Text bold color={m.percent !== undefined && m.percent >= 70 ? color : undefined}>
              {share}
            </Text>
            {reset ? <Text dimColor>{reset}</Text> : null}
          </Box>
        </Box>
      )
    }

    // A dim bar between sections, as session-band separates its figures. Each
    // section is as wide as its contents (flexShrink 0), so none runs under a bar.
    const divider = (key: string) => (
      <Box key={key} flexShrink={0}>
        {/* The bars' track colour on the desktop; the terminal reads no rgba. */}
        {Svg ? <Text color={TRACK}>|</Text> : <Text dimColor>|</Text>}
      </Box>
    )

    return (
      <Box
        flexDirection="row"
        flexWrap="nowrap"
        alignItems="center"
        columnGap={2}
        overflow="hidden"
        paddingX={1}
      >
        {meter('Context', { percent: own.context }, CONTEXT)}
        {divider('d1')}
        {meter('Session', figures.session, SESSION)}
        {divider('d2')}
        {meter('Week', figures.weekly, WEEKLY)}
        {tier <= 1 && own.cost !== undefined ? divider('d3') : null}
        {tier <= 1 && own.cost !== undefined ? (
          <Box flexDirection="row" flexWrap="nowrap" alignItems="center" gap="xs" flexShrink={0}>
            {Svg ? (
              <Svg source={MONEY_ICON} alt="session cost" width={COST_ICON} height={COST_ICON} />
            ) : null}
            <Text bold color={MONEY}>{`$${own.cost.toFixed(2)}`}</Text>
          </Box>
        ) : null}
      </Box>
    )
  })
}
