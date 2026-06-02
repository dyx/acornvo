import { z } from "zod";

const schema = z.object({
  tags: z.array(z.string()).catch([]).transform(t => t.slice(0, 5)),
  rating: z.number().int().min(1).max(10).optional().catch(undefined),
  category: z.enum(['Tutorial', 'Insight']).optional().catch(undefined)
});

console.log(schema.parse({
  tags: ["a", "b", "c", "d", "e", "f"],
  rating: 11,
  category: "Essay"
}));
