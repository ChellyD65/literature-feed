import feedparser
import json
import re
import html
import urllib.parse
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SOURCES_PATH = BASE_DIR / "sources.json"
TOPICS_PATH = BASE_DIR / "topics.json"
OUTPUT_PATH = DATA_DIR / "feed.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)

BLOCKED_IMAGE_SCRAPE_DOMAINS = {
    "science.org",
    "www.science.org",
}

DEFAULT_MAX_ITEMS = 100
DEFAULT_SOURCE_LIMIT = 8

DEFAULT_STYLE = {
    "bg1": "#111827",
    "bg2": "#374151",
    "accent": "#60a5fa",
    "icon": "•",
}

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (compatible; LiteratureFeedBot/1.0)",
        "Accept-Language": "en-US,en;q=0.9",
    }
)


def load_json(path: Path, fallback):
    if not path.exists():
        print(f"Warning: {path.name} not found. Using fallback.")
        return fallback

    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_sources():
    raw = load_json(SOURCES_PATH, [])
    sources = [s for s in raw if s.get("enabled", True)]
    print(f"Loaded {len(sources)} enabled sources from {SOURCES_PATH.name}")
    return sources


def load_topics():
    raw = load_json(TOPICS_PATH, [])
    topics = [t for t in raw if t.get("enabled", True)]
    print(f"Loaded {len(topics)} enabled topics from {TOPICS_PATH.name}")
    return topics


