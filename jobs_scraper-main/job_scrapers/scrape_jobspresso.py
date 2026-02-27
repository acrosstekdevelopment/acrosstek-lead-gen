import asyncio
import json
import os
from playwright.async_api import async_playwright

LISTING_URL = "https://jobspresso.co/remote-work/"
OUTPUT_DIR = "extracted json"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "scrape_jobspresso.json")
os.makedirs(OUTPUT_DIR, exist_ok=True)

MAX_JOBS = 10   # <<< SET THIS TO ANY NUMBER YOU WANT

# ---------------- utilities ----------------

def normalize_job(raw_job: dict) -> dict:
    return {
        "source": raw_job.get("source"),
        "job_url": raw_job.get("job_url"),
        "title": raw_job.get("title"),
        "company": raw_job.get("company"),
        "location": raw_job.get("location"),
    }

async def first_text(page, selectors):
    for sel in selectors:
        el = await page.query_selector(sel)
        if el:
            text = (await el.inner_text()).strip()
            if text:
                return text
    return None

async def first_attr(page, selectors, attr):
    for sel in selectors:
        el = await page.query_selector(sel)
        if el:
            val = await el.get_attribute(attr)
            if val:
                return val
    return None

# ---------------- listing phase ----------------

async def load_job_links(page, max_jobs):
    await page.goto(LISTING_URL, wait_until="networkidle")

    links = set()
    prev_count = 0

    while len(links) < max_jobs:
        # collect visible job links
        for a in await page.query_selector_all("a[href*='/job/']"):
            href = await a.get_attribute("href")
            if href:
                links.add(href)
                if len(links) >= max_jobs:
                    break

        # stop if limit reached
        if len(links) >= max_jobs:
            break

        # stop if no growth
        if len(links) == prev_count:
            break

        prev_count = len(links)

        # try loading more
        load_more = await page.query_selector("a:has-text('Load')")
        if not load_more:
            break

        try:
            await load_more.scroll_into_view_if_needed()
            await page.wait_for_timeout(800)
            await load_more.click()
            await page.wait_for_timeout(2000)
        except:
            break

    return list(links)[:max_jobs]

# ---------------- job detail phase ----------------

async def scrape_job(browser, url):
    page = await browser.new_page()
    await page.goto(url, wait_until="networkidle")

    # ---- title ----
    title = await first_text(page, ["h1"])

    # ---- company (STRICT) ----
    company = None
    company_el = await page.query_selector("li.job-company a")
    if company_el:
        company = (await company_el.inner_text()).strip()

    # ---- location ----
    location = await first_text(page, [".location"])

    # ---- job type (FILTERED) ----
    job_type = None
    allowed_types = ["full", "part", "contract", "intern", "freelance"]

    for li in await page.query_selector_all("li"):
        text = (await li.inner_text()).strip().lower()
        if any(t in text for t in allowed_types):
            job_type = text.title()
            break

    # ---- description (LARGEST BLOCK) ----
    description_html = None
    description_text = None

    candidates = await page.query_selector_all("main article, main section, main div")

    if candidates:
        largest = max(
            candidates,
            key=lambda el: len((page.run_sync(el.inner_text())))
        )
        description_html = await largest.inner_html()
        description_text = await largest.inner_text()

    # ---- apply link ----
    apply_url = await first_attr(
        page,
        [".application a", "a:has-text('Apply')"],
        "href"
    )

    # ---- tags ----
    tags = []
    for tag in await page.query_selector_all("a[rel='tag']"):
        tags.append((await tag.inner_text()).strip())

    await page.close()

    return {
        "source": "jobspresso",
        "job_url": url,
        "title": title,
        "company": company,          # NULL is acceptable
        "location": location,
        "job_type": job_type,
        "apply_url": apply_url,
        "description_html": description_html,
        "description_text": description_text,
        "tags": tags,
    }

# ---------------- runner ----------------

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        print(f"Collecting up to {MAX_JOBS} job links…")
        job_links = await load_job_links(page, MAX_JOBS)
        print(f"Collected {len(job_links)} job links")

        jobs = []
        for i, link in enumerate(job_links, 1):
            print(f"[{i}/{len(job_links)}] Scraping job")
            try:
                raw_job = await scrape_job(browser, link)
                normalized = normalize_job(raw_job)
                jobs.append(normalized)
            except Exception as e:
                continue

        await browser.close()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(jobs)} jobs → {OUTPUT_FILE}")

if __name__ == "__main__":
    asyncio.run(main())
