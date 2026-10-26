import email
import json
import re
import tempfile
import threading
import urllib.error
import urllib.request
import unittest
from datetime import timedelta
from email.message import EmailMessage
from pathlib import Path
from unittest import mock

from webbiz import admin, config, db, demo, hours, importer, outreach, prospect, sitegen


def make_cfg(**over):
    cfg = config.load("/nonexistent.json")
    cfg.update(business_name="Pixel Studio", your_name="Sam", reply_to_email="sam@pixel.test",
               postal_address="1 High St, Town", preview_base_url="https://previews.pixel.test",
               check_email_domains=False)
    cfg["smtp"].update(host="smtp.test", user="sam", password="x", from_email="sam@pixel.test")
    cfg.update(over)
    return cfg


OSM_ELEMENTS = [
    {"type": "node", "id": 1, "lat": 44.0, "lon": -121.3,
     "tags": {"name": "Rosa's Bakery", "shop": "bakery", "email": "rosa@gmail.com",
              "phone": "+1 541 555 0100", "addr:housenumber": "12", "addr:street": "Oak St",
              "addr:city": "Bend", "opening_hours": "Mo-Fr 07:00-15:00"}},
    {"type": "way", "id": 2, "center": {"lat": 44.1, "lon": -121.2},
     "tags": {"name": "Ace Plumbing", "craft": "plumber", "contact:email": "mailto:ace@ace-plumb.test; x@y.z"}},
    {"type": "node", "id": 3, "lat": 0, "lon": 0,
     "tags": {"name": "City Library", "amenity": "library", "email": "lib@city.gov"}},
    {"type": "node", "id": 4, "lat": 0, "lon": 0, "tags": {"name": "No Email Cafe", "amenity": "cafe"}},
]


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.conn = db.connect(Path(self.tmp.name) / "t.db")
        self.cfg = make_cfg()

    def tearDown(self):
        self.conn.close()
        self.tmp.cleanup()

    def find(self, **cfg):
        self.cfg.update(cfg)
        with mock.patch.object(prospect, "geocode", return_value=(44.0, -121.3)), \
             mock.patch.object(prospect, "_get", return_value={"elements": OSM_ELEMENTS}), \
             mock.patch.object(prospect.time, "sleep"):
            return prospect.find(self.conn, self.cfg, "Bend, Oregon", log=lambda *a: None)


class ProspectTests(Base):
    def test_query_excludes_businesses_with_websites(self):
        q = prospect.build_query(1.5, 2.5, 3000)
        self.assertIn('[!"website"]', q)
        self.assertIn("around:3000,1.5,2.5", q)
        self.assertIn('["contact:email"]', q)

    def test_find_keeps_businesses_and_cleans_emails(self):
        self.assertEqual(self.find(), 2)
        rows = {r["name"]: r for r in self.conn.execute("SELECT * FROM leads")}
        self.assertEqual(set(rows), {"Rosa's Bakery", "Ace Plumbing"})
        self.assertEqual(rows["Ace Plumbing"]["email"], "ace@ace-plumb.test")
        self.assertEqual(rows["Ace Plumbing"]["city"], "Bend")  # filled from search area
        self.assertEqual(rows["Rosa's Bakery"]["address"], "12 Oak St, Bend")

    def test_find_is_idempotent(self):
        self.find()
        self.assertEqual(self.find(), 0)

    def test_custom_domain_with_live_site_is_skipped(self):
        with mock.patch.object(prospect, "domain_has_website", side_effect=lambda d: d == "ace-plumb.test") as chk:
            self.assertEqual(self.find(check_email_domains=True), 1)
        chk.assert_called_once_with("ace-plumb.test")  # gmail is never checked

    def test_suppressed_email_not_re_added(self):
        db.suppress(self.conn, "rosa@gmail.com", "opt-out")
        self.assertEqual(self.find(), 1)


