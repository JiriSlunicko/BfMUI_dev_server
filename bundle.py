import os
import re
from pathlib import Path
from rjsmin import jsmin

JS_ROOT: str = os.path.join("static", "js")
BUNDLE_PATH: str = os.path.join("static", "js", "dist", "app.bundle.js")

IGNORE: list[str] = [
  os.path.join("static", "js", "dist")
]

DO_FIRST: list[str] = [
  os.path.join("deps", "lodash.min.js"),
  "010-utils.js",
  "020-ui.js",
  "030-entries.js",
  "040-events.js",
  "050-mainctrl.js",
  "060-ajax.js",
  "070-controls-helpers.js",
]


def read_file(path: str) -> str:
  with open(path, "r", encoding="utf-8") as f:
    return f.read()


def walk_directory(bundle_content: dict[str,str], path: str):
  if path in IGNORE:
    print(f"Ignoring {path}")
    return

  if os.path.isfile(path):
    raise Exception(f"Tried to walk a file ({path})")
  
  for file_or_dir in os.listdir(path):
    full_path = os.path.join(path, file_or_dir)
    if os.path.isdir(full_path):
      walk_directory(bundle_content, full_path)
    elif full_path.endswith(".js") and full_path not in bundle_content:
      bundle_content[full_path] = read_file(full_path)


def save_bundle(bundle_content: dict[str,str]):
  mini_parts = []
  for filename, content in bundle_content.items():
    print(f"Bundling {filename}")
    mini = jsmin(content)
    mini_parts.append(f"// {filename}\n{mini}")
  as_text = "\n\n".join(mini_parts)
  Path(BUNDLE_PATH).parent.mkdir(parents=True, exist_ok=True)
  with open(BUNDLE_PATH, "w", encoding="utf-8") as f:
    f.write(as_text)


def prepare_prod_index():
  print("Making production index.html")
  html = None
  with open(os.path.join("static", "dev-index.html"), "r", encoding="utf-8") as f:
    html = f.read()
  
  # replace individual JS imports with the bundle
  html = re.sub(
    r"<!--Debug imports start.*?Debug imports end-->",
    r"""<script src="/js/dist/app.bundle.js" defer type="application/javascript"></script>""",
    html, flags = re.S)
  
  # delete commented-out HTML
  html = re.sub(r" *<!--.*?-->[\r\n]*", "", html, flags = re.S)

  with open(os.path.join("static", "index.html"), "w", encoding="utf-8") as f:
    f.write(html)


def bundle():
  bundle_content = {}
  for filename in DO_FIRST:
    path = os.path.join(JS_ROOT, filename)
    bundle_content[path] = read_file(path)
  
  walk_directory(bundle_content, JS_ROOT)

  save_bundle(bundle_content)

  prepare_prod_index()


if __name__ == "__main__":
  bundle()
  