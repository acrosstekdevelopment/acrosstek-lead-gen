import requests
from bs4 import BeautifulSoup
import json
import os
from urllib.parse import urljoin

BASE_URL = "https://builtin.com/jobs/remote"
BASE_SITE = "https://builtin.com"
MAX_PAGES = 3

OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_builtin.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept-Language": "en-US,en;q=0.9"
}

def scrape():
    results = []

    for page in range(1, MAX_PAGES + 1):
        url = BASE_URL if page == 1 else f"{BASE_URL}?page={page}"
        print(f"Scraping page {page}: {url}")

        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            print("Non-200 response, stopping.")
            break

        soup = BeautifulSoup(r.text, "html.parser")
        cards = soup.select('div[data-id="job-card"]')

        if not cards:
            print("No jobs found on page, stopping.")
            break

        for card in cards:
            title_a = card.select_one('a[data-id="job-card-title"]')
            if not title_a:
                continue

            title = title_a.get_text(strip=True)
            job_url = urljoin(BASE_SITE, title_a.get("href"))

            company_el = card.select_one('a[data-id="company-title"] span')
            company = company_el.get_text(strip=True) if company_el else None

            location = None
            loc_icon = card.select_one('i.fa-location-dot')
            if loc_icon:
                location = loc_icon.find_parent("div").get_text(strip=True)

            results.append({
                "source": "builtin",
                "job_url": job_url,
                "title": title,
                "company": company,
                "location": location
            })

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(results)} jobs → {OUTPUT_FILE}")

if __name__ == "__main__":
    scrape()
