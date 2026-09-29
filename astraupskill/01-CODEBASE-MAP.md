# Map the creation path

The service calls assertProjectPermission before getProjectSetup. The real permission helper reads organizationRole and projectRole, not a generic role field. Organization administrators can bypass project-role restrictions; an OBSERVER lacks issue:create.

Setup supplies workflow statuses and custom-field definitions. An assignee is checked through an organization/project-scoped member lookup. validateCustomFieldValues checks configured types and required values; requireInitialWorkflowStatus rejects a workflow without an initial status. These reads and checks occur before the transaction.

Inside the callback, sequence allocation precedes createIssue, optional custom values, createActivity and enqueueIssueEvent. Every persistence adapter receives the same tx object. The response contains issue id and the project-key/sequence combination, such as OPS-8.
