import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'usage-bars',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 },
} as const

const LIMITS = [
  { kind: 'five_hour', percentUsed: 33, resetsAt: '2026-10-22T02:00:00Z' },
  { kind: 'seven_day', percentUsed: 27, resetsAt: '2026-10-28T00:00:00Z' },
]

test('the band draws the context, session and weekly meters and the cost', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: Date.parse('2026-10-22T00:00:00Z') }))
  on('clock.every', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'usage_bars' } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({
    context: { window: 1000000, tokens: 150000, percent: 15 },
    rateLimits: LIMITS,
    cost: { usd: 1.234 },
    changed: ['context', 'rateLimits', 'cost'],
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    expect((await ui.find({ type: 'Text', text: /33%/ }))?.text).toBe('33%')
    expect((await ui.find({ type: 'Text', text: /^2h$/ }))?.text).toBe('2h')
    expect((await ui.find({ type: 'Text', text: /27%/ }))?.text).toBe('27%')
    expect((await ui.find({ type: 'Text', text: /^6d$/ }))?.text).toBe('6d')
    expect((await ui.find({ type: 'Text', text: /15%/ }))?.text).toBe('15%')
    expect((await ui.find({ type: 'Text', text: /^\$\d/ }))?.text).toBe('$1.23')
    await ui.unmount()
  }
})

test('the band draws before any reading, and an empty reading keeps the last one', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: Date.parse('2026-10-22T00:00:00Z') }))
  on('clock.every', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'usage_bars' } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /Session/ }))?.text).toBe('Session')
  await ui.unmount()

  await $.session.measure({ context: { window: 1 }, rateLimits: LIMITS, changed: ['rateLimits'] })
  await $.session.measure({ context: { window: 1 }, rateLimits: [], changed: ['rateLimits'] })
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /33%/ }))?.text).toBe('33%')
  await ui.unmount()
})

test('a narrow band drops the labels, and /usage_bars hides it', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: Date.parse('2026-10-22T00:00:00Z') }))
  on('clock.every', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'usage_bars' } }))

  // The engine's own drawing, which the band hands the place back to once hidden.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { window: 1 }, rateLimits: LIMITS, changed: ['rateLimits'] })

  const narrow = { ...BAND, props: { ...BAND.props, bodyColumns: 60 }, surface: 'desktop' }
  let ui = await $.ui.mount(narrow as never)
  expect(await ui.find({ type: 'Text', text: /Session/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /33%/ }))?.text).toBe('33%')
  expect((await ui.find({ type: 'Text', text: /^S$/ }))?.text).toBe('S')
  await $.command.run({ command: 'usage_bars', args: '' } as never)
  await ui.unmount()

  ui = await $.ui.mount(narrow as never)
  expect(await ui.find({ type: 'Text', text: /33%/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
})
