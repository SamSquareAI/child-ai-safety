"""Local JSON protocol evaluation client. No policy engine or network calls.

Explicitly executes a trusted local adapter command, without a shell. Synthetic
oracle runs test wiring only and must never be described as model accuracy.
They provide no safety evidence.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path
from jsonschema import Draft202012Validator

MAX_RESPONSE_BYTES = 32768
ROOT = Path(__file__).resolve().parents[1]
CONTRACT = json.loads((ROOT / "src/protocol.schema.json").read_text())
RESULT_VALIDATOR = Draft202012Validator({"$defs": CONTRACT["$defs"], "$ref": "#/$defs/result"})
REQUEST_VALIDATOR = Draft202012Validator({"$defs": CONTRACT["$defs"], "$ref": "#/$defs/request"})
ACTIONS = tuple(CONTRACT["$defs"]["result"]["properties"]["action"]["enum"])
FAILURES = ("invalid_response", "adapter_error")


def _rate(numerator, denominator):
    return {"numerator": numerator, "denominator": denominator,
            "value": numerator / denominator if denominator else None}


def _summarize(cases):
    # Rows are fixture expectations; columns include failures so every sample
    # stays visible, even when no valid action was returned.
    matrix = {expected: dict.fromkeys(ACTIONS + FAILURES, 0) for expected in ACTIONS}
    for case in cases:
        column = case["actual"] if case["actual"] is not None else case["outcome"]
        matrix[case["expected"]][column] += 1
    per_action = {}
    for action in ACTIONS:
        expected = sum(matrix[action].values())
        actual = sum(row[action] for row in matrix.values())
        matches = matrix[action][action]
        per_action[action] = {
            "expected": expected, "actual": actual, "matches": matches,
            "precision": _rate(matches, actual), "recall": _rate(matches, expected),
        }
    matches = sum(c["outcome"] == "match" for c in cases)
    failures = {failure: sum(c["outcome"] == failure for c in cases) for failure in FAILURES}
    false_allows = sum(matrix[action]["allow"] for action in ACTIONS if action != "allow")
    non_allow_expected = sum(c["expected"] != "allow" for c in cases)
    return {
        "total": len(cases), "matches": matches,
        "mismatches": sum(c["outcome"] == "mismatch" for c in cases),
        "valid_responses": len(cases) - sum(failures.values()),
        **failures,
        "match_rate": _rate(matches, len(cases)),
        "false_allows": false_allows,
        "false_allow_rate": _rate(false_allows, non_allow_expected),
        "refusal_responses": per_action["refuse"]["actual"],
        "support_responses": per_action["support"]["actual"],
        "unavailable": per_action["unavailable"]["actual"],
        "confusion_matrix": matrix, "per_action": per_action,
    }


def evaluate(command, fixtures, synthetic=False):
    cases = []
    for case in fixtures:
        if case["expected"] not in ACTIONS:
            raise ValueError("Fixture expected action must be a protocol action")
        # Context is trusted local test configuration, not wire authority.
        args = list(command)
        if case.get("locale") is not None:
            args += ["--locale", case["locale"]]
        args += ["--age-band", case["ageBand"]]
        request = {"protocolVersion": "1", "input": case["text"]}
        REQUEST_VALIDATOR.validate(request)
        payload = json.dumps(request, ensure_ascii=False).encode()
        # A file bounds retained response bytes in memory; command is trusted
        # local developer code, not arbitrary customer code or a sandbox.
        import tempfile
        outcome = "invalid_response"
        action = None
        with tempfile.TemporaryFile() as stream:
            try:
                proc = subprocess.run(args, input=payload, stdout=stream, stderr=subprocess.DEVNULL, timeout=10, cwd=ROOT, check=False)
                stream.seek(0)
                data = stream.read(MAX_RESPONSE_BYTES + 1)
                if proc.returncode == 0 and len(data) <= MAX_RESPONSE_BYTES:
                    result = json.loads(data)
                    # Same bundled schema, independent Python validator. This
                    # validates the protocol, never semantic child safety.
                    if RESULT_VALIDATOR.is_valid(result):
                        action = result["action"]
                        outcome = "match" if action == case["expected"] else "mismatch"
            except (OSError, ValueError, subprocess.TimeoutExpired):
                outcome = "adapter_error"
        cases.append({"id": case["id"], "expected": case["expected"], "actual": action, "outcome": outcome})
        if case.get("locale") is not None:
            cases[-1]["locale"] = case["locale"]
    locales = sorted({c["locale"] for c in cases if "locale" in c})
    return {
        "protocolVersion": "1",
        "scope": "SYNTHETIC_ORACLE_CONTRACT_ONLY" if synthetic else "LOCAL_ADAPTER_ACTION_COMPARISON_NOT_CERTIFICATION",
        "evidence_notice": (
            "Synthetic oracle reads fixture labels: protocol wiring only; no safety evidence."
            if synthetic else
            "Local fixture action comparison only; no safety certification or population-level claims."
        ),
        **_summarize(cases),
        "by_locale": {locale: _summarize([c for c in cases if c.get("locale") == locale]) for locale in locales},
        "without_locale": _summarize([c for c in cases if "locale" not in c]),
        "cases": cases,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--synthetic-demo", action="store_true")
    parser.add_argument("--fail-on-mismatch", action="store_true", help="Exit 1 on any fixture-label mismatch; not a semantic safety gate")
    parser.add_argument("--command", nargs=argparse.REMAINDER, help="Trusted local adapter executable and arguments")
    args = parser.parse_args()
    if args.synthetic_demo and args.command:
        parser.error("Choose synthetic demo OR a local adapter command")
    command = ["node", "examples/fixture-runner.mjs", "--synthetic-oracle"] if args.synthetic_demo else args.command
    if not command:
        parser.error("Select --synthetic-demo or --command")
    fixtures = json.loads((ROOT / "fixtures/scenarios.json").read_text())
    report = evaluate(command, fixtures, args.synthetic_demo)
    print(json.dumps(report, indent=2))
    if any(c["outcome"] in ("invalid_response", "adapter_error") for c in report["cases"]):
        sys.exit(1)
    if args.fail_on_mismatch and report["mismatches"]:
        sys.exit(1)
