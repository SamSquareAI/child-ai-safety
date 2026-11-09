import json
import subprocess
import sys
import unittest
from unittest.mock import patch
from evaluate import ACTIONS, MAX_RESPONSE_BYTES, RESULT_VALIDATOR, REQUEST_VALIDATOR, evaluate


class ProtocolTests(unittest.TestCase):
    def test_cli_mismatch_failure_is_explicit_opt_in(self):
        # Always-allow fixture adapter intentionally disagrees with draft labels.
        # No detector or safety claim: this checks the CLI regression switch.
        script = 'import json;print(json.dumps({"protocolVersion":"1","policyVersion":"0","detectorId":"synthetic","detectorRevision":"0","action":"allow","text":"synthetic"}))'
        for flags, expected_exit in [([], 0), (["--fail-on-mismatch"], 1)]:
            proc = subprocess.run([sys.executable, "python/evaluate.py", *flags,
                                   "--command", sys.executable, "-c", script],
                                  capture_output=True, timeout=30, check=False)
            self.assertEqual(proc.returncode, expected_exit, proc.stderr.decode())
            report = json.loads(proc.stdout)
            self.assertGreater(report["mismatches"], 0)
            self.assertGreater(report["false_allows"], 0)

    def test_no_body_authority(self):
        self.assertFalse(REQUEST_VALIDATOR.is_valid({"protocolVersion": "1", "input": "Hello", "tenantId": "other"}))

    def test_no_raw_content_in_blocked_result(self):
        receipt = {"protocolVersion": "1", "policyVersion": "0", "detectorId": "fixture", "detectorRevision": "0"}
        self.assertTrue(RESULT_VALIDATOR.is_valid(dict(receipt, action="refuse", responseId="en.refuse.privacy")))
        self.assertFalse(RESULT_VALIDATOR.is_valid(dict(receipt, action="refuse", responseId="en.refuse.privacy", text="PRIVATE")))

    def test_unknown_version_and_missing_receipt(self):
        self.assertFalse(RESULT_VALIDATOR.is_valid({"protocolVersion": "2", "action": "allow", "text": "Hello"}))
        self.assertFalse(RESULT_VALIDATOR.is_valid({"protocolVersion": "1", "action": "allow", "text": "Hello"}))

    def test_failed_adapter_is_not_a_match(self):
        report = evaluate(["/nonexistent/synthetic-adapter"], [{"id": "synthetic", "locale": "en", "ageBand": "9-11", "text": "Hello", "expected": "allow"}])
        self.assertEqual(report["matches"], 0)
        self.assertEqual(report["cases"][0]["outcome"], "adapter_error")
        self.assertNotIn("Hello", str(report))


