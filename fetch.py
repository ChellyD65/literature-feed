import feedparser
import json
import re
import html
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

FEEDS = {
    "Nature": "https://www.nature.com/nature.rss",
    "Nature Neuroscience": "https://www.nature.com/neuro.rss",
    "Nature Immunology": "https://www.nature.com/ni.rss",
    "Immunity": "https://www.cell.com/immunity/rss",
    "Neuron": "https://www.cell.com/neuron/rss",
    "Science": "https://www.science.org/rss/news_current.xml",
}

JOURNAL_FALLBACKS = {
    "Nature": "./images/nature.jpg",
    "Nature Neuroscience": "./images/nature-neuro.jpg",
    "Nature Immunology": "./images/nature-immunology.jpg",
    "Immunity": "./images/immunity.jpg",
    "Neuron": "./images/neuron.jpg",
    "Science": "./images/science.jpg",
}

BLOCKED_IMAGE_SCRAPE_DOMAINS = {
    "science.org",
    "www.science.org",
}

STOPWORDS = {
    "the", "and", "for", "with", "from", "that", "this", "into", "about",
    "after", "before", "under", "over", "between", "among", "during",
    "study", "shows", "show", "reveal", "reveals", "revealed",
    "paper", "papers", "article", "articles",
    "using", "used", "use", "via", "new", "news",
    "cell", "cells", "science", "nature", "neuron", "immunity",
    "research", "researchers", "journal",
    "is", "are", "was", "were", "be", "been", "being",
    "of", "in", "on", "to", "a", "an", "as", "at", "by", "or", "it",
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
    text = re.sub(r"\s+", " ", text).strip()
    return text


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


def tokenize(text: str) -> list[str]:
    text = strip_html(text).lower()
    tokens = re.findall(r"[a-zA-Z][a-zA-Z\-]{2,}", text)
    tokens = [t for t in tokens if t not in STOPWORDS]
    return tokens


def build_wikimedia_query(title: str, summary: str, journal: str = "") -> str:
    title_tokens = tokenize(title)
    summary_tokens = tokenize(summary)

    seen = set()
    ranked = []

    preferred_keywords = [
        "microglia", "macrophage", "tcell", "t-cell", "bcell", "b-cell",
        "neuron", "neuronal", "synapse", "astrocyte", "glia", "cortex",
        "hippocampus", "retina", "immune", "immunity", "inflammation",
        "brain", "spinal", "axon", "dendrite", "myelin", "lymphocyte",
        "monocyte", "cytokine", "antigen", "receptor",
    ]

    normalized_all = title_tokens + summary_tokens

    for kw in preferred_keywords:
        if kw in normalized_all and kw not in seen:
            ranked.append(kw)
            seen.add(kw)

    for tok in title_tokens:
        if tok not in seen:
            ranked.append(tok)
            seen.add(tok)

    for tok in summary_tokens:
        if tok not in seen:
            ranked.append(tok)
            seen.add(tok)
        if len(ranked) >= 6:
            break

    # soften terms that are often too abstract for image search
    replacements = {
        "tcell": "t cell",
        "bcell": "b cell",
        "neuronal": "neuron",
        "immune": "immunology",
    }

    ranked = [replacements.get(x, x) for x in ranked]

    query = " ".join(ranked[:4]).strip()

    if not query:
        if "neuro" in journal.lower() or "neuron" in journal.lower():
            query = "neuron neuroscience"
        elif "immun" in journal.lower():
            query = "immune cell immunology"
        else:
            query = "biology"

    return query


def search_wikimedia_image(query: str) -> str:
    """
    Search Wikimedia Commons and return a thumbnail URL for the first likely match.
    Preference is given to titles that look scientific/biological rather than generic.
    """
    try:
        search_url = "https://commons.wikimedia.org/w/api.php"
        params = {
            "action": "query",
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,  # File namespace
            "gsrlimit": 8,
            "prop": "imageinfo",
            "iiprop": "url",
            "iiurlwidth": 1200,
            "format": "json",
            "origin": "*",
        }

        r = SESSION.get(search_url, params=params, timeout=20)
        r.raise_for_status()
        data = r.json()

        pages = data.get("query", {}).get("pages", {})
        if not pages:
            return ""

        candidates = []
        for page in pages.values():
            title = page.get("title", "")
            imageinfo = page.get("imageinfo", [])
            if not imageinfo:
                continue

            thumb = imageinfo[0].get("thumburl") or imageinfo[0].get("url")
            if not thumb:
                continue

            score = score_wikimedia_candidate(title, query)
            candidates.append((score, thumb, title))

        if not candidates:
            return ""

        candidates.sort(key=lambda x: x[0], reverse=True)
        best_score, best_thumb, best_title = candidates[0]
        print(f"Wikimedia match for '{query}': {best_title} (score={best_score})")
        return best_thumb

    except Exception as e:
        print(f"Wikimedia search failed for '{query}': {e}")
        return ""


def score_wikimedia_candidate(title: str, query: str) -> int:
    """
    Score Commons file titles to bias toward useful scientific imagery.
    """
    title_l = title.lower()
    query_tokens = set(tokenize(query))
    score = 0

    # reward overlap with query
    for tok in query_tokens:
        if tok in title_l:
            score += 3

    # reward likely science illustration / microscopy / anatomy terms
    positives = [
        "neuron", "brain", "retina", "microglia", "macrophage", "t cell",
        "b cell", "astrocyte", "glia", "hippocampus", "cortex", "synapse",
        "microscopy", "histology", "anatomy", "diagram", "cell", "immune",
        "lymphocyte", "immun", "axon", "dendrite",
    ]
    for p in positives:
        if p in title_l:
            score += 2

    # penalize likely irrelevant or low-value file types
    negatives = [
        "logo", "icon", "banner", "flag", "map", "coat of arms", "seal",
        "portrait", "building", "conference", "university", "chart",
        "graph", "news", "screenshot",
    ]
    for n in negatives:
        if n in title_l:
            score -= 4

    # prefer images over other filetypes if obvious from title
    if title_l.endswith((".svg", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp")):
        score += 1

    return score


def choose_image(entry, journal: str) -> str:
    link = entry.get("link", "")
    title = entry.get("title", "")
    summary = entry.get("summary", "")

    image = extract_image(entry)
    if image:
        return image

    if link and can_scrape_image(link):
        image = extract_og_image(link)
        if image:
            return image

    query = build_wikimedia_query(title, summary, journal)
    image = search_wikimedia_image(query)
    if image:
        return image

    return JOURNAL_FALLBACKS.get(journal, "")


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
            image = choose_image(entry, journal)

            items.append(
                {
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "journal": journal,
                    "date": normalize_date(entry),
                    "summary": entry.get("summary", ""),
                    "image": image,
                }
            )

    # simple newest-ish ordering by available date string
    items = sorted(items, key=lambda x: x.get("date", ""), reverse=True)

    with open("data/feed.json", "w", encoding="utf-8") as f:
        json.dump(items[:100], f, indent=2, ensure_ascii=False)

    print(f"Wrote {min(len(items), 100)} items to data/feed.json")


if __name__ == "__main__":
    main()
