import type { BootstrapError } from './app/bootstrap.ts';
import type { ProjectRuntime } from './app/runtime/model.ts';
import type { SymphonyRuntime } from './runtime.ts';

type BootstrapFailurePolicyOptions = {
  readonly runtime: SymphonyRuntime;
  readonly result: ProjectRuntime | BootstrapError;
  readonly failureMessage: string;
};

type BootstrapFailurePolicyResult = {
  readonly runtime: ProjectRuntime | null;
  readonly warning: string | null;
};

export const applyBootstrapFailurePolicy = (
  options: BootstrapFailurePolicyOptions,
): BootstrapFailurePolicyResult => {
  if (!('type' in options.result)) {
    return {
      runtime: options.result,
      warning: null,
    };
  }

  if (options.runtime === 'prod') {
    throw new Error(options.failureMessage);
  }

  return {
    runtime: null,
    warning: `${options.failureMessage} (continuing without project runtime because SYMPHONY_RUNTIME=${options.runtime})`,
  };
};
