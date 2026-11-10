"""Combine model evaluation shards and write a reviewer-facing result summary."""
from pathlib import Path
import json
import sys

from evaluate_workspace import ROOT, read_cases, summarize


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Pass the directory containing the model shard reports.')
    folder = Path(sys.argv[1])
    expected, suite_hash = read_cases(ROOT / 'eval' / 'model.jsonl')
    reports = [json.loads(path.read_text(encoding='utf-8')) for path in sorted(folder.rglob('model-shard-*.json'))]
    if not reports:
        raise SystemExit('The model evaluation did not produce a report.')
    identities = {(item['suite_sha256'], item['model_digest'], item['model'], item['scoring_version'], item['git_head'])
                  for item in reports}
    if len(identities) != 1:
        raise SystemExit('Model evaluation shards differ in suite, revision, or model identity.')
    digest, model_digest, model, scoring, commit = identities.pop()
    if digest != suite_hash or not model_digest or any(item['suite'] != 'model' for item in reports):
        raise SystemExit('The shard reports do not match the published model suite.')
    results = [case for report in reports for case in report['cases']]
    if sorted(case['id'] for case in results) != sorted(case['id'] for case in expected):
        raise SystemExit('Missing or duplicate model cases in the shard reports.')
    stats = summarize(results)
    generated = sum(bool(case.get('model')) for case in results)
    print(f'# CAIL model evaluation · {stats["passed"]}/{stats["total"]} passed')
    print(f'\nModel `{model}` · {generated}/{stats["total"]} final answers generated · rubric v{scoring}')
    print(f'\nCommit `{commit}` · suite SHA-256 `{digest}` · model digest `{model_digest}`')
    print('\n| Category | Passed | Total |\n| --- | ---: | ---: |')
    for name, result in stats['buckets'].items():
        print(f'| {name.replace("_", " ")} | {result["passed"]} | {result["total"]} |')
    if generated < len(results):
        print('\nThe denominator includes application clarifications and cases that lacked a required model reply.')
    print('\nDownload the shard reports to inspect the questions, generated answers, citations and per-case checks.')


if __name__ == '__main__':
    main()
