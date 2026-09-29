/**
 * What this file does:
 * Defines issue creation, update, and comment payloads, keeping input-shape validation outside the service layer.
 * What calls it:
 * Issue and comment route handlers under src/app/api/organizations/.../issues.
 * What it calls:
 * Zod validators plus Prisma enum-backed validation.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Treating custom field values as trusted because they came from the app UI, even though stale clients can still send the wrong shapes.
 */
import { IssuePriority, IssueType } from "@prisma/client";
import { z } from "zod";

const customFieldValueSchema = z.object({
  customFieldId: z.string().min(1),
  value: z.unknown().nullable(),
});

export const createIssueSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(4000).nullable().optional(),
  type: z.nativeEnum(IssueType),
  priority: z.nativeEnum(IssuePriority),
  assigneeId: z.string().min(1).nullable().optional(),
  dueDate: z.iso.datetime().nullable().optional(),
  customFieldValues: z.array(customFieldValueSchema).max(20).default([]),
});

export const updateIssueSchema = z
  .object({
    title: z.string().trim().min(3).max(140).optional(),
    description: z.string().trim().max(4000).nullable().optional(),
    priority: z.nativeEnum(IssuePriority).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    dueDate: z.iso.datetime().nullable().optional(),
    statusId: z.string().min(1).optional(),
    customFieldValues: z.array(customFieldValueSchema).max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be updated.",
  });

export const addCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
