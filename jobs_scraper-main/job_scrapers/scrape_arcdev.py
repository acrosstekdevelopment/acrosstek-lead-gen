import asyncio
import json
import os
from playwright.async_api import async_playwright

URL = "https://arc.dev/remote-jobs"

OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_arcdev.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

async def scrape():
    results = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        page = await browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
        )

        await page.goto(URL, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(6000)

        # each job title is a reliable anchor
        job_links = await page.query_selector_all("a.job-title")

        for a in job_links:
            title = (await a.inner_text()).strip()
            href = await a.get_attribute("href")
            if not href:
                continue

            job_url = "https://arc.dev" + href

            # company is usually near the job title, not nested
            company = None
            parent = await a.evaluate_handle("el => el.parentElement")

            if parent:
                company_el = await parent.query_selector(".company-name")
                if company_el:
                    company = (await company_el.inner_text()).strip()

            results.append({
                "source": "arc",
                "job_url": job_url,
                "title": title,
                "company": company,
                "location": "Remote"
            })

        await browser.close()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(results)} jobs → {OUTPUT_FILE}")

if __name__ == "__main__":
    asyncio.run(scrape())
