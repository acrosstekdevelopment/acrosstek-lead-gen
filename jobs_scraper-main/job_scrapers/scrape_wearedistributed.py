import requests
import json
import os
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASE_URL = "https://wearedistributed.org/jobs"
SITE_URL = "https://wearedistributed.org"

OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_wearedistributed.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0",
}

def normalize_job(raw: dict) -> dict:
    return {
        "source": "wearedistributed",
        "job_url": raw.get("apply_url"),
        "title": raw.get("title"),
        "company": raw.get("company"),
        "location": raw.get("location"),
    }

def scrape_wearedistributed():
    r = requests.get(BASE_URL, headers=HEADERS, timeout=30)
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "lxml")

    jobs = []

    cards = soup.select("div.job-collection-item")
    if not cards:
        raise RuntimeError("No job cards found. Site structure changed.")

    for card in cards:
        link = card.select_one("a[href^='/job/']")
        if not link:
            continue

        title = card.select_one(".job-listing-name")
        company = card.select_one(".job-company-name")
        location = card.select_one(".panel-location")

        jobs.append({
            "company": company.get_text(strip=True) if company else None,
            "title": title.get_text(strip=True) if title else None,
            "location": location.get_text(strip=True) if location else None,
            "apply_url": urljoin(SITE_URL, link["href"]),
            "description": None,  # requires visiting detail page
            "source": "wearedistributed",
        })

    return jobs


if __name__ == "__main__":
    raw_jobs = scrape_wearedistributed()
    jobs = [normalize_job(j) for j in raw_jobs]


    if not jobs:
        raise RuntimeError("Scraped 0 jobs. Unexpected for this site.")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")
