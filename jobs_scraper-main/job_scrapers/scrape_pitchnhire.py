import requests
import json
import time
import os

API_URL = "https://core.pitchnhire.com/careers/job-portal"

OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_pitchnhire.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/143.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Referer": "https://jobs.pitchnhire.com/",
    "x-sitename": "careers.pitchnhire.com",
}

def normalize_job(raw: dict) -> dict:
    location = None
    loc = raw.get("job_location") or {}
    if isinstance(loc, dict):
        city = loc.get("city")
        state = loc.get("state_name")
        country = loc.get("country_name")
        location = ", ".join([x for x in [city, state, country] if x]) or None

    return {
        "source": "pitchnhire",
        "job_url": raw.get("job_link"),
        "title": raw.get("job_title"),
        "company": raw.get("company_name"),
        "location": location,
    }

def find_job_list(obj):
    """
    Recursively search JSON for a list of job-like dicts.
    """
    if isinstance(obj, list):
        if obj and isinstance(obj[0], dict):
            # Heuristic: job objects usually have title-like keys
            keys = set(obj[0].keys())
            if {"title", "job_title", "designation", "id"} & keys:
                return obj
        return None

    if isinstance(obj, dict):
        for v in obj.values():
            found = find_job_list(v)
            if found is not None:
                return found

    return None

def fetch_page(page, page_size=25):
    params = {
        "page": page,
        "page_size": page_size,
    }

    r = requests.get(API_URL, headers=HEADERS, params=params, timeout=15)

    if r.status_code != 200:
        print(f"HTTP {r.status_code} on page {page}")
        return []

    data = r.json()
    jobs = find_job_list(data)

    if jobs is None:
        print("No job list found in response structure.")
        return []

    return jobs

def scrape_all_jobs():
    all_jobs = []
    page = 1
    MAX_PAGES = 1

    while page <= MAX_PAGES:
        print(f"Fetching page {page}")
        jobs = fetch_page(page)

        if not jobs:
            print("No more jobs. Stopping.")
            break

        all_jobs.extend(jobs)
        page += 1
        time.sleep(0.4)

    return all_jobs

if __name__ == "__main__":
    raw_jobs = scrape_all_jobs()
    jobs = [normalize_job(j) for j in raw_jobs]

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs to {OUTPUT_FILE}")