import requests
import json
import re
import os
from bs4 import BeautifulSoup

# ---------------- CONFIG ----------------

START_URL = "https://techcrunch.com/category/startups/"
PAGES = 3
OUTPUT_DIR = "funded_json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "techcrunch_funding_companies.json")


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

IGNORE_LINES = {
    "AI", "Startups", "In Brief", "Opinion", "Security", "Apps"
}

FUNDING_KEYWORDS = [
    "raise", "raised", "raises", "raising",
    "funding", "series", "seed", "round",
    "backed", "secures", "secured", "closed", "closes"
]

NOISE_WORDS = {
    "startup", "startups", "company", "firm",
    "ai", "fintech", "indian", "us", "based",
    "crypto", "climate", "healthtech"
}

AMOUNT_REGEX = re.compile(
    r"\$[\d,.]+(?:\s?(?:million|billion|m|bn))?",
    re.I
)

STAGE_REGEX = re.compile(
    r"\b(pre-seed|seed|series\s[a-f])\b",
    re.I
)

DATE_REGEX = re.compile(r"\b(hours|days|weeks)\s+ago\b", re.I)

# ---------------- SCRAPING ----------------

def fetch_page(page: int) -> str:
    url = START_URL if page == 1 else f"{START_URL}page/{page}/"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text


def extract_titles(html: str):
    soup = BeautifulSoup(html, "lxml")
    posts = soup.select("li.wp-block-post.type-post")

    titles = []

    for post in posts:
        lines = [l.strip() for l in post.get_text("\n").split("\n") if l.strip()]

        for line in lines:
            if line in IGNORE_LINES:
                continue
            if DATE_REGEX.search(line):
                continue
            if len(line.split()) < 4:
                continue

            titles.append(line)
            break

    return titles

# ---------------- EXTRACTION ----------------

def contains_funding_signal(title: str) -> bool:
    t = title.lower()
    return any(k in t for k in FUNDING_KEYWORDS)


def extract_company(title: str):
    tokens = title.replace("’", "'").split()

    funding_pos = [
        i for i, t in enumerate(tokens)
        if any(k in t.lower() for k in FUNDING_KEYWORDS)
    ]

    if not funding_pos:
        return None

    idx = funding_pos[0] - 1
    company_tokens = []

    while idx >= 0:
        raw = tokens[idx].strip(",.:'\"")
        low = raw.lower()

        if low in NOISE_WORDS:
            idx -= 1
            continue

        if raw and raw[0].isupper():
            company_tokens.insert(0, raw)
            idx -= 1
        else:
            break

    return " ".join(company_tokens) if company_tokens else None


def extract_funding(title: str):
    if not contains_funding_signal(title):
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
        "source": "techcrunch"
    }

# ---------------- PIPELINE ----------------

def run():
    all_titles = []

    for page in range(1, PAGES + 1):
        html = fetch_page(page)
        titles = extract_titles(html)
        all_titles.extend(titles)

    results = []

    for title in all_titles:
        info = extract_funding(title)
        if info:
            results.append(info)

    return results


if __name__ == "__main__":
    data = run()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(data)} companies to {OUTPUT_FILE}")
