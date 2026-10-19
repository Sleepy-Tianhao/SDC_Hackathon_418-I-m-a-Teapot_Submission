"""Application entry point.

Replace this file with your project's main logic.
"""

import os

from utils import format_greeting, summarize


def main() -> None:
    project_name = os.getenv("PROJECT_NAME", "Project Name")
    print(format_greeting(project_name))

    sample_data = [12, 7, 3, 21, 9]
    print(f"Result: {summarize(sample_data)}")


if __name__ == "__main__":
    main()
