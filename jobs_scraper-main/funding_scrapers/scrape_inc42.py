import requests
import json
import re
import os
from bs4 import BeautifulSoup

# ================== CONFIG ==================

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

OUTPUT_DIR = "funded_json"
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ================== STRICT RULES ==================

AMOUNT_REGEX = re.compile(
    r"\$[\d,.]+\s?(?:mn|m|million|billion|bn)?|"
    r"INR\s?[\d,.]+\s?(?:cr|crore)?",
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
    """
    Accept ONLY:
    <Company Name> Raises <Amount> ...
    """

    lower = title.lower()

    # Must contain ' raises '
    if " raises " not in lower:
        return None

    # Split on 'Raises'
    parts = title.split("Raises", 1)
    if len(parts) != 2:
        return None

    company_part = parts[0].strip()

    # Reject commas (lists / editorials)
    if "," in company_part:
        return None

    words = company_part.split()
    if not words:
        return None

    # Reject bad prefixes
    if words[0].lower() in BAD_PREFIXES:
        return None

    # Reject descriptor words
    for w in words:
        if w.lower() in BAD_WORDS:
            return None

    # Must start with capital letter
    if not company_part[0].isupper():
        return None

    return company_part


def extract_funding(title: str, source: str):
    company = extract_company_from_raises_title(title)
    if not company:
        return None

    amount_match = AMOUNT_REGEX.search(title)

    return {
        "company": company,
        "funding_amount": amount_match.group(0) if amount_match else None,
        "funding_stage": None,
        "title": title,
        "source": source
    }

INC42_URL = "https://inc42.com/buzz/"

INC42_IGNORE_LINES = {
    "News", "Ecommerce", "Agritech", "Edtech",
    "Health Tech", "Real Estate Tech", "Fintech"
}

INC42_DATE_REGEX = re.compile(
    r"\d{1,2}(st|nd|rd|th)\s+\w+,\s+\d{4}", re.I
)

def fetch_inc42():
    r = requests.get(INC42_URL, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.text


def extract_inc42_titles(html: str):
    soup = BeautifulSoup(html, "lxml")
    cards = soup.select("div.card-wrapper")

    titles = []

    for card in cards:
        lines = [l.strip() for l in card.get_text("\n").split("\n") if l.strip()]

        for line in lines:
            if line in INC42_IGNORE_LINES:
                continue
            if INC42_DATE_REGEX.search(line):
                continue
            if len(line.split()) < 4:
                continue
            if not line[0].isupper():
                continue

            titles.append(line)
            break

    return titles


def scrape_inc42():
    html = fetch_inc42()
    titles = extract_inc42_titles(html)

    results = []

    for title in titles:
        data = extract_funding(title, "inc42")
        if data:
            results.append(data)

    return results

# ================== MAIN ==================

if __name__ == "__main__":
    inc42_data = scrape_inc42()

    with open(
        os.path.join(OUTPUT_DIR, "inc42_funding_companies.json"),
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(inc42_data, f, indent=2, ensure_ascii=False)

    print(f"Inc42 companies saved: {len(inc42_data)}")
