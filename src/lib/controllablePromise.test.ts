import { describe, expect, it } from 'vitest';

import { controllablePromise } from './controllablePromise.js';

describe('controllablePromise', () => {
  it('creates a pending controllable promise', () => {
    const cp = controllablePromise<string>();
    expect(cp.status).toBe('pending');
    expect(cp.promise).toBeInstanceOf(Promise);
    expect(typeof cp.resolve).toBe('function');
    expect(typeof cp.reject).toBe('function');
  });

  it('resolves and changes status', async () => {
    const cp = controllablePromise<string>();
    cp.resolve('hello');
    expect(cp.status).toBe('resolved');
    const result = await cp.promise;
    expect(result).toBe('hello');
  });

  it('rejects and changes status', async () => {
    const cp = controllablePromise<string>();
    const err = new Error('test');
    cp.reject(err);
    expect(cp.status).toBe('rejected');
    await expect(cp.promise).rejects.toThrow('test');
  });

  it('supports number type', async () => {
    const cp = controllablePromise<number>();
    cp.resolve(42);
    expect(await cp.promise).toBe(42);
  });
});
