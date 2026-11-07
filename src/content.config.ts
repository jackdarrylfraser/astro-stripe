import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const members = defineCollection({
  loader: glob({ base: './src/content/members', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = { members };
