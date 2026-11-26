from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    port: int

    @classmethod
    def load(cls) -> "Settings":
        try:
            port = int(os.environ.get("AI_PORT", "8000"))
        except ValueError:
            port = 0
        if not 1 <= port <= 65535:
            raise ValueError("AI_PORT must be a valid TCP port")
        return cls(port=port)
