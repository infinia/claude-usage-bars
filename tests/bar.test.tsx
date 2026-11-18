import { expect, test } from 'claude-code/testing'

test('the terminal draws a block-character bar', async ($, on) => {
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000 }, rateLimits: [] } }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: 0 }))
  on('clock.every', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'usage_bars' } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.measure({
    context: { window: 1000000 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 50 }],
    changed: ['rateLimits'],
  })

  const ui = await $.ui.mount({
    plugin: 'usage-bars',
    component: 'AbovePrompt',
    surface: 'terminal',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 },
  } as never)
  expect((await ui.find({ type: 'Text', text: /█/ }))?.text).toBe('███████░░░░░░░')
  await ui.unmount()
})
