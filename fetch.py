import feedparser
import json
import re
import requests
from bs4 import BeautifulSoup

feeds = {
    "Nature": "https://www.nature.com/nature.rss",
    "Nature Neuroscience": "https://www.nature.com/neuro.rss",
    "Nature Immunology": "https://www.nature.com/ni.rss",
    "Immunity": "https://www.cell.com/immunity/rss",
    "Neuron": "https://www.cell.com/neuron/rss",
    "Science": "https://www.science.org/rss/news_current.xml"
}

def extract_og_image(url):
    try:
        headers = {
            "User-Agent": "Mozilla/5.0"
        }
        r = requests.get(url, headers=headers, timeout=15)
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

        image = extract_image(entry)
        if not image:
            image = extract_og_image(entry.get("link", ""))
        
        items.append({
            "title": entry.get("title", ""),
            "link": entry.get("link", ""),
            "journal": journal,
            "date": entry.get("published", ""),
            "summary": entry.get("summary", ""),
            "image": image
        })

with open("data/feed.json", "w") as f:
    json.dump(items, f, indent=2)
