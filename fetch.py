import feedparser
import json
import re
import html
import urllib.parse
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

FEEDS = {
    # Broad / flagship
    "Nature": "https://www.nature.com/nature.rss",
    "Cell": "https://www.cell.com/cell/rss",
    "Science": "https://www.science.org/rss/news_current.xml",

    # Nature neuroscience / immunology / medicine
    "Nature Neuroscience": "https://www.nature.com/neuro.rss",
    "Nature Immunology": "https://www.nature.com/ni.rss",
    "Nature Medicine": "https://www.nature.com/nm.rss",

    # Cell Press
    "Immunity": "https://www.cell.com/immunity/rss",
    "Neuron": "https://www.cell.com/neuron/rss",
    "Cancer Cell": "https://www.cell.com/cancer-cell/rss",
    "Cell Stem Cell": "https://www.cell.com/cell-stem-cell/rss",

    # bioRxiv
    "bioRxiv Recent": "https://www.biorxiv.org/rss/recent.xml",
    # optional category pages if you want to test them manually from bioRxiv's RSS directory:
    # "bioRxiv Neuroscience": "<category-specific Atom/RSS URL from bioRxiv alerts page>",
    # "bioRxiv Immunology": "<category-specific Atom/RSS URL from bioRxiv alerts page>",
}

BLOCKED_IMAGE_SCRAPE_DOMAINS = {
    "science.org",
    "www.science.org",
}

TOPIC_KEYWORDS = [
    ("microglia", ["microglia", "microglial"]),
    ("macrophage", ["macrophage", "macrophages"]),
    ("t cell", ["t cell", "t-cell", "cd4", "cd8", "lymphocyte"]),
    ("b cell", ["b cell", "b-cell", "b lymphocyte"]),
    ("retina", ["retina", "retinal", "photoreceptor", "rpe"]),
    ("synapse", ["synapse", "synaptic"]),
    ("cortex", ["cortex", "cortical"]),
    ("neuron", ["neuron", "neuronal", "axon", "dendrite"]),
    ("inflammation", ["inflammation", "inflammatory", "cytokine"]),
    ("neurodegeneration", ["neurodegeneration", "degeneration", "alzheim", "parkinson"]),
    ("immunology", ["immune", "immunity", "immunology", "antigen"]),
    ("neuroscience", ["brain", "neural", "neuroscience", "hippocampus"]),
]

TOPIC_STYLES = {
    "microglia": {"bg1": "#0f172a", "bg2": "#0b3b5a", "accent": "#38bdf8", "icon": "✶"},
    "macrophage": {"bg1": "#1f2937", "bg2": "#4b5563", "accent": "#f59e0b", "icon": "⬢"},
    "t cell": {"bg1": "#1e3a2f", "bg2": "#065f46", "accent": "#34d399", "icon": "◉"},
    "b cell": {"bg1": "#312e81", "bg2": "#4338ca", "accent": "#a78bfa", "icon": "◌"},
    "retina": {"bg1": "#3b0764", "bg2": "#6d28d9", "accent": "#f472b6", "icon": "◐"},
    "synapse": {"bg1": "#172554", "bg2": "#1d4ed8", "accent": "#60a5fa", "icon": "⇄"},
    "cortex": {"bg1": "#111827", "bg2": "#374151", "accent": "#93c5fd", "icon": "◎"},
    "neuron": {"bg1": "#111827", "bg2": "#1e40af", "accent": "#22d3ee", "icon": "✺"},
    "inflammation": {"bg1": "#450a0a", "bg2": "#991b1b", "accent": "#fb7185", "icon": "▲"},
    "neurodegeneration": {"bg1": "#27272a", "bg2": "#52525b", "accent": "#fda4af", "icon": "◈"},
    "immunology": {"bg1": "#052e16", "bg2": "#166534", "accent": "#4ade80", "icon": "✳"},
    "neuroscience": {"bg1": "#082f49", "bg2": "#1d4ed8", "accent": "#7dd3fc", "icon": "✹"},
    "default": {"bg1": "#111827", "bg2": "#374151", "accent": "#60a5fa", "icon": "•"},
}

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (compatible; LiteratureFeedBot/1.0)",
        "Accept-Language": "en-US,en;q=0.9",
    }
)

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

def choose_topic(title: str, summary: str, journal: str = "") -> str:
    text = f"{strip_html(title)} {strip_html(summary)}".lower()

    for topic, keywords in TOPIC_KEYWORDS:
        for kw in keywords:
            if kw in text:
                return topic

    jl = journal.lower()
    if "immun" in jl or "immunity" in jl:
        return "immunology"
    if "neuro" in jl or "neuron" in jl:
        return "neuroscience"

    return "default"

def short_title(title: str, max_len: int = 72) -> str:
    t = strip_html(title)
    if len(t) <= max_len:
        return t
    return t[:max_len - 1].rstrip() + "…"

def svg_cover(title: str, journal: str, topic: str) -> str:
    style = TOPIC_STYLES.get(topic, TOPIC_STYLES["default"])
    safe_title = html.escape(short_title(title))
    safe_journal = html.escape(journal)
    safe_topic = html.escape(topic.title())

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

  <rect x="56" y="52" rx="18" ry="18" width="240" height="54" fill="rgba(255,255,255,0.08)"/>
  <text x="84" y="87" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#e5e7eb">{safe_journal}</text>

  <text x="68" y="205" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" fill="#f9fafb">
    {safe_title}
  </text>

  <rect x="68" y="468" rx="18" ry="18" width="220" height="64" fill="rgba(255,255,255,0.08)"/>
  <text x="102" y="510" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="{style['accent']}">
    {safe_topic}
  </text>

  <text x="1010" y="560" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="160" fill="{style['accent']}" opacity="0.85">
    {style['icon']}
  </text>
</svg>
"""
    return "data:image/svg+xml;charset=utf-8," + urllib.parse.quote(svg)

def choose_image(entry, journal: str) -> tuple[str, str]:
    link = entry.get("link", "")
    title = entry.get("title", "")
    summary = entry.get("summary", "")
    topic = choose_topic(title, summary, journal)

    image = extract_image(entry)
    if image:
        return image, topic

    if link and can_scrape_image(link):
        image = extract_og_image(link)
        if image:
            return image, topic

    return svg_cover(title, journal, topic), topic

def normalize_date(entry) -> str:
    return (
        entry.get("published", "")
        or entry.get("updated", "")
        or entry.get("pubDate", "")
        or ""
    )

def main():
    items = []

    for journal, url in FEEDS.items():
      print(f"Fetching {journal} from {url}")
      d = feedparser.parse(url)
      print(f"Entries found: {len(d.entries)}")

      for entry in d.entries[:10]:
          image, topic = choose_image(entry, journal)

          items.append(
              {
                  "title": entry.get("title", ""),
                  "link": entry.get("link", ""),
                  "journal": journal,
                  "date": normalize_date(entry),
                  "summary": entry.get("summary", ""),
                  "image": image,
                  "topic": topic,
              }
          )

    items = sorted(items, key=lambda x: x.get("date", ""), reverse=True)

    with open("data/feed.json", "w", encoding="utf-8") as f:
        json.dump(items[:100], f, indent=2, ensure_ascii=False)

    print(f"Wrote {min(len(items), 100)} items to data/feed.json")

if __name__ == "__main__":
    main()
