# Worked lab addition

Use project OPS, actor user-1 and sequence8. Successful creation sends organizationId org-1, projectId project-1, workflowId wf-1, initial status todo and reporterId user-1 to the issue repository. Activity describes OPS-8, and automation receives ISSUE_CREATED with toStatusId todo. The response is `{id: "issue-8", key: "OPS-8"}`.

The new fixture records setup, tx, sequence, create, activity and event. Adding a valid required numeric custom field inserts custom persistence between create and activity. No separate invented validator was added to application code: the test loads the existing service implementation. The [snapshot](snapshots/issueService.ts.original.txt) preserves the reviewed baseline for future experiments.
