/**
 * Hand terminal ownership back before starting the launcher's bounded teardown.
 * @param releaseTerminal - Synchronous unmount and terminal restoration.
 * @param exit - Launcher exit request, absent during owner disposal.
 */
export function requestTuiExit(
  releaseTerminal: () => void,
  exit: (() => void) | undefined,
): void {
  releaseTerminal()
  exit?.()
}
