/**
 * What this file does:
 * Validates saved-filter definitions so shared project queries stay explicit and portable.
 * What calls it:
 * src/app/api/organizations/[organizationId]/filters/route.ts.
 * What it calls:
 * Zod validators only.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Saving arbitrary JSON blobs without constraining supported query operators, which makes filter execution and migrations brittle.
 */
import { IssuePriority } from "@prisma/client";
import { z } from "zod";

export const filterQuerySchema = z.object({
  projectId: z.string().min(1),
  search: z.string().trim().max(120).optional(),
  assigneeId: z.string().min(1).optional(),
  statusIds: z.array(z.string().min(1)).max(8).optional(),
  priority: z.nativeEnum(IssuePriority).optional(),
  onlyMyIssues: z.boolean().optional(),
});

export const saveFilterSchema = z.object({
  name: z.string().trim().min(3).max(80),
  isShared: z.boolean().default(false),
  query: filterQuerySchema,
});
