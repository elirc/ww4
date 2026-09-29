# Trace worksheet

| Case | Recorded prefix | Result |
|---|---|---|
| Normal create | setup, tx, sequence, create, activity, event | OPS-8 |
| OBSERVER | none |403 |
| Invalid assignee | setup, members |400 |
| Invalid custom value | setup |400 |
| No initial status | setup |409 |
| Activity failure | setup, tx, sequence, create, activity | injected error |

Annotate every row with actor, organization, project and issue identifiers. Mark setup and membership reads as outside tx. In the successful custom-field case, add a custom step before activity. Compare your worksheet with the test call arrays, then mark which facts came from real policy execution and which came from adapter returns. This prevents a trace diagram from implying unobserved database behavior.
