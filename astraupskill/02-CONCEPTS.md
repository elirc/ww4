# Configuration is part of validation

An issue payload alone cannot determine whether a custom field is valid. The service uses the project's definitions, rejecting unknown field ids, missing required values, wrong primitive types and invalid select options. Similarly, the client does not choose the initial workflow status; project configuration supplies it.

Authorization and configuration validation answer different questions. OBSERVER refusal is403, missing workflow404, no initial status409 and invalid assignee/custom value400. Keeping these real errors visible teaches callers how to respond.

Grouping writes under a transaction is distinct from proving atomicity. The test observes client identity and call ordering. A database test must establish rollback and sequence allocation under contention. Pre-transaction membership and setup reads can become stale; the lab does not resolve that concurrency question.
