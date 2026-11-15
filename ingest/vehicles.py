"""Lexicon of car brands/models sold in Thailand, for deciding whether a user's car is a battery-electric vehicle (BEV).

WHY
    Thai standard EV motor policy (OIC 2568), หมวด 1 ข้อ 2, defines the insured car as one
    "ขับเคลื่อนด้วยพลังงานไฟฟ้าจากแบตเตอรี่เท่านั้น โดยไม่รวมถึงรถยนต์ไฟฟ้าที่ดัดแปลงมาจากรถยนต์สันดาป".
    So BEV -> EV policy plans (ev1-ev3); PHEV / EREV / HEV / ICE -> regular plans.
    When one name is sold in both BEV and non-BEV versions the entry is "ambiguous" and the app must ask back.

POWERTRAIN CODES (must match build_data.POWERTRAINS and route.js)
    BEV        battery only, no engine                         -> EV policy
    PHEV       plug-in hybrid (BYD DM-i, Chery CSH, Jaecoo SHS) -> regular policy
    EREV       range-extender / REEV (engine only charges)     -> regular policy
    HEV        hybrid that cannot plug in (incl. Honda e:HEV, Nissan e-POWER)
    ICE        petrol / diesel
    ambiguous  the name covers BEV and non-BEV versions -> ask the user
    A non-BEV entry whose versions mix e.g. HEV + petrol uses its electrified code and says so in "note";
    for the BEV decision only "BEV vs not BEV" matters.
    BRANDS: "BEV" only if every model the brand sells/sold in Thailand (2023-2026) is BEV, else "ambiguous";
    a brand with no BEV at all (Haval) uses its main non-BEV code.

HOW THE APP MATCHES (public/js/route.js detectVehicle)
    text and aliases are lowercased with all whitespace removed; aliases are tried longest first over BRANDS+MODELS
    together; each hit is cut out of the text (so a shorter alias inside it can no longer match); a brand hit is
    dropped when a model of that same brand id also hit.
    Consequences followed here:
    * sub-brand models sit under the parent brand id so "gac aion ut", "changan deepal s07", "gwm ora good cat",
      "byd denza d9" give only the model.  The sub-brand also has its own BRANDS row (aion, deepal, ora, haval,
      denza) for questions that name only the sub-brand.
    * an ambiguous parent never gets an alias that a child would need to extend from the front; when it must
      (e.g. "byd sealion", "denza d9", "mg zs"), every child repeats that prefix ("byd sealion 7").
      Ambiguous names whose brand is already ambiguous (Lexus ES/UX, Benz CLA/GLC) have no parent row: the
      brand row already makes the app ask.
    * children are listed before their parent: equal-length ties keep list order.

ALIAS RULES
    * lowercase; one form only when forms differ just by spaces (spaces are stripped anyway).
    * at least 3 characters after removing spaces (build_data rejects shorter).
    * an alias without a brand word must be >= 4 characters and distinctive (not inside ordinary Thai/English
      insurance wording, not inside another model's alias).  Short or generic names (i4, ix1, x, 07, s5, ev5,
      ux, seal, model y, v, ut, x9, g6, c10, b10, eqa, glc, leaf, urban ...) appear only brand-qualified.
    * never generic words alone: ev, ไฟฟ้า, hybrid, electric, รถไฟฟ้า, numbers.  "seal" never bare (it is inside
      "sealion").  "mini", "smart", "ora", "เกีย", "ไอออน", "โลตัส" are not used bare because they occur in
      ordinary text (minimum/มินิมาร์ท, สมาร์ทโฟน/Yaris Smart, temporary, เกียร์, ลิเธียมไอออน, Lotus's).
    * a distinct BEV name gets its own row (mg_zs_ev "zs ev") and the bare name stays on the ambiguous parent.

SOURCES
    Each row has the URL that was read and that states or clearly shows the powertrain (manufacturer Thai site
    when it could be fetched; many manufacturer sites returned 403, so Thai price lists (9carthai) and Thai auto
    media (car250, headlightmag, autolifethailand, autospinn) were used).  Main ones:
      car250 BEV registrations Sep 2569 + Jan-Sep 2569 ranking + PHEV/REEV list: https://www.car250.com/2026-09-th.html
      car250 BEV registrations Jan-Nov 2567:                                     https://www.car250.com/byd-dolphine-bev-11.html
      car250 BEV price list 2569:                                                https://www.car250.com/bev-phev-erev-th-new-2026-07.html
      car250 BYD/Denza price list with EV / PHEV column:                         https://www.car250.com/byd-price-th-2026-new.html
      MG Thailand model list:                                                    https://www.mgcars.com/th
      Omoda & Jaecoo Thailand model list:                                        https://www.omodajaecoo.co.th/
      9carthai brand price lists (volvo, bmw, mercedes-benz, mini, hyundai, kia, toyota, honda, nissan, lexus,
      porsche, gwm, deepal, mazda, audi): https://www.9carthai.com/<brand>-price
    Rows marked "unverified": True had no source read in this pass that shows the Thai-market powertrain.

Compiled 2026-11-14 (14 พ.ย. 2569).  Review when new models launch, especially EREV/PHEV versions of names that
are BEV-only in Thailand today (Deepal S07, Avatr, Xpeng X9, Leapmotor C10, Wuling Darion, BYD Atto 2, Porsche
Cayenne Electric).

Self-check: python -I ingest/vehicles.py
"""
from __future__ import annotations

POWERTRAINS = {
    "BEV": "รถยนต์ไฟฟ้าแบตเตอรี่ล้วน (BEV) เข้านิยามกรมธรรม์รถยนต์ไฟฟ้า",
    "PHEV": "ปลั๊กอินไฮบริด (PHEV) มีเครื่องยนต์ ไม่ใช่ BEV ใช้กรมธรรม์รถยนต์ทั่วไป",
    "EREV": "ไฟฟ้าพร้อมเครื่องยนต์ปั่นไฟขยายระยะ (EREV/REEV) มีเครื่องยนต์ ไม่ใช่ BEV ใช้กรมธรรม์รถยนต์ทั่วไป",
    "HEV": "ไฮบริด (HEV รวม e:HEV, e-POWER) ไม่ใช่ BEV ใช้กรมธรรม์รถยนต์ทั่วไป",
    "ICE": "เครื่องยนต์สันดาป (เบนซิน/ดีเซล) ใช้กรมธรรม์รถยนต์ทั่วไป",
    "ambiguous": "ชื่อนี้มีทั้งรุ่น BEV และรุ่นที่ไม่ใช่ BEV ต้องถามผู้ใช้ก่อน",
}