class ImportTests(Base):
    def test_import_csv_with_aliases(self):
        path = Path(self.tmp.name) / "l.csv"
        path.write_text("Business Name,email_address,Industry,City\nJoe's Gym,joe@gym.test,fitness,Austin\n"
                        "Bad Row,not-an-email,,\n")
        self.assertEqual(importer.import_csv(self.conn, path), (1, 2))
        self.assertEqual(self.conn.execute("SELECT city FROM leads").fetchone()[0], "Austin")


class SiteTests(Base):
    def test_build_renders_escaped_themed_page(self):
        db.add_lead(self.conn, {"source": "t", "name": "Tom & <Jerry> Cuts", "email": "t@j.test",
                                "category": "shop=hairdresser", "city": "Bend", "phone": ""})
        ids = sitegen.build(self.conn, self.cfg, Path(self.tmp.name) / "sites")
        self.assertEqual(len(ids), 1)
        lead = self.conn.execute("SELECT * FROM leads").fetchone()
        self.assertEqual(lead["status"], "site_built")
        page = (Path(self.tmp.name) / "sites" / lead["slug"] / "index.html").read_text()
        self.assertTrue("Tom &amp; &lt;Jerry&gt; Cuts" in page)
        self.assertFalse("<Jerry>" in page)  # escaped everywhere, including the JSON-LD block
        self.assertTrue("Cormorant Garamond" in page)  # beauty theme fonts
        self.assertTrue('href="mailto:t@j.test"' in page)  # no phone -> email CTA
        self.assertTrue("preview-bar" in page)
        self.assertFalse(re.search(r"\$[a-z_]", page))  # every placeholder filled

    def test_final_render_drops_preview_bar_and_shows_hours_and_map(self):
        lead = {"id": 1, "name": "Rosa's", "email": "r@x.test", "category": "shop=bakery", "phone": "+1 555 0100",
                "city": "Bend", "address": "1 Oak St", "opening_hours": "Mo-Fr 07:00-15:00", "lat": 44.0, "lon": -121.0}
        page = sitegen.render(lead, self.cfg, final=True)
        self.assertFalse('class="preview-bar"' in page)
        self.assertTrue('href="tel:+15550100"' in page)
        self.assertTrue('<tr data-day="0"><td>Monday</td><td>07:00 – 15:00</td></tr>' in page)
        self.assertTrue("openstreetmap.org/export/embed.html" in page)

    def test_theme_matching(self):
        cases = {"shop=bicycle": "auto", "shop=antiques": "shop", "shop=carpet": "shop", "craft=plumber": "trades",
                 "craft=beekeeper": "trades", "office=it": "professional", "shop=kitchen": "shop",
                 "Hair Salon": "beauty", "Car repair": "auto", "plumbing": "trades", "amenity=bar": "food",
                 "leisure=fitness_centre": "fitness", "tourism=guest_house": "stay", "": "shop"}
        for category, kind in cases.items():
            self.assertEqual(sitegen.theme_for(category)["kind"], kind, category)


class HoursTests(unittest.TestCase):
    def test_parse(self):
        week = hours.parse("Mo-Fr 07:00-15:00; Sa 08:00-12:00; Su off")
        self.assertEqual(week[0], ("Monday", "07:00 – 15:00"))
        self.assertEqual(week[5], ("Saturday", "08:00 – 12:00"))
        self.assertEqual(week[6], ("Sunday", "Closed"))
        self.assertEqual(hours.parse("24/7")[3], ("Thursday", "Open 24 hours"))
        self.assertEqual(hours.parse("Fr-Mo 10:00-22:00")[0][1], "10:00 – 22:00")  # wraps the week
        self.assertEqual(hours.parse("Fr-Mo 10:00-22:00")[2][1], "Closed")
        self.assertEqual(hours.parse("Mo 09:00-12:00,13:00-17:00; PH off")[0][1], "09:00 – 12:00, 13:00 – 17:00")

    def test_unparseable_returns_none(self):
        for text in ("", None, "sunrise-sunset", "Mo-Sa 09:00-18:00; Jan off", "by appointment"):
            self.assertIsNone(hours.parse(text), text)


