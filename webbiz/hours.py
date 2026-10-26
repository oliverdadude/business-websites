"""Turn OpenStreetMap opening_hours strings into a weekly table.

Handles the common simple forms ("Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off", "24/7").
Anything fancier (holidays, months, week numbers) returns None so the raw text is shown.
"""
import re

DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
TIME = re.compile(r"^\d{1,2}:\d{2}-\d{1,2}:\d{2}\+?$")


def _days(spec):
    out = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-", 1)
            if a not in DAYS or b not in DAYS:
                return None
            i, j = DAYS.index(a), DAYS.index(b)
            out += [DAYS[k % 7] for k in range(i, j + 1 if j >= i else j + 8)]
        elif part in DAYS:
            out.append(part)
        else:
            return None
    return out


def _times(spec):
    spec = spec.strip()
    if spec.lower() in ("off", "closed"):
        return "Closed"
    ranges = [r.strip() for r in spec.split(",")]
    if not all(TIME.match(r) for r in ranges):
        return None
    return ", ".join(r.replace("-", " – ") for r in ranges)


def parse(text):
    """Return [(day_name, hours_text), ...] for Monday..Sunday, or None if unparseable."""
    text = (text or "").strip()
    if not text:
        return None
    if text == "24/7":
        return [(n, "Open 24 hours") for n in NAMES]
    week = {}
    for rule in filter(None, (r.strip() for r in text.split(";"))):
        if rule.startswith(("PH", "SH")):
            continue
        m = re.match(r"^([A-Za-z,\-]+)\s+(.+)$", rule)
        if m and m.group(1)[:2] in DAYS:
            days, times = _days(m.group(1)), _times(m.group(2))
        else:
            days, times = DAYS, _times(rule)
        if days is None or times is None:
            return None
        for d in days:
            week[d] = times
    if not week:
        return None
    return [(NAMES[i], week.get(d, "Closed")) for i, d in enumerate(DAYS)]
