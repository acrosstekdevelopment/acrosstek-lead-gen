import requests
import json
import os

URL = "https://www.workingnomads.com/api/exposed_jobs/"
OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_working_nomads.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def normalize_job(raw: dict) -> dict:
    return {
        "source": "workingnomads",
        "job_url": raw.get("url"),
        "title": raw.get("title"),
        "company": raw.get("company_name"),
        "location": raw.get("location"),
    }

def scrape():
    response = requests.get(
        URL,
        headers={
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        },
        timeout=30,
    )

    print("HTTP STATUS:", response.status_code)

    raw_jobs = response.json()
    jobs = [normalize_job(j) for j in raw_jobs]


    # print("TYPE:", type(jobs))
    # print("COUNT:", len(jobs) if isinstance(jobs, list) else "NOT A LIST")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")

if __name__ == "__main__":
    scrape()
