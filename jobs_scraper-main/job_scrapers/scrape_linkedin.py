import json
import os
from jobspy import scrape_jobs

OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_linkedin.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# CHANGES ONLY. NOTHING ELSE.

def normalize_job(raw_job: dict) -> dict:
    return {
        "source": raw_job.get("site"),
        "job_url": raw_job.get("job_url"),
        "title": raw_job.get("job_title"),
        "company": raw_job.get("company"),
        "location": raw_job.get("location"),
    }


SEARCHES = [
    {"location": "India"},
    {"location": "United States"},
    {"location": "United Kingdom"},
]

def scrape_jobspy():
    jobs = []
    seen_urls = set()

    for cfg in SEARCHES:
        jobs_df = scrape_jobs(
            site_name=["linkedin"],
            search_term="software engineer",
            location=cfg["location"],
            results_wanted=30,
            hours_old=72,
        )

        if jobs_df is None or jobs_df.empty:
            continue

        records = jobs_df.to_dict(orient="records")

        for raw in records:
            job = normalize_job(raw)
            url = job["job_url"]

            if not url or url in seen_urls:
                continue

            seen_urls.add(url)
            jobs.append(job)

    if not jobs:
        raise RuntimeError("Scraped 0 jobs from LinkedIn.")

    return jobs


if __name__ == "__main__":
    jobs = scrape_jobspy()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")
