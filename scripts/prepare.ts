import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync } from 'node:fs';
import path from 'node:path';

const gitDirectory = path.resolve('.git');
const gitHooksDirectory = path.join(gitDirectory, 'hooks');

if (process.env['CI'] === 'true') {
  console.log('Skipping lefthook install in CI.');
  process.exit(0);
}

if (!existsSync(gitDirectory)) {
  console.log('Skipping lefthook install because .git is not available.');
  process.exit(0);
}

try {
  accessSync(gitHooksDirectory, constants.W_OK);
} catch {
  console.warn(`Skipping lefthook install because ${gitHooksDirectory} is not writable.`);
  process.exit(0);
}

execFileSync('lefthook', ['install'], { stdio: 'inherit' });
