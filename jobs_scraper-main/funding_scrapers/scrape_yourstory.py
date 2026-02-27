import requests
import json
import re
import os

# ================== CONFIG ==================

API_URL = "https://search.thed2csummit.co/query"

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/x-www-form-urlencoded"
}

OUTPUT_DIR = "funded_json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "yourstory_funding_companies.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# ================== STRICT RULES ==================

AMOUNT_REGEX = re.compile(
    r"(\$[\d,.]+\s?(?:mn|m|million|billion|bn))|"
    r"(Rs\.?\s?[\d,.]+\s?(?:cr|crore))|"
    r"(INR\s?[\d,.]+\s?(?:cr|crore))",
    re.I
)

BAD_PREFIXES = {
    "exclusive", "breaking", "report", "opinion",
    "the", "a", "an"
}

DESCRIPTORS = {
    "startup", "startups", "company", "platform",
    "solution", "firm"
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

    if "," in company_part:
        return None

    words = company_part.split()
    if not words:
        return None

    if words[0].lower() in BAD_PREFIXES:
        return None

    while words and words[0].lower() in DESCRIPTORS:
        words.pop(0)

    if not words or not words[0][0].isupper():
        return None

    return " ".join(words)

# ================== SCRAPER ==================

def fetch_page(page: int):
    payload = {
        "query": "raises",
        "page": page
    }

    r = requests.post(API_URL, data=payload, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def run():
    results = []
    page = 1
    MAX_PAGES = 3   # change this number as needed


    while page <= MAX_PAGES:
        data = fetch_page(page)

        if not data:
            break

        for item in data:
            title = item.get("name")
            if not title:
                continue

            company = extract_company_from_raises_title(title)
            if not company:
                continue

            amount_match = AMOUNT_REGEX.search(title)

            results.append({
                "company": company,
                "funding_amount": amount_match.group(0) if amount_match else None,
                "funding_stage": None,
                "title": title,
                "source": "yourstory"
            })

        if len(data) < 5:
            break

        page += 1

    return results

# ================== MAIN ==================

if __name__ == "__main__":
    data = run()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"YourStory companies saved: {len(data)}")
