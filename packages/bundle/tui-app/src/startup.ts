/** Command-line provider for the post-install `tui` profile application. */

import { Command } from 'commander'
import { parseCmdline, type Context } from './host.ts'
import { assertTuiHostCompatibility } from './compatibility.ts'

export const name = 'tui-startup'
export const inject = ['cmdlineArgs']
/** Service key carrying parsed TUI application flags. */
export const TUI_STARTUP_SERVICE = 'tuiStartup'

/** Immutable values published after successful TUI flag parsing. */
export interface TuiStartupValues {
  /** Persisted TUI-owned Session selected by `--resume`. */
  resume?: string
}

function tuiCommand(): Command {
  return new Command()
    .name('dsh --profile tui')
    .description('Run the native DeepSeek Harness terminal UI.')
    .helpOption('-h, --help', 'show this help')
    .option('--resume <session-id>', 'resume a TUI-owned persisted Session')
    .addHelpText('after', `
Examples:
  dsh --profile tui                              start a new terminal Session
  dsh --profile tui --resume <session-id>        resume a TUI-owned Session
`)
}

export function apply(ctx: Context): void {
  assertTuiHostCompatibility()
  const program = tuiCommand()
  program.action(() => {
    const options = program.opts<{ resume?: string }>()
    if (options.resume === '') program.error('error: --resume needs a Session id')
    ctx.provide(TUI_STARTUP_SERVICE, {
      ...options.resume === undefined ? {} : { resume: options.resume },
    } satisfies TuiStartupValues)
  })
  parseCmdline(ctx, program)
}
