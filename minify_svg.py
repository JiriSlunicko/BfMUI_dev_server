import os
import re
import argparse
from xml.etree import ElementTree as ET

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

UNNECESSARY_ATTRS = {
    "stroke-dasharray": "none",
    "stroke-opacity": "1",
    "fill-opacity": "1",
    "xmlns:svg": None,
    "version": None,
    "id": None,
    "height": None,
    "width": None,
}

COLOR_REPLACEMENTS = {
    "#000": "currentColor",
    "#000000": "currentColor",
    "rgb(0,0,0)": "currentColor",
}

def replace_black_in_css(css_text):
    """Replace black color values in CSS with currentColor."""
    for black, replacement in COLOR_REPLACEMENTS.items():
        css_text = re.sub(rf"(?i){re.escape(black)}\b", replacement, css_text)
    return css_text

def clean_style_tags(root):
    """Process embedded <style> elements to replace black with currentColor."""
    for style_elem in root.findall(f".//{{{SVG_NS}}}style"):
        if style_elem.text:
            style_elem.text = replace_black_in_css(style_elem.text)

def clean_attrs(elem):
    """Clean individual attributes and inline style strings."""
    # Handle explicit attributes like fill/stroke
    for attr in list(elem.attrib):
        val = elem.attrib[attr]

        # Remove defaults or unnecessary ones
        if attr in UNNECESSARY_ATTRS and (UNNECESSARY_ATTRS[attr] is None or val == UNNECESSARY_ATTRS[attr]):
            del elem.attrib[attr]
            continue

        # Replace black if explicitly declared
        if attr in ("fill", "stroke", "color"):
            val_lower = val.strip().lower()
            if val_lower in COLOR_REPLACEMENTS:
                elem.attrib[attr] = COLOR_REPLACEMENTS[val_lower]

    # Handle style attribute (inline CSS)
    if "style" in elem.attrib:
        style_str = elem.attrib["style"]
        # Split into key:value; pairs
        declarations = [s.strip() for s in style_str.split(";") if s.strip()]
        new_decls = []
        for decl in declarations:
            if ":" in decl:
                prop, val = map(str.strip, decl.split(":", 1))
                val_lower = val.lower()
                if val_lower in COLOR_REPLACEMENTS:
                    val = COLOR_REPLACEMENTS[val_lower]
                new_decls.append(f"{prop}: {val}")
        if new_decls:
            elem.attrib["style"] = "; ".join(new_decls)
        else:
            del elem.attrib["style"]


def clean_svg_tree(tree):
    root = tree.getroot()
    root.attrib.pop("id", None)
    clean_attrs(root)
    clean_style_tags(root)

    for defs in root.findall(f".//{{{SVG_NS}}}defs"):
        if not list(defs):
            root.remove(defs)

    for elem in root.iter():
        clean_attrs(elem)
        elem.attrib.pop("id", None)
        if elem.tag is ET.Comment:
            elem.clear()

    return tree

def minify_svg_file(input_path, output_path=None):
    try:
        tree = ET.parse(input_path)
        clean_svg_tree(tree)
        if not output_path:
            output_path = input_path
        ET.indent(tree, space="", level=0)
        tree.write(output_path, encoding="utf-8", xml_declaration=False, method="xml")
        print(f"✓ Minified: {input_path}")
    except Exception as e:
        print(f"✗ Failed: {input_path} ({e})")

def find_svg_files(root_dir):
    svg_files = []
    for root, _, files in os.walk(root_dir):
        for file in files:
            if file.lower().endswith(".svg"):
                svg_files.append(os.path.join(root, file))
    return svg_files

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Minify inline SVGs and replace black with currentColor (including <style> tags).")
    parser.add_argument("directory", help="Directory to scan for SVG files")
    parser.add_argument("--out-dir", help="Output directory (optional; defaults to in-place)", default=None)
    args = parser.parse_args()

    svg_files = find_svg_files(args.directory)

    for svg_path in svg_files:
        output_path = None
        if args.out_dir:
            rel_path = os.path.relpath(svg_path, args.directory)
            output_path = os.path.join(args.out_dir, rel_path)
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
        minify_svg_file(svg_path, output_path)
