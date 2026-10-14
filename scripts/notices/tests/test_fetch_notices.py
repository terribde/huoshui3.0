import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import fetch_notices as fn  # noqa: E402

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")


def read(name):
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as handle:
        return handle.read()


LAST = "https://bksy.swjtu.edu.cn/tzgg/jsfz/1.htm"
FIRST = "https://bksy.swjtu.edu.cn/tzgg/jsfz.htm"


class ParseListing(unittest.TestCase):
    def test_real_last_page_items_and_no_next(self):
        page = fn.parse_listing(read("jsfz_last_page.html"), LAST)
        self.assertEqual(len(page["items"]), 10)
        self.assertIsNone(page["next_url"])
        first = page["items"][0]
        self.assertEqual(first["url"], "https://bksy.swjtu.edu.cn/info/1291/26551.htm")
        self.assertEqual(first["title"], "西南交通大学关于开展2025年校级教学名师申报工作的通知")  # 去掉前导空格
        self.assertEqual(first["published_on"], "2025-10-28")
        self.assertEqual(page["items"][-1]["published_on"], "2024-12-11")
        self.assertIn("研习班 （第三期）的通知", page["items"][7]["title"])

    def test_first_page_links_resolve_and_next_page_is_found(self):
        page = fn.parse_listing(read("jsfz_first_page_CONSTRUCTED.html"), FIRST)
        self.assertEqual(page["items"][0]["url"], "https://bksy.swjtu.edu.cn/info/1291/26551.htm")
        self.assertEqual(page["next_url"], "https://bksy.swjtu.edu.cn/tzgg/jsfz/1.htm")

    def test_unrecognised_pager_is_an_error_not_a_silent_stop(self):
        html = read("jsfz_last_page.html").replace("p_next_d", "p_something_else")
        with self.assertRaises(fn.ParseError):
            fn.parse_listing(html, LAST)

    def test_missing_pager_means_single_page(self):
        html = read("jsfz_last_page.html")
        start = html.index('<div class="pb_sys_common')
        end = html.index("</div>", start) + len("</div>")
        page = fn.parse_listing(html[:start] + html[end:], LAST)
        self.assertIsNone(page["next_url"])

    def test_date_suffix_format_without_time_tag(self):
        html = ('<ul class="right-list"><li><a href="/info/1291/9.htm">关于某事的通知 2025/02/25</a></li></ul>')
        item = fn.parse_listing(html, FIRST)["items"][0]
        self.assertEqual((item["title"], item["published_on"]), ("关于某事的通知", "2025-02-25"))

    def test_class_rename_falls_back_to_info_links(self):
        html = '<div><a href="../info/1411/95301.htm">【实习】通知 2026/09/30</a><a href="../jsfz.htm">分类</a></div>'
        items = fn.parse_listing(html, FIRST)["items"]
        self.assertEqual([i["url"] for i in items], ["https://bksy.swjtu.edu.cn/info/1411/95301.htm"])

    def test_school_sites_and_attachments_are_kept_other_links_skipped(self):
        def one(href):
            return ('<ul class="right-list"><li><a href="%s"><div class="line1">T</div>'
                    '<div class="time">2026/01/02</div></a></li></ul>' % href)
        kept = ["https://maths.swjtu.edu.cn/info/1150/27174.htm", "/__local/0/29/EF/ABC_305C6.pdf?e=.pdf",
                "https://swjtu.edu.cn/x.htm"]
        for href in kept:
            self.assertEqual(len(fn.parse_listing(one(href), FIRST)["items"]), 1, href)
        for href in ["http://maths.swjtu.edu.cn/a.htm", "https://swjtu.edu.cn.evil.com/a.htm",
                     "https://evilswjtu.edu.cn/a.htm", "https://swjtu.edu.cn@evil.com/a.htm",
                     "javascript:alert(1)"]:
            page = fn.parse_listing(one(href), FIRST)
            self.assertEqual(page["items"], [], href)
            self.assertEqual(len(page["skipped"]), 1, href)

    def test_external_links_are_skipped_and_garbage_raises(self):
        html = ('<ul class="right-list"><li><a href="https://mp.weixin.qq.com/s/x"><div class="line1">外链</div>'
                '<div class="time">2026/01/02</div></a></li></ul>')
        page = fn.parse_listing(html, FIRST)
        self.assertEqual((page["items"], page["skipped"]), ([], ["https://mp.weixin.qq.com/s/x"]))
        with self.assertRaises(fn.ParseError):
            fn.parse_listing('<ul class="right-list"><li><a href="../../info/1/2.htm">没有日期</a></li></ul>', LAST)


