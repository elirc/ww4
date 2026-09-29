# Verification and limits

Command: `node --experimental-vm-modules --test tests/issue-service-runtime.test.mjs`. Five test cases execute actual createIssue, permission mapping, workflow helpers, custom-field validation and error classes. They cover exact success payloads, permission/configuration refusals, scoped assignee lookup, required/type/foreign-field validation and activity failure ordering.

Generated enum exports and JsonNull are adapted, as are repositories, transactions and automation persistence. Same-client assertions verify arguments, not Prisma commit or rollback. No route parsing, database visibility predicate, sequence contention or automation worker ran. Project setup and membership reads precede the transaction, so concurrent configuration changes remain outside this result. Production source is unchanged; the course and portable runtime lab are the delivered improvements.

## Astra execution evidence

The captured focused production-source suite executed 5 tests: all passed, zero failed and zero skipped. Read the [captured output](evidence/crud-b06-astra-runtime.log) and [exact command and limits](evidence/results.json). Earlier check records remain preserved in the workspace.
