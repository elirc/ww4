/**
 * What this file does:
 * Enforces workflow-level invariants such as status existence and allowed transitions.
 * What calls it:
 * src/services/issues/issueService.ts and src/services/automation/automationService.ts.
 * What it calls:
 * src/lib/http/errors.ts for conflict and validation failures.
 * One thing a junior engineer would likely get wrong when writing something similar:
 * Checking only that a target status exists, while forgetting to validate whether the current status is allowed to move there.
 */
import type { WorkflowStatus, WorkflowStatusCategory } from "@prisma/client";

import { BadRequestError, ConflictError } from "@/lib/http/errors";

export function requireWorkflowStatus(statuses: WorkflowStatus[], statusId: string) {
  const status = statuses.find((entry) => entry.id === statusId);

  if (!status) {
    throw new BadRequestError("The selected status does not belong to this project's workflow.");
  }

  return status;
}

export function requireInitialWorkflowStatus(statuses: WorkflowStatus[]) {
  const initialStatus = statuses.find((status) => status.isInitial);

  if (!initialStatus) {
    throw new ConflictError("This project workflow is misconfigured because it has no initial status.");
  }

  return initialStatus;
}

function isDoneCategory(category: WorkflowStatusCategory) {
  return category === "DONE";
}

export function assertValidStatusTransition(currentStatus: WorkflowStatus, nextStatus: WorkflowStatus) {
  if (currentStatus.id === nextStatus.id) {
    return;
  }

  // ⚠️ SENIOR NOTE: Done states are terminal here; relaxing this later would require an explicit reopen policy and audit review.
  if (isDoneCategory(currentStatus.category) && !isDoneCategory(nextStatus.category)) {
    throw new ConflictError("Issues in a done state cannot move back to an active state.");
  }
}
