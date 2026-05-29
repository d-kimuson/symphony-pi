import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sandboxDirectory = mkdtempSync(path.join(tmpdir(), 'symphony-pi-pack-'));

try {
  execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', sandboxDirectory], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      COREPACK_HOME: path.join(sandboxDirectory, 'corepack-home'),
      XDG_CACHE_HOME: path.join(sandboxDirectory, 'xdg-cache'),
      PNPM_HOME: path.join(sandboxDirectory, 'pnpm-home'),
    },
  });

  const tarballs = readdirSync(sandboxDirectory)
    .filter((entry) => entry.endsWith('.tgz'))
    .sort();
  const tarball = tarballs[0];

  if (tarball === undefined) {
    throw new Error('npm pack did not create a tarball');
  }

  execFileSync('tar', ['-xzf', path.join(sandboxDirectory, tarball), '-C', sandboxDirectory], {
    stdio: 'inherit',
  });

  const packageDirectory = path.join(sandboxDirectory, 'package');
  const requiredFiles = ['dist/cli.mjs', 'dist/web/index.html'];

  for (const requiredFile of requiredFiles) {
    const filePath = path.join(packageDirectory, requiredFile);
    if (!existsSync(filePath)) {
      throw new Error(`Packed package is missing ${requiredFile}`);
    }
  }

  const webAssetsDirectory = path.join(packageDirectory, 'dist/web/assets');
  if (!existsSync(webAssetsDirectory)) {
    throw new Error('Packed package is missing dist/web/assets');
  }

  execFileSync(process.execPath, [path.join(packageDirectory, 'dist/cli.mjs'), '--help'], {
    stdio: 'inherit',
  });
} finally {
  rmSync(sandboxDirectory, { recursive: true, force: true });
}
