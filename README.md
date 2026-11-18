# usage-bars

A Claude Code mod that shows your usage as one compact line above the prompt:

```
Context ▬▬▬▬── 31%  |  Session ▬───── 8% 2h  |  Week ▬▬▬─── 40% 26h  |  $ 18.09
```

- **Context**: how full this session's context window is
- **Session**: the 5-hour limit, with the time until it resets
- **Week**: the 7-day limit, with the time until it resets
- **Cost**: this session's cost so far

Bars turn amber at 70% and red at 90%. The labels shorten to initials when the window is narrow. Limit readings refresh every minute and are cached between sessions, so the band shows straight away. It is designed for the Claude desktop app and also works in the terminal.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install usage-bars --marketplace infinia/claude-usage-bars
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

From a shell:

```bash
claude plugin install usage-bars --marketplace infinia/claude-usage-bars
```

In the desktop app, where `/plugin` doesn't run: click **+** next to the prompt box, then **Plugins**, then **Add marketplace** with `infinia/claude-usage-bars`, then **Add plugin**.

## Use

`/usage_bars` shows or hides the band.
