import requests
import json
import time
import os
from bs4 import BeautifulSoup
from urllib.parse import urljoin

BASE_URL = "https://nodesk.co"
JOBS_URL = "https://nodesk.co/remote-jobs/"
OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_nodesk.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Accept-Language": "en-US,en;q=0.9",
}

FETCH_DESCRIPTIONS = True
REQUEST_DELAY = 1.0

# CHANGES ONLY. NOTHING ELSE.

def normalize_job(raw_job: dict) -> dict:
    return {
        "source": "nodesk",
        "job_url": raw_job.get("apply_url"),
        "title": raw_job.get("title"),
        "company": raw_job.get("company"),
        "location": raw_job.get("location"),
    }

def fetch_html(url):
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.text


def extract_description(job_url):
    try:
        html = fetch_html(job_url)
        soup = BeautifulSoup(html, "lxml")

        container = soup.select_one("div.article-content, article")
        if not container:
            return None

        return container.get_text("\n", strip=True)
    except Exception:
        return None


def scrape_nodesk():
    html = fetch_html(JOBS_URL)
    soup = BeautifulSoup(html, "lxml")

    jobs = []

    job_items = soup.select("ul > li.dt-s")
    if not job_items:
        raise RuntimeError("No job items found. HTML structure changed.")

    for li in job_items:
        title_link = li.select_one("h2 a[href]")
        company_tag = li.select_one("h3")

        if not title_link or not company_tag:
            continue

        title = title_link.get_text(strip=True)
        apply_url = urljoin(BASE_URL, title_link["href"])
        company = company_tag.get_text(strip=True)

        location = None
        for h5 in li.select("h5"):
            text = h5.get_text(strip=True)
            if text:
                location = text
                break

        job = {
            "company": company,
            "title": title,
            "location": location,
            "apply_url": apply_url,
            "description": None,
        }

        if FETCH_DESCRIPTIONS:
            job["description"] = extract_description(apply_url)
            time.sleep(REQUEST_DELAY)

        jobs.append(normalize_job(job))

    return jobs


if __name__ == "__main__":
    jobs = scrape_nodesk()

    if not jobs:
        raise RuntimeError("Scraped 0 jobs. Selector mismatch.")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")
