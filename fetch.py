import feedparser
import json
import re

feeds = {
    "Nature": "https://www.nature.com/nature.rss",
    "Nature Neuroscience": "https://www.nature.com/neuro.rss",
    "Nature Immunology": "https://www.nature.com/ni.rss",
    "Immunity": "https://www.cell.com/immunity/rss",
    "Neuron": "https://www.cell.com/neuron/rss",
    "Science": "https://www.science.org/rss/news_current.xml"
}

def extract_image(entry):
    if "media_content" in entry and entry.media_content:
        for m in entry.media_content:
            url = m.get("url")
            if url:
                return url

    if "media_thumbnail" in entry and entry.media_thumbnail:
        for m in entry.media_thumbnail:
            url = m.get("url")
            if url:
                return url

    summary = entry.get("summary", "")
    m = re.search(r'<img[^>]+src="([^"]+)"', summary)
    if m:
        return m.group(1)

    content = entry.get("content", [])
    for c in content:
        value = c.get("value", "")
        m = re.search(r'<img[^>]+src="([^"]+)"', value)
        if m:
            return m.group(1)

    return ""

items = []

for journal, url in feeds.items():
    d = feedparser.parse(url)

    for entry in d.entries[:10]:
        items.append({
            "title": entry.get("title", ""),
            "link": entry.get("link", ""),
            "journal": journal,
            "date": entry.get("published", ""),
            "summary": entry.get("summary", ""),
            "image": extract_image(entry)
        })

with open("data/feed.json", "w") as f:
    json.dump(items, f, indent=2)
