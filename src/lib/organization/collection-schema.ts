/** Corps des requêtes de collection, partagés par les routes. */
import { z } from "zod";
import { COLLECTION_DESCRIPTION_MAX } from "./types";
import { collectionRulesSchema } from "./rules";

const sort = z.enum(["date", "name", "size"]);
const order = z.enum(["asc", "desc"]);

export const createCollectionSchema = z.object({
  name: z.string().max(200),
  description: z.string().max(COLLECTION_DESCRIPTION_MAX).nullable().optional(),
  rules: collectionRulesSchema,
  sort: sort.optional(),
  order: order.optional(),
  pinned: z.boolean().optional(),
});

export const updateCollectionSchema = createCollectionSchema.partial();

export const previewCollectionSchema = z.object({
  rules: collectionRulesSchema,
  sort: sort.optional(),
  order: order.optional(),
});
