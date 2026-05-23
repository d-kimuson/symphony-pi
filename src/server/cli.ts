/** CLI argument parsing. */

export type CliArgs = {
  port?: number;
  workflow?: string;
};

/**
 * Parse process.argv into typed CLI arguments.
 */
export const parseCliArgs = (argv: readonly string[]): CliArgs => {
  const args: CliArgs = {};

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && i + 1 < argv.length) {
      const next = argv[i + 1];
      if (next === undefined) continue;
      const val = parseInt(next, 10);
      i++;
      if (!Number.isNaN(val) && val > 0 && val <= 65535) {
        args.port = val;
      }
    } else if (arg === '--workflow' && i + 1 < argv.length) {
      const next = argv[i + 1];
      if (next !== undefined && next.length > 0) {
        args.workflow = next;
        i++;
      }
    }
  }

  return args;
};
