import { runSymphonyCli } from './server/main.ts';

void runSymphonyCli(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[symphony] Fatal bootstrap error: ${message}`);
  process.exit(1);
});
