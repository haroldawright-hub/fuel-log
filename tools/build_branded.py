"""Build data/products.json from USDA FoodData Central Branded Foods (US, public domain).
Keeps national brands (and the big national store brands), current products only, capped per brand.
Row: [barcode, name, brand, serving label, serving grams, kcal, protein, carbs, fat, fiber, sugar, sodium_mg, satFat] per 100 g."""
import csv, json, re, sys, collections

D, out = sys.argv[1], sys.argv[2]
PER_BRAND, MIN_BRAND, STORE_CAP = 32, 60, 120

REGIONAL = set("""MEIJER|WEGMANS|SHOPRITE|FOOD CLUB|HY-VEE|SIGNATURE SELECT|SIGNATURE KITCHENS|SIGNATURE FARMS|GIANT EAGLE|AHOLD|HARRIS TEETER|SCHNUCKS|ESSENTIAL EVERYDAY|TOPS|RALEY'S|BEST CHOICE|FOOD LION|FIRST STREET|HANNAFORD|OUR FAMILY|BIG Y|SHURFINE|PUBLIX|SPARTAN|WEIS QUALITY|ROUNDY'S|STATER BROS.|WEIS|O ORGANICS|SE GROCERS|H-E-B|HEB|SIMPLY BALANCED|BROOKSHIRE'S|HEINEN'S|PRIVATE SELECTION|FULL CIRCLE MARKET|FULL CIRCLE|WELLSLEY FARMS|IGA|GOLD EMBLEM|GOLD EMBLEM ABOUND|LUNDS & BYERLYS|GALERIE|NICE!|FRESHNESS GUARANTEED|NATURE'S PROMISE|WILD HARVEST|WINN-DIXIE|LOWES FOODS|ROUSES MARKETS|TASTE OF INSPIRATIONS|OPEN NATURE|CLOVER VALLEY|SHOPPERS VALUE|VALU TIME|CENTRAL MARKET|HILL COUNTRY FARE|PARADE|PRICE CHOPPER|MARKET BASKET|FOOD CITY|INGLES|LUCERNE|WATERFRONT BISTRO|READY MEALS|KROGER BAKERY|SUPER A FOODS|PICK 'N SAVE|SMART WAY|GREAT SCOT|PAQUI|DOLLAR GENERAL|BEST YET|GIANT|STOP & SHOP|MARTIN'S|FOOD 4 LESS|SAVE MART|BI-LO|SHOP RITE|PRICE RITE|ACME|ALBERTSONS|SAFEWAY|VONS|JEWEL-OSCO|SHAW'S|STAR MARKET|DIERBERGS|FESTIVAL FOODS|NIEMANN|HAGGEN|KINGS|FOOD BAZAAR|C&S|TOPCO|BOWL & BASKET|PATHMARK|MARKETPLACE|KINGS HAWAIIAN BAKERY|NOT A BRANDED ITEM""".split("|"))
NATIONAL_STORE = {"GREAT VALUE", "KIRKLAND SIGNATURE", "MEMBER'S MARK", "TRADER JOE'S", "365 WHOLE FOODS MARKET", "365 EVERYDAY VALUE",
                  "WHOLE FOODS MARKET", "GOOD & GATHER", "MARKET PANTRY", "FAVORITE DAY", "KROGER", "SIMPLE TRUTH", "SIMPLE TRUTH ORGANIC",
                  "MARKETSIDE", "ARCHER FARMS", "SAM'S CHOICE", "EQUATE", "ALDI", "CLANCY'S", "MILLVILLE", "FRIENDLY FARMS"}
NUT = {"1008": 0, "1003": 1, "1005": 2, "1004": 3, "1079": 4, "2000": 5, "1093": 6, "1258": 7}
# Energy is sometimes only given in kJ (1062) or as Atwater energy (2047/2048).
ALT_KCAL = {"2047", "2048"}

def r1(x):
    x = round(float(x or 0), 1)
    return int(x) if x == int(x) else x

SMALL = {"and", "or", "of", "with", "in", "the", "a", "for", "on", "to", "&"}
def title(s):
    s = re.sub(r"\s+", " ", s.strip())
    if s.upper() != s:  # already mixed case
        return s
    words = s.lower().split(" ")
    out = []
    for i, w in enumerate(words):
        if i and w in SMALL:
            out.append(w)
        else:
            out.append(re.sub(r"(^|[-/(])([a-z])", lambda m: m.group(1) + m.group(2).upper(), w))
    s = " ".join(out)
    return re.sub(r"'S\b", "'s", s)

