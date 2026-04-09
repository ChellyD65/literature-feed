import feedparser
import json
from datetime import datetime

feeds = {
    "Nature Immunology": "https://www.nature.com/ni/current_issue/rss/",
    "Nature Neuroscience": "https://www.nature.com/neuro/current_issue/rss/",
    "Immunity": "https://www.cell.com/immunity/rss",
    "Neuron": "https://www.cell.com/neuron/rss",
    "Science": "https://www.science.org/rss/news_current.xml",
    "J Neurosci": "https://www.jneurosci.org/rss/current.xml"
}

items = []

for journal, url in feeds.items():
    d = feedparser.parse(url)

    for entry in d.entries[:10]:
        items.append({
            "title": entry.get("title"),
            "link": entry.get("link"),
            "journal": journal,
            "date": entry.get("published", ""),
            "summary": entry.get("summary", "")
        })

# sort newest first (best effort)
items = sorted(items, key=lambda x: x["date"], reverse=True)

with open("data/feed.json", "w") as f:
    json.dump(items[:100], f, indent=2)
