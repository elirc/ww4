# Answers and review rubric

Creation uses the server-supplied workflow and initial status; the key is OPS-8. OBSERVER receives403 before setup. The outsider case receives400 after setup and a lookup containing org-1/project-1, before tx. Missing or mistyped required points and foreign field ids receive400; numeric3 reaches custom persistence. A missing workflow is404, while a workflow without an initial status is409.

Activity failure preserves the injected error after sequence and create attempts, with no event enqueue. Grade answers on scope ids, actual error classes, exact order and the distinction between attempted writes and committed rows. The service's transaction-client discipline is tested; database rollback, sequence uniqueness and automation execution are not. A strong review names that missing evidence without changing expectations to make a mock pass.
