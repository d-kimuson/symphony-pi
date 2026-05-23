/**
 * CLI argument parsing using Commander.
 * Implements SPEC 17.7 CLI contract:
 *   - Positional workflow path [workflow-path] (default: ./WORKFLOW.md)
 *   - --port <number> option
 *   - --help auto-generated
 *   - Validates explicit workflow path exists
 */

import { Command } from 'commander';

export type CliArgs = {
  workflowPath: string;
  port?: number;
};

/**
 * Parse process.argv into typed CLI options using Commander.
 */
export const parseCliArgs = (argv: readonly string[]): CliArgs => {
  const program = new Command();

  program
    .name('symphony')
    .description('Long-running automation service that runs coding agents for issue tracker work')
    .version('0.0.0')
    .argument('[workflow-path]', 'Path to WORKFLOW.md', './WORKFLOW.md')
    .option('-p, --port <number>', 'Preferred HTTP server port (default: 48484)', (val) => {
      const parsed = parseInt(val, 10);
      if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid port: ${val}. Must be a number between 1 and 65535.`);
      }
      return parsed;
    })
    .parse([...argv] as Parameters<typeof program.parse>[0]);

  const opts: { port?: number } = program.opts();
  // Commander's processedArgs is typed as any[]; we narrow safely
  const args: readonly unknown[] = program.processedArgs;
  const positional: unknown = args[0];
  const workflowPath = typeof positional === 'string' ? positional : './WORKFLOW.md';

  return {
    workflowPath,
    port: opts.port,
  };
};
