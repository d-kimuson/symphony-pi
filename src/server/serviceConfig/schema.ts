import * as v from 'valibot';

export const projectObjectSchema = v.object({
  id: v.optional(v.pipe(v.string(), v.nonEmpty())),
  root: v.pipe(v.string(), v.nonEmpty()),
  workflow: v.optional(v.pipe(v.string(), v.nonEmpty())),
});

export const projectConfigInputSchema = v.union([
  v.pipe(v.string(), v.nonEmpty()),
  projectObjectSchema,
]);

export const projectsConfigFileSchema = v.object({
  max_concurrent_agents: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  projects: v.array(projectConfigInputSchema),
});

export const serviceConfigSchema = v.object({
  max_concurrent_agents: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  projects: v.pipe(v.array(projectConfigInputSchema), v.minLength(1)),
});
