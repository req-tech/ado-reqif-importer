#!/usr/bin/env python3
"""
Import ReqIF data into Azure DevOps as 'System Requirement' work items.

  Organisation : https://dev.azure.com/bytecorporation
  Project      : Azdo-CodeBeamer
  Source file  : Test_file_Modern_Requirements_20260423.reqif/
                 Nin1_LEB_HL_LAH_Basis_19250150.reqif

Behaviour
---------
- Title        : ReqIF.ChapterName when present; otherwise first line of ReqIF.Text.
- Description  : All remaining attributes rendered as an HTML table.
- Area / Iter  : First entry returned by the Azure DevOps classification-node API.
- Hierarchy    : SPEC-HIERARCHY parent→child links preserved via
                 System.LinkTypes.Hierarchy-Reverse on every child work item.
- Duplicates   : Items whose ReqIF ForeignID already appears in a
                 'reqif-id:<id>' tag are silently skipped.

Requirements
------------
    pip install requests          (stdlib + requests only)
"""

import base64
import io
import os
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

import requests

# ── Paths & constants ─────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
REQIFZ_FILE = Path(r"C:\code\ado-reqif-importer\exampleData\test.reqifz")

ORG_URL = "https://dev.azure.com/bytecorporation"
PROJECT = "Azdo_CodeBeamer_2"
WIT     = "System Requirement"

# ── Load PAT ─────────────────────────────────────────────────────────────────

def _load_pat() -> str:
    env_file = SCRIPT_DIR / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("AZDO_PAT="):
                return line.split("=", 1)[1].strip()
    return os.environ.get("AZDO_PAT", "")


PAT = _load_pat()
if not PAT:
    sys.exit("ERROR: AZDO_PAT not found in .env or environment.")


# ── XML namespaces ────────────────────────────────────────────────────────────

_NS  = "http://www.omg.org/spec/ReqIF/20110401/reqif.xsd"
_XNS = "http://www.w3.org/1999/xhtml"


def _q(tag: str) -> str:
    return f"{{{_NS}}}{tag}"


# ── XHTML helpers ─────────────────────────────────────────────────────────────

def _xhtml_to_plain(el) -> str:
    """Recursively extract all text from an xhtml element."""
    if el is None:
        return ""
    parts: list[str] = []
    if el.text:
        parts.append(el.text)
    for child in el:
        parts.append(_xhtml_to_plain(child))
        if child.tail:
            parts.append(child.tail)
    return "".join(parts).strip()


def _xhtml_to_html(el) -> str:
    """Serialise an xhtml element back to an HTML string."""
    if el is None:
        return ""
    # Strip the namespace prefix so Azure DevOps renders it cleanly
    xml_str = ET.tostring(el, encoding="unicode")
    # Remove namespace declarations and xhtml: prefixes
    xml_str = re.sub(r' xmlns(?::\w+)?="[^"]*"', "", xml_str)
    xml_str = re.sub(r"<(/?)xhtml:", r"<\1", xml_str)
    return xml_str


# ── ReqIF parser ──────────────────────────────────────────────────────────────

