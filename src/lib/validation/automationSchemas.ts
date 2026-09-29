/**
 * What this file does:
 * Validates automation rule definitions and manual job processor requests.
 * What calls it:
 * Automation rule and job-processing routes under src/app/api/organizations.
 * What it calls:
 * Zod validators plus Prisma enum-backed validation.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Allowing the action payload shape to float independently from the action type, which produces rules that save successfully but explode at runtime.
 */
import { AutomationActionType, AutomationEventType } from "@prisma/client";
import { z } from "zod";

const addCommentPayloadSchema = z.object({
  comment: z.string().trim().min(3).max(300),
});

const assignUserPayloadSchema = z.object({
  assigneeId: z.string().min(1),
});

const baseRuleSchema = z.object({
  name: z.string().trim().min(3).max(80),
  projectId: z.string().min(1),
  eventType: z.nativeEnum(AutomationEventType),
  conditions: z
    .object({
      fromStatusId: z.string().min(1).optional(),
      toStatusId: z.string().min(1).optional(),
      priority: z.string().min(1).optional(),
    })
    .optional(),
});

export const createAutomationRuleSchema = z.union([
  baseRuleSchema.extend({
    actionType: z.literal(AutomationActionType.ADD_COMMENT),
    actionPayload: addCommentPayloadSchema,
  }),
  baseRuleSchema.extend({
    actionType: z.literal(AutomationActionType.ASSIGN_USER),
    actionPayload: assignUserPayloadSchema,
  }),
]);

export const processAutomationJobsSchema = z.object({
  projectId: z.string().min(1),
  limit: z.number().int().min(1).max(25).default(10),
});
