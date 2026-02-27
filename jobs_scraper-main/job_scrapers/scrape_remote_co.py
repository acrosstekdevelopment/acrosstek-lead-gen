import asyncio
import json
import os
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
from urllib.parse import urljoin

URL = "https://remote.co/remote-jobs"
OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_remote_co.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

def normalize_job(raw: dict) -> dict:
    return {
        "source": "remote.co",
        "job_url": raw.get("job_url"),
        "title": raw.get("title"),
        "company": raw.get("company"),
        "location": raw.get("location"),
    }

async def scrape():
    async with async_playwright() as p:
        browser = await p.firefox.launch(headless=True)

        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )

        page = await context.new_page()

        # DO NOT wait for networkidle
        await page.goto(URL, wait_until="domcontentloaded", timeout=60000)

        # Let async content settle
        await page.wait_for_timeout(5000)

        html = await page.content()
        await browser.close()

    # --------- PARSE HTML OFFLINE ---------

    soup = BeautifulSoup(html, "html.parser")
    jobs = []

    for category_block in soup.select("div.laxZFs"):
        category_el = category_block.select_one("h2 a")
        category = category_el.get_text(strip=True) if category_el else None

        for card in category_block.select("div.job-list-card"):
            title_el = card.select_one("h3 a")
            title = title_el.get_text(strip=True) if title_el else None
            job_url = urljoin(URL, title_el["href"]) if title_el else None

            company_el = card.select_one("h4")
            company = company_el.get_text(strip=True) if company_el else None

            location = None
            loc_el = card.select_one("div.fKmeBu div")
            if loc_el:
                location = loc_el.get_text(strip=True)

            posted_date = None
            time_el = card.select_one("span.time-posted")
            if time_el:
                posted_date = time_el.get_text(strip=True)

            tags = [li.get_text(strip=True) for li in card.select("ul.eXqnaN li")]

            raw = {
                "source": "remote.co",
                "category": category,
                "title": title,
                "company": company,
                "location": location,
                "posted_date": posted_date,
                "job_url": job_url,
                "tags": tags,
            }
            jobs.append(normalize_job(raw))


    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")

if __name__ == "__main__":
    asyncio.run(scrape())
