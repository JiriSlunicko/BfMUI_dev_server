import os
import sys
from pathlib import Path
import shutil

from dotenv import load_dotenv


class Config:
    debug: bool
    root: Path
    data_dir: Path
    urlpat: str = "" # overwritten by the tiles module

    def __init__(self):
        self.root = Path(
            sys.executable if getattr(sys, "frozen", False)
            else __file__
        ).parent.resolve()

        # auto-create .env from .env.example if it doesn't exist
        env = self.root / ".env"
        if not env.exists():
            env_example = self.root / ".env.example"
            if not env_example.exists():
                raise FileNotFoundError("Neither .env or .env.example exists!")
            print("WARNING: '.env' does not exist, copying from '.env.example'.")
            shutil.copy(env_example, env)

        load_dotenv(env)
        self.debug = os.getenv("DEBUG") == "1"

        self.data_dir = self.root # overwritten by Kotlin wrapper


cfg: Config = Config()
