"""Build a factual Moon-name index; do not copy walkthrough prose or images."""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import unquote, urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
INDEX = "https://www.mariowiki.com/Lists_of_Power_Moons"
RESEARCH_DATE = "2026-10-30"
EXPECTED = {
    "Cap": 31, "Cascade": 40, "Sand": 89, "Lake": 42, "Wooded": 76,
    "Cloud": 9, "Lost": 35, "Metro": 81, "Snow": 55, "Seaside": 71,
    "Luncheon": 68, "Ruined": 10, "Bowser": 62, "Moon": 38,
    "Mushroom": 104, "Dark Side": 24, "Darker Side": 1,
}
REGIONAL_COUNTS = {
    "Cap": 50, "Cascade": 50, "Sand": 100, "Lake": 50, "Wooded": 100,
    "Cloud": 0, "Lost": 50, "Metro": 100, "Snow": 50, "Seaside": 100,
    "Luncheon": 100, "Ruined": 0, "Bowser": 100, "Moon": 50,
    "Mushroom": 100, "Dark Side": 0, "Darker Side": 0,
}


def fetch(url):
    request = Request(url, headers={"User-Agent": "FirstPlayResearch/0.1 (personal research)"})
    with urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


class LinksAndTables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.tables = []
        self.table = None
        self.depth = 0
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and "href" in attrs:
            self.links.append(attrs["href"])
        if tag == "table":
            if self.table is None and "wikitable" in attrs.get("class", ""):
                self.table, self.depth = [], 1
            elif self.table is not None:
                self.depth += 1
        if self.table is not None:
            if tag == "tr":
                self.row = []
            elif tag in ("td", "th"):
                self.cell = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)

    def handle_endtag(self, tag):
        if self.table is None:
            return
        if tag in ("td", "th") and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == "table":
            self.depth -= 1
            if self.depth == 0:
                self.tables.append(self.table)
                self.table = None


def parse(html):
    parsed = LinksAndTables()
    parsed.feed(html)
    return parsed


def kingdom_for(url):
    tail = unquote(url.rsplit("/", 1)[-1])
    tail = tail.removeprefix("List_of_Power_Moons_in_").replace("_", " ")
    tail = tail.removeprefix("the ").removesuffix(" Kingdom")
    return "Bowser" if tail in ("Bowser's", "Bowser’s") else tail


def cascade_phase(availability):
    text = availability.lower()
    if "moon rock" in text:
        return "moon_rock_opened"
    if "bowser" in text:
        return "main_story_completed"
    if "leaving" in text or "returning" in text:
        return "left_cascade_and_returned"
    if "different kingdom" in text or "painting" in text or "seaside" in text or "snow kingdom" in text:
        return "external_kingdom_route_required"
    if "multi moon" in text:
        return "after_falls_story_reward"
    if "our first power moon" in text:
        return "after_first_story_moon"
    if "start" in text:
        return "initial_objective"
    return "requires_manual_availability_review"


def extract_page(url):
    html = fetch(url)
    parsed = parse(html)
    kingdom = kingdom_for(url)
    records = []
    for table in parsed.tables:
        if not table or "Name" not in table[0] or "#" not in table[0]:
            continue
        header = table[0]
        name_i = header.index("Name")
        avail_i = header.index("Availability") if "Availability" in header else None
        for row in table[1:]:
            if len(row) <= name_i or not re.fullmatch(r"\d+", row[0]):
                continue
            raw_name = row[name_i]
            value = 3 if "❸" in raw_name or "③" in raw_name else 1
            name = re.sub(r"\s*[❸③]\s*", "", raw_name).strip()
            record = {
                "id": f"smo.moon.{kingdom.lower().replace(' ', '_')}.{int(row[0]):03d}",
                "kingdom": kingdom,
                "number": int(row[0]),
                "name": name,
                "moon_value": value,
                "source_url": url,
                "source_checked_at": RESEARCH_DATE,
                "gameplay_verified": False,
                "player_knows": False,
            }
            if kingdom == "Cascade" and avail_i is not None and len(row) > avail_i:
                record["availability_phase"] = cascade_phase(row[avail_i])
                record["availability_not_player_knowledge"] = True
            records.append(record)
    numbers = [r["number"] for r in records]
    assert numbers == list(range(1, EXPECTED[kingdom] + 1)), (kingdom, numbers)
    return kingdom, records, sha256(html.encode()).hexdigest()


