import requests
import json
import os

URL = "https://remotive.com/api/remote-jobs"
OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_remotive.json")

os.makedirs(OUTPUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}

def normalize_job(raw: dict) -> dict:
    return {
        "source": "remotive",
        "job_url": raw.get("apply_url"),
        "title": raw.get("title"),
        "company": raw.get("company"),
        "location": raw.get("location"),
    }

def scrape_remotive():
    r = requests.get(URL, headers=HEADERS, timeout=30)
    r.raise_for_status()

    payload = r.json()
    jobs_data = payload.get("jobs")

    if not jobs_data:
        raise RuntimeError("Remotive API returned no jobs.")

    jobs = []

    for job in jobs_data:
        jobs.append({
            "company": job.get("company_name"),
            "title": job.get("title"),
            "location": job.get("candidate_required_location"),
            "apply_url": job.get("url"),
            "description": job.get("description"),
            "source": "remotive",
        })

    return jobs


if __name__ == "__main__":
    raw_jobs = scrape_remotive()
    jobs = [normalize_job(j) for j in raw_jobs]


    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")