def strip_html(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def extract_image(entry) -> str:
    media_content = entry.get("media_content", [])
    for m in media_content:
        url = m.get("url")
        if url:
            return url

    media_thumbnail = entry.get("media_thumbnail", [])
    for m in media_thumbnail:
        url = m.get("url")
        if url:
            return url

    links = entry.get("links", [])
    for link in links:
        href = link.get("href", "")
        ltype = link.get("type", "")
        rel = link.get("rel", "")
        if href and (rel == "enclosure" or ltype.startswith("image/")):
            return href

    summary = entry.get("summary", "")
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', summary, re.IGNORECASE)
    if m:
        return m.group(1)

    for c in entry.get("content", []):
        value = c.get("value", "")
        m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', value, re.IGNORECASE)
        if m:
            return m.group(1)

    return ""


def can_scrape_image(url: str) -> bool:
    try:
        domain = urlparse(url).netloc.lower()
        return domain not in BLOCKED_IMAGE_SCRAPE_DOMAINS
    except Exception:
        return False


def extract_og_image(url: str) -> str:
    try:
        r = SESSION.get(url, timeout=15)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")

        tag = soup.find("meta", property="og:image")
        if tag and tag.get("content"):
            return tag["content"]

        tag = soup.find("meta", attrs={"name": "twitter:image"})
        if tag and tag.get("content"):
            return tag["content"]

    except Exception as e:
        print(f"Image scrape failed for {url}: {e}")

    return ""


def get_topic_config(topic_name: str, topics: list[dict]) -> dict:
    for topic in topics:
        if topic.get("name", "").strip().lower() == topic_name.strip().lower():
            return topic
    return {}


def get_default_topic_config(topics: list[dict]) -> dict:
    return get_topic_config("default", topics)


def choose_topic(title: str, summary: str, journal: str, topics: list[dict]) -> str:
    text = f"{strip_html(title)} {strip_html(summary)}".lower()

    for topic in topics:
        topic_name = topic.get("name", "").strip()
        if not topic_name or topic_name.lower() == "default":
            continue

        keywords = topic.get("keywords", [])
        for kw in keywords:
            if kw.lower() in text:
                return topic_name

    jl = journal.lower()
    if "immun" in jl or "immunity" in jl:
        return "immunology"
    if "neuro" in jl or "neuron" in jl:
        return "neuroscience"

    default_topic = get_default_topic_config(topics)
    return default_topic.get("name", "default")


def short_title(title: str, max_len: int = 72) -> str:
    t = strip_html(title)
    if len(t) <= max_len:
        return t
    return t[: max_len - 1].rstrip() + "…"


def get_topic_style(topic: str, topics: list[dict]) -> dict:
    topic_cfg = get_topic_config(topic, topics)
    style = topic_cfg.get("style", {})
    if style:
        return {
            "bg1": style.get("bg1", DEFAULT_STYLE["bg1"]),
            "bg2": style.get("bg2", DEFAULT_STYLE["bg2"]),
            "accent": style.get("accent", DEFAULT_STYLE["accent"]),
            "icon": style.get("icon", DEFAULT_STYLE["icon"]),
        }

    default_cfg = get_default_topic_config(topics)
    default_style = default_cfg.get("style", {}) if default_cfg else {}

    return {
        "bg1": default_style.get("bg1", DEFAULT_STYLE["bg1"]),
        "bg2": default_style.get("bg2", DEFAULT_STYLE["bg2"]),
        "accent": default_style.get("accent", DEFAULT_STYLE["accent"]),
        "icon": default_style.get("icon", DEFAULT_STYLE["icon"]),
    }


def svg_cover(title: str, journal: str, topic: str, topics: list[dict]) -> str:
    style = get_topic_style(topic, topics)

    safe_title = html.escape(short_title(title))
    safe_journal = html.escape(journal)

    svg = f"""
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{style['bg1']}"/>
      <stop offset="100%" stop-color="{style['bg2']}"/>
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="30"/>
    </filter>
  </defs>

  <rect width="1200" height="675" fill="url(#bg)"/>

  <circle cx="1030" cy="110" r="170" fill="{style['accent']}" opacity="0.18" filter="url(#blur)"/>
  <circle cx="180" cy="560" r="150" fill="{style['accent']}" opacity="0.16" filter="url(#blur)"/>

  <rect x="56" y="52" rx="18" ry="18" width="260" height="54" fill="rgba(255,255,255,0.08)"/>
  <text x="84" y="87" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#e5e7eb">{safe_journal}</text>

  <foreignObject x="68" y="150" width="860" height="220">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-family: Arial, Helvetica, sans-serif; font-size: 44px; font-weight: 700; line-height: 1.15; color: #f9fafb;">
      {safe_title}
    </div>
  </foreignObject>

  <text x="1010" y="560"
        text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="160"
        fill="{style['accent']}"
        opacity="0.85">
    {html.escape(style['icon'])}
  </text>
</svg>
"""
    return "data:image/svg+xml;charset=utf-8," + urllib.parse.quote(svg)


def normalize_date(entry) -> str:
    return (
        entry.get("published", "")
        or entry.get("updated", "")
        or entry.get("pubDate", "")
        or ""
    )


def parse_datetime_for_sort(date_str: str) -> float:
    if not date_str:
        return 0.0

    ds = date_str.strip()

    candidates = [
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S %z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d",
    ]

    for fmt in candidates:
        try:
            dt = datetime.strptime(ds, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        except ValueError:
            pass

    try:
        dt = datetime.fromisoformat(ds.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.timestamp()
    except Exception:
        return 0.0


def compute_priority_score(title: str, summary: str, topic: str, topics: list[dict]) -> int:
    text_title = strip_html(title).lower()
    text_summary = strip_html(summary).lower()

    score = 0

    for topic_cfg in topics:
        topic_name = topic_cfg.get("name", "").strip()
        topic_priority = int(topic_cfg.get("priority", 0))
        keywords = topic_cfg.get("keywords", [])

        if topic == topic_name:
            score += topic_priority

        for kw in keywords:
            kw_l = kw.lower()
            if kw_l in text_title:
                score += max(10, topic_priority // 2)
            if kw_l in text_summary:
                score += max(3, topic_priority // 6)

    return score


def choose_image(entry, journal: str, topic: str, topics: list[dict]) -> str:
    link = entry.get("link", "")
    title = entry.get("title", "")

    image = extract_image(entry)
    if image:
        return image

    if link and can_scrape_image(link):
        image = extract_og_image(link)
        if image:
            return image

    return svg_cover(title, journal, topic, topics)


def process_source(source: dict, topics: list[dict]) -> list[dict]:
    name = source["name"]
    url = source["url"]
    source_type = source.get("category", "journal")
    limit = int(source.get("limit", DEFAULT_SOURCE_LIMIT))

    print(f"Fetching {name} from {url}")
    d = feedparser.parse(url)
    print(f"Entries found: {len(d.entries)}")

    items = []

    for entry in d.entries[:limit]:
        title = entry.get("title", "")
        summary = entry.get("summary", "")
        date_str = normalize_date(entry)
        topic = choose_topic(title, summary, name, topics)
        priority_score = compute_priority_score(title, summary, topic, topics)
        image = choose_image(entry, name, topic, topics)
        topic_style = get_topic_style(topic, topics)

        items.append(
            {
                "title": title,
                "link": entry.get("link", ""),
                "journal": name,
                "source_type": source_type,
                "date": date_str,
                "date_sort": parse_datetime_for_sort(date_str),
                "summary": summary,
                "image": image,
                "topic": topic,
                "topic_color": topic_style["accent"],
                "priority_score": priority_score,
            }
        )

    return items


def main():
    sources = load_sources()
    topics = load_topics()

    items = []

    for source in sources:
        try:
            items.extend(process_source(source, topics))
        except Exception as e:
            print(f"Failed to process source {source.get('name', 'unknown')}: {e}")

    items = sorted(
        items,
        key=lambda x: (x.get("priority_score", 0), x.get("date_sort", 0)),
        reverse=True,
    )

    for item in items:
        item.pop("date_sort", None)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(items[:DEFAULT_MAX_ITEMS], f, indent=2, ensure_ascii=False)

    print(f"Wrote {min(len(items), DEFAULT_MAX_ITEMS)} items to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
