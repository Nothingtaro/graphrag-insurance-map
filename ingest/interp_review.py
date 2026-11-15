"""B19 (PLAN.md): decisions on the readings marked `interp` (the wording does not state them outright).

Every node or detail that carries `interp` must have a row here, or build_data.py stops: a new interpretation cannot
reach the chat without someone deciding how it is answered.

    accepted  the project owner accepted the reading (15 Nov 2569) while the claims team has not reviewed it yet:
              the chat answers it directly, without "ยืนยันกับบริษัทก่อน"
    keep      the answer depends on facts the data does not hold (the policy schedule, a police or court finding,
              the law on the day): the chat keeps saying what it depends on, whoever accepts the reading
    confirmed the claims team confirmed it (set from the review page, research/b19 review artifact)
    rejected  the claims team rejected it: the node must be changed in graph.py / graph_ext.py before the next build

Changing a row here and rebuilding is all it takes; the review page lists the same ids.
"""
from __future__ import annotations

OWNER = {"by": "เจ้าของโปรเจกต์", "at": "2026-11-15"}
STATUSES = ("accepted", "keep", "confirmed", "rejected")

# id -> (status, note)
REVIEW: dict[str, tuple[str, str]] = {
    # ---- details
    "flood_t1": ("accepted", ""),
    "flood_ev1": ("accepted", ""),
    "ncbx_t5": ("accepted", ""),
    "drug_tp_t4": ("accepted", ""),
    "drug_tp_t4sg": ("accepted", ""),
    # ---- events (B2)
    "evt_hit_object": ("accepted", ""),
    "evt_rear_ended": ("accepted", ""),
    "evt_glass_stone": ("accepted", ""),
    "evt_vandal": ("accepted", ""),
    "evt_breakin": ("accepted", ""),
    "evt_tree_fall": ("accepted", ""),
    "evt_flood_parked": ("accepted", ""),
    "evt_flood_drive": ("keep", "น้ำเข้าเครื่องเป็นอุบัติเหตุหรือเครื่องเสียเอง ต้องดูข้อเท็จจริงของแต่ละคันและเกณฑ์ของฝ่ายสินไหม"),
    "evt_flood_ev": ("accepted", ""),
    "evt_hit_animal": ("accepted", ""),
    "evt_theft_parking": ("accepted", ""),
    "evt_carjack": ("accepted", ""),
    "evt_fraud": ("keep", "เป็นฉ้อโกงหรือลักทรัพย์ขึ้นกับข้อเท็จจริงและผลการแจ้งความ ซึ่งระบบไม่รู้"),
    "evt_charging_fire": ("accepted", ""),
    "evt_rollover": ("accepted", ""),
    "evt_adas": ("keep", "ต้องพิสูจน์ก่อนว่าซอฟต์แวร์ผิดปกติ และเล่มไม่ได้บอกว่าใครพิสูจน์"),
    "evt_hack": ("accepted", ""),
    "evt_riot": ("accepted", ""),
    "evt_passenger_hurt": ("accepted", ""),
    "evt_dooring": ("accepted", ""),
    "evt_service_damage": ("accepted", ""),
    # ---- factors (B3-B6)
    "role_unnamed": ("accepted", ""),
    "role_family": ("accepted", ""),
    "use_territory": ("keep", "อาณาเขตคุ้มครองอยู่ในตารางกรมธรรม์ ซึ่งไม่อยู่ในข้อมูล"),
    "use_racing": ("accepted", ""),
    "use_off_schedule": ("keep", "ลักษณะการใช้รถอยู่ในรหัสของตารางกรมธรรม์ ซึ่งไม่อยู่ในข้อมูล"),
    "use_contract": ("accepted", ""),
    "ds_drunk": ("accepted", ""),
    "ds_drugs": ("keep", "สารแต่ละชนิดเป็นสารต้องห้ามหรือไม่ขึ้นกับกฎหมายในวันเกิดเหตุ ซึ่งอยู่นอกเล่ม"),
    "ds_no_license": ("accepted", ""),
    "ds_expired_license": ("accepted", ""),
    "ds_young_temp": ("accepted", ""),
    "ds_gross_negligence": ("accepted", ""),
    "ds_bad_faith": ("accepted", ""),
    "fault_shared": ("accepted", ""),
    # ---- definitions (B7)
    "def_driver": ("accepted", ""),
    "def_cmi_tpd": ("keep", "เล่ม พ.ร.บ. ไม่นิยามคำนี้ จึงยืมนิยามจากเล่มอื่นมาตอบไม่ได้"),
}
