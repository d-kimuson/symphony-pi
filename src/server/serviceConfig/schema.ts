import * as v from 'valibot';

const projectObjectSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.nonEmpty())),
  root: v.pipe(v.string(), v.nonEmpty()),
  workflow: v.optional(v.pipe(v.string(), v.nonEmpty())),
});

export const serviceConfigSchema = v.object({
  max_concurrent_agents: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  projects: v.pipe(
    v.array(v.union([v.pipe(v.string(), v.nonEmpty()), projectObjectSchema])),
    v.minLength(1),
  ),
});
