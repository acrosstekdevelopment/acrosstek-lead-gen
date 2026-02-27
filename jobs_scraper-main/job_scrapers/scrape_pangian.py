import requests
import json
import os
import time

BASE_URL = "https://pangian.com/remote/api/v1/job-listings"
OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_pangian.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}

PAGE_SIZE = 100
REQUEST_DELAY = 0.3

def normalize_job(raw: dict) -> dict:
    return {
        "source": "pangian",
        "job_url": raw.get("apply_url"),
        "title": raw.get("title"),
        "company": raw.get("company"),
        "location": raw.get("location"),
    }

def fetch_page(page):
    params = {
        "page": page,
        "limit": PAGE_SIZE,
    }

    r = requests.get(BASE_URL, headers=HEADERS, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def scrape_pangian():
    all_jobs = []
    page = 1
    MAX_PAGES = 1

    while page <= MAX_PAGES:
        print(f"Fetching page {page}")
        payload = fetch_page(page)

        jobs = payload.get("data")
        if not jobs:
            break

        for job in jobs:
            all_jobs.append({
                "company": job.get("job_company_name"),
                "title": job.get("job_title"),
                "location": job.get("job_location"),
                "apply_url": job.get("job_url"),
                "description": None,   # not provided by this API
                "source": "pangian",
            })

        page += 1
        time.sleep(REQUEST_DELAY)

    return all_jobs


if __name__ == "__main__":
    raw_jobs = scrape_pangian()
    jobs = [normalize_job(j) for j in raw_jobs]


    if not jobs:
        raise RuntimeError("Scraped 0 jobs. Response shape changed or API empty.")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")