class OutreachTests(Base):
    def setUp(self):
        super().setUp()
        self.find()
        sitegen.build(self.conn, self.cfg, Path(self.tmp.name) / "sites")

    def test_compose_has_compliance_bits(self):
        lead = self.conn.execute("SELECT * FROM leads WHERE name=\"Rosa's Bakery\"").fetchone()
        msg = outreach.compose(lead, self.cfg, 1)
        body = msg.get_content()
        self.assertIn("https://previews.pixel.test/" + lead["slug"] + "/", body)
        self.assertIn("1 High St, Town", body)
        self.assertIn("unsubscribe", body)
        self.assertIn("mailto:sam@pixel.test?subject=unsubscribe", msg["List-Unsubscribe"])
        self.assertIn("a local bakery in Bend", body)
        self.assertIn("$299", body)

    def test_dry_run_sends_nothing(self):
        with mock.patch.object(outreach.smtplib, "SMTP") as smtp:
            n = outreach.send(self.conn, self.cfg, outbox=Path(self.tmp.name) / "out", log=lambda *a: None)
        self.assertEqual(n, 2)
        smtp.assert_not_called()
        self.assertEqual(len(list((Path(self.tmp.name) / "out").glob("*.eml"))), 2)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM leads WHERE status='contacted'").fetchone()[0], 0)

    def test_live_send_limits_followups_and_suppression(self):
        quiet = dict(log=lambda *a: None, sleep=lambda s: None)
        with mock.patch.object(outreach.smtplib, "SMTP") as smtp:
            self.assertEqual(outreach.send(self.conn, self.cfg, live=True, limit=1, **quiet), 1)
            self.assertEqual(outreach.send(self.conn, self.cfg, live=True, **quiet), 1)
            # nothing due: both contacted, follow-up not yet due
            self.assertEqual(outreach.send(self.conn, self.cfg, live=True, **quiet), 0)
            # make follow-ups due; one lead opts out
            old = (outreach._now() - timedelta(days=5)).isoformat(timespec="seconds")
            self.conn.execute("UPDATE leads SET last_emailed_at=?", (old,))
            db.suppress(self.conn, "rosa@gmail.com", "opt-out")
            self.assertEqual(outreach.send(self.conn, self.cfg, live=True, **quiet), 1)
            self.conn.execute("UPDATE leads SET last_emailed_at=?", (old,))
            self.assertEqual(outreach.send(self.conn, self.cfg, live=True, **quiet), 0)  # max 2 per lead
        self.assertEqual(smtp.return_value.send_message.call_count, 3)
        kinds = [r[0] for r in self.conn.execute("SELECT kind FROM messages WHERE direction='out' ORDER BY id")]
        self.assertEqual(kinds, ["outreach", "outreach", "followup"])

    def test_daily_limit(self):
        self.cfg["daily_send_limit"] = 1
        with mock.patch.object(outreach.smtplib, "SMTP"):
            outreach.send(self.conn, self.cfg, live=True, log=lambda *a: None)
            self.assertEqual(outreach.send(self.conn, self.cfg, live=True, log=lambda *a: None), 0)

    def test_skip_ids(self):
        ids = [r[0] for r in self.conn.execute("SELECT id FROM leads")]
        self.assertEqual(outreach.send(self.conn, self.cfg, skip_ids=ids, log=lambda *a: None), 0)

    def test_live_refuses_without_setup(self):
        self.cfg["postal_address"] = ""
        with self.assertRaises(SystemExit) as ctx:
            outreach.send(self.conn, self.cfg, live=True, log=lambda *a: None)
        self.assertIn("postal_address", str(ctx.exception))

    def test_classify_replies(self):
        leads = {"rosa@gmail.com": None}

        def msg(frm, subject, body):
            m = EmailMessage()
            m["From"], m["Subject"] = frm, subject
            m.set_content(body)
            return email.message_from_bytes(bytes(m))

        self.assertEqual(outreach.classify(msg("Rosa <rosa@gmail.com>", "Re: site", "Love it! How do we start?\n"
                                               "On Mon, Sam wrote:\n> Reply unsubscribe ..."), leads),
                         ("rosa@gmail.com", "replied"))
        self.assertEqual(outreach.classify(msg("rosa@gmail.com", "Re: site", "Please remove me"), leads),
                         ("rosa@gmail.com", "opted_out"))
        self.assertEqual(outreach.classify(msg("MAILER-DAEMON@x.test", "Undelivered",
                                               "could not deliver to rosa@gmail.com"), leads),
                         ("rosa@gmail.com", "bounced"))
        self.assertIsNone(outreach.classify(msg("other@x.test", "hi", "hello"), leads))


