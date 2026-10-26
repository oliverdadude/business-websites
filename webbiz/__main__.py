"""webbiz command line.

  python -m webbiz find "Bend, Oregon" --radius 15     find businesses with email but no website
  python -m webbiz import leads.csv                    add leads found another way (e.g. a skill)
  python -m webbiz build                               make a preview site for every new lead
  python -m webbiz send [--live] [--limit N]           email previews + follow-ups (dry run by default)
  python -m webbiz publish                             upload output/sites using publish_command
  python -m webbiz sync                                read your inbox: mark replies, opt-outs, bounces
  python -m webbiz run "Bend, Oregon" [--live]         find + build + send in one go (good for cron)
  python -m webbiz leads [--status S]                  list leads
  python -m webbiz mark ID won|lost|replied|skipped    update a lead by hand
  python -m webbiz optout EMAIL                        never email this address again
  python -m webbiz stats                               pipeline summary
  python -m webbiz admin [--demo]                      dashboard at http://127.0.0.1:8080
"""
import argparse
import sys

from . import config, db, importer, outreach, prospect, publish, sitegen


def main(argv=None):
    p = argparse.ArgumentParser(prog="webbiz", description="Find, build and pitch websites for local businesses.")
    p.add_argument("--config", help="path to config.json (default: ./config.json)")
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("find", help="find local businesses with a public email and no website")
    f.add_argument("area", help='town or neighbourhood, e.g. "Bend, Oregon"')
    f.add_argument("--radius", type=float, default=10, help="search radius in km (default 10)")

    i = sub.add_parser("import", help="import leads from a CSV (name,email,... columns)")
    i.add_argument("csv")
    i.add_argument("--source", default="import")

    b = sub.add_parser("build", help="generate preview sites for new leads")
    b.add_argument("--rebuild", action="store_true", help="also regenerate sites not yet emailed")

    s = sub.add_parser("send", help="email leads their preview (dry run unless --live)")
    s.add_argument("--live", action="store_true")
    s.add_argument("--limit", type=int)

    sub.add_parser("sync", help="check inbox for replies, opt-outs and bounces")
    sub.add_parser("publish", help="upload output/sites (Netlify from Settings, or publish_command)")

    r = sub.add_parser("run", help="find + build + send")
    r.add_argument("area", nargs="?", help="skip to build+send if omitted")
    r.add_argument("--radius", type=float, default=10)
    r.add_argument("--live", action="store_true")
    r.add_argument("--limit", type=int)

    l = sub.add_parser("leads", help="list leads")
    l.add_argument("--status", choices=db.STATUSES)

    m = sub.add_parser("mark", help="set a lead's status")
    m.add_argument("id", type=int)
    m.add_argument("status", choices=db.STATUSES)

    o = sub.add_parser("optout", help="add an email to the do-not-contact list")
    o.add_argument("email")

    sub.add_parser("stats", help="pipeline summary")

    a = sub.add_parser("admin", help="open the admin dashboard (leads, mailbox, websites)")
    a.add_argument("--host", default="127.0.0.1")
    a.add_argument("--port", type=int, default=8080)
    a.add_argument("--demo", action="store_true", help="explore with sample data (separate demo database)")
    a.add_argument("--open", action="store_true", help="open the dashboard in your browser")

    args = p.parse_args(argv)
    cfg = config.load(args.config)
    if getattr(args, "demo", False):
        cfg.update(db_path="data/demo.db", sites_dir="output/demo-sites")
    conn = db.connect(config.resolve(cfg, "db_path"))
    sites_dir = config.resolve(cfg, "sites_dir")
    outbox = config.ROOT / "output" / "outbox"

    if args.cmd == "find":
        prospect.find(conn, cfg, args.area, args.radius)
    elif args.cmd == "import":
        added, total = importer.import_csv(conn, args.csv, args.source)
        print(f"Imported {added} new leads from {total} rows.")
    elif args.cmd == "build":
        built = sitegen.build(conn, cfg, sites_dir, rebuild=args.rebuild)
        print(f"Built {len(built)} preview site(s) in {sites_dir}")
    elif args.cmd == "send":
        outreach.send(conn, cfg, live=args.live, limit=args.limit, outbox=outbox)
    elif args.cmd == "publish":
        try:
            publish.publish(cfg, sites_dir)
        except (ValueError, RuntimeError) as exc:
            raise SystemExit(str(exc))
    elif args.cmd == "sync":
        outreach.sync_replies(conn, cfg)
    elif args.cmd == "run":
        if cfg["imap"]["host"]:
            outreach.sync_replies(conn, cfg)  # never follow up on someone who already replied
        if args.area:
            prospect.find(conn, cfg, args.area, args.radius)
        built = sitegen.build(conn, cfg, sites_dir)
        print(f"Built {len(built)} preview site(s) in {sites_dir}")
        skip = []
        if built and publish.can_publish(cfg):
            publish.publish(cfg, sites_dir)
        elif built and args.live:
            # Don't email a link that isn't online yet; they'll go out on the next run.
            print("Publishing isn't set up, so new sites will be emailed on the next run "
                  "once you've published output/sites.")
            skip = built
        outreach.send(conn, cfg, live=args.live, limit=args.limit, outbox=outbox, skip_ids=skip)
    elif args.cmd == "leads":
        q, params = "SELECT * FROM leads", ()
        if args.status:
            q, params = q + " WHERE status=?", (args.status,)
        for row in conn.execute(q + " ORDER BY id", params):
            print(f"{row['id']:>4}  {row['status']:<10} {row['name'][:32]:<32} {row['email']:<34} "
                  f"{sitegen.nice_category(row['category'])[:20]}")
    elif args.cmd == "mark":
        db.set_status(conn, args.id, args.status)
        print(f"Lead {args.id} -> {args.status}")
    elif args.cmd == "optout":
        db.suppress(conn, args.email, "opt-out")
        print(f"{args.email} will never be emailed.")
    elif args.cmd == "admin":
        from . import admin
        if args.demo:
            from . import demo
            demo.seed(conn, cfg, sites_dir)
        admin.serve(cfg, args.host, args.port, open_browser=args.open)
    elif args.cmd == "stats":
        for row in conn.execute("SELECT status, COUNT(*) n FROM leads GROUP BY status ORDER BY n DESC"):
            print(f"{row['status']:<11} {row['n']}")
        total = conn.execute("SELECT COUNT(*) FROM messages WHERE direction='out'").fetchone()[0]
        print(f"\nemails sent: {total}  (today: {outreach.sent_today(conn)}/{cfg['daily_send_limit']})")


if __name__ == "__main__":
    sys.exit(main())
