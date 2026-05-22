import { describe, expect, it } from 'vitest';

import { buildCandidateJql, mapJiraPriority } from './jira.js';

describe('buildCandidateJql', () => {
  it('builds JQL from project key and active states', () => {
    const jql = buildCandidateJql('PROJ', ['Todo', 'In Progress']);
    expect(jql).toContain('project = PROJ');
    expect(jql).toContain('status in ("Todo", "In Progress")');
    expect(jql).toContain('ORDER BY priority ASC, created ASC');
  });

  it('handles single state', () => {
    const jql = buildCandidateJql('ABC', ['Open']);
    expect(jql).toContain('status in ("Open")');
  });

  it('handles empty active states', () => {
    const jql = buildCandidateJql('PROJ', []);
    expect(jql).toContain('status in ()');
  });
});

describe('mapJiraPriority', () => {
  it('maps highest to 1', () => {
    expect(mapJiraPriority('Highest')).toBe(1);
  });

  it('maps high to 2', () => {
    expect(mapJiraPriority('High')).toBe(2);
  });

  it('maps medium to 3', () => {
    expect(mapJiraPriority('Medium')).toBe(3);
  });

  it('maps low to 4', () => {
    expect(mapJiraPriority('Low')).toBe(4);
  });

  it('maps lowest to 5', () => {
    expect(mapJiraPriority('Lowest')).toBe(5);
  });

  it('returns null for undefined', () => {
    expect(mapJiraPriority(undefined)).toBeNull();
  });

  it('returns null for unknown priority', () => {
    expect(mapJiraPriority('critical')).toBeNull();
  });
});
