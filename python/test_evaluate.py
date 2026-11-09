import unittest
from evaluate import RESULT_VALIDATOR, REQUEST_VALIDATOR, evaluate


class ProtocolTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
