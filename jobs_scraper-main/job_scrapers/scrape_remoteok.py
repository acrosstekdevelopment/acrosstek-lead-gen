import requests
import json
import os

URL = "https://remoteok.com/remote-jobs.json"
OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_remoteok.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}

def normalize_job(raw: dict) -> dict:
    return {
        "source": "remoteok",
        "job_url": raw.get("apply_url"),
        "title": raw.get("title"),
        "company": raw.get("company"),
        "location": raw.get("location"),
    }

def scrape_remoteok():
    r = requests.get(URL, headers=HEADERS, timeout=30)
    r.raise_for_status()

    data = r.json()

    if not isinstance(data, list) or len(data) < 2:
        raise RuntimeError("RemoteOK JSON format changed.")

    jobs = []

    # First element is metadata, skip it
    for job in data[1:]:
        jobs.append({
            "company": job.get("company"),
            "title": job.get("position"),
            "location": job.get("location"),
            "apply_url": job.get("url"),
            "description": job.get("description"),
            "source": "remoteok",
        })

    return jobs


if __name__ == "__main__":
    raw_jobs = scrape_remoteok()
    jobs = [normalize_job(j) for j in raw_jobs]


    if not jobs:
        raise RuntimeError("Scraped 0 jobs. RemoteOK feed empty.")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")
