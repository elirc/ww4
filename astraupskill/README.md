# Issue creation workshop

Follow [issueService.createIssue](../src/services/issues/issueService.ts) from project permission through configuration checks to transactional writes. The new [runtime lab](../tests/issue-service-runtime.test.mjs) executes the existing service, real permission map, workflow helpers, custom-field validation and error classes. Production behavior is unchanged.

Begin with a prediction: where should an invalid assignee stop? Run the lab, compare call order, then try the custom-field and failure exercises. This course combines source mapping, concrete payload tracing, boundary tests and a review rubric. Repository and automation adapters make calls observable; they do not prove database rollback or worker delivery. Use the separate verification chapter when deciding what a passing result supports.