def parse_reqif(path_or_reqifz: Path):
    """
    Returns
    -------
    spec_objects : dict[str, dict[str, str]]
        ReqIF object IDENTIFIER → {attribute_name: value_string}
    hierarchy    : list[tuple[str | None, str]]
        Ordered (parent_obj_id_or_None, child_obj_id) pairs, top-down.

    Accepts either a plain .reqif path or a .reqifz (zip) path.  When given a
    .reqifz the function looks for a *.reqif.orig entry (the unmodified full
    export); if none is found it falls back to the first *.reqif entry.
    """
    if str(path_or_reqifz).lower().endswith(".reqifz"):
        with zipfile.ZipFile(path_or_reqifz) as zf:
            names = zf.namelist()
            orig = next((n for n in names if n.endswith(".reqif.orig")), None)
            entry = orig or next((n for n in names if n.endswith(".reqif")), None)
            if entry is None:
                raise FileNotFoundError(f"No .reqif entry found in {path_or_reqifz}")
            print(f"      Using entry: {entry}")
            with zf.open(entry) as f:
                data = f.read()
        root = ET.parse(io.BytesIO(data)).getroot()
    else:
        root = ET.parse(path_or_reqifz).getroot()
    content = root.find(
        f"{_q('CORE-CONTENT')}/{_q('REQ-IF-CONTENT')}"
    )

    # 1. Enum value IDENTIFIER → display name
    enum_values: dict[str, str] = {}
    for ev in content.findall(f".//{_q('ENUM-VALUE')}"):
        enum_values[ev.attrib["IDENTIFIER"]] = ev.attrib["LONG-NAME"]

    # 2. Attribute-definition IDENTIFIER → LONG-NAME
    attr_defs: dict[str, str] = {}
    for el in content.findall(f".//{_q('SPEC-ATTRIBUTES')}//*"):
        ident = el.attrib.get("IDENTIFIER")
        name  = el.attrib.get("LONG-NAME")
        if ident and name:
            attr_defs[ident] = name

    # 3. SPEC-OBJECTS  →  {ident: {attr_name: value}}
    spec_objects: dict[str, dict[str, str]] = {}

    for obj in content.findall(f"{_q('SPEC-OBJECTS')}/{_q('SPEC-OBJECT')}"):
        oid   = obj.attrib["IDENTIFIER"]
        attrs: dict[str, str] = {}

        for val in obj.findall(f"{_q('VALUES')}/*"):
            tag = val.tag  # e.g. {…}ATTRIBUTE-VALUE-XHTML

            # Resolve attribute name from the inner *-REF element
            def_ref = None
            for suffix in ("XHTML", "INTEGER", "ENUMERATION", "STRING", "BOOLEAN", "DATE", "REAL"):
                def_ref = val.find(f".//{_q(f'ATTRIBUTE-DEFINITION-{suffix}-REF')}")
                if def_ref is not None:
                    break
            attr_name = attr_defs.get(def_ref.text, def_ref.text) if def_ref is not None else "Unknown"

            # Extract the value
            if "XHTML" in tag:
                the_val = val.find(f"{_q('THE-VALUE')}")
                attrs[attr_name] = _xhtml_to_plain(the_val)
            elif "ENUMERATION" in tag:
                refs = [
                    enum_values.get(r.text, r.text)
                    for r in val.findall(f"{_q('VALUES')}/{_q('ENUM-VALUE-REF')}")
                ]
                attrs[attr_name] = ", ".join(refs)
            elif "INTEGER" in tag or "REAL" in tag:
                attrs[attr_name] = val.attrib.get("THE-VALUE", "")
            else:
                attrs[attr_name] = val.attrib.get("THE-VALUE", "")

        spec_objects[oid] = attrs

    # 4. SPEC-HIERARCHY → ordered (parent_id | None, obj_id) list
    hierarchy: list[tuple[str | None, str]] = []

    def _walk(node, parent_obj_id: str | None) -> None:
        ref_el = node.find(f"{_q('OBJECT')}/{_q('SPEC-OBJECT-REF')}")
        if ref_el is None:
            return
        oid = ref_el.text
        hierarchy.append((parent_obj_id, oid))
        children_el = node.find(_q("CHILDREN"))
        if children_el is not None:
            for child in children_el.findall(_q("SPEC-HIERARCHY")):
                _walk(child, oid)

    spec_el = content.find(
        f"{_q('SPECIFICATIONS')}/{_q('SPECIFICATION')}"
    )
    if spec_el is not None:
        top_children = spec_el.find(_q("CHILDREN"))
        if top_children is not None:
            for top in top_children.findall(_q("SPEC-HIERARCHY")):
                _walk(top, None)

    return spec_objects, hierarchy


# ── Azure DevOps helpers ───────────────────────────────────────────────────────

