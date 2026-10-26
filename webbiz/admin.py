"""Local admin dashboard: leads, mailbox, site previews and pipeline actions.

    python -m webbiz admin            # http://127.0.0.1:8080

Runs on your own machine. To expose it beyond localhost, set ADMIN_PASSWORD and pass --host 0.0.0.0.
"""
import base64
import contextlib
import hmac
import json
import mimetypes
import os
import re
import subprocess
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import config, db, outreach, prospect, sitegen

PAGE = Path(__file__).parent / "templates" / "admin.html"
LEAD_FIELDS = ("name", "email", "category", "phone", "address", "city", "opening_hours", "notes")


def _rows(cur):
    return [dict(r) for r in cur.fetchall()]


class App:
    def __init__(self, cfg, password=""):
        self.cfg = cfg
        self.password = password
        self.db_path = config.resolve(cfg, "db_path")
        self.sites_dir = config.resolve(cfg, "sites_dir")
        self.job, self.job_lock = None, threading.Lock()
        db.connect(self.db_path).close()

    def conn(self):
        return db.connect(self.db_path)

    # ---- API -----------------------------------------------------------------------------
    def stats(self, conn, _q):
        by_status = {r["status"]: r["n"] for r in conn.execute("SELECT status, COUNT(*) n FROM leads GROUP BY status")}
        unread = conn.execute("SELECT COUNT(*) FROM messages WHERE direction='in' AND is_read=0").fetchone()[0]
        sent = conn.execute("SELECT COUNT(*) FROM messages WHERE direction='out'").fetchone()[0]
        recent = _rows(conn.execute(
            "SELECT m.id, m.lead_id, m.subject, m.body, m.kind, m.is_read, m.created_at, l.name FROM messages m "
            "JOIN leads l ON l.id=m.lead_id WHERE m.direction='in' ORDER BY m.created_at DESC LIMIT 6"))
        return {
            "by_status": by_status, "total": sum(by_status.values()), "unread": unread, "sent_total": sent,
            "sent_today": outreach.sent_today(conn), "daily_limit": self.cfg["daily_send_limit"],
            "queue": len(outreach.queue(conn, self.cfg)), "recent": recent,
            "ready": outreach.check_ready(self.cfg), "imap": bool(self.cfg["imap"]["host"]),
            "business_name": self.cfg["business_name"], "publish": bool(self.cfg["publish_command"]),
        }

    def leads(self, conn, q):
        sql = ("SELECT l.*, (SELECT COUNT(*) FROM messages m WHERE m.lead_id=l.id AND m.direction='in' "
               "AND m.is_read=0) unread, (SELECT MAX(created_at) FROM messages m WHERE m.lead_id=l.id) last_activity "
               "FROM leads l")
        where, params = [], []
        if q.get("status"):
            where.append("l.status=?")
            params.append(q["status"])
        if q.get("q"):
            where.append("(l.name LIKE ? OR l.email LIKE ? OR l.city LIKE ? OR l.category LIKE ?)")
            params += [f"%{q['q']}%"] * 4
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY COALESCE(last_activity, l.created_at) DESC, l.id DESC LIMIT 1000"
        return _rows(conn.execute(sql, params))

    def lead(self, conn, lead_id):
        row = conn.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
        if not row:
            raise LookupError("lead not found")
        lead = dict(row)
        lead["theme"] = sitegen.theme_for(lead["category"])["kind"]
        lead["preview_url"] = sitegen.preview_url(self.cfg, lead["slug"]) if lead["slug"] else ""
        lead["suppressed"] = db.is_suppressed(conn, lead["email"])
        messages = _rows(conn.execute("SELECT * FROM messages WHERE lead_id=? ORDER BY created_at, id", (lead_id,)))
        due = {r["id"]: s for r, s in outreach.due(conn, self.cfg)}
        draft = None
        if lead_id in due:
            msg = outreach.compose(row, self.cfg, due[lead_id])
            draft = {"step": due[lead_id], "subject": msg["Subject"], "body": msg.get_content()}
        return {"lead": lead, "messages": messages, "next_email": draft, "statuses": db.STATUSES}

    def mailbox(self, conn, q):
        folder = q.get("folder", "inbox")
        if folder == "queued":
            items = []
            for lead, step in outreach.queue(conn, self.cfg):
                msg = outreach.compose(lead, self.cfg, step)
                items.append({"id": f"q{lead['id']}", "lead_id": lead["id"], "name": lead["name"],
                              "to_addr": lead["email"], "subject": msg["Subject"], "body": msg.get_content(),
                              "kind": "outreach" if step == 1 else "followup", "is_read": 1, "created_at": ""})
            return items
        direction = "in" if folder == "inbox" else "out"
        return _rows(conn.execute(
            "SELECT m.*, l.name FROM messages m LEFT JOIN leads l ON l.id=m.lead_id WHERE m.direction=? "
            "ORDER BY m.created_at DESC, m.id DESC LIMIT 500", (direction,)))

    def update_lead(self, conn, lead_id, body):
        if "status" in body:
            if body["status"] in ("opted_out", "bounced"):
                email = conn.execute("SELECT email FROM leads WHERE id=?", (lead_id,)).fetchone()["email"]
                db.suppress(conn, email, "bounce" if body["status"] == "bounced" else "opt-out")
            else:
                db.set_status(conn, lead_id, body["status"])
        fields = {k: str(v) for k, v in body.items() if k in LEAD_FIELDS}
        if fields:
            conn.execute(f"UPDATE leads SET {', '.join(f'{k}=?' for k in fields)} WHERE id=?",
                         [*fields.values(), lead_id])
            conn.commit()
        if body.get("rebuild"):
            row = conn.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
            sitegen.build_one(conn, self.cfg, self.sites_dir, row)
        return self.lead(conn, lead_id)

    def mark_read(self, conn, lead_id):
        conn.execute("UPDATE messages SET is_read=1 WHERE lead_id=? AND direction='in'", (lead_id,))
        conn.commit()
        return {"ok": True}

    def reply(self, conn, lead_id, body):
        row = conn.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
        if not body.get("body", "").strip():
            raise ValueError("Write a message first.")
        outreach.send_reply(conn, self.cfg, row, body.get("subject") or f"Re: website for {row['name']}", body["body"])
        return self.lead(conn, lead_id)

    def optout(self, conn, lead_id):
        row = conn.execute("SELECT email FROM leads WHERE id=?", (lead_id,)).fetchone()
        db.suppress(conn, row["email"], "opt-out")
        return self.lead(conn, lead_id)

    def start_action(self, name, body):
        """Run a pipeline step in the background; the UI polls /api/job for its log."""
        if name not in ("find", "build", "publish", "send", "sync"):
            raise LookupError(f"unknown action {name}")
        if name == "find" and not (body.get("area") or "").strip():
            raise ValueError("Enter a town or area to search.")
        with self.job_lock:
            if self.job and self.job["running"]:
                raise RuntimeError("Another action is still running — wait for it to finish.")
            self.job = job = {"name": name, "running": True, "log": [], "error": "", "live": bool(body.get("live"))}
        threading.Thread(target=self._run_action, args=(job, name, body), daemon=True).start()
        return self.job_status()

    def job_status(self):
        job = self.job or {"name": "", "running": False, "log": [], "error": ""}
        return dict(job, log="\n".join(job["log"]))

    def _run_action(self, job, name, body):
        log = lambda *a: job["log"].append(" ".join(str(x) for x in a))
        conn = self.conn()
        try:
            if name == "find":
                prospect.find(conn, self.cfg, body["area"].strip(), float(body.get("radius") or 10), log=log)
            elif name == "build":
                built = sitegen.build(conn, self.cfg, self.sites_dir, rebuild=bool(body.get("rebuild")))
                log(f"Built {len(built)} site(s).")
            elif name == "publish":
                if not self.cfg["publish_command"]:
                    raise ValueError("Set publish_command in config.json first (see README).")
                res = subprocess.run(self.cfg["publish_command"], shell=True, cwd=config.ROOT,
                                     capture_output=True, text=True, timeout=900)
                log((res.stdout + res.stderr)[-6000:])
                if res.returncode:
                    raise RuntimeError(f"publish_command failed (exit {res.returncode})")
                log("Published.")
            elif name == "send":
                limit = int(body["limit"]) if body.get("limit") else None
                outreach.send(conn, self.cfg, live=bool(body.get("live")), limit=limit, log=log)
            elif name == "sync":
                outreach.sync_replies(conn, self.cfg, log=log)
        except SystemExit as exc:  # CLI-style errors from the pipeline
            job["error"] = str(exc)
        except Exception as exc:
            traceback.print_exc()
            job["error"] = f"{type(exc).__name__}: {exc}"
        finally:
            conn.close()
            job["running"] = False

    # ---- Routing ------------------------------------------------------------------------
    def route(self, method, path, query, body):
        with contextlib.closing(self.conn()) as conn:
            if method == "GET":
                if path == "/api/stats":
                    return self.stats(conn, query)
                if path == "/api/leads":
                    return self.leads(conn, query)
                if path == "/api/job":
                    return self.job_status()
                if path == "/api/mailbox":
                    return self.mailbox(conn, query)
                if m := re.fullmatch(r"/api/leads/(\d+)", path):
                    return self.lead(conn, int(m[1]))
            elif method == "POST":
                if m := re.fullmatch(r"/api/leads/(\d+)", path):
                    return self.update_lead(conn, int(m[1]), body)
                if m := re.fullmatch(r"/api/leads/(\d+)/(read|reply|optout)", path):
                    lead_id = int(m[1])
                    return {"read": lambda: self.mark_read(conn, lead_id), "reply": lambda: self.reply(conn, lead_id, body),
                            "optout": lambda: self.optout(conn, lead_id)}[m[2]]()
                if m := re.fullmatch(r"/api/actions/(\w+)", path):
                    return self.start_action(m[1], body)
        raise LookupError("not found")

    def final_site(self, lead_id):
        with contextlib.closing(self.conn()) as conn:
            row = conn.execute("SELECT * FROM leads WHERE id=?", (lead_id,)).fetchone()
            if not row:
                raise LookupError("lead not found")
            return row, sitegen.render(row, self.cfg, final=True)


