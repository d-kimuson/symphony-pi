import { randomUUID } from 'node:crypto';

/** Server-only identifier helpers. */

/**
 * Generate a unique session thread ID.
 * Uses UUID for uniqueness across restarts.
 */
export const generateThreadId = (): string => randomUUID();

/**
 * Compose a synthetic Symphony session ID from pi thread and turn IDs.
 * Format: `pi:<thread_id>:<turn_id>`
 */
export const composeSessionId = (threadId: string, turnId: string): string =>
  `pi:${threadId}:${turnId}`;

/**
 * Format a turn ID from a monotonically increasing number.
 * Format: `turn-<n>`
 */
export const formatTurnId = (turnNumber: number): string => `turn-${turnNumber}`;