def _basic(content_type: str = "application/json") -> dict:
    token = base64.b64encode(f":{PAT}".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "Content-Type": content_type,
    }


def _get(url: str, **kwargs) -> dict:
    r = requests.get(url, headers=_basic(), **kwargs)
    r.raise_for_status()
    return r.json()


def _post(url: str, payload, patch: bool = False) -> dict:
    ct = "application/json-patch+json" if patch else "application/json"
    r = requests.post(url, headers=_basic(ct), json=payload)
    if not r.ok:
        print(f"    HTTP {r.status_code}: {r.text[:400]}")
        r.raise_for_status()
    return r.json()


def get_first_area_path() -> str:
    url  = f"{ORG_URL}/{PROJECT}/_apis/wit/classificationnodes/Areas?api-version=7.1&$depth=1"
    data = _get(url)
    children = data.get("children", [])
    if children:
        return f"{PROJECT}\\{children[0]['name']}"
    return PROJECT


def get_first_iteration() -> str:
    url  = f"{ORG_URL}/{PROJECT}/_apis/wit/classificationnodes/Iterations?api-version=7.1&$depth=1"
    data = _get(url)
    children = data.get("children", [])
    if children:
        return f"{PROJECT}\\{children[0]['name']}"
    return PROJECT


def get_existing_foreign_ids() -> set[str]:
    """Query Azure DevOps for all work items that carry a 'reqif-id:…' tag."""
    wiql = {
        "query": (
            f"SELECT [System.Id] FROM WorkItems "
            f"WHERE [System.TeamProject] = '{PROJECT}' "
            f"  AND [System.WorkItemType] = '{WIT}' "
            f"  AND [System.Tags] CONTAINS 'reqif-import'"
        )
    }
    items = _post(
        f"{ORG_URL}/{PROJECT}/_apis/wit/wiql?api-version=7.1",
        wiql,
    ).get("workItems", [])

    if not items:
        return set()

    # Fetch tags in batches of 200 (Azure DevOps API limit)
    all_ids = [i["id"] for i in items]
    existing: set[str] = set()
    for i in range(0, len(all_ids), 200):
        batch = all_ids[i:i + 200]
        ids_str = ",".join(str(x) for x in batch)
        wis = _get(
            f"{ORG_URL}/{PROJECT}/_apis/wit/workitems"
            f"?ids={ids_str}&fields=System.Tags&api-version=7.1"
        ).get("value", [])
        for wi in wis:
            tags_str = wi["fields"].get("System.Tags", "")
            for tag in tags_str.split(";"):
                tag = tag.strip()
                if tag.startswith("reqif-id:"):
                    existing.add(tag[len("reqif-id:"):])
    return existing


def create_work_item(
    title: str,
    description: str,
    area: str,
    iteration: str,
    foreign_id: str,
    parent_wi_id: int | None,
) -> int:
    patch_doc = [
        {"op": "add", "path": "/fields/System.Title",
         "value": title},
        {"op": "add", "path": "/fields/System.Description",
         "value": description},
        {"op": "add", "path": "/fields/System.AreaPath",
         "value": area},
        {"op": "add", "path": "/fields/System.IterationPath",
         "value": iteration},
        {"op": "add", "path": "/fields/System.Tags",
         "value": f"reqif-import; reqif-id:{foreign_id}"},
    ]
    if parent_wi_id is not None:
        patch_doc.append({
            "op": "add",
            "path": "/relations/-",
            "value": {
                "rel": "System.LinkTypes.Hierarchy-Reverse",
                "url": f"{ORG_URL}/_apis/wit/workItems/{parent_wi_id}",
                "attributes": {"comment": "ReqIF hierarchy"},
            },
        })

    wit_encoded = WIT.replace(" ", "%20")
    url = f"{ORG_URL}/{PROJECT}/_apis/wit/workitems/${wit_encoded}?api-version=7.1"
    result = _post(url, patch_doc, patch=True)
    return result["id"]


# ── Title / description builders ──────────────────────────────────────────────