def raw_email(frm, subject, body, msg_id="<m1@x.test>"):
    m = EmailMessage()
    m["From"], m["Subject"], m["Message-ID"], m["Date"] = frm, subject, msg_id, "Mon, 26 Oct 2026 10:00:00 +0000"
    m.set_content(body)
    return bytes(m)


class MailboxTests(Base):
    def setUp(self):
        super().setUp()
        self.find()
        sitegen.build(self.conn, self.cfg, Path(self.tmp.name) / "sites")
        with mock.patch.object(outreach.smtplib, "SMTP"):
            outreach.send(self.conn, self.cfg, live=True, log=lambda *a: None, sleep=lambda s: None)
        self.leads = {r["email"].lower(): r for r in self.conn.execute("SELECT * FROM leads")}

    def test_ingest_stores_reply_once_and_updates_status(self):
        raw = raw_email("Rosa <rosa@gmail.com>", "Re: website", "Yes please!")
        self.assertEqual(outreach.ingest(self.conn, raw, self.leads), "replied")
        self.assertIsNone(outreach.ingest(self.conn, raw, self.leads))  # same Message-ID: ignored
        row = self.conn.execute("SELECT * FROM messages WHERE direction='in'").fetchone()
        self.assertEqual((row["body"], row["is_read"], row["kind"]), ("Yes please!", 0, "inbound"))
        self.assertEqual(self.conn.execute("SELECT status FROM leads WHERE email='rosa@gmail.com'").fetchone()[0], "replied")

    def test_resync_does_not_override_manual_status(self):
        raw = raw_email("rosa@gmail.com", "Re: website", "Yes please!")
        outreach.ingest(self.conn, raw, self.leads)
        self.conn.execute("UPDATE leads SET status='won' WHERE email='rosa@gmail.com'")
        outreach.ingest(self.conn, raw, self.leads)
        self.assertEqual(self.conn.execute("SELECT status FROM leads WHERE email='rosa@gmail.com'").fetchone()[0], "won")

    def test_optout_reply_suppresses(self):
        outreach.ingest(self.conn, raw_email("rosa@gmail.com", "Re: website", "please remove me"), self.leads)
        self.assertTrue(db.is_suppressed(self.conn, "rosa@gmail.com"))

    def test_send_reply_threads_and_records(self):
        outreach.ingest(self.conn, raw_email("rosa@gmail.com", "Re: website", "How much?", "<abc@x.test>"), self.leads)
        lead = self.conn.execute("SELECT * FROM leads WHERE email='rosa@gmail.com'").fetchone()
        with mock.patch.object(outreach.smtplib, "SMTP") as smtp:
            msg = outreach.send_reply(self.conn, self.cfg, lead, "Re: website", "It's $299.")
        smtp.return_value.send_message.assert_called_once()
        self.assertEqual(msg["In-Reply-To"], "<abc@x.test>")
        self.assertEqual(outreach.sent_today(self.conn), 2)  # manual replies don't use the cold-email budget

    def test_sync_searches_from_first_email(self):
        box = mock.MagicMock()
        box.__enter__.return_value = box
        box.search.return_value = ("OK", [b"1"])
        box.fetch.return_value = ("OK", [(b"1", raw_email("rosa@gmail.com", "Re", "Sounds good"))])
        self.cfg["imap"]["host"] = "imap.test"
        with mock.patch.object(outreach.imaplib, "IMAP4_SSL", return_value=box):
            self.assertEqual(outreach.sync_replies(self.conn, self.cfg, log=lambda *a: None), {"rosa@gmail.com": "replied"})


