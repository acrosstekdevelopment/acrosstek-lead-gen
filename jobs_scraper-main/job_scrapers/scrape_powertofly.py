import requests
import json
import os
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASE_URL = "https://powertofly.com/jobs/"
SITE_URL = "https://powertofly.com"
MAX_JOBS = 50

OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_powertofly.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0",
}

# ADD THIS FUNCTION

def normalize_job(raw: dict) -> dict:
    return {
        "source": "powertofly",
        "job_url": raw.get("apply_url"),
        "title": raw.get("title"),
        "company": raw.get("company"),
        "location": raw.get("location"),
    }

def scrape_powertofly():
    jobs = []
    page = 1

    while len(jobs) < MAX_JOBS:
        url = f"{BASE_URL}?page={page}&only_html=True"
        print(f"Fetching page {page}")

        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()

        soup = BeautifulSoup(r.text, "lxml")

        cards = soup.select("button.job.box.stat-manager-view-job")
        if not cards:
            break

        for card in cards:
            if len(jobs) >= MAX_JOBS:
                break

            title_el = card.select_one("h5.title")
            company_el = card.select_one("span.company")
            location_el = card.select_one("span.location span.item")

            job_id = card.get("data-job-id")
            if not job_id:
                continue

            jobs.append({
                "company": company_el.get_text(strip=True) if company_el else None,
                "title": title_el.get_text(strip=True) if title_el else None,
                "location": location_el.get_text(strip=True) if location_el else None,
                "apply_url": f"{SITE_URL}/jobs/detail/{job_id}",
                "description": None,
                "source": "powertofly",
            })

        page += 1

    return jobs


if __name__ == "__main__":
    raw_jobs = scrape_powertofly()
    jobs = [normalize_job(j) for j in raw_jobs]

    if not jobs:
        raise RuntimeError("Scraped 0 jobs. Unexpected for PowerToFly.")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")