class ReportingTests(unittest.TestCase):
    @staticmethod
    def fixture(index, expected, locale="en"):
        case = {"id": f"synthetic-{index}", "expected": expected,
                "ageBand": "9-11", "text": "SYNTHETIC INPUT ONLY"}
        if locale is not None:
            case["locale"] = locale
        return case

    @staticmethod
    def response(action):
        result = {"protocolVersion": "1", "policyVersion": "0",
                  "detectorId": "synthetic", "detectorRevision": "0", "action": action}
        if action == "allow":
            result["text"] = "SYNTHETIC OUTPUT ONLY"
        else:
            category = "none" if action == "unavailable" else "privacy"
            result["responseId"] = f"en.{action}.{category}"
        return json.dumps(result).encode()

    def run_cases(self, fixtures, responses, synthetic=False):
        responses = iter(responses)

        def run(args, **kwargs):
            response = next(responses)
            if isinstance(response, Exception):
                raise response
            data, returncode = response if isinstance(response, tuple) else (response, 0)
            kwargs["stdout"].write(data)
            return subprocess.CompletedProcess(args, returncode)

        with patch("evaluate.subprocess.run", side_effect=run) as adapter:
            report = evaluate(["synthetic-adapter"], fixtures, synthetic)
        return report, adapter

    def test_all_action_pairs(self):
        pairs = [(expected, actual) for expected in ACTIONS for actual in ACTIONS]
        fixtures = [self.fixture(i, expected) for i, (expected, _) in enumerate(pairs)]
        report, _ = self.run_cases(fixtures, [self.response(actual) for _, actual in pairs])
        self.assertEqual(report["total"], 16)
        self.assertEqual(report["matches"], 4)
        self.assertEqual(report["mismatches"], 12)
        self.assertEqual(report["valid_responses"], 16)
        self.assertEqual(report["match_rate"], {"numerator": 4, "denominator": 16, "value": .25})
        self.assertEqual(report["false_allows"], 3)
        self.assertEqual(report["false_allow_rate"], {"numerator": 3, "denominator": 12, "value": .25})
        for action in ACTIONS:
            self.assertEqual(report["per_action"][action]["expected"], 4)
            self.assertEqual(report["per_action"][action]["actual"], 4)
            self.assertEqual(report["per_action"][action]["precision"]["value"], .25)
            self.assertEqual(report["per_action"][action]["recall"]["value"], .25)
            for actual in ACTIONS:
                self.assertEqual(report["confusion_matrix"][action][actual], 1)
        self.assertEqual(report["refusal_responses"], 4)
        self.assertEqual(report["support_responses"], 4)
        self.assertEqual(report["unavailable"], 4)
        self.assertNotIn("SYNTHETIC INPUT ONLY", json.dumps(report))
        self.assertNotIn("SYNTHETIC OUTPUT ONLY", json.dumps(report))

    def test_failures_remain_in_denominators(self):
        responses = [b"not json", b"{}", (self.response("allow"), 1),
                     b"x" * (MAX_RESPONSE_BYTES + 1),
                     subprocess.TimeoutExpired("synthetic-adapter", 10), OSError("synthetic"),
                     self.response("unavailable"), self.response("refuse")]
        report, _ = self.run_cases([self.fixture(i, "refuse") for i in range(8)], responses)
        self.assertEqual(report["invalid_response"], 3)
        # JSON decoding errors retain the evaluator's existing adapter_error outcome.
        self.assertEqual(report["adapter_error"], 3)
        self.assertEqual(report["valid_responses"], 2)
        self.assertEqual(report["matches"], 1)
        self.assertEqual(report["mismatches"], 1)
        self.assertEqual(report["match_rate"]["denominator"], 8)
        self.assertEqual(report["false_allow_rate"]["denominator"], 8)
        self.assertEqual(report["per_action"]["refuse"]["recall"]["value"], 1 / 8)
        self.assertEqual(report["refusal_responses"], 1)
        self.assertEqual(report["unavailable"], 1)
        self.assertEqual(sum(report["confusion_matrix"]["refuse"].values()), 8)
        self.assertEqual(report["confusion_matrix"]["refuse"]["adapter_error"], 3)

    def test_locale_slices_and_missing_locale(self):
        fixtures = [self.fixture(0, "refuse", "en"), self.fixture(1, "support", "fr"),
                    self.fixture(2, "allow", "fr"), self.fixture(3, "unavailable", None)]
        report, adapter = self.run_cases(fixtures, [self.response(a) for a in
                                                  ("allow", "unavailable", "allow", "unavailable")])
        self.assertEqual(set(report["by_locale"]), {"en", "fr"})
        self.assertEqual(report["by_locale"]["en"]["false_allows"], 1)
        self.assertEqual(report["by_locale"]["fr"]["total"], 2)
        self.assertEqual(report["by_locale"]["fr"]["unavailable"], 1)
        self.assertEqual(report["without_locale"]["total"], 1)
        self.assertEqual(report["without_locale"]["matches"], 1)
        self.assertNotIn("locale", report["cases"][-1])
        self.assertNotIn("--locale", adapter.call_args_list[-1].args[0])
        for key in ("total", "matches", "false_allows", "unavailable"):
            self.assertEqual(report[key], sum(s[key] for s in report["by_locale"].values())
                             + report["without_locale"][key])

    def test_empty_and_absent_actions_have_null_rates(self):
        report, adapter = self.run_cases([], [])
        adapter.assert_not_called()
        self.assertEqual(report["total"], 0)
        self.assertEqual(report["by_locale"], {})
        self.assertEqual(report["match_rate"], {"numerator": 0, "denominator": 0, "value": None})
        self.assertIsNone(report["false_allow_rate"]["value"])
        for action in ACTIONS:
            self.assertIsNone(report["per_action"][action]["precision"]["value"])
            self.assertIsNone(report["per_action"][action]["recall"]["value"])
        json.dumps(report, allow_nan=False)
        report, _ = self.run_cases([self.fixture(0, "allow")], [self.response("allow")])
        self.assertIsNone(report["false_allow_rate"]["value"])
        self.assertIsNone(report["per_action"]["refuse"]["recall"]["value"])

    def test_synthetic_notice_is_explicit(self):
        report, _ = self.run_cases([self.fixture(0, "allow")], [self.response("allow")], synthetic=True)
        self.assertEqual(report["scope"], "SYNTHETIC_ORACLE_CONTRACT_ONLY")
        self.assertIn("no safety evidence", report["evidence_notice"])
        self.assertEqual(report["matches"], 1)

    def test_unknown_fixture_action_is_rejected(self):
        with patch("evaluate.subprocess.run") as adapter:
            with self.assertRaises(ValueError):
                evaluate(["synthetic-adapter"], [self.fixture(0, "unknown")])
        adapter.assert_not_called()


if __name__ == "__main__":
    unittest.main()
