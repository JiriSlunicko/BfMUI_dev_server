"""(c) 2025 ChatGPT"""
import shutil
import subprocess
import zipfile
from pathlib import Path
from bundle import bundle
from version import get_v

# ---- CONFIG ----
ENTRY_SCRIPT = "app.py"
EXE_NAME = "BfMUI_desktop.exe"
DIST_DIR = Path("dist")
BUILD_DIR = Path("build")
ZIP_NAME = "BfMUI_desktop.zip"

# Files/folders to include in the zip along with the .exe
EXTRA_FILES = [
    "config.txt",
    "static/index.html",
    "static/dev-index.html",
    "static/js/",
    "static/css/",
    "readme.md",
    "v",
]

def clean():
    print("[*] Cleaning previous build...")
    shutil.rmtree(DIST_DIR, ignore_errors=True)
    shutil.rmtree(BUILD_DIR, ignore_errors=True)
    if Path(ZIP_NAME).exists():
        Path(ZIP_NAME).unlink()

def build_exe():
    print("[*] Building .exe with PyInstaller...")
    v = get_v()
    subprocess.run([
        "pyinstaller",
        "--onefile",
        "--clean",
        "--name", f"{Path(EXE_NAME).stem}-{v}",
        ENTRY_SCRIPT
    ], check=True)

def gather_files():
    print("[*] Preparing ZIP package...")
    zip_path = DIST_DIR / ZIP_NAME
    exe_path = DIST_DIR / EXE_NAME
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(exe_path, arcname=EXE_NAME)
        for item in EXTRA_FILES:
            p = Path(item)
            if p.is_file():
                zipf.write(p, item)
            elif p.is_dir():
                for file in p.rglob("*"):
                    if file.is_file():
                        arcname = file
                        zipf.write(file, arcname)
    exe_path.unlink()

    print(f"[OK] Created {zip_path}")

def main():
    clean()
    build_exe()
    gather_files()

if __name__ == "__main__":
    bundle()
    main()
