import email
import tempfile
import unittest
from datetime import timedelta
from email.message import EmailMessage
from pathlib import Path
from unittest import mock

from webbiz import config, db, importer, outreach, prospect, sitegen


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
        self.assertIn("Tom &amp; &lt;Jerry&gt; Cuts", page)
        self.assertNotIn("<Jerry>", page)
        self.assertIn("#be185d", page)  # beauty theme
        self.assertIn("mailto:t@j.test", page)  # no phone -> email CTA
        self.assertNotIn("$", page.replace("$$", ""))  # every placeholder filled

    def test_theme_fallback(self):
        self.assertEqual(sitegen.theme_for("shop=bicycle")["kind"], "auto")
        self.assertEqual(sitegen.theme_for("shop=antiques")["kind"], "shop")


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


if __name__ == "__main__":
    unittest.main()
