import feedparser
import json

feeds = {
    "Nature": "https://www.nature.com/nature.rss",
    "Nature Neuroscience": "https://www.nature.com/neuro.rss",
    "Nature Immunology": "https://www.nature.com/ni.rss",
    "Immunity": "https://www.cell.com/immunity/rss",
    "Neuron": "https://www.cell.com/neuron/rss",
    "Science": "https://www.science.org/rss/news_current.xml"
}

items = []

for journal, url in feeds.items():
    print(f"Fetching {journal}...")
    d = feedparser.parse(url)

    print(f"Entries found: {len(d.entries)}")

    for entry in d.entries[:5]:
        items.append({
            "title": entry.get("title", ""),
            "link": entry.get("link", ""),
            "journal": journal,
            "date": entry.get("published", ""),
            "summary": entry.get("summary", "")
        })

print(f"Total items collected: {len(items)}")

with open("data/feed.json", "w") as f:
    json.dump(items, f, indent=2)
