/**
 * What this file does:
 * Defines project creation payloads, including workflow and custom-field configuration.
 * What calls it:
 * src/app/api/organizations/[organizationId]/projects/route.ts.
 * What it calls:
 * Zod validators plus Prisma enum-backed validation.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Allowing arbitrary workflow status arrays without verifying exactly one initial status exists.
 */
import { CustomFieldType, WorkflowStatusCategory } from "@prisma/client";
import { z } from "zod";

export const createProjectSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(2)
      .max(8)
      .regex(/^[A-Z][A-Z0-9]+$/, "Project key must be uppercase letters and numbers."),
    name: z.string().trim().min(3).max(80),
    description: z.string().trim().max(500).nullable().optional(),
    workflowName: z.string().trim().min(3).max(80),
    statuses: z
      .array(
        z.object({
          key: z.string().trim().min(2).max(30).regex(/^[a-z0-9-]+$/),
          name: z.string().trim().min(2).max(40),
          category: z.nativeEnum(WorkflowStatusCategory),
          position: z.number().int().nonnegative(),
          isInitial: z.boolean(),
        }),
      )
      .min(3)
      .max(8),
    customFields: z
      .array(
        z.object({
          key: z.string().trim().min(2).max(30).regex(/^[a-z0-9-]+$/),
          name: z.string().trim().min(2).max(60),
          type: z.nativeEnum(CustomFieldType),
          required: z.boolean(),
          position: z.number().int().nonnegative(),
          config: z.record(z.string(), z.unknown()).nullable().optional(),
        }),
      )
      .max(12)
      .default([]),
  })
  .superRefine((value, ctx) => {
    const initialStatuses = value.statuses.filter((status) => status.isInitial);

    if (initialStatuses.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "Exactly one workflow status must be marked as initial.",
        path: ["statuses"],
      });
    }
  });