class AdminTests(Base):
    def setUp(self):
        super().setUp()
        self.cfg.update(db_path=str(Path(self.tmp.name) / "t.db"), sites_dir=str(Path(self.tmp.name) / "sites"))
        demo.seed(self.conn, self.cfg, self.cfg["sites_dir"])
        self.app = admin.App(self.cfg)

    def call(self, method, path, body=None, query=None):
        return self.app.route(method, path, query or {}, body or {})

    def test_stats_leads_and_mailbox(self):
        stats = self.call("GET", "/api/stats")
        self.assertEqual(stats["total"], len(demo.LEADS))
        self.assertEqual(stats["unread"], 2)
        self.assertEqual(len(self.call("GET", "/api/leads", query={"q": "bakery"})), 1)
        inbox = self.call("GET", "/api/mailbox", query={"folder": "inbox"})
        self.assertEqual({m["name"] for m in inbox}, {"Rosa's Bakery", "Luna Hair Studio", "Quick Fix Auto"})
        queued = self.call("GET", "/api/mailbox", query={"folder": "queued"})
        kinds = {m["name"]: m["kind"] for m in queued}
        self.assertEqual(kinds["Riverside Dental"], "outreach")  # site built, never emailed
        self.assertEqual(kinds["Hartley & Co Accountants"], "followup")  # emailed 6 days ago, no reply
        self.assertNotIn("Rosa's Bakery", kinds)  # replied: never auto-emailed again

    def test_lead_detail_edit_rebuild_and_read(self):
        lead_id = self.conn.execute("SELECT id FROM leads WHERE name=\"Rosa's Bakery\"").fetchone()[0]
        d = self.call("GET", f"/api/leads/{lead_id}")
        self.assertEqual(d["lead"]["theme"], "food")
        self.assertEqual([m["direction"] for m in d["messages"]], ["out", "in"])
        self.call("POST", f"/api/leads/{lead_id}", {"phone": "999 111", "rebuild": True, "evil": "x"})
        page = (Path(self.cfg["sites_dir"]) / d["lead"]["slug"] / "index.html").read_text()
        self.assertTrue("999 111" in page)
        self.call("POST", f"/api/leads/{lead_id}/read")
        self.assertEqual(self.call("GET", "/api/stats")["unread"], 1)

    def test_status_opted_out_suppresses(self):
        lead_id = self.conn.execute("SELECT id FROM leads WHERE name='Riverside Dental'").fetchone()[0]
        self.call("POST", f"/api/leads/{lead_id}", {"status": "opted_out"})
        self.assertTrue(self.call("GET", f"/api/leads/{lead_id}")["lead"]["suppressed"])

    def test_actions_run_in_background(self):
        job = self.call("POST", "/api/actions/send", {"live": False})
        self.assertEqual(job["name"], "send")
        for _ in range(100):
            job = self.app.job_status()
            if not job["running"]:
                break
            threading.Event().wait(0.05)
        self.assertEqual(job["error"], "")
        self.assertTrue("[dry run]" in job["log"])
        with self.assertRaises(ValueError):
            self.call("POST", "/api/actions/find", {"area": " "})

    def test_http_guards(self):
        server = admin.ThreadingHTTPServer(("127.0.0.1", 0), admin.make_handler(self.app))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        try:
            def status(path, method="GET", headers=None):
                req = urllib.request.Request(base + path, method=method, data=b"{}" if method == "POST" else None,
                                             headers=headers or {})
                try:
                    return urllib.request.urlopen(req).status
                except urllib.error.HTTPError as exc:
                    return exc.code
            self.assertEqual(status("/"), 200)
            self.assertEqual(status("/api/actions/send", "POST"), 403)  # no CSRF header
            self.assertEqual(status("/sites/%2e%2e/t.db"), 404)  # no path traversal
            slug = self.conn.execute("SELECT slug FROM leads LIMIT 1").fetchone()[0]
            self.assertEqual(status(f"/sites/{slug}/"), 200)
            self.app.password = "s3cret"
            self.assertEqual(status("/api/stats"), 401)
            import base64
            auth = {"Authorization": "Basic " + base64.b64encode(b"admin:s3cret").decode()}
            self.assertEqual(status("/api/stats", headers=auth), 200)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
