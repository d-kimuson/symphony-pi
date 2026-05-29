/**
 * CLI argument parsing using Commander.
 * Supports either a single workflow path or a multi-project config JSON.
 */

import { Command } from 'commander';

import pkg from '../../package.json' with { type: 'json' };

export type CliArgs =
  | {
      readonly mode: 'workflow';
      readonly workflowPath: string;
      readonly port?: number;
    }
  | {
      readonly mode: 'config';
      readonly configPath: string;
      readonly port?: number;
    };

/**
 * Parse process.argv into typed CLI options using Commander.
 */
export const parseCliArgs = (argv: readonly string[]): CliArgs => {
  const program = new Command();

  program
    .name(pkg.name)
    .description(pkg.description)
    .version(pkg.version)
    .argument('[workflow-path]', 'Path to WORKFLOW.md')
    .option('-c, --config <path>', 'Path to multi-project service config JSON')
    .option('-p, --port <number>', 'Preferred HTTP server port (default: 48484)', (val) => {
      const parsed = parseInt(val, 10);
      if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid port: ${val}. Must be a number between 1 and 65535.`);
      }
      return parsed;
    })
    .parse([...argv]);

  const opts = program.opts<{ config?: string; port?: number }>();
  const workflowPath = program.args[0];

  if (workflowPath !== undefined && opts.config !== undefined) {
    throw new Error('Cannot specify both a workflow path and --config.');
  }

  if (opts.config !== undefined) {
    return {
      mode: 'config',
      configPath: opts.config,
      port: opts.port,
    };
  }

  return {
    mode: 'workflow',
    workflowPath: workflowPath ?? './WORKFLOW.md',
    port: opts.port,
  };
};
