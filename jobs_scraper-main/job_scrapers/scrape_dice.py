import asyncio
import json
import os
from playwright.async_api import async_playwright

START_URL = "https://www.dice.com/jobs?page=1"
MAX_JOBS = 10   # do not increase aggressively

OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_dice.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --------------------------------------------------
# Extract company from embedded JSON (fallback)
# --------------------------------------------------
async def extract_company_from_embedded_json(page):
    # 1. JSON-LD (SEO schema)
    scripts = await page.query_selector_all("script[type='application/ld+json']")
    for script in scripts:
        try:
            content = await script.inner_text()
            data = json.loads(content)

            if isinstance(data, dict):
                org = data.get("hiringOrganization")
                if isinstance(org, dict):
                    name = org.get("name")
                    if name:
                        return name.strip()
        except:
            continue

    # 2. Next.js payload
    try:
        next_data = await page.evaluate("() => window.__NEXT_DATA__")
        if next_data:
            stack = [next_data]
            while stack:
                cur = stack.pop()
                if isinstance(cur, dict):
                    for k, v in cur.items():
                        if k.lower() in ["company", "companyname", "employer"]:
                            if isinstance(v, str) and v.strip():
                                return v.strip()
                        stack.append(v)
                elif isinstance(cur, list):
                    stack.extend(cur)
    except:
        pass

    return None


# --------------------------------------------------
# MAIN SCRAPER
# --------------------------------------------------
async def scrape():
    jobs = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled"]
        )
        page = await browser.new_page()

        # Step 1: open generic jobs page
        await page.goto(START_URL, wait_until="domcontentloaded")

        # Step 2: wait until job links appear
        await page.wait_for_function(
            """
            () => Array.from(document.querySelectorAll('a'))
                .some(a => a.href && a.href.includes('/job-detail/'))
            """,
            timeout=20000
        )

        # Step 3: collect job-detail URLs
        job_links = []
        for a in await page.query_selector_all("a[href*='/job-detail/']"):
            href = await a.get_attribute("href")
            if href:
                if href.startswith("/"):
                    href = "https://www.dice.com" + href
                if href not in job_links:
                    job_links.append(href)
            if len(job_links) >= MAX_JOBS:
                break

        # Step 4: visit each job detail page
        for i, url in enumerate(job_links, 1):
            print(f"[{i}/{len(job_links)}] Scraping job")

            try:
                job_page = await browser.new_page()
                await job_page.goto(url, wait_until="domcontentloaded")

                # ---- title ----
                title = await job_page.locator("h1").first.inner_text()

                # ---- company (DOM → JSON fallback) ----
                company = None

                company_el = await job_page.query_selector(
                    'a[data-cy="companyNameLink"]'
                )
                if company_el:
                    company = (await company_el.inner_text()).strip()

                if not company:
                    company = await extract_company_from_embedded_json(job_page)

                # ---- location (best-effort DOM) ----
                location = None
                for sel in [
                    "li[data-cy='location']",
                    "span[data-cy='location']",
                    "span.location"
                ]:
                    el = await job_page.query_selector(sel)
                    if el:
                        location = (await el.inner_text()).strip()
                        break

                jobs.append({
                    "source": "dice",
                    "job_url": url,
                    "title": title.strip() if title else None,
                    "company": company,
                    "location": location
                })

                await job_page.close()

            except Exception as e:
                print(f"[ERROR] {e}")
                continue

        await browser.close()

    # Step 5: save output
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} Dice jobs → {OUTPUT_FILE}")


# --------------------------------------------------
# ENTRY POINT
# --------------------------------------------------
if __name__ == "__main__":
    asyncio.run(scrape())
