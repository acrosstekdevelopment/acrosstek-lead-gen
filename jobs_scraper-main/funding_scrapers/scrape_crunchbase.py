import requests
import json
import re
import os
from bs4 import BeautifulSoup

# ================== CONFIG ==================

START_URLS = [
    "https://news.crunchbase.com/venture/",
    "https://news.crunchbase.com/startups/",
    "https://news.crunchbase.com/ai/",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

OUTPUT_DIR = "funded_json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "crunchbase_funding_companies.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ================== STRICT RULES ==================

# ACCEPT ONLY titles containing the verb "raises"
RAISES_REGEX = re.compile(r"\braises\b", re.I)

AMOUNT_REGEX = re.compile(
    r"\$[\d,.]+\s?(?:million|billion|m|bn)?",
    re.I
)

STAGE_REGEX = re.compile(
    r"\b(pre-seed|seed|series\s[a-f])\b",
    re.I
)

BAD_PREFIXES = {
    "exclusive", "breaking", "report",
    "opinion", "the", "a", "an"
}

DESCRIPTORS = {
    "startup", "startups", "company",
    "firm", "platform"
}

# ================== CORE EXTRACTION ==================

def extract_company(title: str):
    tokens = title.replace("’", "'").split()

    # find "raises"
    idx = None
    for i, t in enumerate(tokens):
        if t.lower() == "raises":
            idx = i
            break

    if idx is None:
        return None

    company_tokens = []
    j = idx - 1

    while j >= 0:
        raw = tokens[j].strip(",.:'\"")
        low = raw.lower()

        if low in DESCRIPTORS:
            j -= 1
            continue

        if raw and raw[0].isupper():
            company_tokens.insert(0, raw)
            j -= 1
        else:
            break

    if not company_tokens:
        return None

    if company_tokens[0].lower() in BAD_PREFIXES:
        return None

    return " ".join(company_tokens)


def extract_funding(title: str):
    # HARD FILTER: must contain "raises"
    if not RAISES_REGEX.search(title):
        return None

    company = extract_company(title)
    if not company:
        return None

    amount = AMOUNT_REGEX.search(title)
    stage = STAGE_REGEX.search(title)

    return {
        "company": company,
        "funding_amount": amount.group(0) if amount else None,
        "funding_stage": stage.group(0).title() if stage else None,
        "title": title,
        "source": "crunchbase"
    }

# ================== SCRAPING ==================

def fetch_titles(url: str):
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "lxml")
    titles = []

    for article in soup.select("article"):
        h = article.select_one("h2, h3")
        if not h:
            continue

        title = h.get_text(strip=True)
        if title:
            titles.append(title)

    return titles


def run():
    all_titles = []

    for url in START_URLS:
        all_titles.extend(fetch_titles(url))

    results = []

    for title in all_titles:
        data = extract_funding(title)
        if data:
            results.append(data)

    return results

# ================== MAIN ==================

if __name__ == "__main__":
    data = run()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Crunchbase companies saved: {len(data)}")
