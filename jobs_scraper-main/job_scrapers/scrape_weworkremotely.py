import json
import time
import os
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

BASE_URL = "https://weworkremotely.com"
SEARCH_URL = "https://weworkremotely.com/remote-jobs/search"
OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_weworkremotely.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

FETCH_DESCRIPTIONS = True
DETAIL_DELAY = 1.0

def normalize_job(raw: dict) -> dict:
    return {
        "source": "weworkremotely",
        "job_url": raw.get("apply_url"),
        "title": raw.get("title"),
        "company": raw.get("company"),
        "location": raw.get("location"),
    }

def extract_description(context, job_url):
    page = context.new_page()
    try:
        page.goto(job_url, wait_until="domcontentloaded", timeout=30000)
        html = page.content()
    finally:
        page.close()

    soup = BeautifulSoup(html, "lxml")
    container = soup.select_one("div.listing-container")
    if not container:
        return None

    return container.get_text("\n", strip=True)


def scrape_weworkremotely():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/143.0.0.0 Safari/537.36"
            )
        )

        page = context.new_page()
        page.goto(SEARCH_URL, wait_until="domcontentloaded", timeout=30000)

        html = page.content()
        page.close()

        soup = BeautifulSoup(html, "lxml")
        jobs = []

        for section in soup.select("section.jobs"):
            category_tag = section.find("h2")
            category = category_tag.get_text(strip=True) if category_tag else None

            for li in section.select("li.new-listing-container"):
                link = li.select_one("a.listing-link--unlocked[href]")
                if not link:
                    continue

                title_tag = li.select_one("h3.new-listing__header__title")
                company_tag = li.select_one("p.new-listing__company-name")
                location_tag = li.select_one("p.new-listing__company-headquarters")

                title = title_tag.get_text(strip=True) if title_tag else None
                company = company_tag.get_text(strip=True) if company_tag else None
                location = location_tag.get_text(strip=True) if location_tag else None

                if not title or not company:
                    continue

                apply_url = urljoin(BASE_URL, link["href"])

                job = {
                    "company": company,
                    "title": title,
                    "location": location,
                    "category": category,
                    "apply_url": apply_url,
                    "description": None,
                }

                if FETCH_DESCRIPTIONS:
                    job["description"] = extract_description(context, apply_url)
                    time.sleep(DETAIL_DELAY)

                jobs.append(job)

        browser.close()
        return jobs


if __name__ == "__main__":
    raw_jobs = scrape_weworkremotely()
    jobs = [normalize_job(j) for j in raw_jobs]


    if not jobs:
        raise RuntimeError("Scraped 0 jobs. Selector mismatch.")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")
