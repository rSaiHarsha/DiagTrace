# Jira & Requirements Extract
**Category:** Jira & Requirements
**Document Type:** Jira & Requirements
**Purpose:** Requirements traceability and open engineering tickets relevant to current DTC patterns, so the RCA engine can flag "this is a known/tracked issue" vs. "this is a new pattern."

## Requirement REQ-ECM-0087
**Title:** Catalyst Monitor Cold-Start Enable Conditions
**Text:** The catalyst efficiency monitor (P0420) SHALL NOT enable until the downstream O2 sensor heater has reached 400°C ±15°C, verified via heater resistance model, to prevent false monitor triggers during cold ambient starts.
**Status:** Partially implemented in calibration v4.7.2; gap identified in Test Report TR-2026-0417 for extreme cold soak (-20°C). Tracked by JIRA-ECM-2291.

---

## JIRA-ECM-2291
**Type:** Bug
**Priority:** P2
**Summary:** P0420 false-triggers on Alpha Sedan at -20°C cold soak, cal v4.7.2
**Description:** Downstream O2 heater slew rate insufficient to meet REQ-ECM-0087 enable window under extreme cold. Root cause confirmed via DV test cell (TR-2026-0417).
**Linked Fix:** CAR-2026-118, target calibration v4.8.0.
**Status:** In Progress
**Affects Version:** Alpha Sedan MY25, cal v4.7.2 and earlier

---

## JIRA-SRS-1904
**Type:** Bug
**Priority:** P0 (Safety)
**Summary:** Intermittent B0028 on DV fleet vehicles, C-pillar harness splice
**Description:** 3 of 40 DV vehicles showed right-side airbag squib loop resistance out of spec, traced to connector retention clip from supplier lot 2025-Q4.
**Root Cause:** Supplier build-quality defect (insufficient clip engagement force), not a design or firmware defect.
**Resolution:** Supplier corrective action implemented; retention clip redesign in production from build week 2026-W09 onward.
**Status:** Closed
**Note for RCA:** If B0028 appears on a VIN built before 2026-W09, prioritize harness connector inspection over SRS module replacement.

---

## JIRA-BCM-1755
**Type:** Bug
**Priority:** P1
**Summary:** Gateway timeout causes cascading U0100/U0121 across ECM, TCM, ABS simultaneously
**Description:** Under high bus load (>85%) conditions, BCM gateway firmware v2.3 occasionally drops routing for 400-600ms, which downstream modules interpret as a communication-loss fault and log independently.
**Root Cause:** Gateway firmware buffer overflow under sustained high bus load.
**Resolution:** Firmware v2.4 increases buffer depth; rollout in progress.
**Status:** In Progress
**Note for RCA:** When U0100/U0121-family codes appear across 2+ modules within the same ~1 second window, this ticket should be surfaced as the likely explanation instead of investigating each module's connector independently.

## Requirement REQ-ABS-0033
**Title:** Brake Pressure Sensor Circuit Diagnostic Coverage
**Text:** The ABS module SHALL distinguish between a brake pressure sensor circuit fault (P0546) and a hydraulic system fault by cross-referencing wheel speed sensor data during active braking events, per Test Repository TP-106.
**Status:** Implemented, v3.1 ABS software onward.
