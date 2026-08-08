# Existing Issues Repository
**Category:** Existing Issues
**Document Type:** Existing Issues Repository
**Purpose:** Historical record of confirmed root causes and resolutions by DTC, so the RCA engine can pattern-match new occurrences against precedent instead of starting from zero each time.

## Issue #EI-0412 — P0300 (Random Misfire), Alpha Sedan
**Confirmed Root Cause:** Ignition coil #3 dielectric breakdown under high-humidity conditions, affecting build lots from Supplier X, date codes 2025-06 through 2025-09.
**Frequency:** 22 confirmed field occurrences.
**Resolution:** Coil replaced under warranty; supplier switched dielectric compound starting lot 2025-10.
**Precedent guidance:** If P0300 is isolated to cylinder 3 and vehicle build date falls in the affected window, this is the leading candidate before broader misfire diagnostics.

## Issue #EI-0455 — P0420 (Catalyst Efficiency), all programs
**Confirmed Root Cause (majority of cases):** Calibration-related false trigger under cold-start conditions (see JIRA-ECM-2291). A minority (approx. 8% of field cases) were genuine catalyst substrate degradation past 80,000 miles.
**Precedent guidance:** Check odometer reading and ambient temp at time of fault before assuming hardware failure. Under 80,000 miles + cold-climate region = calibration issue is the leading hypothesis.

## Issue #EI-0501 — P0171 (System Too Lean, Bank 1), Beta Sedan
**Confirmed Root Cause:** PCV valve hose cracking due to under-hood heat exposure on Beta Sedan's tighter engine bay packaging (unique to this platform vs. Alpha Sedan).
**Frequency:** 41 confirmed field occurrences, concentrated in high-ambient-temperature regions.
**Resolution:** Revised PCV hose material (higher heat tolerance) introduced at build week 2025-W44.
**Precedent guidance:** For Beta Sedan specifically, check PCV hose condition before MAF sensor — this is platform-specific and does not apply to Alpha Sedan, Gamma SUV, Delta EV, or Omega Truck.

## Issue #EI-0538 — U0100/U0121 cluster faults, all CAN-gateway programs
**Confirmed Root Cause:** BCM gateway firmware buffer overflow under high bus load (see JIRA-BCM-1755).
**Precedent guidance:** Multi-module simultaneous communication-loss codes should be triaged as a single gateway event, not N separate module failures. This has been the single highest-value RCA disambiguation identified to date — engineers report it previously took 2-3x longer to diagnose when each module was investigated independently.

## Issue #EI-0562 — B0028 (Right Airbag Deployment), DV fleet + limited field
**Confirmed Root Cause:** Supplier connector retention clip defect (see JIRA-SRS-1904 / Test Report TR-2026-0298).
**Precedent guidance:** Build-week cutoff is 2026-W09. Any B0028 on a VIN built after that date is NOT explained by this issue and requires fresh investigation.

## Issue #EI-0579 — P0546 (Brake Pressure Sensor B Malfunction), Omega Truck
**Confirmed Root Cause:** HCU connector corrosion due to under-body salt/moisture exposure, disproportionately affecting Omega Truck (higher ground clearance exposes the HCU connector to more road spray than sedan platforms).
**Frequency:** 17 confirmed field occurrences, concentrated in winter road-salt regions.
**Resolution:** Connector seal upgrade (IP67-rated) introduced at build week 2026-W02.
**Precedent guidance:** For Omega Truck built before 2026-W02 in salt-belt regions, prioritize connector inspection over sensor or HCU replacement.

## Issue #EI-0601 — P0700 (Transmission Control System Malfunction), Gamma SUV
**Confirmed Root Cause:** This is an umbrella/MIL-only code; underlying TCM-internal DTC in 90% of confirmed cases was a shift solenoid circuit fault, not the TCM itself.
**Precedent guidance:** Always pull the TCM-internal DTC via UDS before treating P0700 as a standalone fault — closing it based on the umbrella code alone has historically led to repeat visits.
