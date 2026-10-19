import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from utils import format_greeting, summarize


class TestUtils(unittest.TestCase):
    def test_format_greeting(self):
        self.assertEqual(format_greeting("Demo"), "Welcome to Demo!")

    def test_summarize(self):
        result = summarize([1, 2, 3])
        self.assertEqual(result["count"], 3)
        self.assertEqual(result["average"], 2.0)

    def test_summarize_empty(self):
        self.assertEqual(summarize([])["count"], 0)


if __name__ == "__main__":
    unittest.main()
