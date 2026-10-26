"""Put preview sites online.

Built in: Netlify (free plan) via its API — paste a personal access token in Settings and
webbiz creates the site, sets preview_base_url and uploads every preview in one zip.
Alternatively set `publish_command` in config.json to use any other host.
"""
import io
import json
import secrets as _secrets
import subprocess
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from . import config

NETLIFY_API = "https://api.netlify.com/api/v1"
# Previews are private pitches: keep them out of search engines and give the root no listing.
ROBOTS = "User-agent: *\nDisallow: /\n"
ROOT_PAGE = ("<!doctype html><meta charset=utf-8><meta name=robots content=noindex>"
             "<title>Website previews</title><p style='font:16px system-ui;margin:40px'>Nothing to see here.</p>")


def _netlify(cfg, method, path, data=None, content_type="application/json"):
    req = urllib.request.Request(f"{NETLIFY_API}{path}", data=data, method=method, headers={
        "Authorization": f"Bearer {cfg['netlify_token']}", "Content-Type": content_type,
        "User-Agent": "webbiz"})
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        if exc.code == 401:
            raise ValueError("Netlify rejected the token — create a new one and paste it in Settings.") from None
        raise RuntimeError(f"Netlify error {exc.code}: {detail}") from None


def connect_netlify(cfg, name_hint):
    """Create a Netlify site for the previews and save its id + URL. Returns the URL."""
    base = "".join(c if c.isalnum() else "-" for c in name_hint.lower()).strip("-")[:40] or "previews"
    for attempt in range(5):
        name = f"{base}-previews" + ("" if attempt == 0 else f"-{_secrets.token_hex(3)}")
        try:
            site = _netlify(cfg, "POST", "/sites", json.dumps({"name": name}).encode())
            break
        except RuntimeError as exc:
            if "422" not in str(exc):  # 422 = name taken; try another
                raise
    else:
        raise RuntimeError("Couldn't find a free Netlify site name — try again.")
    url = (site.get("ssl_url") or site.get("url") or f"https://{name}.netlify.app").rstrip("/")
    config.save({"netlify_site_id": site["id"], "preview_base_url": url})
    cfg.update(netlify_site_id=site["id"], preview_base_url=url)
    return url


def zip_sites(sites_dir):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("robots.txt", ROBOTS)
        zf.writestr("index.html", ROOT_PAGE)
        for path in sorted(Path(sites_dir).rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(sites_dir).as_posix())
    return buf.getvalue()


def can_publish(cfg):
    return bool(cfg["publish_command"] or (cfg["netlify_token"] and cfg["netlify_site_id"]))


def publish(cfg, sites_dir, log=print):
    if cfg["publish_command"]:
        log(f"Publishing: {cfg['publish_command']}")
        res = subprocess.run(cfg["publish_command"], shell=True, cwd=config.ROOT,
                             capture_output=True, text=True, timeout=900)
        output = (res.stdout + res.stderr).strip()
        if output:
            log(output[-6000:])
        if res.returncode:
            raise RuntimeError(f"publish_command failed (exit {res.returncode})")
    elif cfg["netlify_token"] and cfg["netlify_site_id"]:
        data = zip_sites(sites_dir)
        log(f"Uploading {len(data) // 1024} KB to Netlify...")
        deploy = _netlify(cfg, "POST", f"/sites/{cfg['netlify_site_id']}/deploys", data, "application/zip")
        log(f"Deployed ({deploy.get('state', 'uploaded')}). Previews live at {cfg['preview_base_url']}/")
    else:
        raise ValueError("Connect Netlify in Settings (or set publish_command in config.json) to publish.")
