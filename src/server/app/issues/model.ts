/** Normalized issue model shared by tracker adapters and orchestration. */

export type BlockerRef = {
  readonly id: string | null;
  readonly identifier: string | null;
  readonly state: string | null;
};

export type Issue = {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly description: string | null;
  readonly priority: number | null;
  readonly state: string;
  readonly branch_name: string | null;
  readonly url: string | null;
  readonly labels: readonly string[];
  readonly blocked_by: readonly BlockerRef[];
  readonly created_at: string | null;
  readonly updated_at: string | null;
};