BRANDS = [
    # ---- BEV-only brands in Thailand ----
    {"id": "tesla", "name": "Tesla", "alias": ["tesla", "เทสล่า", "เทสลา", "เทสล้า"], "powertrain": "BEV",
     "source": "https://www.car250.com/byd-dolphine-bev-11.html",
     "note": "ทุกรุ่นเป็น BEV (Model 3, Model Y, Model S/X นำเข้า)"},
    {"id": "zeekr", "name": "Zeekr", "alias": ["zeekr", "ซีเคอร์", "ซีคเกอร์"], "powertrain": "BEV",
     "source": "https://www.car250.com/2026-09-th.html", "note": "ในไทยมี X, 7X, 009 ทุกรุ่น BEV"},
    {"id": "neta", "name": "Neta", "alias": ["neta", "เนต้า", "เนตา"], "powertrain": "BEV",
     "source": "https://www.car250.com/byd-dolphine-bev-11.html", "note": "Neta V, V-II, X ทุกรุ่น BEV"},
    {"id": "xpeng", "name": "Xpeng", "alias": ["xpeng", "เสี่ยวเผิง", "เอ็กซ์เผิง", "เอ็กซ์เพง"], "powertrain": "BEV",
     "source": "https://www.car250.com/2026-09-th.html",
     "note": "ในไทยมี G6, X9 แบบ BEV; X9 EREV มีในจีน ยังไม่พบว่าขายในไทย"},
    {"id": "leapmotor", "name": "Leapmotor", "alias": ["leapmotor", "ลีปมอเตอร์", "ลี๊ปมอเตอร์"], "powertrain": "BEV",
     "source": "https://www.car250.com/2026-09-th.html", "note": "ในไทยมี C10 EV, B10; C10 REEV มีในต่างประเทศ"},
    {"id": "wuling", "name": "Wuling", "alias": ["wuling", "วูหลิง", "อู่หลิง"], "powertrain": "BEV",
     "source": "https://www.car250.com/2026-09-th.html",
     "note": "ในไทยมี Air EV, Binguo, Bingo, Starlight Darion EV; Darion PHEV ขายในอินโดนีเซีย"},
    {"id": "avatr", "name": "Avatr", "alias": ["avatr", "อวาตาร์", "อวาต้า", "อะวาตาร์"], "powertrain": "BEV",
     "source": "https://www.autospinn.com/2025/11/avatr-07-146359",
     "note": "ในไทยนำเข้า 07, 11 แบบ BEV; 07/11 รุ่น EREV มีในจีน"},
    {"id": "omoda", "name": "Omoda", "alias": ["omoda", "โอโมดะ", "โอโมด้า"], "powertrain": "BEV",
     "source": "https://www.omodajaecoo.co.th/", "note": "ในไทยขาย C5 EV รุ่นเดียว"},
    {"id": "smart", "name": "smart", "alias": ["smart #", "สมาร์ท #"], "powertrain": "BEV",
     "source": "https://www.headlightmag.com/?p=359532", "note": "#1, #3, #5 ในไทยเป็นไฟฟ้า; ไม่ใช้คำว่า smart เดี่ยวๆ เพราะซ้ำกับคำทั่วไปและรุ่นย่อย Toyota"},
    {"id": "riddara", "name": "Riddara", "alias": ["riddara", "ริดดารา"], "powertrain": "BEV",
     "source": "https://www.car250.com/2026-09-th.html", "note": "RD6 กระบะไฟฟ้า"},
    {"id": "hongqi", "name": "Hongqi", "alias": ["hongqi", "หงฉี", "หงษ์ฉี"], "powertrain": "BEV",
     "source": "https://www.headlightmag.com/official-price-hongqi-e-hs-9/", "note": "ในไทยมี E-HS9, EH7 (BEV)"},
    {"id": "aion", "name": "GAC Aion", "alias": ["aion", "gac aion"], "powertrain": "BEV",
     "source": "https://www.car250.com/2026-09-th.html",
     "note": "แบรนด์ย่อยของ GAC: UT, V, Y Plus, ES, Hyptec ทุกรุ่น BEV; รุ่นอยู่ใต้ brand gac"},

    # ---- brands that sell both ----
    {"id": "byd", "name": "BYD", "alias": ["byd", "บีวายดี", "บีวายดี้"], "powertrain": "ambiguous",
     "source": "https://www.car250.com/byd-price-th-2026-new.html", "note": "EV และ DM-i (PHEV) เช่น Sealion 6/5 DM-i, Seal 5 DM-i"},
    {"id": "denza", "name": "Denza", "alias": ["denza", "เดนซ่า", "เด็นซ่า"], "powertrain": "ambiguous",
     "source": "https://www.car250.com/byd-price-th-2026-new.html", "note": "D9 EV ขายในไทย; D9 DM-i (PHEV) เคยโชว์ในไทย; รุ่นอยู่ใต้ brand byd"},
    {"id": "mg", "name": "MG", "alias": ["เอ็มจี", "mg motor", "รถ mg", "ค่าย mg"], "powertrain": "ambiguous",
     "source": "https://www.mgcars.com/th", "note": "\"mg\" สั้นเกิน 3 ตัวอักษร จึงจับผ่านชื่อรุ่น (mg4, mg zs ...)"},
    {"id": "changan", "name": "Changan", "alias": ["changan", "ฉางอาน"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/deepal-price", "note": "Lumin/Nevo เป็น BEV แต่ Deepal (ของ Changan) มี REEV; รุ่น Deepal อยู่ใต้ brand นี้"},
    {"id": "deepal", "name": "Deepal", "alias": ["deepal", "ดีพอล", "ดีปาล", "ดีพาล"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/deepal-price", "note": "S05 มี BEV และ REEV, Hunter K50 เป็น REEV"},
    {"id": "gac", "name": "GAC", "alias": ["gac", "จีเอซี"], "powertrain": "ambiguous",
     "source": "https://www.car250.com/2026-09-th.html", "note": "Aion เป็น BEV แต่ GAC M8 เป็น PHEV"},
    {"id": "geely", "name": "Geely", "alias": ["geely", "จีลี่", "จีลี"], "powertrain": "ambiguous",
     "source": "https://www.motorist.co.th/en/article/6228/thonburi-neue-stern-debuts-the-geely-starray-em-r-reev-suv-as-a-global-first-in-thailand",
     "note": "EX2/EX5 เป็น BEV แต่ Starray EM-R เป็น REEV"},
    {"id": "gwm", "name": "GWM (Great Wall Motor)", "alias": ["gwm", "great wall", "เกรทวอลล์"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/gwm-price", "note": "ORA เป็น BEV ส่วน Haval/Tank/WEY เป็น HEV/PHEV/ดีเซล; รุ่นทุกแบรนด์ย่อยอยู่ใต้ brand gwm"},
    {"id": "ora", "name": "GWM ORA", "alias": ["โอร่า"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/new-ora-5-price/", "note": "ORA 5 มีทั้ง EV และ HEV; ไม่ใช้ \"ora\" เดี่ยวๆ (อยู่ใน temporary, corporate)"},
    {"id": "haval", "name": "GWM Haval", "alias": ["haval", "ฮาวาล"], "powertrain": "HEV",
     "source": "https://www.car250.com/2026-09-th.html", "note": "ไม่มี BEV: H6 HEV/PHEV, Jolion HEV, Raptor PHEV"},
    {"id": "jaecoo", "name": "Jaecoo", "alias": ["jaecoo", "เจคู", "เจคู่"], "powertrain": "ambiguous",
     "source": "https://www.omodajaecoo.co.th/", "note": "5 EV/6 EV/6T EV เป็น BEV แต่ 6T REEV และ 7 SHS ไม่ใช่"},
    {"id": "chery", "name": "Chery", "alias": ["chery", "เชอรี่"], "powertrain": "ambiguous",
     "source": "https://www.autospinn.com/2026/01/installment-schedul-chery-tiggo8-csh-2026-147403",
     "note": "Q และ V23 เป็น BEV แต่ Tiggo 8 CSH เป็น PHEV"},
    {"id": "lepas", "name": "Lepas", "alias": ["lepas", "เลปัส", "เลพาส"], "powertrain": "ambiguous",
     "source": "https://en.thairath.co.th/news/auto/2930289", "note": "L6 EV เป็น BEV, L8 เป็น PHEV"},
    {"id": "volvo", "name": "Volvo", "alias": ["volvo", "วอลโว่", "วอลโว"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/volvo-price", "note": "EX/EC เป็น BEV, XC60/XC90 เป็น PHEV"},
    {"id": "bmw", "name": "BMW", "alias": ["bmw", "บีเอ็ม", "บีเอ็มดับเบิลยู", "บีเอ็มดับบลิว"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/bmw-price", "note": "i/iX เป็น BEV, รุ่นอื่นเบนซิน/ดีเซล/PHEV"},
    {"id": "mini", "name": "MINI", "alias": ["ค่ายมินิ", "ยี่ห้อมินิ", "ค่าย mini"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/mini-price", "note": "ไม่ใช้ \"mini\"/\"มินิ\"/\"รถมินิ\" (minimum, minivan, มินิมาร์ท, รถมินิบัส)"},
    {"id": "mercedes", "name": "Mercedes-Benz", "alias": ["mercedes", "benz", "เบนซ์", "เมอร์เซเดส"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/mercedes-benz-price", "note": "EQ/CLA electric/G 580 เป็น BEV, รุ่น e เป็น PHEV"},
    {"id": "hyundai", "name": "Hyundai", "alias": ["hyundai", "ฮุนได", "ฮุนได้", "ฮยอนได"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/hyundai-price", "note": "Ioniq เป็น BEV, Staria/Creta ฯลฯ ไม่ใช่"},
    {"id": "kia", "name": "Kia", "alias": ["kia", "ค่ายเกีย", "ยี่ห้อเกีย"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/kia-price", "note": "EV5/EV9 เป็น BEV, Carnival/Sorento HEV/PHEV; ไม่ใช้ \"เกีย\" เดี่ยวๆ (อยู่ในคำว่าเกียร์)"},
    {"id": "toyota", "name": "Toyota", "alias": ["toyota", "โตโยต้า"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/toyota-price", "note": "bZ4X และ Hilux Travo-e เป็น BEV, รุ่นอื่น HEV/เบนซิน/ดีเซล"},
    {"id": "isuzu", "name": "Isuzu", "alias": ["isuzu", "อีซูซุ", "อีซูซู"], "powertrain": "ambiguous",
     "source": "https://www.autospinn.com/2026/03/isuzu-d-max-ev-148311",
     "note": "D-Max EV (มี.ค. 2569) เป็น BEV, D-Max/MU-X ดีเซล"},
    {"id": "mitsubishi", "name": "Mitsubishi", "alias": ["mitsubishi", "มิตซูบิชิ", "มิตซู"], "powertrain": "ICE",
     "source": "https://www.9carthai.com/mitsubishi-price",
     "note": "ไม่มี BEV ในรายการราคาไทย (พ.ย. 2569): เบนซิน/ดีเซล, Xpander/Xforce HEV, Outlander PHEV; ถ้ามี BEV เข้าไทยให้เปลี่ยนเป็น ambiguous"},
    {"id": "suzuki", "name": "Suzuki", "alias": ["suzuki", "ซูซูกิ"], "powertrain": "ambiguous",
     "source": "https://www.car250.com/suzuki-e-vitara-th-new.html", "note": "e VITARA เป็น BEV, รุ่นอื่นเบนซิน/ไฮบริด"},
    {"id": "lexus", "name": "Lexus", "alias": ["lexus", "เลกซัส", "เล็กซัส"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/lexus-price", "note": "RZ และ ES 350e เป็น BEV, รุ่น h เป็น HEV, h+ เป็น PHEV"},
    {"id": "honda", "name": "Honda", "alias": ["honda", "ฮอนด้า"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/honda-price", "note": "e:N1/e:N2/Super-ONE เป็น BEV, e:HEV เป็นไฮบริด"},
    {"id": "nissan", "name": "Nissan", "alias": ["nissan", "นิสสัน"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/nissan-price", "note": "Leaf เป็น BEV; e-POWER เป็นไฮบริดแบบมีเครื่องยนต์ปั่นไฟ"},
    {"id": "porsche", "name": "Porsche", "alias": ["porsche", "ปอร์เช่", "ปอร์เช"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/porsche-price", "note": "Taycan/Macan Electric เป็น BEV, E-Hybrid เป็น PHEV"},
    {"id": "audi", "name": "Audi", "alias": ["ออดี้", "รถ audi", "ค่าย audi", "audi a", "audi q", "audi rs", "audi tt"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/audi-price", "note": "e-tron เป็น BEV, TFSI e เป็น PHEV; ไม่ใช้ \"audi\" เดี่ยวๆ เพราะอยู่ในคำว่า audio (เครื่องเสียง)"},
    {"id": "mazda", "name": "Mazda", "alias": ["mazda", "มาสด้า"], "powertrain": "ambiguous",
     "source": "https://www.9carthai.com/mazda-price", "note": "6e/CX-6e เป็น BEV, รุ่นอื่นเบนซิน/ดีเซล"},
    {"id": "ford", "name": "Ford", "alias": ["ford", "ฟอร์ด"], "powertrain": "ambiguous",
     "source": "https://www.car250.com/2026-09-th.html", "note": "Mustang Mach-E เป็น BEV, Ranger/Everest/Mustang ไม่ใช่"},
    {"id": "volkswagen", "name": "Volkswagen", "alias": ["volkswagen", "โฟล์คสวาเกน", "รถ vw"], "powertrain": "ambiguous",
     "source": "https://www.car250.com/byd-dolphine-bev-11.html", "note": "ID. Buzz เป็น BEV, Caravelle ฯลฯ ไม่ใช่"},
    {"id": "lotus", "name": "Lotus", "alias": ["lotus cars", "ค่ายโลตัส", "ยี่ห้อโลตัส"], "powertrain": "ambiguous",
     "source": "https://www.headlightmag.com/?p=216294", "note": "Eletre/Emeya เป็น BEV, Emira เป็นเบนซิน; ไม่ใช้ \"lotus\"/\"โลตัส\" เดี่ยวๆ (ห้าง Lotus's, จอดรถโลตัส)"},
]

MODELS = [
    # ===================== BYD (and Denza under brand byd) =====================
    {"id": "byd_dolphin", "brand": "byd", "name": "BYD Dolphin", "alias": ["dolphin", "ดอลฟิน", "ดอลฟิ้น", "โดลฟิน"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_atto1", "brand": "byd", "name": "BYD Atto 1",
     "alias": ["atto 1", "แอตโต้ 1", "อัตโต้ 1", "แอตโต 1", "อัตโต 1", "แอทโต้ 1"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_atto2", "brand": "byd", "name": "BYD Atto 2",
     "alias": ["atto 2", "แอตโต้ 2", "อัตโต้ 2", "แอตโต 2", "อัตโต 2", "แอทโต้ 2"],
     "powertrain": "BEV", "note": "ในไทยขายเฉพาะ EV; ต่างประเทศมี Atto 2 DM-i ถ้าผู้ใช้บอก DM-i ให้ถือว่าไม่ใช่ BEV",
     "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_atto3", "brand": "byd", "name": "BYD Atto 3",
     "alias": ["atto 3", "แอตโต้ 3", "อัตโต้ 3", "แอตโต 3", "อัตโต 3", "แอทโต้ 3"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    # Sealion children first (ties keep list order), then the ambiguous parent, then Seal.
    {"id": "byd_sealion7", "brand": "byd", "name": "BYD Sealion 7",
     "alias": ["sealion 7", "byd sealion 7", "ซีไลออน 7", "ซีไลอ้อน 7", "ซีลไลออน 7", "บีวายดี ซีลไลออน 7"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_sealion6", "brand": "byd", "name": "BYD Sealion 6 DM-i (Seal U DM-i)",
     "alias": ["sealion 6", "byd sealion 6", "ซีไลออน 6", "ซีไลอ้อน 6", "ซีลไลออน 6", "บีวายดี ซีลไลออน 6",
               "seal u", "byd seal u", "ซีล ยู", "บีวายดี ซีล ยู"],
     "powertrain": "PHEV", "note": "ปลั๊กอินไฮบริด DM-i; ชื่อสากล Seal U DM-i (ไม่มี Seal U แบบ EV ในไทย)",
     "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_sealion5", "brand": "byd", "name": "BYD Sealion 5 DM-i",
     "alias": ["sealion 5", "byd sealion 5", "ซีไลออน 5", "ซีไลอ้อน 5", "ซีลไลออน 5", "บีวายดี ซีลไลออน 5"],
     "powertrain": "PHEV", "note": "ปลั๊กอินไฮบริด DM-i", "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_sealion", "brand": "byd", "name": "BYD Sealion (ไม่ระบุเลขรุ่น)",
     "alias": ["sealion", "byd sealion", "ซีไลออน", "ซีไลอ้อน", "ซีลไลออน", "บีวายดี ซีลไลออน"],
     "powertrain": "ambiguous",
     "variants": [{"name": "Sealion 7", "powertrain": "BEV"}, {"name": "Sealion 6 DM-i", "powertrain": "PHEV"},
                  {"name": "Sealion 5 DM-i", "powertrain": "PHEV"}],
     "note": "ถามว่า Sealion 7 (ไฟฟ้าล้วน) หรือ Sealion 6/5 DM-i (ปลั๊กอินไฮบริด)",
     "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_seal6", "brand": "byd", "name": "BYD Seal 6",
     "alias": ["seal 6", "byd seal 6", "บีวายดี ซีล 6", "ซีล 6"],
     "powertrain": "BEV", "note": "ในไทยขายเฉพาะ Seal 6 EV; ต่างประเทศมี Seal 06 DM-i",
     "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_seal5", "brand": "byd", "name": "BYD Seal 5 DM-i",
     "alias": ["seal 5", "byd seal 5", "บีวายดี ซีล 5", "ซีล 5"],
     "powertrain": "PHEV", "note": "ปลั๊กอินไฮบริด DM-i", "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_seal", "brand": "byd", "name": "BYD Seal",
     "alias": ["byd seal", "บีวายดี ซีล", "seal ev"],
     "powertrain": "BEV", "note": "Seal ซีดาน (ไม่มีเลข) เป็น BEV; ถ้ามีเลข 5 หรือ DM-i คือ Seal 5 DM-i (PHEV)",
     "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_m6", "brand": "byd", "name": "BYD M6", "alias": ["byd m6", "บีวายดี m6", "บีวายดี เอ็ม6"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_e6", "brand": "byd", "name": "BYD e6", "alias": ["byd e6", "บีวายดี e6", "บีวายดี อี6"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "byd_t3", "brand": "byd", "name": "BYD T3", "alias": ["byd t3", "บีวายดี t3"],
     "powertrain": "BEV", "note": "รถตู้ไฟฟ้าเชิงพาณิชย์", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "byd_denza_d9_ev", "brand": "byd", "name": "Denza D9 EV",
     "alias": ["denza d9 ev", "d9 ev", "เดนซ่า d9 ev", "เดนซ่า d9 อีวี"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-price-th-2026-new.html"},
    {"id": "byd_denza_d9_dmi", "brand": "byd", "name": "Denza D9 DM-i",
     "alias": ["denza d9 dm-i", "d9 dm-i", "เดนซ่า d9 dm-i"],
     "powertrain": "PHEV", "note": "เคยโชว์ในไทย (BIMS) ยังไม่พบราคาไทยทางการ",
     "source": "https://wapcar.my/news/byds-jv-with-mercedesbenz-denza-d9-dmi-previewed-in-thailand-15litre-turbo-phev-as-bev-alternative-78609"},
    {"id": "byd_denza_d9", "brand": "byd", "name": "Denza D9",
     "alias": ["denza d9", "เดนซ่า d9", "เด็นซ่า d9"],
     "powertrain": "ambiguous",
     "variants": [{"name": "D9 EV", "powertrain": "BEV"}, {"name": "D9 DM-i", "powertrain": "PHEV"}],
     "note": "รถที่จดทะเบียนในไทยส่วนใหญ่เป็น D9 EV แต่มี D9 DM-i ในภูมิภาค ถามก่อน",
     "source": "https://www.car250.com/byd-price-th-2026-new.html"},

    # ===================== Tesla =====================
    {"id": "tesla_model_3", "brand": "tesla", "name": "Tesla Model 3",
     "alias": ["tesla model 3", "tesla โมเดล 3", "เทสล่า โมเดล 3", "เทสลา โมเดล 3", "เทสล่า model 3", "เทสลา model 3",
               "เทสล่า โมเดลทรี"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "tesla_model_y", "brand": "tesla", "name": "Tesla Model Y",
     "alias": ["tesla model y", "tesla โมเดลวาย", "เทสล่า โมเดลวาย", "เทสลา โมเดลวาย", "เทสล่า โมเดล y", "เทสลา โมเดล y",
               "เทสล่า model y", "เทสลา model y"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "tesla_model_s", "brand": "tesla", "name": "Tesla Model S",
     "alias": ["tesla model s", "เทสล่า โมเดล s", "เทสล่า model s"],
     "powertrain": "BEV", "note": "นำเข้าอิสระ", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "tesla_model_x", "brand": "tesla", "name": "Tesla Model X",
     "alias": ["tesla model x", "เทสล่า โมเดล x", "เทสล่า model x"],
     "powertrain": "BEV", "note": "นำเข้าอิสระ", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},

    # ===================== MG =====================
    {"id": "mg_zs_ev", "brand": "mg", "name": "MG ZS EV",
     "alias": ["zs ev", "mg zs ev", "เอ็มจี zs ev", "เอ็มจี zs อีวี", "เอ็มจี แซดเอส อีวี", "แซดเอส อีวี"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_zs", "brand": "mg", "name": "MG ZS", "alias": ["mg zs", "เอ็มจี zs", "เอ็มจี แซดเอส", "แซดเอส"],
     "powertrain": "ambiguous",
     "variants": [{"name": "ZS EV", "powertrain": "BEV"}, {"name": "ZS / ZS HEV", "powertrain": "ICE/HEV"}],
     "note": "ถ้าผู้ใช้พิมพ์ zs ev ให้ใช้ mg_zs_ev", "source": "https://www.mgcars.com/th"},
    {"id": "mg_mg4", "brand": "mg", "name": "MG4 Electric",
     "alias": ["mg4", "เอ็มจี 4", "เอ็มจี โฟร์", "mg4 electric", "mg4 x-power"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_s5", "brand": "mg", "name": "MG S5 EV", "alias": ["mg s5", "เอ็มจี s5", "เอ็มจี เอส5"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_ep", "brand": "mg", "name": "MG EP / EP Plus", "alias": ["mg ep", "เอ็มจี ep", "เอ็มจี อีพี"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_es", "brand": "mg", "name": "MG ES", "alias": ["mg es", "เอ็มจี es", "เอ็มจี อีเอส"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_maxus7", "brand": "mg", "name": "MG Maxus 7", "alias": ["maxus 7", "แม็กซัส 7", "แมกซัส 7"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_maxus9", "brand": "mg", "name": "MG Maxus 9", "alias": ["maxus 9", "แม็กซัส 9", "แมกซัส 9", "mifa 9"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_cyberster", "brand": "mg", "name": "MG Cyberster", "alias": ["cyberster", "ไซเบอร์สเตอร์"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_im5", "brand": "mg", "name": "MG IM5", "alias": ["mg im5", "เอ็มจี im5"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_im6", "brand": "mg", "name": "MG IM6", "alias": ["mg im6", "เอ็มจี im6"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_urban", "brand": "mg", "name": "MG Urban", "alias": ["mg urban", "เอ็มจี urban", "เอ็มจี เออร์เบิน", "เอ็มจี เออเบิน"],
     "powertrain": "BEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_hs", "brand": "mg", "name": "MG HS / HS PHEV", "alias": ["mg hs", "เอ็มจี hs", "เอ็มจี เอชเอส", "hs phev"],
     "powertrain": "PHEV", "note": "มีทั้ง PHEV และเบนซิน ไม่ใช่ BEV ทั้งคู่", "source": "https://www.mgcars.com/th"},
    {"id": "mg_vs", "brand": "mg", "name": "MG VS HEV", "alias": ["mg vs", "เอ็มจี vs", "vs hev"],
     "powertrain": "HEV", "note": "", "source": "https://www.mgcars.com/th"},
    {"id": "mg_mg5", "brand": "mg", "name": "MG5", "alias": ["mg5", "เอ็มจี 5"],
     "powertrain": "ICE", "note": "ซีดานเบนซิน (MG EP คือรุ่นไฟฟ้าแยกชื่อ)", "source": "https://www.mgcars.com/th"},
    {"id": "mg_mg3", "brand": "mg", "name": "MG3 Hybrid+", "alias": ["mg3", "เอ็มจี 3", "mg3 hybrid+"],
     "powertrain": "HEV", "note": "รุ่นเก่ามีเบนซิน ไม่ใช่ BEV", "source": "https://www.mgcars.com/th"},
    {"id": "mg_extender", "brand": "mg", "name": "MG Extender", "alias": ["mg extender", "เอ็มจี extender", "เอ็มจี เอ็กซ์เทนเดอร์"],
     "powertrain": "ICE", "note": "กระบะดีเซล", "source": "https://www.mgcars.com/th"},

    # ===================== Changan / Deepal (Deepal rows under brand changan) =====================
    {"id": "changan_lumin", "brand": "changan", "name": "Changan Lumin", "alias": ["changan lumin", "ฉางอาน ลูมิน", "ลูมิน"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/bev-phev-erev-th-new-2026-07.html"},
    {"id": "changan_nevo_q05", "brand": "changan", "name": "Changan Nevo Q05",
     "alias": ["nevo q05", "เนโว q05", "changan q05", "ฉางอาน q05"],
     "powertrain": "BEV", "note": "ในไทยขายเฉพาะ BEV", "source": "https://www.9carthai.com/?p=488597"},
    {"id": "deepal_s05_bev", "brand": "changan", "name": "Deepal S05 BEV",
     "alias": ["deepal s05 bev", "deepal s05 ev", "s05 bev", "s05 ev", "ดีพอล s05 ev", "ดีพอล s05 bev", "ดีพอล s05 อีวี"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/deepal-price"},
    {"id": "deepal_s05_reev", "brand": "changan", "name": "Deepal S05 REEV",
     "alias": ["deepal s05 reev", "deepal s05 erev", "s05 reev", "s05 erev", "ดีพอล s05 reev", "ดีพอล s05 erev"],
     "powertrain": "EREV", "note": "", "source": "https://www.9carthai.com/deepal-price"},
    {"id": "deepal_s05", "brand": "changan", "name": "Deepal S05", "alias": ["deepal s05", "ดีพอล s05", "ดีปาล s05"],
     "powertrain": "ambiguous",
     "variants": [{"name": "S05 BEV", "powertrain": "BEV"}, {"name": "S05 REEV", "powertrain": "EREV"}],
     "note": "ถามว่า BEV หรือ REEV", "source": "https://www.9carthai.com/deepal-price"},
    {"id": "deepal_s07_erev", "brand": "changan", "name": "Deepal S07 EREV",
     "alias": ["deepal s07 erev", "deepal s07 reev", "s07 erev", "s07 reev", "ดีพอล s07 erev", "ดีพอล s07 reev"],
     "powertrain": "EREV", "note": "มีในจีน ยังไม่ยืนยันว่าขายในไทย (car250 บอกว่าอาจมา)",
     "source": "https://www.car250.com/deepal-s07-2026-th-29.html"},
    {"id": "deepal_s07", "brand": "changan", "name": "Deepal S07", "alias": ["deepal s07", "ดีพอล s07", "ดีปาล s07"],
     "powertrain": "BEV",
     "note": "ที่ขายในไทยถึง พ.ย. 2569 เป็น BEV; ถ้ารุ่น EREV เข้าไทยให้เปลี่ยนเป็น ambiguous",
     "source": "https://www.car250.com/deepal-s07-2026-th-29.html"},
    {"id": "deepal_l07", "brand": "changan", "name": "Deepal L07 (SL03)", "alias": ["deepal l07", "ดีพอล l07", "deepal sl03"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "deepal_e07", "brand": "changan", "name": "Deepal E07", "alias": ["deepal e07", "ดีพอล e07"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "deepal_hunter", "brand": "changan", "name": "Deepal Hunter K50 REEV",
     "alias": ["deepal hunter", "hunter k50", "deepal k50", "ดีพอล ฮันเตอร์"],
     "powertrain": "EREV", "note": "กระบะ REEV", "source": "https://www.9carthai.com/deepal-price"},

    # ===================== Avatr =====================
    {"id": "avatr_07", "brand": "avatr", "name": "Avatr 07", "alias": ["avatr 07", "อวาตาร์ 07", "อวาต้า 07"],
     "powertrain": "BEV", "note": "ในไทยเป็น BEV; จีนมี EREV", "source": "https://www.autospinn.com/2025/11/avatr-07-146359"},
    {"id": "avatr_11", "brand": "avatr", "name": "Avatr 11", "alias": ["avatr 11", "อวาตาร์ 11", "อวาต้า 11"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "avatr_12", "brand": "avatr", "name": "Avatr 12", "alias": ["avatr 12", "อวาตาร์ 12", "อวาต้า 12"],
     "powertrain": "BEV", "note": "ยังไม่พบหลักฐานการขายในไทยในรอบนี้", "source": "", "unverified": True},

    # ===================== GAC / Aion (Aion rows under brand gac) =====================
    {"id": "aion_ut", "brand": "gac", "name": "GAC Aion UT", "alias": ["aion ut", "gac aion ut", "ไอออน ut", "ไอออน ยูที"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "aion_v", "brand": "gac", "name": "GAC Aion V", "alias": ["aion v", "gac aion v", "ไอออน v", "ไอออน วี"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "aion_y_plus", "brand": "gac", "name": "GAC Aion Y Plus",
     "alias": ["aion y", "gac aion y", "aion y plus", "ไอออน y", "ไอออน วาย", "ไอออน วาย พลัส"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "aion_es", "brand": "gac", "name": "GAC Aion ES", "alias": ["aion es", "gac aion es", "ไอออน es"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "aion_hyptec", "brand": "gac", "name": "GAC Aion Hyptec HT",
     "alias": ["hyptec", "aion hyptec", "gac aion hyptec", "ไฮเปเทค", "ไฮป์เทค"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "gac_m8", "brand": "gac", "name": "GAC M8 PHEV", "alias": ["gac m8", "จีเอซี m8"],
     "powertrain": "PHEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},

    # ===================== Geely / Zeekr =====================
    {"id": "geely_ex2", "brand": "geely", "name": "Geely EX2", "alias": ["geely ex2", "จีลี่ ex2", "จีลี ex2"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/bev-phev-erev-th-new-2026-07.html"},
    {"id": "geely_ex5", "brand": "geely", "name": "Geely EX5 (Galaxy E5)",
     "alias": ["geely ex5", "จีลี่ ex5", "จีลี ex5", "galaxy e5"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/bev-phev-erev-th-new-2026-07.html"},
    {"id": "geely_starray", "brand": "geely", "name": "Geely Starray EM-R",
     "alias": ["starray", "สตาร์เรย์", "starray em-r"],
     "powertrain": "EREV", "note": "EM-R เป็น REEV, EM-i (ต่างประเทศ) เป็น PHEV ไม่ใช่ BEV ทั้งคู่",
     "source": "https://www.motorist.co.th/en/article/6228/thonburi-neue-stern-debuts-the-geely-starray-em-r-reev-suv-as-a-global-first-in-thailand"},
    {"id": "zeekr_x", "brand": "zeekr", "name": "Zeekr X", "alias": ["zeekr x", "ซีเคอร์ x"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "zeekr_7x", "brand": "zeekr", "name": "Zeekr 7X", "alias": ["zeekr 7x", "ซีเคอร์ 7x"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "zeekr_009", "brand": "zeekr", "name": "Zeekr 009", "alias": ["zeekr 009", "ซีเคอร์ 009"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "zeekr_001", "brand": "zeekr", "name": "Zeekr 001", "alias": ["zeekr 001", "ซีเคอร์ 001"],
     "powertrain": "BEV", "note": "ไม่พบในรายการจดทะเบียน/ราคาไทยที่อ่าน", "source": "", "unverified": True},

    # ===================== Neta =====================
    {"id": "neta_v", "brand": "neta", "name": "Neta V / V-II (Aya)",
     "alias": ["neta v", "เนต้า v", "เนต้า วี", "neta aya", "เนต้า อาย่า"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "neta_x", "brand": "neta", "name": "Neta X", "alias": ["neta x", "เนต้า x", "เนต้า เอ็กซ์"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},

    # ===================== GWM: ORA / Haval / Tank / WEY (all under brand gwm) =====================
    {"id": "gwm_good_cat", "brand": "gwm", "name": "ORA Good Cat / Good Cat GT",
     "alias": ["good cat", "กู๊ดแคท", "กู้ดแคท", "กู๊ดแคต"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/gwm-price"},
    {"id": "gwm_ora07", "brand": "gwm", "name": "ORA 07", "alias": ["ora 07", "โอร่า 07"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/gwm-price"},
    {"id": "gwm_ora5_ev", "brand": "gwm", "name": "ORA 5 EV", "alias": ["ora 5 ev", "ora 5 bev", "โอร่า 5 ev", "โอร่า 5 อีวี"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/new-ora-5-price/"},
    {"id": "gwm_ora5_hev", "brand": "gwm", "name": "ORA 5 HEV",
     "alias": ["ora 5 hev", "ora 5 hybrid", "โอร่า 5 hev", "โอร่า 5 ไฮบริด"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/new-ora-5-price/"},
    {"id": "gwm_ora5", "brand": "gwm", "name": "ORA 5", "alias": ["ora 5", "โอร่า 5"],
     "powertrain": "ambiguous",
     "variants": [{"name": "ORA 5 EV", "powertrain": "BEV"}, {"name": "ORA 5 HEV", "powertrain": "HEV"}],
     "note": "ถามว่า EV หรือ HEV", "source": "https://www.9carthai.com/new-ora-5-price/"},
    {"id": "gwm_haval_h6", "brand": "gwm", "name": "Haval H6 HEV / PHEV",
     "alias": ["haval h6", "ฮาวาล h6", "h6 hev", "h6 phev"],
     "powertrain": "HEV", "note": "มีทั้ง HEV และ PHEV ไม่ใช่ BEV ทั้งคู่", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "gwm_haval_jolion", "brand": "gwm", "name": "Haval Jolion", "alias": ["jolion", "โจไลออน"],
     "powertrain": "HEV", "note": "HEV/เบนซิน ไม่ใช่ BEV", "source": "https://www.9carthai.com/gwm-price"},
    {"id": "gwm_haval_raptor", "brand": "gwm", "name": "Haval Raptor Plus", "alias": ["haval raptor", "ฮาวาล แร็พเตอร์"],
     "powertrain": "PHEV", "note": "", "source": "https://www.9carthai.com/gwm-price"},
    {"id": "gwm_tank", "brand": "gwm", "name": "GWM Tank 300 / 500 / 700",
     "alias": ["tank 300", "tank 500", "tank 700", "gwm tank", "แทงค์ 300", "แทงค์ 500"],
     "powertrain": "HEV", "note": "ดีเซล/HEV/PHEV (700 Hi4-Z) ไม่ใช่ BEV", "source": "https://www.9carthai.com/gwm-price"},
    {"id": "gwm_wey", "brand": "gwm", "name": "GWM WEY (G9 / V9X)", "alias": ["gwm wey", "wey g9", "wey v9x"],
     "powertrain": "PHEV", "note": "", "source": "https://www.9carthai.com/gwm-price"},

    # ===================== Omoda / Jaecoo =====================
    {"id": "omoda_c5_ev", "brand": "omoda", "name": "Omoda C5 EV (E5)",
     "alias": ["omoda c5", "omoda e5", "โอโมดะ c5", "โอโมด้า c5", "โอโมดะ e5"],
     "powertrain": "BEV", "note": "ในไทยขายเฉพาะ EV", "source": "https://www.omodajaecoo.co.th/"},
    {"id": "jaecoo_5", "brand": "jaecoo", "name": "Jaecoo 5 EV",
     "alias": ["jaecoo 5", "jaecoo j5", "เจคู 5", "เจคู่ 5"],
     "powertrain": "BEV", "note": "ในไทยขายเฉพาะ EV", "source": "https://www.omodajaecoo.co.th/"},
    {"id": "jaecoo_6t_ev", "brand": "jaecoo", "name": "Jaecoo 6T EV",
     "alias": ["jaecoo 6t ev", "เจคู 6t ev", "เจคู่ 6t ev"],
     "powertrain": "BEV", "note": "", "source": "https://www.omodajaecoo.co.th/"},
    {"id": "jaecoo_6t_reev", "brand": "jaecoo", "name": "Jaecoo 6T REEV",
     "alias": ["jaecoo 6t reev", "jaecoo 6t erev", "6t reev", "เจคู 6t reev", "เจคู่ 6t reev"],
     "powertrain": "EREV", "note": "", "source": "https://www.omodajaecoo.co.th/"},
    {"id": "jaecoo_6t", "brand": "jaecoo", "name": "Jaecoo 6T", "alias": ["jaecoo 6t", "เจคู 6t", "เจคู่ 6t"],
     "powertrain": "ambiguous",
     "variants": [{"name": "6T EV", "powertrain": "BEV"}, {"name": "6T REEV", "powertrain": "EREV"}],
     "note": "ถามว่า EV หรือ REEV", "source": "https://www.omodajaecoo.co.th/"},
    {"id": "jaecoo_6", "brand": "jaecoo", "name": "Jaecoo 6 EV", "alias": ["jaecoo 6", "jaecoo j6", "เจคู 6", "เจคู่ 6"],
     "powertrain": "BEV", "note": "ถ้ามี T ต่อท้าย (6T) ดู jaecoo_6t", "source": "https://www.omodajaecoo.co.th/"},
    {"id": "jaecoo_7", "brand": "jaecoo", "name": "Jaecoo 7 (J7) SHS",
     "alias": ["jaecoo 7", "jaecoo j7", "เจคู 7", "เจคู่ 7", "j7 shs"],
     "powertrain": "PHEV", "note": "SHS = ปลั๊กอินไฮบริด; ไม่มีรุ่น BEV", "source": "https://www.car250.com/2026-09-th.html"},

    # ===================== Chery / Lepas =====================
    {"id": "chery_q", "brand": "chery", "name": "Chery Q (Qlick/Qool/Quint)",
     "alias": ["chery q", "เชอรี่ q", "เชอรี่ คิว"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/new-chery-q-price/"},
    {"id": "chery_v23", "brand": "chery", "name": "Chery (iCaur) V23",
     "alias": ["chery v23", "เชอรี่ v23", "icaur v23", "icar v23", "ไอคาร์ v23"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "chery_icar03", "brand": "chery", "name": "Chery iCar 03", "alias": ["icar 03", "icaur 03", "ไอคาร์ 03"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "chery_tiggo", "brand": "chery", "name": "Chery Tiggo (8 CSH)",
     "alias": ["tiggo", "ทิกโก้", "tiggo 8 csh"],
     "powertrain": "PHEV", "note": "Tiggo 8 CSH เป็น PHEV; Tiggo รุ่นอื่นเบนซิน ไม่มี BEV",
     "source": "https://www.autospinn.com/2026/01/installment-schedul-chery-tiggo8-csh-2026-147403"},
    {"id": "lepas_l6", "brand": "lepas", "name": "Lepas L6 EV", "alias": ["lepas l6", "เลปัส l6"],
     "powertrain": "BEV", "note": "", "source": "https://en.thairath.co.th/news/auto/2930289"},
    {"id": "lepas_l8", "brand": "lepas", "name": "Lepas L8 PHEV", "alias": ["lepas l8", "เลปัส l8"],
     "powertrain": "PHEV", "note": "", "source": "https://en.thairath.co.th/news/auto/2930289"},

    # ===================== Xpeng / Leapmotor / Wuling / Riddara / Hongqi =====================
    {"id": "xpeng_g6", "brand": "xpeng", "name": "Xpeng G6", "alias": ["xpeng g6", "เสี่ยวเผิง g6", "เอ็กซ์เผิง g6"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "xpeng_x9", "brand": "xpeng", "name": "Xpeng X9", "alias": ["xpeng x9", "เสี่ยวเผิง x9", "เอ็กซ์เผิง x9"],
     "powertrain": "BEV", "note": "ในไทยเป็น BEV; X9 EREV มีในจีน ถ้าผู้ใช้บอก EREV ไม่ใช่ BEV",
     "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "leapmotor_c10", "brand": "leapmotor", "name": "Leapmotor C10 EV",
     "alias": ["leapmotor c10", "ลีปมอเตอร์ c10", "leap c10"],
     "powertrain": "BEV", "note": "ในไทยเป็น EV; C10 REEV มีในต่างประเทศ",
     "source": "https://autolifethailand.tv/official-price-leapmotor-c10-ev-bev-jan-2026/embed/"},
    {"id": "leapmotor_b10", "brand": "leapmotor", "name": "Leapmotor B10",
     "alias": ["leapmotor b10", "ลีปมอเตอร์ b10", "leap b10"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/bev-phev-erev-th-new-2026-07.html"},
    {"id": "wuling_air", "brand": "wuling", "name": "Wuling Air EV", "alias": ["wuling air", "วูหลิง แอร์", "อู่หลิง แอร์"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "wuling_binguo", "brand": "wuling", "name": "Wuling Binguo EV", "alias": ["binguo", "บินกั๋ว", "บินกัว"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/bev-phev-erev-th-new-2026-07.html"},
    {"id": "wuling_bingo", "brand": "wuling", "name": "Wuling Bingo EV", "alias": ["wuling bingo", "วูหลิง บิงโก"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "wuling_darion", "brand": "wuling", "name": "Wuling Starlight Darion EV",
     "alias": ["darion", "ดาริออน", "wuling starlight", "วูหลิง สตาร์ไลท์"],
     "powertrain": "BEV", "note": "ในไทยขายเฉพาะ EV; Darion PHEV ขายในอินโดนีเซีย",
     "source": "https://www.car250.com/wuling-starlight-mpv-2026-03.html"},
    {"id": "riddara_rd6", "brand": "riddara", "name": "Riddara RD6", "alias": ["riddara rd6", "ริดดารา rd6"],
     "powertrain": "BEV", "note": "กระบะไฟฟ้า", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "hongqi_ehs9", "brand": "hongqi", "name": "Hongqi E-HS9", "alias": ["e-hs9", "ehs9", "หงฉี e-hs9", "หงษ์ฉี อีเอชเอส 9"],
     "powertrain": "BEV", "note": "", "source": "https://www.headlightmag.com/official-price-hongqi-e-hs-9/"},
    {"id": "hongqi_eh7", "brand": "hongqi", "name": "Hongqi EH7", "alias": ["hongqi eh7", "หงฉี eh7"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/tag/hongqi-eh7/"},

    # ===================== Volvo =====================
    {"id": "volvo_ex30", "brand": "volvo", "name": "Volvo EX30", "alias": ["ex30"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/volvo-price"},
    {"id": "volvo_ex40", "brand": "volvo", "name": "Volvo EX40 (เดิม XC40 Recharge Pure Electric)", "alias": ["ex40"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/volvo-price"},
    {"id": "volvo_ec40", "brand": "volvo", "name": "Volvo EC40 / C40 Recharge",
     "alias": ["ec40", "volvo c40", "วอลโว่ c40", "c40 recharge"],
     "powertrain": "BEV", "note": "C40 ทุกคันเป็นไฟฟ้า (เปลี่ยนชื่อเป็น EC40)", "source": "https://www.9carthai.com/volvo-price"},
    {"id": "volvo_xc40_bev", "brand": "volvo", "name": "Volvo XC40 Recharge Pure Electric",
     "alias": ["xc40 pure electric", "xc40 recharge pure electric", "xc40 bev", "xc40 ev", "xc40 p8"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/volvo-price"},
    {"id": "volvo_xc40", "brand": "volvo", "name": "Volvo XC40", "alias": ["xc40", "xc40 recharge"],
     "powertrain": "ambiguous",
     "variants": [{"name": "XC40 Recharge Pure Electric / EX40", "powertrain": "BEV"},
                  {"name": "XC40 Recharge T5 Plug-in Hybrid", "powertrain": "PHEV"},
                  {"name": "XC40 B4/B5/T4 (mild hybrid/เบนซิน)", "powertrain": "ICE"}],
     "note": "คำว่า Recharge ใช้ทั้งรุ่นไฟฟ้าและ T5 PHEV ถามก่อน", "source": "https://www.9carthai.com/volvo-price"},
    {"id": "volvo_ex90", "brand": "volvo", "name": "Volvo EX90", "alias": ["ex90"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/volvo-price"},
    {"id": "volvo_es90", "brand": "volvo", "name": "Volvo ES90", "alias": ["es90"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/volvo-price"},
    {"id": "volvo_xc60", "brand": "volvo", "name": "Volvo XC60", "alias": ["xc60"],
     "powertrain": "PHEV", "note": "T8 PHEV (รุ่นเก่ามี mild hybrid) ไม่ใช่ BEV", "source": "https://www.9carthai.com/volvo-price"},
    {"id": "volvo_xc90", "brand": "volvo", "name": "Volvo XC90", "alias": ["xc90"],
     "powertrain": "PHEV", "note": "PHEV ไม่ใช่ BEV (EX90 คือรุ่นไฟฟ้า)", "source": "https://www.9carthai.com/volvo-price"},

    # ===================== BMW =====================
    {"id": "bmw_ix1", "brand": "bmw", "name": "BMW iX1",
     "alias": ["bmw ix1", "บีเอ็ม ix1", "บีเอ็มดับเบิลยู ix1", "บีเอ็มดับบลิว ix1"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_ix2", "brand": "bmw", "name": "BMW iX2",
     "alias": ["bmw ix2", "บีเอ็ม ix2", "บีเอ็มดับเบิลยู ix2", "บีเอ็มดับบลิว ix2"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_ix3", "brand": "bmw", "name": "BMW iX3",
     "alias": ["bmw ix3", "บีเอ็ม ix3", "บีเอ็มดับเบิลยู ix3", "บีเอ็มดับบลิว ix3"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_ix", "brand": "bmw", "name": "BMW iX",
     "alias": ["bmw ix", "บีเอ็ม ix", "บีเอ็มดับเบิลยู ix", "บีเอ็มดับบลิว ix"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_i4", "brand": "bmw", "name": "BMW i4",
     "alias": ["bmw i4", "บีเอ็ม i4", "บีเอ็มดับเบิลยู i4", "บีเอ็มดับบลิว i4"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "bmw_i5", "brand": "bmw", "name": "BMW i5",
     "alias": ["bmw i5", "บีเอ็ม i5", "บีเอ็มดับเบิลยู i5", "บีเอ็มดับบลิว i5"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_i7", "brand": "bmw", "name": "BMW i7",
     "alias": ["bmw i7", "บีเอ็ม i7", "บีเอ็มดับเบิลยู i7", "บีเอ็มดับบลิว i7"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_x1", "brand": "bmw", "name": "BMW X1",
     "alias": ["bmw x1", "บีเอ็ม x1", "บีเอ็มดับเบิลยู x1", "บีเอ็มดับบลิว x1"],
     "powertrain": "ICE", "note": "เบนซิน; รุ่นไฟฟ้าชื่อ iX1", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_x3", "brand": "bmw", "name": "BMW X3",
     "alias": ["bmw x3", "บีเอ็ม x3", "บีเอ็มดับเบิลยู x3", "บีเอ็มดับบลิว x3"],
     "powertrain": "ICE", "note": "ดีเซล/เบนซิน/30e PHEV ไม่ใช่ BEV; รุ่นไฟฟ้าชื่อ iX3", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_phev", "brand": "bmw", "name": "BMW ปลั๊กอินไฮบริด (330e / 530e / 750e / X5 50e / XM 50e)",
     "alias": ["330e", "530e", "750e", "m760e", "x5 50e", "x5 xdrive50e", "xm 50e"],
     "powertrain": "PHEV", "note": "", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_3series", "brand": "bmw", "name": "BMW 3 Series",
     "alias": ["bmw series 3", "bmw 3 series", "bmw ซีรีส์ 3", "bmw ซีรี่ส์ 3", "บีเอ็ม ซีรีส์ 3", "บีเอ็ม ซีรี่ส์ 3"],
     "powertrain": "ICE", "note": "เบนซิน/ดีเซล/330e PHEV ไม่มี BEV", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_5series", "brand": "bmw", "name": "BMW 5 Series",
     "alias": ["bmw series 5", "bmw 5 series", "bmw ซีรีส์ 5", "bmw ซีรี่ส์ 5", "บีเอ็ม ซีรีส์ 5", "บีเอ็ม ซีรี่ส์ 5"],
     "powertrain": "ambiguous",
     "variants": [{"name": "i5", "powertrain": "BEV"}, {"name": "530e", "powertrain": "PHEV"}, {"name": "520d", "powertrain": "ICE"}],
     "note": "i5 คือ 5 Series ไฟฟ้า ถามก่อน", "source": "https://www.9carthai.com/bmw-price"},
    {"id": "bmw_7series", "brand": "bmw", "name": "BMW 7 Series",
     "alias": ["bmw series 7", "bmw 7 series", "bmw ซีรีส์ 7", "bmw ซีรี่ส์ 7", "บีเอ็ม ซีรีส์ 7", "บีเอ็ม ซีรี่ส์ 7"],
     "powertrain": "ambiguous",
     "variants": [{"name": "i7", "powertrain": "BEV"}, {"name": "750e / M760e", "powertrain": "PHEV"}, {"name": "740d", "powertrain": "ICE"}],
     "note": "i7 คือ 7 Series ไฟฟ้า ถามก่อน", "source": "https://www.9carthai.com/bmw-price"},

    # ===================== MINI =====================
    {"id": "mini_cooper_e", "brand": "mini", "name": "MINI Cooper SE / Cooper E (Electric)",
     "alias": ["cooper se", "cooper e", "cooper electric", "mini cooper se", "mini cooper e", "mini electric",
               "คูเปอร์ se", "คูเปอร์ เอสอี", "คูเปอร์ อีวี", "คูเปอร์ ไฟฟ้า",
               "มินิ คูเปอร์ se", "มินิ คูเปอร์ เอสอี", "มินิ คูเปอร์ อีวี", "มินิ คูเปอร์ ไฟฟ้า"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/mini-price"},
    {"id": "mini_cooper_s", "brand": "mini", "name": "MINI Cooper S / Cooper C (เบนซิน)",
     "alias": ["cooper s", "mini cooper s", "คูเปอร์ เอส", "มินิ คูเปอร์ เอส"],
     "powertrain": "ICE", "note": "", "source": "https://www.9carthai.com/mini-price"},
    {"id": "mini_cooper", "brand": "mini", "name": "MINI Cooper",
     "alias": ["mini cooper", "cooper", "มินิ คูเปอร์", "คูเปอร์"],
     "powertrain": "ambiguous",
     "variants": [{"name": "Cooper SE / E", "powertrain": "BEV"}, {"name": "Cooper S / C / Convertible", "powertrain": "ICE"}],
     "note": "ถามว่าไฟฟ้า (SE/E) หรือเบนซิน (S/C)", "source": "https://www.9carthai.com/mini-price"},
    {"id": "mini_aceman", "brand": "mini", "name": "MINI Aceman", "alias": ["aceman", "เอซแมน", "เอซเมน"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/mini-price"},
    {"id": "mini_countryman_e", "brand": "mini", "name": "MINI Countryman SE / E",
     "alias": ["countryman se", "countryman e", "countryman electric", "คันทรีแมน se", "คันทรีแมน อีวี", "คันทรี่แมน se"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/mini-price"},
    {"id": "mini_countryman", "brand": "mini", "name": "MINI Countryman", "alias": ["countryman", "คันทรีแมน", "คันทรี่แมน"],
     "powertrain": "ambiguous",
     "variants": [{"name": "Countryman SE ALL4 / E", "powertrain": "BEV"}, {"name": "Countryman S / JCW", "powertrain": "ICE"},
                  {"name": "Countryman Plug-in Hybrid (รุ่นเก่า)", "powertrain": "PHEV"}],
     "note": "ถามก่อน", "source": "https://www.9carthai.com/mini-price"},
    {"id": "mini_jcw_electric", "brand": "mini", "name": "MINI John Cooper Works Electric",
     "alias": ["jcw electric", "john cooper works electric", "jcw aceman"],
     "powertrain": "BEV", "note": "JCW ธรรมดา/Countryman JCW เป็นเบนซิน", "source": "https://www.9carthai.com/mini-price"},

    # ===================== Mercedes-Benz / smart =====================
    {"id": "merc_eqa", "brand": "mercedes", "name": "Mercedes-Benz EQA", "alias": ["benz eqa", "เบนซ์ eqa", "mercedes eqa", "eqa 250"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "merc_eqb", "brand": "mercedes", "name": "Mercedes-Benz EQB", "alias": ["benz eqb", "เบนซ์ eqb", "mercedes eqb", "eqb 250"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "merc_eqc", "brand": "mercedes", "name": "Mercedes-Benz EQC", "alias": ["benz eqc", "เบนซ์ eqc", "mercedes eqc", "eqc 400"],
     "powertrain": "BEV", "note": "รุ่นเก่า ไม่พบในรายการที่อ่าน", "source": "", "unverified": True},
    {"id": "merc_eqe", "brand": "mercedes", "name": "Mercedes-Benz EQE / EQE SUV",
     "alias": ["benz eqe", "เบนซ์ eqe", "mercedes eqe", "eqe 350", "eqe 300", "eqe 53", "eqe suv"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "merc_eqs", "brand": "mercedes", "name": "Mercedes-Benz EQS / EQS SUV",
     "alias": ["benz eqs", "เบนซ์ eqs", "mercedes eqs", "eqs 450", "eqs 500", "eqs 580", "eqs suv"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "merc_cla_ev", "brand": "mercedes", "name": "Mercedes-Benz CLA Electric",
     "alias": ["cla electric", "cla 250+", "cla ev", "cla ไฟฟ้า"],
     "powertrain": "BEV", "note": "CLA รุ่นเก่า (CLA 200/250 AMG/35/45) เป็นเบนซิน; \"benz cla\" อย่างเดียวให้ยี่ห้อถามกลับ",
     "source": "https://www.9carthai.com/mercedes-benz-price"},
    {"id": "merc_cla_ice", "brand": "mercedes", "name": "Mercedes-Benz CLA 200 / AMG CLA (เบนซิน)",
     "alias": ["cla 200", "cla 35", "cla 45", "amg cla"],
     "powertrain": "ICE", "note": "", "source": "https://www.car250.com/2026-09-th.html", "unverified": True},
    {"id": "merc_glc_ev", "brand": "mercedes", "name": "Mercedes-Benz GLC Electric",
     "alias": ["glc electric", "glc ev", "glc ไฟฟ้า"],
     "powertrain": "BEV", "note": "GLC อื่นเป็น PHEV/ดีเซล; \"benz glc\" อย่างเดียวให้ยี่ห้อถามกลับ",
     "source": "https://www.9carthai.com/mercedes-benz-price"},
    {"id": "merc_phev", "brand": "mercedes", "name": "Mercedes-Benz ปลั๊กอินไฮบริด (C/E/S/GLC 300 e, 350 e, 580 e)",
     "alias": ["c 350 e", "c 300 e", "e 350 e", "e 300 e", "s 580 e", "s 450 e", "glc 350 e", "glc 300 e"],
     "powertrain": "PHEV", "note": "", "source": "https://www.9carthai.com/mercedes-benz-price"},
    {"id": "merc_g580", "brand": "mercedes", "name": "Mercedes-Benz G 580 with EQ Technology",
     "alias": ["g 580", "g 580 eq", "g-class electric", "g-class ไฟฟ้า", "จี 580"],
     "powertrain": "BEV", "note": "G-Class อื่น (G 63, G 450 d) ไม่ใช่ BEV", "source": "https://www.9carthai.com/mercedes-benz-price"},
    {"id": "smart_1", "brand": "smart", "name": "smart #1", "alias": ["smart #1", "สมาร์ท #1", "smart hashtag 1"],
     "powertrain": "BEV", "note": "", "source": "https://www.headlightmag.com/?p=359532"},
    {"id": "smart_3", "brand": "smart", "name": "smart #3", "alias": ["smart #3", "สมาร์ท #3", "smart hashtag 3"],
     "powertrain": "BEV", "note": "", "source": "https://autolifethailand.tv/?p=182154"},
    {"id": "smart_5", "brand": "smart", "name": "smart #5", "alias": ["smart #5", "สมาร์ท #5", "smart hashtag 5"],
     "powertrain": "BEV", "note": "บทความไทยระบุราคาแต่ไม่ได้ระบุระบบขับเคลื่อน; #5 EHD (PHEV) มีในจีน",
     "source": "https://www.headlightmag.com/?p=359532", "unverified": True},

    # ===================== Hyundai / Kia =====================
    {"id": "hyundai_ioniq5", "brand": "hyundai", "name": "Hyundai Ioniq 5 / Ioniq 5 N",
     "alias": ["ioniq 5", "ไอโอนิค 5", "ไอออนิค 5"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/hyundai-price"},
    {"id": "hyundai_ioniq6", "brand": "hyundai", "name": "Hyundai Ioniq 6",
     "alias": ["ioniq 6", "ไอโอนิค 6", "ไอออนิค 6"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "hyundai_ioniq", "brand": "hyundai", "name": "Hyundai Ioniq (ไม่ระบุเลข)",
     "alias": ["ioniq", "ไอโอนิค", "ไอออนิค", "ioniq electric"],
     "powertrain": "BEV", "note": "Ioniq ที่ขายในไทย (Ioniq Electric 2018, Ioniq 5, Ioniq 6) เป็น BEV; Ioniq Hybrid มีต่างประเทศ",
     "source": "https://paultan.org/2018/03/28/bangkok-2018-hyundai-ioniq-electric-full-ev-launched-in-thailand-28-kwh-280-km-range-rm216k"},
    {"id": "hyundai_kona_ev", "brand": "hyundai", "name": "Hyundai Kona Electric",
     "alias": ["kona electric", "kona ev", "โคน่า อีวี", "โคน่า ไฟฟ้า", "โคน่า อิเล็กทริก"],
     "powertrain": "BEV", "note": "ขายในไทย 2019 ปัจจุบันเลิกขาย", "source": "https://www.zigwheels.co.th/new-cars/hyundai/kona-electric"},
    {"id": "hyundai_kona", "brand": "hyundai", "name": "Hyundai Kona", "alias": ["kona", "โคน่า"],
     "powertrain": "ambiguous",
     "variants": [{"name": "Kona Electric", "powertrain": "BEV"}, {"name": "Kona เบนซิน / Hybrid", "powertrain": "ICE/HEV"}],
     "note": "ในไทยที่ขายเป็นทางการคือ Kona Electric แต่ชื่อ Kona มีรุ่นเบนซิน/ไฮบริด (นำเข้าเอง/ต่างประเทศ) ถามก่อน",
     "source": "https://www.zigwheels.co.th/new-cars/hyundai/kona-electric"},
    {"id": "kia_ev5", "brand": "kia", "name": "Kia EV5", "alias": ["kia ev5", "เกีย ev5", "เกีย อีวี5"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/kia-price"},
    {"id": "kia_ev6", "brand": "kia", "name": "Kia EV6", "alias": ["kia ev6", "เกีย ev6", "เกีย อีวี6"],
     "powertrain": "BEV", "note": "ไม่พบราคา/ยอดจดทะเบียนไทยในรอบนี้", "source": "", "unverified": True},
    {"id": "kia_ev9", "brand": "kia", "name": "Kia EV9", "alias": ["kia ev9", "เกีย ev9", "เกีย อีวี9"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/kia-price"},
    {"id": "kia_pv5", "brand": "kia", "name": "Kia PV5", "alias": ["kia pv5", "เกีย pv5"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "kia_carnival", "brand": "kia", "name": "Kia Carnival", "alias": ["carnival", "คาร์นิวัล"],
     "powertrain": "HEV", "note": "HEV/ดีเซล ไม่ใช่ BEV", "source": "https://www.9carthai.com/kia-price"},
    {"id": "kia_sorento", "brand": "kia", "name": "Kia Sorento", "alias": ["sorento", "โซเรนโต้", "โซเรนโต"],
     "powertrain": "HEV", "note": "HEV/PHEV ไม่ใช่ BEV", "source": "https://www.9carthai.com/kia-price"},

    # ===================== Toyota / Lexus =====================
    {"id": "toyota_bz4x", "brand": "toyota", "name": "Toyota bZ4X", "alias": ["bz4x", "บีซีโฟร์เอ็กซ์", "บีแซดโฟร์เอ็กซ์"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_corolla_cross", "brand": "toyota", "name": "Toyota Corolla Cross",
     "alias": ["corolla cross", "โคโรลล่า ครอส", "โคโรล่า ครอส"],
     "powertrain": "HEV", "note": "HEV (รุ่นเก่ามีเบนซิน) ไม่ใช่ BEV", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_yaris_cross", "brand": "toyota", "name": "Toyota Yaris Cross HEV", "alias": ["yaris cross", "ยาริส ครอส"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_yaris_ativ", "brand": "toyota", "name": "Toyota Yaris Ativ", "alias": ["yaris ativ", "ยาริส เอทีฟ", "เอทีฟ"],
     "powertrain": "HEV", "note": "HEV/เบนซิน ไม่ใช่ BEV", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_yaris", "brand": "toyota", "name": "Toyota Yaris", "alias": ["yaris", "ยาริส"],
     "powertrain": "ICE", "note": "เบนซิน; Ativ/Cross ดูรายการแยก", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_camry", "brand": "toyota", "name": "Toyota Camry", "alias": ["camry", "แคมรี่", "แคมรี"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_altis", "brand": "toyota", "name": "Toyota Corolla Altis", "alias": ["altis", "อัลติส"],
     "powertrain": "HEV", "note": "HEV/เบนซิน ไม่ใช่ BEV", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_alphard", "brand": "toyota", "name": "Toyota Alphard / Vellfire",
     "alias": ["alphard", "อัลพาร์ด", "vellfire", "เวลไฟร์"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_innova", "brand": "toyota", "name": "Toyota Innova Zenix", "alias": ["zenix", "เซนิกซ์"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_chr", "brand": "toyota", "name": "Toyota C-HR", "alias": ["c-hr", "toyota chr", "ซีเอชอาร์"],
     "powertrain": "HEV", "note": "HEV/เบนซิน (รุ่นที่เคยขายในไทย) ไม่ใช่ BEV", "source": "", "unverified": True},
    # A7 (PLAN.md): popular non-BEV models, so naming one does not make the app ask back because the brand also sells a BEV.
    # Hilux: the 9th generation (Travo, Nov 2025) is sold as diesel and as the battery-electric Travo-e, so "Travo" and
    # bare "Hilux" ask back; Revo / Champ / Vigo are diesel-only earlier generations.
    {"id": "toyota_hilux_travo_e", "brand": "toyota", "name": "Toyota Hilux Travo-e",
     "alias": ["travo-e", "travo e", "travo ev", "hilux travo-e", "hilux ev", "hilux bev", "ทราโว่-อี", "ทราโว่ อี", "ไฮลักซ์ ไฟฟ้า"],
     "powertrain": "BEV", "note": "กระบะไฟฟ้าล้วน 59.2 kWh เปิดตัว พ.ย. 2568",
     "source": "https://autolifethailand.tv/official-price-toyota-hilux-travo-e-ev-bev-thailand/"},
    {"id": "toyota_hilux_travo", "brand": "toyota", "name": "Toyota Hilux Travo", "alias": ["hilux travo", "travo", "ทราโว่", "ไฮลักซ์ ทราโว่"],
     "powertrain": "ambiguous", "variants": [{"name": "Travo 2.8 ดีเซล", "powertrain": "ICE"}, {"name": "Travo-e", "powertrain": "BEV"}],
     "note": "ถามว่าเป็นดีเซลหรือ Travo-e", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_hilux_revo", "brand": "toyota", "name": "Toyota Hilux Revo",
     "alias": ["hilux revo", "revo", "รีโว่", "ไฮลักซ์ รีโว่", "revo rocco", "ร็อคโค่"],
     "powertrain": "ICE", "note": "ดีเซล 2.4/2.8 (รายการราคาเรียก Toyota Revo)", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_hilux_champ", "brand": "toyota", "name": "Toyota Hilux Champ", "alias": ["hilux champ", "ไฮลักซ์ แชมป์"],
     "powertrain": "ICE", "note": "2.4 MT/AT", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_hilux_vigo", "brand": "toyota", "name": "Toyota Hilux Vigo", "alias": ["hilux vigo", "vigo", "วีโก้"],
     "powertrain": "ICE", "note": "รุ่นเก่า (ก่อน Revo) ดีเซล", "source": "", "unverified": True},
    {"id": "toyota_hilux", "brand": "toyota", "name": "Toyota Hilux (ไม่ระบุรุ่น)", "alias": ["hilux", "ไฮลักซ์"],
     "powertrain": "ambiguous",
     "variants": [{"name": "Revo / Champ / Vigo / Travo ดีเซล", "powertrain": "ICE"}, {"name": "Travo-e", "powertrain": "BEV"}],
     "note": "ถามก่อน", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_fortuner", "brand": "toyota", "name": "Toyota Fortuner", "alias": ["fortuner", "ฟอร์จูนเนอร์", "ฟอจูนเนอร์"],
     "powertrain": "ICE", "note": "2.4/2.8 (Leader, Legender, GR Sport) ไม่ใช่ BEV", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_veloz", "brand": "toyota", "name": "Toyota Veloz", "alias": ["veloz", "เวลอซ"],
     "powertrain": "ICE", "note": "Smart/Premium ไม่มีรุ่นไฟฟ้า", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "toyota_vios", "brand": "toyota", "name": "Toyota Vios", "alias": ["vios", "วีออส"],
     "powertrain": "ICE", "note": "รุ่นก่อน Yaris Ativ เบนซิน ไม่อยู่ในรายการราคาปัจจุบัน", "source": "", "unverified": True},
    {"id": "toyota_avanza", "brand": "toyota", "name": "Toyota Avanza", "alias": ["avanza", "อแวนซ่า"],
     "powertrain": "ICE", "note": "1.5 เบนซิน", "source": "", "unverified": True},
    {"id": "toyota_hiace", "brand": "toyota", "name": "Toyota Hiace / Commuter / Majesty",
     "alias": ["hiace", "ไฮเอซ", "toyota commuter", "คอมมิวเตอร์", "toyota majesty", "โตโยต้า มาเจสตี้"],
     "powertrain": "ICE", "note": "รถตู้ดีเซล 2.8", "source": "https://www.9carthai.com/toyota-price"},
    {"id": "lexus_rz", "brand": "lexus", "name": "Lexus RZ",
     "alias": ["lexus rz", "เลกซัส rz", "เล็กซัส rz", "rz 450e", "rz 300e", "rz 350e", "rz 500e"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/lexus-price"},
    {"id": "lexus_es_ev", "brand": "lexus", "name": "Lexus ES 350e / 500e", "alias": ["es 350e", "es 500e"],
     "powertrain": "BEV", "note": "ES 300h/350h เป็น HEV; \"lexus es\" อย่างเดียวให้ยี่ห้อถามกลับ",
     "source": "https://www.9carthai.com/lexus-price"},
    {"id": "lexus_ux300e", "brand": "lexus", "name": "Lexus UX 300e", "alias": ["ux 300e"],
     "powertrain": "BEV", "note": "รุ่นเก่า ไม่พบในรายการราคาปัจจุบัน", "source": "", "unverified": True},
    {"id": "lexus_hybrid", "brand": "lexus", "name": "Lexus ไฮบริด (รุ่น h / h+)",
     "alias": ["es 300h", "es 350h", "ux 250h", "ux 300h", "nx 350h", "nx 450h+", "rx 350h", "rx 450h+", "rx 500h",
               "is 300h", "ls 500h", "lm 350h", "lm 500h", "lexus nx", "lexus rx", "lexus lbx", "lexus lm",
               "เลกซัส nx", "เลกซัส rx", "เล็กซัส nx", "เล็กซัส rx"],
     "powertrain": "HEV", "note": "h = HEV, h+ = PHEV ไม่ใช่ BEV", "source": "https://www.9carthai.com/lexus-price"},

    # ===================== Honda =====================
    {"id": "honda_en1", "brand": "honda", "name": "Honda e:N1",
     "alias": ["e:n1", "honda en1", "ฮอนด้า en1", "ฮอนด้า อีเอ็นวัน", "อีเอ็นวัน"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/honda-price"},
    {"id": "honda_en2", "brand": "honda", "name": "Honda e:N2",
     "alias": ["e:n2", "honda en2", "ฮอนด้า en2", "ฮอนด้า อีเอ็นทู", "อีเอ็นทู"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/honda-price"},
    {"id": "honda_super_one", "brand": "honda", "name": "Honda Super-ONE",
     "alias": ["super-one", "honda super one", "ฮอนด้า super one", "ฮอนด้า ซูเปอร์วัน"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/honda-price"},
    {"id": "honda_hrv", "brand": "honda", "name": "Honda HR-V e:HEV", "alias": ["hr-v", "honda hrv", "ฮอนด้า hrv", "เอชอาร์วี"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/honda-price"},
    {"id": "honda_crv", "brand": "honda", "name": "Honda CR-V e:HEV", "alias": ["cr-v", "honda crv", "ฮอนด้า crv", "ซีอาร์วี"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/honda-price"},
    {"id": "honda_city", "brand": "honda", "name": "Honda City", "alias": ["honda city", "ฮอนด้า ซิตี้", "ฮอนด้า ซิตี"],
     "powertrain": "HEV", "note": "e:HEV/เบนซิน ไม่ใช่ BEV", "source": "https://www.9carthai.com/honda-price"},
    {"id": "honda_civic", "brand": "honda", "name": "Honda Civic", "alias": ["civic", "ซีวิค", "ซีวิก"],
     "powertrain": "HEV", "note": "e:HEV / Type R เบนซิน ไม่ใช่ BEV", "source": "https://www.9carthai.com/honda-price"},
    {"id": "honda_accord", "brand": "honda", "name": "Honda Accord", "alias": ["honda accord", "แอคคอร์ด"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/honda-price"},
    {"id": "honda_brv", "brand": "honda", "name": "Honda BR-V", "alias": ["br-v", "honda brv", "ฮอนด้า brv", "บีอาร์วี"],
     "powertrain": "ICE", "note": "E/EL AT เบนซิน", "source": "https://www.9carthai.com/honda-price"},
    {"id": "honda_wrv", "brand": "honda", "name": "Honda WR-V", "alias": ["wr-v", "honda wrv", "ฮอนด้า wrv", "ดับเบิลยูอาร์วี"],
     "powertrain": "ICE", "note": "SV/RS เบนซิน", "source": "https://www.9carthai.com/honda-price"},
    {"id": "honda_jazz", "brand": "honda", "name": "Honda Jazz", "alias": ["honda jazz", "ฮอนด้า แจ๊ส", "ฮอนด้า แจ๊ซ"],
     "powertrain": "ICE", "note": "รุ่นเก่า เบนซิน (บางรุ่นไฮบริด) ไม่ใช่ BEV", "source": "", "unverified": True},

    # ===================== Nissan =====================
    {"id": "nissan_leaf", "brand": "nissan", "name": "Nissan Leaf", "alias": ["nissan leaf", "นิสสัน ลีฟ", "นิสสัน leaf"],
     "powertrain": "BEV", "note": "", "source": "https://autolifethailand.tv/tag/nissan-leaf/"},
    {"id": "nissan_kicks", "brand": "nissan", "name": "Nissan Kicks e-POWER",
     "alias": ["nissan kicks", "kicks e-power", "นิสสัน คิกส์", "คิกส์"],
     "powertrain": "HEV", "note": "e-POWER มีเครื่องยนต์ปั่นไฟ ไม่ใช่ BEV", "source": "https://www.9carthai.com/nissan-price"},
    {"id": "nissan_note", "brand": "nissan", "name": "Nissan Note e-POWER", "alias": ["nissan note", "note e-power", "นิสสัน โน้ต"],
     "powertrain": "HEV", "note": "รุ่นเก่า", "source": "", "unverified": True},
    {"id": "nissan_serena", "brand": "nissan", "name": "Nissan Serena", "alias": ["serena", "เซเรน่า"],
     "powertrain": "HEV", "note": "e-POWER/เบนซิน ไม่ใช่ BEV", "source": "https://www.9carthai.com/nissan-price"},
    {"id": "nissan_xtrail", "brand": "nissan", "name": "Nissan X-Trail e-POWER", "alias": ["x-trail", "xtrail", "เอ็กซ์เทรล"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/nissan-price"},
    {"id": "nissan_epower", "brand": "nissan", "name": "Nissan e-POWER (ไม่ระบุรุ่น)", "alias": ["e-power", "อีพาวเวอร์"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/nissan-price"},
    {"id": "nissan_almera", "brand": "nissan", "name": "Nissan Almera", "alias": ["almera", "อัลเมร่า"],
     "powertrain": "ICE", "note": "", "source": "https://www.9carthai.com/nissan-price"},
    {"id": "nissan_navara", "brand": "nissan", "name": "Nissan Navara", "alias": ["navara", "นาวาร่า"],
     "powertrain": "ICE", "note": "กระบะดีเซล (Calibre, PRO-2X, PRO-4X)", "source": "https://www.9carthai.com/nissan-price"},
    {"id": "nissan_terra", "brand": "nissan", "name": "Nissan Terra", "alias": ["nissan terra", "นิสสัน เทอร์รา", "นิสสัน เทอร์ร่า"],
     "powertrain": "ICE", "note": "2.3 ดีเซล", "source": "https://www.9carthai.com/nissan-price"},
    {"id": "nissan_march", "brand": "nissan", "name": "Nissan March", "alias": ["nissan march", "นิสสัน มาร์ช"],
     "powertrain": "ICE", "note": "รุ่นเก่า เบนซิน", "source": "", "unverified": True},
    {"id": "nissan_sylphy", "brand": "nissan", "name": "Nissan Sylphy", "alias": ["sylphy", "ซิลฟี่"],
     "powertrain": "ICE", "note": "รุ่นเก่า เบนซิน", "source": "", "unverified": True},

    # ===================== Isuzu / Mitsubishi / Suzuki (A7) =====================
    {"id": "isuzu_dmax_ev", "brand": "isuzu", "name": "Isuzu D-Max EV",
     "alias": ["d-max ev", "dmax ev", "ดีแม็กซ์ ev", "ดีแม็กซ์ อีวี", "ดีแม็กซ์ ไฟฟ้า", "isuzu ev"],
     "powertrain": "BEV", "note": "กระบะไฟฟ้าล้วน 66.9 kWh เปิดตัว 17 มี.ค. 2569",
     "source": "https://www.autospinn.com/2026/03/isuzu-d-max-ev-148311"},
    {"id": "isuzu_dmax", "brand": "isuzu", "name": "Isuzu D-Max", "alias": ["d-max", "dmax", "ดีแม็กซ์", "ดีแม็ก", "ดีแมกซ์", "ดีแม็ค"],
     "powertrain": "ambiguous", "variants": [{"name": "D-Max 2.2/3.0 Ddi ดีเซล", "powertrain": "ICE"}, {"name": "D-Max EV", "powertrain": "BEV"}],
     "note": "ถามว่าเป็นดีเซลหรือ D-Max EV", "source": "https://www.9carthai.com/isuzu-price"},
    {"id": "isuzu_mux", "brand": "isuzu", "name": "Isuzu MU-X", "alias": ["mu-x", "isuzu mux", "มิวเอ็กซ์", "มิว-เอ็กซ์"],
     "powertrain": "ICE", "note": "2.2/3.0 ดีเซล", "source": "https://www.9carthai.com/isuzu-price"},
    {"id": "mitsubishi_triton", "brand": "mitsubishi", "name": "Mitsubishi Triton", "alias": ["triton", "ไทรทัน"],
     "powertrain": "ICE", "note": "2.4 ดีเซล", "source": "https://www.9carthai.com/mitsubishi-price"},
    {"id": "mitsubishi_pajero", "brand": "mitsubishi", "name": "Mitsubishi Pajero Sport", "alias": ["pajero", "ปาเจโร่", "ปาเจโร"],
     "powertrain": "ICE", "note": "ดีเซล", "source": "https://www.9carthai.com/mitsubishi-price"},
    {"id": "mitsubishi_xpander", "brand": "mitsubishi", "name": "Mitsubishi Xpander HEV", "alias": ["xpander", "เอ็กซ์แพนเดอร์"],
     "powertrain": "HEV", "note": "รุ่นเก่ามีเบนซิน ไม่ใช่ BEV", "source": "https://www.9carthai.com/mitsubishi-price"},
    {"id": "mitsubishi_xforce", "brand": "mitsubishi", "name": "Mitsubishi Xforce HEV", "alias": ["xforce", "x-force", "เอ็กซ์ฟอร์ซ"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/mitsubishi-price"},
    {"id": "mitsubishi_attrage", "brand": "mitsubishi", "name": "Mitsubishi Attrage", "alias": ["attrage", "แอททราจ", "แอทราจ"],
     "powertrain": "ICE", "note": "", "source": "https://www.9carthai.com/mitsubishi-price"},
    {"id": "mitsubishi_mirage", "brand": "mitsubishi", "name": "Mitsubishi Mirage", "alias": ["mitsubishi mirage", "มิราจ"],
     "powertrain": "ICE", "note": "", "source": "https://www.9carthai.com/mitsubishi-price"},
    {"id": "mitsubishi_outlander", "brand": "mitsubishi", "name": "Mitsubishi Outlander PHEV", "alias": ["outlander", "เอาท์แลนเดอร์"],
     "powertrain": "PHEV", "note": "", "source": "https://www.9carthai.com/mitsubishi-price"},
    {"id": "suzuki_evitara", "brand": "suzuki", "name": "Suzuki e VITARA", "alias": ["e vitara", "e-vitara", "อี วิทาร่า"],
     "powertrain": "BEV", "note": "61 kWh นำเข้าจากอินเดีย", "source": "https://www.car250.com/suzuki-e-vitara-th-new.html"},
    {"id": "suzuki_swift", "brand": "suzuki", "name": "Suzuki Swift", "alias": ["suzuki swift", "สวิฟท์", "ซูซูกิ สวิฟ"],
     "powertrain": "ICE", "note": "GL/GLX CVT เบนซิน", "source": "https://www.9carthai.com/suzuki-price"},
    {"id": "suzuki_xl7", "brand": "suzuki", "name": "Suzuki XL7 Hybrid", "alias": ["suzuki xl7", "ซูซูกิ xl7", "xl7 hybrid"],
     "powertrain": "HEV", "note": "", "source": "https://www.9carthai.com/suzuki-price"},
    {"id": "suzuki_fronx", "brand": "suzuki", "name": "Suzuki Fronx", "alias": ["fronx", "ฟรองซ์"],
     "powertrain": "HEV", "note": "MHEV ไม่ใช่ BEV", "source": "https://www.car250.com/suzuki-e-vitara-th-new.html"},
    {"id": "suzuki_carry", "brand": "suzuki", "name": "Suzuki Carry", "alias": ["suzuki carry", "ซูซูกิ แครี่"],
     "powertrain": "ICE", "note": "กระบะเบนซิน", "source": "https://www.9carthai.com/suzuki-price"},
    {"id": "suzuki_ertiga", "brand": "suzuki", "name": "Suzuki Ertiga", "alias": ["ertiga", "เออร์ติก้า"],
     "powertrain": "ICE", "note": "เบนซิน (บางรุ่นไฮบริดอ่อน) ไม่ใช่ BEV", "source": "", "unverified": True},
    {"id": "suzuki_celerio", "brand": "suzuki", "name": "Suzuki Celerio", "alias": ["celerio", "เซเลริโอ"],
     "powertrain": "ICE", "note": "", "source": "", "unverified": True},
    {"id": "suzuki_ciaz", "brand": "suzuki", "name": "Suzuki Ciaz", "alias": ["ciaz", "เซียส"],
     "powertrain": "ICE", "note": "", "source": "", "unverified": True},

    # ===================== Porsche / Audi / Lotus / Ford / VW / Mazda =====================
    {"id": "porsche_taycan", "brand": "porsche", "name": "Porsche Taycan", "alias": ["taycan", "ไทคาน", "เทย์คาน"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/porsche-price"},
    {"id": "porsche_macan_ev", "brand": "porsche", "name": "Porsche Macan Electric",
     "alias": ["macan electric", "macan ev", "macan 4 electric", "macan 4s electric", "macan turbo electric", "มาคัน ไฟฟ้า", "มาคัน อีวี"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/porsche-price"},
    {"id": "porsche_macan", "brand": "porsche", "name": "Porsche Macan", "alias": ["macan", "มาคัน"],
     "powertrain": "ambiguous",
     "variants": [{"name": "Macan Electric", "powertrain": "BEV"}, {"name": "Macan / S / GTS", "powertrain": "ICE"}],
     "note": "ถามก่อน", "source": "https://www.9carthai.com/porsche-price"},
    {"id": "porsche_cayenne_ev", "brand": "porsche", "name": "Porsche Cayenne Electric",
     "alias": ["cayenne electric", "cayenne ev", "คาเยนน์ ไฟฟ้า"],
     "powertrain": "BEV", "note": "เปิดตัวทั่วโลกปลาย 2025 ยังไม่ยืนยันว่าขายในไทย", "source": "", "unverified": True},
    {"id": "porsche_cayenne", "brand": "porsche", "name": "Porsche Cayenne", "alias": ["cayenne", "คาเยนน์", "คาเยน"],
     "powertrain": "PHEV", "note": "E-Hybrid (PHEV) และเบนซิน ไม่ใช่ BEV; ถ้ารุ่น Electric เข้าไทยให้เปลี่ยนเป็น ambiguous",
     "source": "https://www.9carthai.com/porsche-price"},
    {"id": "porsche_panamera", "brand": "porsche", "name": "Porsche Panamera", "alias": ["panamera", "พานาเมร่า"],
     "powertrain": "PHEV", "note": "E-Hybrid และเบนซิน ไม่ใช่ BEV", "source": "https://www.9carthai.com/porsche-price"},
    {"id": "audi_etron", "brand": "audi", "name": "Audi e-tron (Q8 e-tron / Q6 e-tron / e-tron GT)",
     "alias": ["e-tron", "อีทรอน", "q8 e-tron", "q6 e-tron", "q4 e-tron", "e-tron gt"],
     "powertrain": "BEV", "note": "", "source": "https://www.9carthai.com/audi-price"},
    {"id": "audi_phev", "brand": "audi", "name": "Audi TFSI e (Q7/Q8 60 TFSI e)", "alias": ["tfsi e"],
     "powertrain": "PHEV", "note": "", "source": "https://www.9carthai.com/audi-price"},
    {"id": "audi_q8", "brand": "audi", "name": "Audi Q8", "alias": ["audi q8", "ออดี้ q8"],
     "powertrain": "ambiguous",
     "variants": [{"name": "Q8 e-tron", "powertrain": "BEV"}, {"name": "Q8 60 TFSI e", "powertrain": "PHEV"}, {"name": "RS Q8", "powertrain": "ICE"}],
     "note": "ถามก่อน", "source": "https://www.9carthai.com/audi-price"},
    {"id": "lotus_eletre", "brand": "lotus", "name": "Lotus Eletre", "alias": ["eletre", "เอเลเทร"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "lotus_emeya", "brand": "lotus", "name": "Lotus Emeya", "alias": ["emeya", "เอมีย่า"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "lotus_emira", "brand": "lotus", "name": "Lotus Emira", "alias": ["emira", "เอมิร่า"],
     "powertrain": "ICE", "note": "", "source": "https://www.headlightmag.com/?p=216294"},
    {"id": "ford_mach_e", "brand": "ford", "name": "Ford Mustang Mach-E",
     "alias": ["mach-e", "mach e", "mustang mach-e", "mustang mach e", "มัสแตง มัค-อี", "มัคอี", "มัค-อี"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/2026-09-th.html"},
    {"id": "ford_mustang", "brand": "ford", "name": "Ford Mustang (เบนซิน)", "alias": ["mustang", "มัสแตง"],
     "powertrain": "ICE", "note": "Mach-E คือรุ่นไฟฟ้าแยกชื่อ", "source": "", "unverified": True},
    {"id": "ford_ranger", "brand": "ford", "name": "Ford Ranger / Ranger Raptor",
     "alias": ["ranger", "เรนเจอร์", "ford raptor", "ฟอร์ด แรปเตอร์", "ฟอร์ด แร็พเตอร์"],
     "powertrain": "ICE", "note": "2.0 Turbo/Bi-Turbo, 3.0 V6 ไม่มีรุ่น BEV; ไม่ใช้ \"raptor\" เดี่ยวๆ (Haval Raptor เป็น PHEV)", "source": "https://www.9carthai.com/ford-price"},
    {"id": "ford_everest", "brand": "ford", "name": "Ford Everest", "alias": ["everest", "เอเวอเรสต์"],
     "powertrain": "ICE", "note": "2.0 Turbo, 3.0 V6", "source": "https://www.9carthai.com/ford-price"},
    {"id": "hyundai_creta", "brand": "hyundai", "name": "Hyundai Creta", "alias": ["creta", "ครีต้า"],
     "powertrain": "ICE", "note": "Alpha / N Line", "source": "https://www.9carthai.com/hyundai-price"},
    {"id": "hyundai_stargazer", "brand": "hyundai", "name": "Hyundai Stargazer", "alias": ["stargazer", "สตาร์เกเซอร์"],
     "powertrain": "ICE", "note": "", "source": "https://www.9carthai.com/hyundai-price"},
    {"id": "hyundai_staria", "brand": "hyundai", "name": "Hyundai Staria", "alias": ["staria", "สตาเรีย", "สตาร์เรีย"],
     "powertrain": "HEV", "note": "ดีเซลและ Staria Hybrid ไม่ใช่ BEV", "source": "https://www.9carthai.com/hyundai-price"},
    {"id": "hyundai_h1", "brand": "hyundai", "name": "Hyundai H-1", "alias": ["hyundai h1", "hyundai h-1", "ฮุนได h1"],
     "powertrain": "ICE", "note": "รถตู้ดีเซล รุ่นเก่า", "source": "", "unverified": True},
    {"id": "vw_id_buzz", "brand": "volkswagen", "name": "Volkswagen ID. Buzz", "alias": ["id buzz", "id. buzz", "ไอดี บัซ", "ไอดี บัส"],
     "powertrain": "BEV", "note": "", "source": "https://www.car250.com/byd-dolphine-bev-11.html"},
    {"id": "mazda_6e", "brand": "mazda", "name": "Mazda 6e", "alias": ["mazda 6e", "มาสด้า 6e", "มาสด้า 6อี"],
     "powertrain": "BEV", "note": "Mazda6 เดิมเป็นเบนซิน; \"mazda 6\" อย่างเดียวให้ยี่ห้อถามกลับ",
     "source": "https://www.car250.com/bev-phev-erev-th-new-2026-07.html"},
    {"id": "mazda_cx6e", "brand": "mazda", "name": "Mazda CX-6e", "alias": ["cx-6e", "cx6e"],
     "powertrain": "BEV", "note": "รายการราคา 9carthai มีชื่อแต่ไม่ได้ระบุระบบขับเคลื่อน",
     "source": "https://www.9carthai.com/mazda-price", "unverified": True},
    {"id": "mazda_2", "brand": "mazda", "name": "Mazda 2", "alias": ["mazda2", "มาสด้า 2"],
     "powertrain": "ICE", "note": "เบนซิน 1.3 / ดีเซล 1.5", "source": "https://www.9carthai.com/mazda-price"},
    {"id": "mazda_3", "brand": "mazda", "name": "Mazda 3", "alias": ["mazda3", "มาสด้า 3"],
     "powertrain": "ICE", "note": "2.0", "source": "https://www.9carthai.com/mazda-price"},
    {"id": "mazda_cx3", "brand": "mazda", "name": "Mazda CX-3", "alias": ["cx-3"],
     "powertrain": "ICE", "note": "", "source": "https://www.9carthai.com/mazda-price"},
    {"id": "mazda_cx30", "brand": "mazda", "name": "Mazda CX-30", "alias": ["cx-30", "cx30", "มาสด้า cx30"],
     "powertrain": "ICE", "note": "2.0", "source": "https://www.9carthai.com/mazda-price"},
    {"id": "mazda_cx5", "brand": "mazda", "name": "Mazda CX-5", "alias": ["cx-5", "mazda cx5", "มาสด้า cx5"],
     "powertrain": "ICE", "note": "2.0 เบนซิน / 2.2 ดีเซล", "source": "https://www.9carthai.com/mazda-price"},
    {"id": "mazda_cx8", "brand": "mazda", "name": "Mazda CX-8", "alias": ["cx-8", "mazda cx8", "มาสด้า cx8"],
     "powertrain": "ICE", "note": "เบนซิน 2.5 / ดีเซล 2.2", "source": "https://www.9carthai.com/mazda-price"},
    {"id": "mazda_bt50", "brand": "mazda", "name": "Mazda BT-50", "alias": ["bt-50", "bt50", "บีที 50"],
     "powertrain": "ICE", "note": "2.2/3.0 ดีเซล", "source": "https://www.9carthai.com/mazda-price"},
]


if __name__ == "__main__":
    # ------------------------------------------------------------------ self-check (no imports)
    def sq(s):
        return "".join(str(s).lower().split())

    # words that may appear in a Thai insurance question without naming a car (an alias must not sit inside them)
    COMMON = [
        "เกียร์", "เกียร์ออโต้", "รถเกียร์ธรรมดา", "ลิเธียมไอออน", "แบตเตอรี่ลิเธียมไอออน", "มินิมาร์ท", "มินิบัส",
        "สมาร์ทโฟน", "สมาร์ทคีย์", "โลตัส", "ซีลยาง", "อะลูมิเนียม", "อลูมิเนียม", "ประกันภัย", "ประกันชั้นหนึ่ง",
        "รถยนต์ไฟฟ้า", "ความคุ้มครอง", "เบี้ยประกัน", "ค่าเสียหายส่วนแรก", "อุบัติเหตุ", "คู่กรณี", "เคลม", "ซ่อมห้าง",
        "ซ่อมอู่", "ศูนย์บริการ", "ที่ชาร์จ", "สายชาร์จ", "ตู้ชาร์จ", "วอลล์บ็อกซ์", "แบตเตอรี่", "น้ำท่วม", "ไฟไหม้",
        "รถหาย", "โจรกรรม", "กระจก", "อะไหล่", "ทุนประกัน", "ค่าซ่อม", "ค่ารักษาพยาบาล", "ผู้ขับขี่", "ระบุชื่อ",
        "ต่ออายุ", "ป้ายแดง", "มือสอง", "เครื่องยนต์", "เบนซิน", "ดีเซล", "ไฮบริด", "ปลั๊กอินไฮบริด", "พลังงานไฟฟ้า",
        "ดัดแปลง", "สันดาป", "ขับเคลื่อน", "ออนไลน์", "ห้างสรรพสินค้า", "ทางด่วน", "มอเตอร์ไซค์", "รถกระบะ", "รถตู้",
        "แท็กซี่", "แกร็บ", "คอนโด", "หมู่บ้าน", "ซูเปอร์มาร์เก็ต", "อีกคัน", "อีกครั้ง", "รุ่นท็อป", "สมาร์ท",
        "temporary", "corporate", "minimum", "comprehensive", "insurance", "premium", "standard", "battery",
        "charger", "charging", "wallbox", "accident", "deductible", "coverage", "company", "electric", "vehicle",
        "hybrid", "repair", "garage", "flood", "theft", "policy", "claim", "motor", "model", "series", "version",
        "everything", "alternative", "aluminium", "aluminum", "illuminate", "survey", "native", "relative",
        "negative", "creative", "petronas", "smartphone", "smart key", "airbag", "replacement", "liability",
        "audio", "เครื่องเสียง audio", "lotus's", "จอดรถโลตัส", "รถมินิบัส", "รถมินิแวน", "minivan", "เพลงโฟล์ค",
    ]
    COMMON = [sq(w) for w in COMMON]
    GENERIC = {sq(w) for w in ["ev", "bev", "phev", "hev", "erev", "reev", "hybrid", "electric", "ไฟฟ้า", "รถไฟฟ้า",
                               "รถยนต์ไฟฟ้า", "ไฮบริด", "รถ", "รถยนต์", "อีวี", "plug-in", "ปลั๊กอิน"]}
    # names that are too short or generic to stand alone even when >= 4 characters
    NOT_STANDALONE = {sq(w) for w in ["seal", "model 3", "model y", "model s", "model x", "leaf", "urban", "bingo",
                                      "note", "city", "hunter", "mini", "smart", "ativ", "lumin", "etron", "accord",
                                      "kicks", "air ev", "tank", "wey"]}
    SHORT_BRAND_TOKENS = {"mg": ["mg"], "volkswagen": ["vw"]}   # brand words shorter than the 3-char build minimum

    problems, warnings = [], []
    brand_by_id = {b["id"]: b for b in BRANDS}
    rows = [("brand", b) for b in BRANDS] + [("model", m) for m in MODELS]

    # ids, brands, powertrains, sources
    seen = set()
    for kind, r in rows:
        if r["id"] in seen:
            problems.append(f"duplicate id {r['id']}")
        seen.add(r["id"])
        if r.get("powertrain") not in POWERTRAINS:
            problems.append(f"{r['id']}: powertrain {r.get('powertrain')!r} not in POWERTRAINS")
        if kind == "model" and r.get("brand") not in brand_by_id:
            problems.append(f"{r['id']}: brand {r.get('brand')!r} not in BRANDS")
        if not r.get("source") and not r.get("unverified"):
            problems.append(f"{r['id']}: no source and not marked unverified")
        if r.get("powertrain") == "ambiguous" and kind == "model" and not r.get("variants"):
            problems.append(f"{r['id']}: ambiguous model without variants")

    brand_words = {b["id"]: [sq(a) for a in b["alias"]] + SHORT_BRAND_TOKENS.get(b["id"], []) for b in BRANDS}
    all_brand_words = [w for ws in brand_words.values() for w in ws]

    owner = {}
    for kind, r in rows:
        mine = set()
        for a in r["alias"]:
            n = sq(a)
            tag = f"{r['id']}: alias {a!r}"
            if a != a.lower():
                problems.append(f"{tag} not lowercase")
            if n in mine:
                problems.append(f"{tag} duplicates another form of the same alias (spaces only)")
            mine.add(n)
            if n in owner and owner[n] != r["id"]:
                problems.append(f"{tag} shared with {owner[n]}")
            owner.setdefault(n, r["id"])
            if len(n) < 3:
                problems.append(f"{tag} shorter than 3 characters (build_data rejects it)")
            if n in GENERIC or not any(ch.isalpha() for ch in n):
                problems.append(f"{tag} is generic or has no letters")
            rest = n
            for g in sorted(GENERIC, key=len, reverse=True):
                rest = rest.replace(g, "")
            if sum(ch.isalnum() for ch in rest) < 2 or not any(ch.isalpha() for ch in rest):
                problems.append(f"{tag} is only generic words/numbers")
            hit = [w for w in COMMON if n in w]
            if hit:
                problems.append(f"{tag} occurs inside ordinary word(s) {hit}")
            if kind == "model" and not any(w in n for w in all_brand_words):
                if len(n) < 4:
                    problems.append(f"{tag} has no brand word and is shorter than 4 characters")
                if n in NOT_STANDALONE:
                    problems.append(f"{tag} is too generic without the brand")

    # alias inside another entry's alias: fine when the longer one is the more specific entry; listed for review,
    # one line per pair of entries.  Brand words inside model aliases are expected and not listed.
    flat = [(sq(a), kind, r) for kind, r in rows for a in r["alias"]]
    pairs = {}
    for a, ka, ra in flat:
        if ka == "brand":
            continue
        for b, kb, rb in flat:
            if ra["id"] == rb["id"] or a == b or a not in b:
                continue
            pairs.setdefault((ra["id"], rb["id"]), []).append(f"{a}<{b}")
    for (short_id, long_id), ex in pairs.items():
        sa, lo = next(r for _, r in rows if r["id"] == short_id), next(r for _, r in rows if r["id"] == long_id)
        same = sa.get("brand") == lo.get("brand", lo["id"])
        warnings.append(f"{'' if same else 'CROSS-BRAND '}{short_id} ({sa['powertrain']}) inside {long_id} "
                        f"({lo['powertrain']}): {', '.join(ex[:3])}{' ...' if len(ex) > 3 else ''}")

    # ---- simulate public/js/route.js detectVehicle()
    ALIASES = [(sq(a), "model", m) for m in MODELS for a in dict.fromkeys(m["alias"])] + \
              [(sq(a), "brand", b) for b in BRANDS for a in dict.fromkeys(b["alias"])]
    ALIASES.sort(key=lambda x: -len(x[0]))   # stable, like Array.prototype.sort in JS

    def detect(text):
        n, hits = sq(text), []
        for a, kind, v in ALIASES:
            if a not in n:
                continue
            n = n.replace(a, "|")
            if not any(h[1]["id"] == v["id"] for h in hits):
                hits.append((kind, v))
        models = [h for h in hits if h[0] == "model"]
        return [h[1]["id"] for h in hits if h[0] == "model" or not any(m[1]["brand"] == h[1]["id"] for m in models)]

    # every model alias that has no brand word, typed after each brand word of its own brand
    for m in MODELS:
        own = [w for w in brand_words[m["brand"]] if len(w) >= 3]
        for a in m["alias"]:
            if any(w in sq(a) for w in all_brand_words if len(w) >= 3) or "mg" in sq(a):
                continue
            for p in own:
                got = detect(p + " " + a)
                if got != [m["id"]]:
                    problems.append(f"match {p + ' ' + a!r}: expected [{m['id']}] got {got}")

    CASES = [
        ("แอตโต้3", ["byd_atto3"]), ("อัตโต้ 3", ["byd_atto3"]), ("atto3", ["byd_atto3"]), ("ดอลฟิน", ["byd_dolphin"]),
        ("เทสล่า โมเดลวาย", ["tesla_model_y"]), ("เอ็มจี4", ["mg_mg4"]), ("MG4 ไฟไหม้", ["mg_mg4"]),
        ("mg zs ev", ["mg_zs_ev"]), ("MG ZS", ["mg_zs"]), ("เอ็มจี แซดเอส อีวี", ["mg_zs_ev"]),
        ("ขับ BYD Seal ชนท้าย", ["byd_seal"]), ("byd sealion 7", ["byd_sealion7"]), ("BYD Sealion 6 DM-i", ["byd_sealion6"]),
        ("byd sealion", ["byd_sealion"]), ("บีวายดี ซีลไลออน 7", ["byd_sealion7"]), ("ซีไลออน", ["byd_sealion"]),
        ("byd seal u dm-i", ["byd_sealion6"]), ("บีวายดี ซีล 5", ["byd_seal5"]),
        ("byd denza d9", ["byd_denza_d9"]), ("denza d9 ev", ["byd_denza_d9_ev"]), ("denza", ["denza"]),
        ("deepal s05 reev", ["deepal_s05_reev"]), ("ดีพอล s05", ["deepal_s05"]), ("changan deepal s07", ["deepal_s07"]),
        ("deepal s07 erev", ["deepal_s07_erev"]), ("ฉางอาน ลูมิน", ["changan_lumin"]),
        ("gac aion ut", ["aion_ut"]), ("GAC Aion Y Plus", ["aion_y_plus"]), ("aion", ["aion"]),
        ("gwm ora good cat", ["gwm_good_cat"]), ("ora 5 hev", ["gwm_ora5_hev"]), ("โอร่า 5", ["gwm_ora5"]),
        ("gwm haval h6", ["gwm_haval_h6"]), ("haval", ["haval"]),
        ("jaecoo 6t reev", ["jaecoo_6t_reev"]), ("เจคู่ 6", ["jaecoo_6"]), ("jaecoo 6t", ["jaecoo_6t"]),
        ("volvo xc40 recharge", ["volvo_xc40"]), ("volvo c40 recharge", ["volvo_ec40"]),
        ("xc40 recharge pure electric", ["volvo_xc40_bev"]), ("volvo ex30", ["volvo_ex30"]),
        ("bmw x1", ["bmw_x1"]), ("bmw ix1", ["bmw_ix1"]), ("บีเอ็มดับเบิลยู i5", ["bmw_i5"]), ("bmw ix", ["bmw_ix"]),
        ("mini cooper se", ["mini_cooper_e"]), ("mini cooper s", ["mini_cooper_s"]), ("mini cooper", ["mini_cooper"]),
        ("มินิ คูเปอร์ อีกคัน", ["mini_cooper"]),
        ("hyundai kona electric", ["hyundai_kona_ev"]), ("hyundai kona", ["hyundai_kona"]),
        ("lexus es 300h", ["lexus_hybrid"]), ("lexus es", ["lexus"]), ("lexus es 350e", ["lexus_es_ev"]),
        ("mercedes-benz eqs", ["merc_eqs"]), ("เบนซ์ c 350 e", ["merc_phev"]), ("benz glc 350 e", ["merc_phev"]),
        ("ford mustang mach e", ["ford_mach_e"]), ("mustang", ["ford_mustang"]),
        ("toyota yaris ativ smart 1.2", ["toyota_yaris_ativ"]), ("toyota corolla cross hybrid", ["toyota_corolla_cross"]),
        ("honda e:n1", ["honda_en1"]), ("nissan kicks e-power", ["nissan_kicks"]),
        ("audi q8 e-tron", ["audi_etron"]), ("porsche macan electric", ["porsche_macan_ev"]), ("macan", ["porsche_macan"]),
        ("tesla", ["tesla"]), ("ผมใช้ byd อยู่", ["byd"]), ("smart #1", ["smart_1"]),
        ("รถเกียร์ออโต้ชนท้าย", []), ("แบตลิเธียมไอออนเสื่อม", []), ("ประกันชั้น 1 รถยนต์ไฟฟ้า", []),
        ("ไปห้างโลตัสแล้วโดนชน", []), ("มินิมาร์ทหน้าบ้าน", []), ("temporary cover", []),
        ("ติดเครื่องเสียง audio เพิ่ม", []), ("จอดรถโลตัสแล้วโดนขูด", []), ("ชนกับรถมินิบัส", []),
        ("audi a4", ["audi"]), ("audi q8", ["audi_q8"]), ("lotus eletre", ["lotus_eletre"]),
        ("ซื้อ ora good cat มือสอง", ["gwm_good_cat"]), ("smart #3 ใช้แผน ev ได้ไหม", ["smart_3"]),
        # A7
        ("isuzu d-max ev", ["isuzu_dmax_ev"]), ("อีซูซุ ดีแม็กซ์", ["isuzu_dmax"]), ("isuzu mu-x", ["isuzu_mux"]),
        ("toyota hilux revo", ["toyota_hilux_revo"]), ("hilux travo-e", ["toyota_hilux_travo_e"]),
        ("hilux travo", ["toyota_hilux_travo"]), ("ไฮลักซ์", ["toyota_hilux"]), ("ford ranger raptor", ["ford_ranger"]),
        ("ฟอร์ด เรนเจอร์", ["ford_ranger"]), ("mitsubishi triton", ["mitsubishi_triton"]), ("มิตซูบิชิ", ["mitsubishi"]),
        ("suzuki e vitara", ["suzuki_evitara"]), ("suzuki swift", ["suzuki_swift"]), ("mazda cx-30", ["mazda_cx30"]),
        ("mazda cx-3", ["mazda_cx3"]), ("nissan navara", ["nissan_navara"]),
    ]
    for text, want in CASES:
        got = detect(text)
        if got != want:
            problems.append(f"case {text!r}: expected {want} got {got}")

    # ---- report (Windows consoles may not print Thai: fall back to escapes instead of crashing)
    _print = print

    def print(*args):
        try:
            _print(*args)
        except UnicodeEncodeError:
            _print(*(str(x).encode("ascii", "backslashreplace").decode() for x in args))

    def counts(rs):
        out = {}
        for r in rs:
            out[r["powertrain"]] = out.get(r["powertrain"], 0) + 1
        return out

    print(f"BRANDS {len(BRANDS)} {counts(BRANDS)}")
    print(f"MODELS {len(MODELS)} {counts(MODELS)}")
    print(f"aliases {len(owner)}; unverified: {[r['id'] for _, r in rows if r.get('unverified')]}")
    print(f"ambiguous models: {[m['id'] for m in MODELS if m['powertrain'] == 'ambiguous']}")
    print(f"\n{len(warnings)} overlap warning(s) (shorter alias inside a longer one of another entry; longest match wins):")
    for w in warnings:
        print("  -", w)
    print(f"\n{len(problems)} problem(s):")
    for p in problems:
        print("  !", p)
    assert not problems, "fix the problems above"
    print("OK")
