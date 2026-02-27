import requests
import json
import re
import os
from bs4 import BeautifulSoup

# ================== CONFIG ==================

URL = "https://entrackr.com/news"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

OUTPUT_DIR = "funded_json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "entrackr_funding_companies.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ================== STRICT RULES ==================

AMOUNT_REGEX = re.compile(
    r"(\$[\d,.]+\s?(?:mn|m|million|billion|bn)?)|"
    r"(Rs\.?\s?[\d,.]+\s?(?:cr|crore))|"
    r"(INR\s?[\d,.]+\s?(?:cr|crore))",
    re.I
)

BAD_PREFIXES = {
    "exclusive", "breaking", "report", "opinion",
    "the", "a", "an"
}

BAD_WORDS = {
    "startup", "startups", "company", "platform",
    "solution", "firm", "treatment"
}

# ================== CORE LOGIC ==================

def extract_company_from_raises_title(title: str):
    lower = title.lower()

    if " raises " not in lower:
        return None

    parts = re.split(r"\braises\b", title, flags=re.I, maxsplit=1)
    if len(parts) != 2:
        return None

    company_part = parts[0].strip()

    # Reject lists / editorials
    if "," in company_part:
        return None

    words = company_part.split()
    if not words:
        return None

    # Reject bad prefixes
    if words[0].lower() in BAD_PREFIXES:
        return None

    # Allow descriptors but strip them
    DESCRIPTORS = {"startup", "firm", "company", "platform"}

    while words and words[0].lower() in DESCRIPTORS:
        words.pop(0)

    if not words:
        return None

    company = " ".join(words)

    if not company[0].isupper():
        return None

    return company



def extract_funding(title: str):
    company = extract_company_from_raises_title(title)
    if not company:
        return None

    amount_match = AMOUNT_REGEX.search(title)

    return {
        "company": company,
        "funding_amount": amount_match.group(0) if amount_match else None,
        "funding_stage": None,
        "title": title,
        "source": "entrackr"
    }

# ================== SCRAPING ==================

def fetch_entrackr_html():
    r = requests.get(URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text


def extract_titles_from_jsonld(html: str):
    soup = BeautifulSoup(html, "lxml")
    titles = []

    scripts = soup.find_all("script", type="application/ld+json")

    for s in scripts:
        try:
            data = json.loads(s.string)
        except Exception:
            continue

        if isinstance(data, dict) and data.get("@type") == "ItemList":
            for item in data.get("itemListElement", []):
                title = item.get("name")
                if title:
                    titles.append(title)

    return titles


def run():
    html = fetch_entrackr_html()
    titles = extract_titles_from_jsonld(html)

    results = []

    for title in titles:
        data = extract_funding(title)
        if data:
            results.append(data)

    return results

# ================== MAIN ==================

if __name__ == "__main__":
    data = run()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Entrackr companies saved: {len(data)}")