def make_handler(app):
    class Handler(BaseHTTPRequestHandler):
        server_version = "webbiz"

        def log_message(self, fmt, *args):
            if os.environ.get("WEBBIZ_DEBUG"):
                super().log_message(fmt, *args)

        def _authorised(self):
            if not app.password:
                return True
            header = self.headers.get("Authorization", "")
            if header.startswith("Basic "):
                try:
                    _, _, pw = base64.b64decode(header[6:]).decode().partition(":")
                    if hmac.compare_digest(pw, app.password):
                        return True
                except Exception:
                    pass
            self.send_response(401)
            self.send_header("WWW-Authenticate", 'Basic realm="webbiz admin"')
            self.end_headers()
            return False

        def _send(self, status, payload, ctype="application/json", extra=None):
            data = payload if isinstance(payload, bytes) else (
                payload.encode() if isinstance(payload, str) else json.dumps(payload).encode())
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(data)

        def _static_site(self, path):
            rel = path[len("/sites/"):]
            target = (app.sites_dir / rel).resolve()
            if target.is_dir():
                if not path.endswith("/"):
                    return self._send(301, b"", "text/plain", {"Location": path + "/"})
                target = target / "index.html"
            if app.sites_dir.resolve() not in target.parents or not target.is_file():
                return self._send(404, b"Site not found - build it first.", "text/plain")
            ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            if ctype.startswith("text/"):
                ctype += "; charset=utf-8"
            self._send(200, target.read_bytes(), ctype)

        def _handle(self, method):
            if not self._authorised():
                return
            url = urlparse(self.path)
            query = {k: v[0] for k, v in parse_qs(url.query).items()}
            try:
                if method == "GET" and url.path in ("/", "/index.html"):
                    return self._send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
                if method == "GET" and url.path.startswith("/sites/"):
                    return self._static_site(url.path)
                if method == "GET" and (m := re.fullmatch(r"/final/(\d+)", url.path)):
                    row, page = app.final_site(int(m[1]))
                    name = sitegen.slugify(row["name"]) + ".html"
                    return self._send(200, page, "text/html; charset=utf-8",
                                      {"Content-Disposition": f'attachment; filename="{name}"'})
                body = {}
                if method == "POST":
                    # Custom header forces a CORS preflight, so other websites can't POST here (CSRF).
                    if self.headers.get("X-Webbiz") != "1":
                        return self._send(403, {"error": "missing X-Webbiz header"})
                    length = int(self.headers.get("Content-Length") or 0)
                    body = json.loads(self.rfile.read(length) or b"{}") if length else {}
                self._send(200, app.route(method, url.path, query, body))
            except LookupError as exc:
                self._send(404, {"error": str(exc)})
            except (ValueError, RuntimeError) as exc:
                self._send(400, {"error": str(exc)})
            except Exception as exc:  # surface unexpected errors in the UI rather than hanging
                traceback.print_exc()
                self._send(500, {"error": f"{type(exc).__name__}: {exc}"})

        def do_GET(self):
            self._handle("GET")

        def do_POST(self):
            self._handle("POST")

    return Handler


def serve(cfg, host="127.0.0.1", port=8080):
    password = os.environ.get("ADMIN_PASSWORD", "")
    if host not in ("127.0.0.1", "localhost", "::1") and not password:
        raise SystemExit("Set ADMIN_PASSWORD before exposing the admin beyond localhost.")
    app = App(cfg, password)
    httpd = ThreadingHTTPServer((host, port), make_handler(app))
    print(f"webbiz admin running at http://{host}:{port}  (Ctrl+C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
