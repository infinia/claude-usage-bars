export type Meter = { percent?: number; resetsAt?: string }

export type Usage = {
  session: Meter
  weekly: Meter
}

// This session's own: context fill as a percentage, cost in US dollars.
export type SessionFigures = { context?: number; cost?: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-bars': { usage: Usage | null; session: SessionFigures; isHidden: boolean }
  }
}