def main():
    parsed = parse(fetch(INDEX))
    urls = list(dict.fromkeys(urljoin(INDEX, link) for link in parsed.links
                              if link.startswith("/List_of_Power_Moons_in_") and "#" not in link))
    assert len(urls) == 16, len(urls)
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(extract_page, urls))
    by_kingdom = {kingdom: records for kingdom, records, _ in results}
    by_kingdom["Darker Side"] = [{
        "id": "smo.moon.darker_side.001", "kingdom": "Darker Side", "number": 1,
        "name": "Long Journey's End", "moon_value": 3,
        "source_url": "https://www.mariowiki.com/Long_Journey%27s_End",
        "source_checked_at": RESEARCH_DATE, "gameplay_verified": False, "player_knows": False,
    }]
    records = [record for kingdom in EXPECTED for record in by_kingdom[kingdom]]
    assert len(records) == 836, len(records)
    assert sum(r["moon_value"] for r in records) == 880
    assert sum(r["moon_value"] == 3 for r in records) == 22
    assert sum(REGIONAL_COUNTS.values()) == 1000
    catalog = {
        "schema_version": "0.1", "researched_at": RESEARCH_DATE,
        "status": "source_index_not_gameplay_verified_or_runtime_pack",
        "scope": "Unique numbered objectives, including the first indexed shop Moon; excludes repeatable extra purchases.",
        "objective_count": len(records), "moon_units": 880, "multi_moon_objectives": 22,
        "source_index": INDEX,
        "source_snapshots": [{"kingdom": k, "html_sha256": h} for k, _, h in results],
        "kingdoms": [{"kingdom": k, "objective_count": len(by_kingdom[k]),
                       "moon_units": sum(r["moon_value"] for r in by_kingdom[k]),
                       "regional_coin_count": REGIONAL_COUNTS[k],
                       "moon_source_url": by_kingdom[k][0]["source_url"]} for k in EXPECTED],
        "moons": records,
    }
    (ROOT / "smo-moons-all.json").write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    cascade = {
        "schema_version": "0.1", "researched_at": RESEARCH_DATE, "kingdom": "Cascade",
        "objective_count": 40, "moon_units": 42,
        "status": "source_index_not_gameplay_verified_or_runtime_pack",
        "availability_note": "Phase tags summarize guide conditions; secondary dependencies and exact first-visit access still need review.",
        "moons": by_kingdom["Cascade"],
    }
    (ROOT / "cascade-moons.json").write_text(json.dumps(cascade, indent=2, ensure_ascii=False) + "\n")
    checklist = [
        "# Super Mario Odyssey: complete Moon checklist", "",
        f"Source-checked {RESEARCH_DATE}. **Contains full-game spoilers.**", "",
        "836 numbered objectives award 880 Moon units: 22 objectives award three each. "
        "This includes each indexed shop objective but excludes repeatable extra shop purchases.", "",
        "This is a factual name/number index, not a copied walkthrough, validated detector, "
        "complete availability graph or player knowledge record. No entries are marked discovered.", "",
        f"Sources: [kingdom lists]({INDEX}); "
        "[count explanation](https://smo.wiki/Power_Moon). "
        "Darker Side is added explicitly because the source index does not link a dedicated list for it.", "",
        "| Kingdom | Objectives | Moon units | Purple coins |",
        "|---|---:|---:|---:|",
    ]
    for entry in catalog["kingdoms"]:
        checklist.append(f"| {entry['kingdom']} | {entry['objective_count']} | "
                         f"{entry['moon_units']} | {entry['regional_coin_count']} |")
    checklist += ["| **Total** | **836** | **880** | **1,000** |", ""]
    for kingdom in EXPECTED:
        checklist += [f"## {kingdom}", "",
                      f"[Source list]({by_kingdom[kingdom][0]['source_url']})", "",
                      "| Number | English name | Moon units |", "|---:|---|---:|"]
        for entry in by_kingdom[kingdom]:
            checklist.append(f"| {entry['number']} | {entry['name']} | {entry['moon_value']} |")
        checklist.append("")
    (ROOT / "moon-checklist.md").write_text("\n".join(checklist) + "\n")
    print(json.dumps({"objectives": len(records), "moon_units": 880, "multi_moons": 22,
                      "kingdoms": len(EXPECTED), "regional_coins": 1000,
                      "cascade_objectives": 40, "cascade_units": 42}))


if __name__ == "__main__":
    main()
