"""Build data/usda.json from FoodData Central survey foods (FNDDS).
Row: [name, category, kcal, protein, carbs, fat, fiber, sugar, sodium_mg, satFat, portions]
Nutrients per 100 g. portions: "label|grams;label|grams", default first."""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
foods = json.load(open(src))["SurveyFoods"]
NUM = {"208": 2, "203": 3, "205": 4, "204": 5, "291": 6, "269": 7, "307": 8, "606": 9}

def r1(x):
    x = round(float(x), 1)
    return int(x) if x == int(x) else x

rows = []
for f in foods:
    v = [None] * 10
    for n in f.get("foodNutrients", []):
        i = NUM.get(n["nutrient"].get("number"))
        if i is not None:
            v[i] = n.get("amount", 0)
    if v[2] is None:
        continue
    clean = lambda t: re.sub(r"\s+", " ", re.sub(r",?\s*\(?\bNFS\b\)?|,?\s*NS as to [^,()]+", "", t)).strip(" ,")
    ports = [(p.get("portionDescription") or "").strip() for p in f.get("foodPortions", [])]
    ports = [d if d.lower().startswith("quantity not specified") else (clean(d) or d) for d in ports]
    grams = [p.get("gramWeight") or 0 for p in f.get("foodPortions", [])]
    qns = next((g for d, g in zip(ports, grams) if d.lower().startswith("quantity not specified")), None)
    pl = [(d, g) for d, g in zip(ports, grams) if g and d and not d.lower().startswith("quantity not specified")]
    if qns:
        same = [p for p in pl if abs(p[1] - qns) < 0.5]
        if same:
            pl.remove(same[0]); pl.insert(0, same[0])
        elif not pl:
            pl = [("1 serving", qns)]
    if not qns or not any(abs(p[1] - qns) < 0.5 for p in pl[:1]):
        pref = next((p for k in ("1 cup (8", "1 medium", "1 cup", "1 piece", "1 slice", "1 serving") for p in pl if p[0].lower().startswith(k)), None)
        if pref:
            pl.remove(pref); pl.insert(0, pref)
    pl = pl[:6]
    cat = (f.get("wweiaFoodCategory") or {}).get("wweiaFoodCategoryDescription", "")
    rows.append([f["description"], cat] + [r1(x or 0) for x in v[2:]] + [";".join(f"{d.replace('|', '/').replace(';', ',')}|{r1(g)}" for d, g in pl)])

rows.sort(key=lambda r: r[0])
json.dump(rows, open(out, "w"), separators=(",", ":"), ensure_ascii=False)
print(len(rows), "foods")
