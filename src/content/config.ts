import { defineCollection, z } from 'astro:content';

const guides = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    section: z.enum(['measuring', 'fabric', 'tools', 'technique', 'context']),
    published: z.string(),
    updated: z.string().optional(),
    readingMinutes: z.number().int().positive(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    sources: z
      .array(z.object({ label: z.string(), note: z.string().optional() }))
      .default([]),
  }),
});

export const collections = { guides };
