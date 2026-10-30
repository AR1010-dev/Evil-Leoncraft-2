from pathlib import Path
from flask import Flask, abort, send_from_directory

app = Flask(__name__)
APP_DIR = Path(__file__).resolve().parent

def _serve_file(filename: str):
    if not filename or filename.startswith("/"):
        abort(404)

    candidate = (APP_DIR / filename).resolve()
    try:
        candidate.relative_to(APP_DIR)
    except ValueError:
        abort(404)

    if not candidate.is_file():
        abort(404)

    return send_from_directory(APP_DIR, filename, max_age=0)

@app.get("/")
def index():
    return _serve_file("index.html")

@app.get("/<path:filename>")
def game_asset(filename):
    return _serve_file(filename)

@app.get("/legacy/vendor/three-0.163.0.module.js")
def legacy_three_module():
    return send_from_directory(APP_DIR / "js", "three.module.js", max_age=0)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
