#!/usr/bin/env python3
"""抓取西南交通大学本科生院「通知公告」(https://bksy.swjtu.edu.cn/tzgg/) 并写入 Supabase 的 public.notices 表。

用法:
  python fetch_notices.py --dry-run            只抓取并打印统计，不登录、不写库
  python fetch_notices.py --dry-run --save x.json   同上，并把抓到的内容存成 JSON 方便检查
  python fetch_notices.py                      增量: 「全部」和每个分类只看前 2 页，写入新增/变化的通知
  python fetch_notices.py --full               全量: 「全部」和所有分类翻到最后一页（首次运行用）
  python fetch_notices.py --dry-run --only glgd jxjs --pages 1   只快速检查指定分类的第一页
  加 --no-proxy 可让访问教务网时绕过系统代理

写库需要环境变量: SUPABASE_URL, SUPABASE_ANON_KEY, CRAWLER_EMAIL, CRAWLER_PASSWORD
（用专用的 crawler 角色账号登录，不使用 service_role 密钥。）
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time
from datetime import date, datetime, timezone
from urllib.parse import urljoin, urldefrag, urlparse

import requests
from bs4 import BeautifulSoup

SITE = "https://bksy.swjtu.edu.cn"
LISTING_ROOT = f"{SITE}/tzgg/"
# 与教务网 /tzgg/<代码>.htm 一致，和 server/notices.mjs 的 NOTICE_CATEGORIES 保持同步。
CATEGORIES = {
    "jxyx": "教学运行", "jxjs": "教学建设", "jsfz": "教师发展", "tsjy": "通识教育", "sjjx": "实践教学",
    "syjx": "实验教学", "cxcy": "创新创业", "zljs": "质量建设", "glgd": "管理规定",
}
ALL_PAGE = "qb"  # “全部”
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/126.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9",
}
INFO_HREF = re.compile(r"(^|/)info/\d+/\d+\.htm$")
DATE_RE = re.compile(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})")


class ParseError(RuntimeError):
    """页面结构和预期不符（通常是网站改版）。宁可让任务失败，也不静默地漏数据。"""


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def is_school_url(url: str) -> bool:
    """只接受 https 且属于 swjtu.edu.cn 的链接（通知可能指向学院网站或直接指向 PDF 附件）。"""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and (host == "swjtu.edu.cn" or host.endswith(".swjtu.edu.cn"))


def parse_listing(html: str, page_url: str) -> dict:
    """解析一个列表页，返回 {'items': [...], 'next_url': str|None, 'skipped': [...]}。"""
    soup = BeautifulSoup(html, "html.parser")
    rows = soup.select("ul.right-list li")
    anchors = [li.find("a", href=True) for li in rows]
    anchors = [a for a in anchors if a is not None]
    if rows and not anchors:
        raise ParseError(f"列表项里找不到链接，页面结构可能变了: {page_url}")
    if not anchors:  # 页面 class 改名时的备用办法: 按详情页路径特征找链接
        anchors = [a for a in soup.find_all("a", href=True) if INFO_HREF.search(a["href"])]
    # 有列表容器（哪怕里面是空的）说明页面结构正常；既没有容器也没有通知链接才是异常
    has_list = soup.select_one("ul.right-list") is not None or bool(anchors)

    items, skipped = [], []
    for a in anchors:
        url = urldefrag(urljoin(page_url, a["href"].strip()))[0]
        time_tag = a.select_one(".time")
        date_text = clean(time_tag.get_text()) if time_tag else ""
        title_tag = a.select_one(".line1")
        title = clean(title_tag.get_text()) if title_tag else clean(a.get_text(" "))
        if not time_tag:  # 没有单独的日期标签: 日期拼在标题末尾（旧脚本观察到的形式）
            match = re.search(r"\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})\s*$", title)
            if match:
                date_text, title = match.group(1), clean(title[:match.start()])
        match = DATE_RE.search(date_text)
        if not title or not match:
            raise ParseError(f"无法解析通知标题或日期: href={a['href']!r} title={title!r} date={date_text!r}")
        published = date(int(match[1]), int(match[2]), int(match[3])).isoformat()
        if not is_school_url(url):
            skipped.append(url)  # 非学校站点或非 https 链接: 数据库约束只收录 https://*.swjtu.edu.cn
            continue
        items.append({"url": url, "title": title, "published_on": published})

    return {"items": items, "next_url": _next_page(soup, page_url), "skipped": skipped, "has_list": has_list}


def _next_page(soup: BeautifulSoup, page_url: str) -> str | None:
    pager = soup.select_one(".p_pages")
    if pager is None:
        return None  # 没有分页组件: 只有一页
    link = pager.select_one(".p_next a[href]")
    if link is not None:
        return urldefrag(urljoin(page_url, link["href"]))[0]
    if pager.select_one(".p_next_d") is not None:
        return None  # 明确标记为“下页不可用”: 最后一页
    raise ParseError(f"无法识别分页组件，不能判断是否还有下一页: {page_url}")


def crawl_listing(fetch, start_url: str, max_pages: int | None, delay=lambda: None) -> dict:
    """从 start_url 开始逐页抓取。fetch(url) -> html。max_pages=None 表示翻到最后一页。"""
    items, skipped, seen_pages, has_list = [], [], set(), False
    url = start_url
    while url:
        if url in seen_pages:
            raise ParseError(f"分页出现循环: {url}")
        if len(seen_pages) >= (max_pages if max_pages is not None else 500):
            if max_pages is None:
                raise ParseError("分页超过 500 页，疑似异常")
            break
        seen_pages.add(url)
        page = parse_listing(fetch(url), url)
        items.extend(page["items"])
        skipped.extend(page["skipped"])
        has_list = has_list or page["has_list"]
        url = page["next_url"]
        if url:
            delay()
    return {"items": items, "skipped": skipped, "pages": len(seen_pages), "has_list": has_list}


def collect(fetch, *, full: bool, pages: int, delay=lambda: None, log=print, only=None) -> tuple[dict, list]:
    """抓取所有分类，返回 ({url: {title, published_on, categories:set}}, skipped_urls)。
    only: 只抓这些分类代码（可含 'qb' 表示“全部”页），用于快速检查某个分类。"""
    notices, skipped, per_category = {}, [], {}

    def add(items, category):
        for item in items:
            entry = notices.setdefault(item["url"], {"title": item["title"], "published_on": item["published_on"],
                                                     "categories": set()})
            if category:
                entry["categories"].add(category)

    def describe(result):
        newest = max(result["items"], key=lambda item: item["published_on"])
        return f"（最新: {newest['published_on']} {newest['title'][:18]}）"

    limit = None if full else pages
    for code in CATEGORIES:
        if only is not None and code not in only:
            continue
        result = crawl_listing(fetch, f"{LISTING_ROOT}{code}.htm", limit, delay)
        if not result["items"]:
            if not result["has_list"]:  # 连列表容器都没有: 网站改版了，宁可失败
                raise ParseError(f"分类 {code}（{CATEGORIES[code]}）页面里找不到通知列表，网站可能改版了")
            log(f"  {code} {CATEGORIES[code]}: 0 条（该分类当前没有通知）")
            delay()
            continue
        add(result["items"], code)
        per_category[code] = {item["url"] for item in result["items"]}
        skipped += result["skipped"]
        log(f"  {code} {CATEGORIES[code]}: {len(result['items'])} 条 / {result['pages']} 页 {describe(result)}")
        delay()
    codes = sorted(per_category)
    for i, first in enumerate(codes):  # 两个分类的内容完全一样时给出提示，方便人工确认
        for second in codes[i + 1:]:
            if per_category[first] == per_category[second]:
                log(f"  注意: 分类 {first}（{CATEGORIES[first]}）和 {second}（{CATEGORIES[second]}）抓到的内容完全相同")
    if only is None or ALL_PAGE in only:  # “全部”页用来补上不属于任何分类的通知（约占 4 成），增量模式也要看
        result = crawl_listing(fetch, f"{LISTING_ROOT}{ALL_PAGE}.htm", limit, delay)
        if not result["items"]:
            raise ParseError("「全部」页没有解析出任何通知")
        add(result["items"], None)
        skipped += result["skipped"]
        log(f"  {ALL_PAGE} 全部: {len(result['items'])} 条 / {result['pages']} 页 {describe(result)}")
    return notices, skipped


def plan_changes(scraped: dict, existing: dict, now_iso: str) -> list[dict]:
    """对比抓到的内容和数据库已有内容，只返回需要写入的行。分类只合并、不删除。"""
    rows = []
    for url, entry in scraped.items():
        old = existing.get(url)
        categories = sorted(set(old["categories"] if old else []) | entry["categories"])
        if old and old["title"] == entry["title"] and old["published_on"] == entry["published_on"] \
                and old["categories"] == categories:
            continue
        rows.append({"url": url, "title": entry["title"], "published_on": entry["published_on"],
                     "categories": categories, "updated_at": now_iso})
    return rows


# ---------------------------------------------------------------- 网络与数据库

def make_fetch(delay_range, use_proxy=True):
    session = requests.Session()
    session.headers.update(HEADERS)
    session.trust_env = use_proxy  # False: 不使用系统/环境变量里的代理，直连教务网

    def fetch(url: str) -> str:
        last_error = None
        for attempt in range(3):
            try:
                response = session.get(url, timeout=20)
                response.raise_for_status()
                return response.content.decode("utf-8", errors="replace")  # 页面声明为 UTF-8
            except requests.RequestException as error:
                last_error = error
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"请求失败: {url}: {last_error}")

    return fetch, (lambda: time.sleep(random.uniform(*delay_range)))


class Supabase:
    def __init__(self, url: str, anon_key: str):
        self.url, self.anon_key = url.rstrip("/"), anon_key
        self.session = requests.Session()
        self.token = None

    def login(self, email: str, password: str) -> None:
        response = self.session.post(f"{self.url}/auth/v1/token", params={"grant_type": "password"},
                                     headers={"apikey": self.anon_key}, json={"email": email, "password": password},
                                     timeout=20)
        if response.status_code != 200:
            raise RuntimeError(f"爬虫账号登录失败（HTTP {response.status_code}），请检查 CRAWLER_EMAIL / CRAWLER_PASSWORD")
        self.token = response.json()["access_token"]

    @property
    def headers(self) -> dict:
        return {"apikey": self.anon_key, "Authorization": f"Bearer {self.token}"}

    def existing(self) -> dict:
        found, offset = {}, 0
        while True:
            response = self.session.get(f"{self.url}/rest/v1/notices", headers=self.headers, timeout=30, params={
                "select": "url,title,published_on,categories", "order": "id", "limit": 1000, "offset": offset})
            response.raise_for_status()
            rows = response.json()
            for row in rows:
                found[row["url"]] = {"title": row["title"], "published_on": row["published_on"],
                                     "categories": sorted(row["categories"] or [])}
            if len(rows) < 1000:
                return found
            offset += 1000

    def upsert(self, rows: list[dict]) -> None:
        for start in range(0, len(rows), 100):
            response = self.session.post(
                f"{self.url}/rest/v1/notices", params={"on_conflict": "url"}, timeout=30,
                headers={**self.headers, "Content-Type": "application/json",
                         "Prefer": "resolution=merge-duplicates,return=minimal"},
                data=json.dumps(rows[start:start + 100], ensure_ascii=False).encode("utf-8"))
            if response.status_code >= 300:
                raise RuntimeError(f"写入失败（HTTP {response.status_code}）: {response.text[:300]}")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--full", action="store_true", help="全量抓取（首次运行）")
    parser.add_argument("--pages", type=int, default=2, help="增量模式下每个分类抓取的页数（默认 2）")
    parser.add_argument("--dry-run", action="store_true", help="只抓取，不登录、不写库")
    parser.add_argument("--save", metavar="FILE", help="把抓到的内容保存为 JSON 文件")
    parser.add_argument("--only", nargs="+", metavar="CODE",
                        help="只抓指定分类（如 --only glgd jxjs），可含 qb 表示“全部”页；用于快速检查")
    parser.add_argument("--no-proxy", action="store_true",
                        help="访问教务网时不使用系统代理（开着代理/VPN 软件导致“Unable to connect to proxy”时用）")
    parser.add_argument("--delay", type=float, nargs=2, default=(0.6, 1.5), metavar=("MIN", "MAX"),
                        help="两次请求之间的随机等待秒数")
    args = parser.parse_args(argv)
    if args.only:
        unknown = [code for code in args.only if code not in CATEGORIES and code != ALL_PAGE]
        if unknown:
            parser.error(f"未知分类: {', '.join(unknown)}；可选: {', '.join(list(CATEGORIES) + [ALL_PAGE])}")

    fetch, delay = make_fetch(tuple(args.delay), use_proxy=not args.no_proxy)
    print(f"抓取模式: {'全量' if args.full else f'增量（每个分类前 {args.pages} 页）'}")
    scraped, skipped = collect(fetch, full=args.full, pages=args.pages, delay=delay, only=args.only)
    uncategorized = sum(1 for entry in scraped.values() if not entry["categories"])
    print(f"共 {len(scraped)} 条（未归入任何分类 {uncategorized} 条，跳过非学校站点链接 {len(skipped)} 条）")
    for url in skipped[:5]:
        print("  跳过:", url)

    if args.save:
        with open(args.save, "w", encoding="utf-8") as handle:
            json.dump([{"url": url, **{k: sorted(v) if k == "categories" else v for k, v in entry.items()}}
                       for url, entry in scraped.items()], handle, ensure_ascii=False, indent=1)
        print("已保存:", args.save)
    if args.dry_run:
        for url, entry in list(scraped.items())[:5]:
            print(" ", entry["published_on"], sorted(entry["categories"]), entry["title"][:40], url)
        print("dry-run: 未登录、未写库")
        return 0

    missing = [name for name in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "CRAWLER_EMAIL", "CRAWLER_PASSWORD")
               if not os.environ.get(name)]
    if missing:
        print("缺少环境变量:", ", ".join(missing), file=sys.stderr)
        return 2
    db = Supabase(os.environ["SUPABASE_URL"], os.environ["SUPABASE_ANON_KEY"])
    db.login(os.environ["CRAWLER_EMAIL"], os.environ["CRAWLER_PASSWORD"])
    existing = db.existing()
    rows = plan_changes(scraped, existing, datetime.now(timezone.utc).isoformat())
    new = sum(1 for row in rows if row["url"] not in existing)
    print(f"数据库已有 {len(existing)} 条；需要写入 {len(rows)} 条（新增 {new}，更新 {len(rows) - new}）")
    if rows:
        db.upsert(rows)
    print("完成")
    return 0


if __name__ == "__main__":
    sys.exit(main())
