"""Helper functions used across the project."""


def format_greeting(name: str) -> str:
    """Return a welcome message for the given project name."""
    return f"Welcome to {name}!"


def summarize(values: list[float]) -> dict:
    """Return basic statistics for a list of numbers."""
    if not values:
        return {"count": 0, "min": None, "max": None, "average": None}
    return {
        "count": len(values),
        "min": min(values),
        "max": max(values),
        "average": round(sum(values) / len(values), 2),
    }
