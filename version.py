from sys import exit
import argparse
import os
from typing_extensions import Literal

V_FILE = "v"
VERSION_TYPE_TO_INDEX_MAP = {
  "release": 0,
  "major": 1,
  "minor": 2
}


def get_v() -> str:
  if not os.path.exists(V_FILE):
    raise Exception("No version file present.")
    
  with open(V_FILE, "r", encoding="utf-8") as f:
    return f.read()


def set_v(new_v: str):
  with open(V_FILE, "w", encoding="utf-8") as f:
    f.write(new_v)


def increment_v(type: Literal["release", "major", "minor"] = "minor"):
  v_parts: list[str] = None
  try:
    v = get_v()
    v_parts = [ int(part) for part in v.split(".") ]
    if len(v_parts) != 3: raise Exception()
  except:
    v_parts = [0,0,0]
  
  edit_index = VERSION_TYPE_TO_INDEX_MAP[type]
  v_parts[edit_index] += 1
  zero_index = edit_index+1
  while zero_index < len(v_parts):
    v_parts[zero_index] = 0
    zero_index += 1
  set_v(".".join([ str(part) for part in v_parts ]))




if __name__ == "__main__":
  parser = argparse.ArgumentParser(prog="BfMUI version manager",
    description="Gets and sets the current version of the app")
  parser.add_argument("command", default=None)
  parser.add_argument("-v", "--version")
  parser.add_argument("-t", "--type")
  try:
    args = parser.parse_args()
    cmd = getattr(args, "command", None)
    new_v = getattr(args, "version", None)
    v_type = getattr(args, "type", None)
    if cmd is None:
      raise Exception("No command provided.")
    if cmd == "set" and not new_v:
      raise Exception("Must provide new version name.")
    if cmd == "increment" and\
    (v_type not in ["release", "major", "minor"]):
      raise Exception("Must provide version type: 'release', 'major' or 'minor'.")
  except Exception as e:
    print(f"ERROR: {str(e)}")
    exit(1)

  if (cmd == "get"):
    try:
      v = get_v()
      print(v)
      exit(0)
    except Exception as e:
      print(f"ERROR: {str(e)}")
      exit(1)
  
  if (cmd == "set"):
    try:
      set_v(new_v)
      v = get_v()
      print(f"OK: Version is now {v}")
      exit(0)
    except Exception as e:
      print(f"ERROR: {str(e)}")
      exit(1)
  
  if (cmd == "increment"):
    try:
      increment_v(v_type)
      v = get_v()
      print(f"OK: Version is now {v}")
      exit(0)
    except Exception as e:
      print(f"ERROR: {str(e)}")
      exit(1)

  print("ERROR: Unknown command.")
  exit(1)
  

  