class Crawl(unittest.TestCase):
    pages = {
        FIRST: read("jsfz_first_page_CONSTRUCTED.html"),
        LAST: read("jsfz_last_page.html"),
    }

    def test_follows_next_until_disabled(self):
        calls = []
        result = fn.crawl_listing(lambda url: calls.append(url) or self.pages[url], FIRST, None)
        self.assertEqual((calls, result["pages"], len(result["items"])), ([FIRST, LAST], 2, 20))

    def test_max_pages_limits_crawl(self):
        calls = []
        result = fn.crawl_listing(lambda url: calls.append(url) or self.pages[url], FIRST, 1)
        self.assertEqual((calls, result["pages"]), ([FIRST], 1))

    def test_pagination_loop_is_detected(self):
        looping = read("jsfz_first_page_CONSTRUCTED.html").replace("jsfz/1.htm", "jsfz.htm")
        with self.assertRaises(fn.ParseError):
            fn.crawl_listing(lambda url: looping, FIRST, None)

    def test_collect_merges_categories_and_fails_on_empty_category(self):
        def fetch(url):
            if url.endswith("/tzgg/jsfz.htm"):
                return read("jsfz_last_page.html")
            if url.endswith("/tzgg/qb.htm"):
                return read("jsfz_last_page.html").replace("26551", "99999")
            return read("jsfz_last_page.html").replace("26551", "26551")  # 其它分类也含同一批通知
        scraped, skipped = fn.collect(fetch, full=True, pages=2, log=lambda *_: None)
        entry = scraped["https://bksy.swjtu.edu.cn/info/1291/26541.htm"]
        self.assertEqual(entry["categories"], set(fn.CATEGORIES))  # 同一篇出现在多个分类里
        self.assertEqual(scraped["https://bksy.swjtu.edu.cn/info/1291/99999.htm"]["categories"], set())

    def test_empty_category_is_allowed_but_missing_list_is_an_error(self):
        empty = '<html><body><ul class="right-list"></ul></body></html>'
        messages = []
        fetch = lambda url: read("jsfz_last_page.html") if url.endswith("/qb.htm") else empty  # noqa: E731
        scraped, _ = fn.collect(fetch, full=False, pages=1, log=messages.append)
        self.assertEqual(len(scraped), 10)  # 只剩“全部”页里的通知
        self.assertEqual(sum("没有通知" in line for line in messages), len(fn.CATEGORIES))
        with self.assertRaises(fn.ParseError):  # 改版: 既没有列表容器也没有通知链接
            fn.collect(lambda url: "<html><body><p>维护中</p></body></html>", full=False, pages=1, log=lambda *_: None)
        with self.assertRaises(fn.ParseError):  # 有列表项但找不到链接
            fn.parse_listing('<ul class="right-list"><li>只有文字</li></ul>', FIRST)

    def test_incremental_mode_also_reads_the_all_page(self):
        seen = []
        def fetch(url):
            seen.append(url)
            return read("jsfz_last_page.html")
        scraped, _ = fn.collect(fetch, full=False, pages=2, log=lambda *_: None)
        self.assertEqual(seen[-1], "https://bksy.swjtu.edu.cn/tzgg/qb.htm")
        self.assertEqual(len(seen), len(fn.CATEGORIES) + 1)

    def test_only_limits_categories_and_identical_categories_are_flagged(self):
        seen, messages = [], []
        def fetch(url):
            seen.append(url)
            return read("jsfz_last_page.html")
        fn.collect(fetch, full=False, pages=1, log=messages.append, only=["jxyx", "jxjs", "glgd"])
        self.assertEqual([u.rsplit("/", 1)[1] for u in seen], ["jxyx.htm", "jxjs.htm", "glgd.htm"])
        self.assertTrue(any("完全相同" in line for line in messages))
        seen.clear()
        fn.collect(fetch, full=True, pages=1, log=lambda *_: None, only=["qb"])
        self.assertEqual([u.rsplit("/", 1)[1] for u in seen], ["qb.htm"])


class PlanChanges(unittest.TestCase):
    NOW = "2026-10-01T00:00:00+00:00"

    def scraped(self, **entry):
        base = {"title": "T", "published_on": "2026-09-30", "categories": {"jsfz"}}
        return {"https://bksy.swjtu.edu.cn/info/1/1.htm": {**base, **entry}}

    def test_new_rows_are_written_and_unchanged_rows_are_not(self):
        url = "https://bksy.swjtu.edu.cn/info/1/1.htm"
        rows = fn.plan_changes(self.scraped(), {}, self.NOW)
        self.assertEqual(rows, [{"url": url, "title": "T", "published_on": "2026-09-30",
                                 "categories": ["jsfz"], "updated_at": self.NOW}])
        same = {url: {"title": "T", "published_on": "2026-09-30", "categories": ["jsfz"]}}
        self.assertEqual(fn.plan_changes(self.scraped(), same, self.NOW), [])

    def test_categories_are_merged_never_dropped(self):
        url = "https://bksy.swjtu.edu.cn/info/1/1.htm"
        existing = {url: {"title": "T", "published_on": "2026-09-30", "categories": ["jxyx"]}}
        rows = fn.plan_changes(self.scraped(), existing, self.NOW)
        self.assertEqual(rows[0]["categories"], ["jsfz", "jxyx"])
        # 只在“全部”页出现（没有分类）也不会把已有分类清空
        rows = fn.plan_changes(self.scraped(categories=set(), title="T2"), existing, self.NOW)
        self.assertEqual((rows[0]["categories"], rows[0]["title"]), (["jxyx"], "T2"))


if __name__ == "__main__":
    unittest.main()
