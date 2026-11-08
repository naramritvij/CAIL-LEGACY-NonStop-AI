# CAIL answer evaluation

The manifests are checked in as JSON Lines. [The runner](../scripts/evaluate_workspace.py) starts FastAPI on a temporary loopback port, creates an isolated SQLite database, and opens authenticated operator sessions. It makes the same HTTP calls as the workspace UI. The runner exits unsuccessfully when a case fails and can save answers and individual checks as JSON.

| Set | Cases | What runs |
| --- | ---: | --- |
| [Workspace offline](workspace.jsonl) | **120** | 96 questions across four staged incidents, plus 24 checks of reviewed guidance, source availability and action safety in the ordinary assistant. |
| [Local model](model.jsonl) | **100** | 20 general questions, 24 grounded answers, 20 memory cases, 12 observation readings, 12 timeline reasoning cases and 12 operator-judgment cases. Every scored reply must come from the local model. |

## Run and inspect

Install `backend/requirements-dev.txt` in a Python 3.12 virtual environment, then run from the repo root with that environment's Python.

~~~bash
python scripts/evaluate_workspace.py --report eval/results.local.json
~~~

The offline suite runs in [GitHub Actions](../.github/workflows/ci.yml). Its report is available as the **cail-offline-answer-evaluation** artifact on the completed workflow run. A local run passed **120 of 120** cases, with p50 4.0 ms and p95 7.4 ms for answer HTTP requests. Cases include **14 action-safety checks**, **6 checkpoint cutoff checks**, **10 live-source boundary checks**, and **6 unavailable, draft, or superseded guidance checks**. The HTTP workflow also completes four rehearsals with three decisions each, verifies access isolation and retry behavior, and reads all four debriefs after process restart.

With local Ollama running:

~~~bash
ollama pull qwen3:4b-instruct
python scripts/evaluate_workspace.py --suite model --case qwen-01 --case qwen-09 --case qwen-17 --report eval/model-smoke.local.json
python scripts/evaluate_workspace.py --suite model --report eval/model-results.local.json
~~~

The three focused cases cover a definition, a cited reviewed answer, and recall after a topic change. A missing service or tag stops the model run. The runner checks that every scored answer identifies a model and records the local tag digest in the report. The **CAIL local model evaluation** workflow runs the same set in ten isolated shards with a loopback Ollama process on each standard Linux runner. It checks that the reports cover all 100 cases on the same commit and model digest. Open the workflow summary for the measured pass counts and the shard artifacts for individual answers.

## Scoring and interpretation

Rubric v2 accepts equivalent wording in four cases after inspecting the first run's answers. The grounded questions and their required note citations stayed the same. Compare whole-suite scores only under the same rubric. The first run revealed that naming an approved note could skip retrieval. The assistant now selects the named current note before generation and requires an exact citation.

- **Observed facts.** Cases assert answer content and the intended status. Replay questions specify the exact evidence IDs visible at the checkpoint. A case fails if the answer cites a different observation or leaks a later one.
- **Reviewed evidence.** Positive cases require the intended current, signed note. Direct lookup reproduces its text. Boundary cases keep draft or superseded material out of evidence. Model cases require a registered citation to the relevant signed note and check required concepts in the response.
- **Model memory.** Multi-turn cases submit real prelude messages. They test a topic switch, a corrected user detail, and recall of an earlier assistant reply. The earlier-assistant case verifies the first reply before scoring the follow-up.
- **Safety and scope.** Expected statuses include withheld live claims, refusals for write requests, out-of-scope references, missing records and uncertainty. The offline suite also checks that the response and debrief carry the read-only flags.
- **Report.** The JSON includes case IDs, per-check results, bucket totals, question and answer text, citations, the suite hash, model identity when applicable and latency. Latency is the final answer request over local HTTP. It excludes fixture setup and any prelude turns.

The answer assertions check facts and identifiers on these authored fixtures. Review generated prose for semantic support using the recorded answer and cited passage. The offline timing applies to the replay and approved-guidance paths. Operator task time, production incident outcomes and head-to-head model scores require their own trials.
