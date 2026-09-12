import { z } from 'astro/zod';

const common = z.object({
  title: z.string().trim().min(8),
  description: z.string().trim().min(20),
  context: z.string().trim().min(3),
  order: z.number(),
  featured: z.boolean(),
  tags: z.array(z.string()),
  linkLabel: z.string().trim().min(8).optional(),
});

// Detailed cases must supply their own opening; there are no shared text defaults.
export const caseSchema = z.discriminatedUnion('detailed', [
  common.extend({ detailed: z.literal(false) }),
  common.extend({
    detailed: z.literal(true),
    opening: z.object({
      subtitle: z.string().trim().min(20),
      contribution: z.string().trim().min(20),
      outcome: z.string().trim().min(20),
      evidence: z.string().trim().min(20),
    }),
  }),
]);
