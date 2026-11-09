"""Local JSON protocol evaluation client. No policy engine or network calls.

Explicitly executes a trusted local adapter command, without a shell. Synthetic
oracle runs test wiring only and must never be described as model accuracy.
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


def evaluate(command, fixtures, synthetic=False):
    cases = []
    for case in fixtures:
        # Context is trusted local test configuration, not wire authority.
        args = list(command) + ["--locale", case["locale"], "--age-band", case["ageBand"]]
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
    return {"protocolVersion": "1", "scope": "SYNTHETIC_ORACLE_CONTRACT_ONLY" if synthetic else "LOCAL_ADAPTER_ACTION_COMPARISON_NOT_CERTIFICATION", "total": len(cases), "matches": sum(c["outcome"] == "match" for c in cases), "cases": cases}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--synthetic-demo", action="store_true")
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
