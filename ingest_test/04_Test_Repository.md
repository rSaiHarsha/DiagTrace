# Test Repository — Diagnostic Verification Procedures
**Category:** Test Repository
**Document Type:** Test Repository
**Purpose:** Standard verification steps engineers run to confirm a DTC root cause before closing an issue. RCA outputs should reference these procedures as "recommended next steps" rather than inventing generic advice.

## TP-101: P0300 — Random/Multiple Cylinder Misfire Verification
1. Retrieve freeze frame data; note RPM, load, and coolant temp at time of fault.
2. Check misfire counters per cylinder via UDS Routine 0x0206 — determine if misfire is isolated to one cylinder (points to injector/coil/plug) or distributed across all cylinders (points to fuel supply, timing, or crank sensor signal quality).
3. If isolated: swap suspect coil/injector with an adjacent cylinder and clear codes; re-test 50 miles. If misfire follows the part, part is confirmed faulty.
4. If distributed: check fuel rail pressure against spec (should be 58–62 psi at idle) and inspect crank position sensor air gap.
5. **Do not close as "Resolved" on a single clear/retest cycle** — minimum 50-mile confirmation drive required per DiagTrace QA policy.

## TP-102: P0420 — Catalyst Efficiency Verification
1. Confirm no upstream exhaust leaks (visual + smoke test) before suspecting catalyst substrate.
2. Log upstream/downstream O2 sensor voltage traces at steady 55mph cruise for 2 minutes; compare cross-count ratio (see Signal Information doc for thresholds).
3. Cross-reference vehicle build date/climate against known cold-start calibration issue (see Test Report TR-2026-0417) before authorizing catalyst replacement.
4. Only replace catalyst hardware if cross-count ratio fails **and** cold-start calibration is ruled out.

## TP-103: P0171 — System Too Lean (Bank 1) Verification
1. Check for intake vacuum leaks using smoke test at idle.
2. Inspect PCV valve and hose routing for cracks.
3. Review MAF sensor trace against Signal Information reference ranges; a MAF reading below 3 g/s at idle with normal throttle position confirms sensor fault vs. an actual air leak (which shows elevated MAF plus low LTFT correction lag).
4. Clean or replace MAF sensor per SOP-ECM-014 if sensor fault confirmed.

## TP-104: U0100 / U0121 — Communication Loss Verification
1. **Always check BCM gateway status bit first** (see ECU Architecture Specs, Section 4) before replacing the reporting module.
2. Pull CAN bus load and error-frame counts via the diagnostic tester; bus load > 85% or error frames > 50/min indicates a bus-level issue, not a single-node fault.
3. Inspect connector at the reporting module for corrosion/backout only if bus-level and gateway checks pass clean.
4. Confirm resolution with a 3-ignition-cycle soak test (cold start x3) since intermittent gateway faults often don't reproduce on a single key cycle.

## TP-105: B0001 / B0028 — SRS Deployment Loop Verification
1. **Safety-critical procedure — do not attempt on a live vehicle without SRS system disabled and capacitor discharge time (per OEM spec, minimum 10 minutes) observed.**
2. Use dedicated airbag loop simulator/resistance tester; do not use a standard multimeter on live squib circuits.
3. Confirm resistance reading against 2.0–2.5 ohm nominal range.
4. Inspect harness connector at implicated location (see Test Report TR-2026-0298 for known C-pillar splice issue on affected build lots) before condemning the SRS module itself.
5. Escalate to Safety Review Board per SRS-SOP-001 regardless of root cause found — SRS closures require dual sign-off.

## TP-106: P0546 — Brake Pressure Sensor B Malfunction Verification
1. Compare primary and secondary brake pressure sensor readings; if one is stuck-at while the vehicle is confirmed in motion (via WSS), it's a sensor circuit fault, not hydraulic.
2. Check connector at HCU (hydraulic control unit) for corrosion — this is the #1 historical cause per Existing Issues Repository.
3. Replace sensor only after connector inspection; HCU replacement is a last resort and requires bleed/calibration per SOP-ABS-009.
