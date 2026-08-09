"""
CaptchaMaster AI Trainer - Auto-Restart Dev Server
Watches backend/ directory for ALL changes (new files, edits, deletes)
and automatically restarts uvicorn.
"""
import subprocess
import sys
import time
from pathlib import Path

try:
    from watchfiles import watch, Change
except ImportError:
    print("Installing watchfiles...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "watchfiles"])
    from watchfiles import watch, Change

HOST = "0.0.0.0"
PORT = 8000
WATCH_DIR = Path(__file__).parent / "backend"
MODULE = "backend.main:app"


def start_server() -> subprocess.Popen:
    cmd = [
        sys.executable, "-m", "uvicorn", MODULE,
        "--host", HOST,
        "--port", str(PORT),
        "--no-access-log",
    ]
    print(f"\n{'='*50}")
    print(f"  Starting server: http://{HOST}:{PORT}")
    print(f"  Watching: {WATCH_DIR}")
    print(f"{'='*50}\n")
    return subprocess.Popen(cmd, cwd=str(Path(__file__).parent))


def main():
    proc = start_server()
    restart_count = 0

    try:
        for changes in watch(str(WATCH_DIR), force_polling=True):
            changed_files = []
            new_files = []
            for change_type, path in changes:
                p = Path(path)
                if p.suffix in (".py",) and "__pycache__" not in str(p):
                    if change_type == Change.added:
                        new_files.append(p.name)
                    else:
                        changed_files.append(p.name)

            if new_files or changed_files:
                restart_count += 1
                tags = []
                if new_files:
                    tags.append(f"NEW: {', '.join(new_files)}")
                if changed_files:
                    tags.append(f"EDITED: {', '.join(changed_files)}")

                print(f"\n[Restart #{restart_count}] Changes detected: {' | '.join(tags)}")
                print("  Restarting server...")

                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()

                time.sleep(0.5)
                proc = start_server()
                print(f"  Server restarted successfully!\n")

    except KeyboardInterrupt:
        print("\nShutting down...")
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        print("Server stopped.")


if __name__ == "__main__":
    main()
