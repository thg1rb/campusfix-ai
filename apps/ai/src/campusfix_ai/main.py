import argparse

import uvicorn

from campusfix_ai.bootstrap import create_app
from campusfix_ai.config import Settings


def app_factory():
    return create_app(Settings.load())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reload", action="store_true")
    args = parser.parse_args()
    uvicorn.run(
        "campusfix_ai.main:app_factory",
        factory=True,
        host="0.0.0.0",
        port=Settings.load().port,
        reload=args.reload,
        reload_dirs=["src"] if args.reload else None,
        timeout_graceful_shutdown=8,
    )


if __name__ == "__main__":
    main()