def build_title(attrs: dict[str, str]) -> str:
    chapter = attrs.get("ReqIF.ChapterName", "").strip()
    if chapter:
        return chapter[:255]

    text = attrs.get("ReqIF.Text", "").strip()
    if text:
        first_line = re.split(r"[\n\r]", text)[0].strip()
        if len(first_line) > 255:
            return first_line[:252] + "..."
        return first_line or text[:252] + "..."

    fid = attrs.get("ReqIF.ForeignID", "").strip()
    return f"Requirement {fid}" if fid else "Unnamed Requirement"


# Fields used for the title — excluded from description to avoid duplication
_TITLE_FIELDS = {"ReqIF.ChapterName"}


def build_description(attrs: dict[str, str]) -> str:
    rows: list[str] = []
    for key, value in attrs.items():
        if key in _TITLE_FIELDS or not value.strip():
            continue
        safe_key   = key.replace("&", "&amp;").replace("<", "&lt;")
        safe_value = value.replace("&", "&amp;").replace("<", "&lt;").replace("\n", "<br/>")
        rows.append(
            f"<tr><th style='text-align:left;padding:4px 8px;background:#f5f5f5'>"
            f"{safe_key}</th>"
            f"<td style='padding:4px 8px'>{safe_value}</td></tr>"
        )
    if not rows:
        return "<p><em>No additional attributes.</em></p>"
    return (
        "<table border='1' cellspacing='0' cellpadding='0' "
        "style='border-collapse:collapse;font-size:13px'>"
        + "".join(rows)
        + "</table>"
    )


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("ReqIF -> Azure DevOps importer")
    print("=" * 60)

    # Parse
    print("\n[1/4] Parsing ReqIF …")
    print(f"      Source: {REQIFZ_FILE}")
    spec_objects, hierarchy = parse_reqif(REQIFZ_FILE)
    print(f"      {len(spec_objects)} spec objects  |  {len(hierarchy)} hierarchy nodes")

    # Azure DevOps config
    print("\n[2/4] Fetching Azure DevOps config …")
    area      = get_first_area_path()
    iteration = get_first_iteration()
    print(f"      Area path : {area}")
    print(f"      Iteration : {iteration}")

    # Existing imports
    print("\n[3/4] Checking for existing imports …")
    existing = get_existing_foreign_ids()
    print(f"      Already imported: {len(existing)} item(s)")

    # Import
    print(f"\n[4/4] Importing to '{WIT}' …")
    reqif_to_wi: dict[str, int] = {}   # ReqIF obj id -> ADO work item id
    created = skipped = errors = 0
    total = len(hierarchy)

    for idx, (parent_reqif_id, obj_id) in enumerate(hierarchy, 1):
        attrs      = spec_objects.get(obj_id, {})
        foreign_id = attrs.get("ReqIF.ForeignID", "").strip() or obj_id
        title      = build_title(attrs)

        progress = f"[{idx}/{total}]"

        if foreign_id in existing:
            print(f"  SKIP  {progress} [{foreign_id}] {title[:50]}")
            skipped += 1
            # Children of skipped parents will be created without a parent link
            # because we cannot recover the existing ADO id here.
            continue

        description = build_description(attrs)
        parent_wi   = reqif_to_wi.get(parent_reqif_id) if parent_reqif_id else None

        print(f"  CREATE {progress} [{foreign_id}] {title[:50]}")
        try:
            wi_id = create_work_item(
                title, description, area, iteration, foreign_id, parent_wi
            )
            reqif_to_wi[obj_id] = wi_id
            parent_label = f"child of #{parent_wi}" if parent_wi else "root"
            print(f"         -> #{wi_id}  ({parent_label})")
            created += 1
        except Exception as exc:
            print(f"  ERROR: {exc}")
            errors += 1

    print("\n" + "=" * 60)
    print(f"Done.  Created: {created}  Skipped: {skipped}  Errors: {errors}")
    print("=" * 60)


if __name__ == "__main__":
    main()