# 1) pick current products, latest record per barcode
best = {}
with open(D + "/branded_food.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if r["discontinued_date"] or (r["market_country"] and r["market_country"] != "United States"):
            continue
        g = r["gtin_upc"].strip().lstrip("0")
        if not g.isdigit() or not (7 <= len(g) <= 13):
            continue
        unit = r["serving_size_unit"].lower()
        if unit not in ("g", "grm", "ml", "mlt"):
            continue
        p = best.get(g)
        if p is None or r["available_date"] > p["available_date"]:
            best[g] = r

brand_of = lambda r: (r["brand_name"] or r["brand_owner"]).strip().upper()
counts = collections.Counter(brand_of(r) for r in best.values())
keep_brand = {b for b, n in counts.items() if b and b not in REGIONAL and (b in NATIONAL_STORE or n >= MIN_BRAND)}
cands = [r for r in best.values() if brand_of(r) in keep_brand]
print("candidates", len(cands), "brands", len(keep_brand), flush=True)

# 2) newest products first within each brand, capped
by_brand = collections.defaultdict(list)
for r in cands:
    by_brand[brand_of(r)].append(r)
chosen = {}
for b, rs in by_brand.items():
    rs.sort(key=lambda r: r["available_date"], reverse=True)
    cap = STORE_CAP if b in NATIONAL_STORE else PER_BRAND
    for r in rs[:cap]:
        chosen[r["fdc_id"]] = r
print("chosen", len(chosen), flush=True)

# 3) names
names = {}
with open(D + "/food.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if r["fdc_id"] in chosen:
            names[r["fdc_id"]] = r["description"]

# 4) nutrients (per 100 g)
vals = collections.defaultdict(lambda: [None] * 8)
alt = {}
with open(D + "/food_nutrient.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        fid = r["fdc_id"]
        if fid not in chosen:
            continue
        nid = r["nutrient_id"]
        try:
            a = float(r["amount"])
        except ValueError:
            continue
        if nid in NUT:
            vals[fid][NUT[nid]] = a
        elif nid in ALT_KCAL:
            alt[fid] = a
        elif nid == "1062":
            alt.setdefault(fid, a / 4.184)

rows, seen_name = [], set()
for fid, r in chosen.items():
    v = vals.get(fid)
    name = names.get(fid, "").strip()
    if not v or not name:
        continue
    if v[0] is None:
        v[0] = alt.get(fid)
    if v[0] is None or v[0] > 950:
        continue
    v = [x or 0 for x in v]
    if v[1] + v[2] + v[3] > 102:
        continue
    brand = title(r["brand_name"] or r["brand_owner"])[:40]
    nm = title(name)
    m = re.match(r"^(.*\S),\s*([^,]+)$", nm)
    if m and m.group(2).lower() in m.group(1).lower():
        nm = m.group(1)
    nm = nm[:90]
    key = (nm.lower(), brand.lower())
    if key in seen_name:
        continue
    seen_name.add(key)
    try:
        sg = float(r["serving_size"] or 0)
    except ValueError:
        sg = 0
    hh = re.sub(r"\s+", " ", r["household_serving_fulltext"] or "").strip()
    unit = "ml" if r["serving_size_unit"].lower() in ("ml", "mlt") else "g"
    hh = title(hh)
    if hh and not re.match(r"(?i)^(amount per serving|per serving|serving|none|n/?a|\d+(\.\d+)?)$", hh) and not re.search(r"\d\s*(g|ml)\b", hh, re.I):
        sl = f"{hh} ({r1(sg)} {unit})"
    else:
        sl = f"{r1(sg)} {unit}"
    if not (0 < sg < 2000):
        sg, sl = 0, ""
    code = r["gtin_upc"].strip().lstrip("0")
    rows.append([code.zfill(13) if len(code) > 8 else code,
                 nm, brand, sl[:40], r1(sg)] + [r1(x) for x in v])

# well-known brands first (more products in the full dataset = bigger brand)
rows.sort(key=lambda x: -counts.get(x[2].upper(), 0))
json.dump(rows, open(out, "w"), separators=(",", ":"), ensure_ascii=False)
print(len(rows), "products")
