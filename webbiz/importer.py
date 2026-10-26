"""Import leads found elsewhere (e.g. by a prospecting skill) from a CSV file.

Recognised columns (case-insensitive; extra columns are ignored):
name / business_name / company, email, category / industry, phone, address, city.
"""
import csv

from . import db

ALIASES = {
    "name": ("name", "business_name", "business name", "company", "company_name"),
    "email": ("email", "email_address", "business_email", "contact_email"),
    "category": ("category", "industry", "type"),
    "phone": ("phone", "phone_number", "telephone"),
    "address": ("address", "street_address", "full_address"),
    "city": ("city", "town", "locality"),
}


def import_csv(conn, path, source="import"):
    added = total = 0
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        cols = {c.lower().strip(): c for c in reader.fieldnames or []}
        mapping = {field: next((cols[a] for a in names if a in cols), None) for field, names in ALIASES.items()}
        if not mapping["name"] or not mapping["email"]:
            raise SystemExit(f"{path} needs at least a name column and an email column; found {list(cols)}")
        for row in reader:
            total += 1
            lead = {f: (row.get(c) or "").strip() for f, c in mapping.items() if c}
            if "@" not in lead.get("email", "") or not lead.get("name"):
                continue
            lead["source"] = source
            if not db.is_suppressed(conn, lead["email"]) and db.add_lead(conn, lead):
                added += 1
    return added, total
