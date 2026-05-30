import { Command } from 'commander';

import pkg from '../../package.json' with { type: 'json' };

export type CliArgs =
  | {
      readonly command: 'start';
      readonly port?: number;
    }
  | {
      readonly command: 'projects-list';
    }
  | {
      readonly command: 'projects-add';
    }
  | {
      readonly command: 'projects-delete';
    };

const parsePort = (value: string): number => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}. Must be a number between 1 and 65535.`);
  }
  return parsed;
};

export const parseCliArgs = (argv: readonly string[]): CliArgs => {
  const program = new Command();
  let parsedArgs: CliArgs | null = null;

  program.name(pkg.name).description(pkg.description).version(pkg.version);

  program
    .command('start')
    .description('Start Symphony using ~/.symphony-pi/projects.json')
    .option('-p, --port <number>', 'Preferred HTTP server port (default: 48484)', parsePort)
    .action((options: { readonly port?: number }) => {
      parsedArgs = {
        command: 'start',
        port: options.port,
      };
    });

  const projectsCommand = program
    .command('projects')
    .description('Manage ~/.symphony-pi/projects.json');

  projectsCommand
    .command('list')
    .description('List configured projects')
    .action(() => {
      parsedArgs = { command: 'projects-list' };
    });

  projectsCommand
    .command('add')
    .description('Interactively add a project')
    .action(() => {
      parsedArgs = { command: 'projects-add' };
    });

  projectsCommand
    .command('delete')
    .description('Interactively delete a project')
    .action(() => {
      parsedArgs = { command: 'projects-delete' };
    });

  program.parse([...argv]);

  if (parsedArgs !== null) {
    return parsedArgs;
  }

  throw new Error('A command is required. Use --help to see available commands.');
};
