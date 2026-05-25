export type SymphonyRuntime = 'prod' | 'dev' | 'test';

export const resolveSymphonyRuntime = (env: NodeJS.ProcessEnv = process.env): SymphonyRuntime => {
  const runtime = env['SYMPHONY_RUNTIME'];

  if (runtime === 'dev' || runtime === 'test') {
    return runtime;
  }

  return 'prod';
};

export const shouldServeBuiltWeb = (runtime: SymphonyRuntime): boolean => runtime === 'prod';
