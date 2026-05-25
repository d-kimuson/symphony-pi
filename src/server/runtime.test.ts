import { describe, expect, it } from 'vitest';

import { resolveSymphonyRuntime, shouldServeBuiltWeb } from './runtime.ts';

describe('resolveSymphonyRuntime', () => {
  it('defaults to prod when env is missing', () => {
    expect(resolveSymphonyRuntime({})).toBe('prod');
  });

  it('returns dev and test explicitly', () => {
    expect(resolveSymphonyRuntime({ SYMPHONY_RUNTIME: 'dev' })).toBe('dev');
    expect(resolveSymphonyRuntime({ SYMPHONY_RUNTIME: 'test' })).toBe('test');
  });

  it('treats unknown values as prod', () => {
    expect(resolveSymphonyRuntime({ SYMPHONY_RUNTIME: 'staging' })).toBe('prod');
  });
});

describe('shouldServeBuiltWeb', () => {
  it('serves built web only in prod', () => {
    expect(shouldServeBuiltWeb('prod')).toBe(true);
    expect(shouldServeBuiltWeb('dev')).toBe(false);
    expect(shouldServeBuiltWeb('test')).toBe(false);
  });
});
