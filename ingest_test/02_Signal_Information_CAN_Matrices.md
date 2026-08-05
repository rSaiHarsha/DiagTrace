# Signal Information & CAN Matrix Reference
**Category:** Signal Information
**Document Type:** Signal Information & CAN Matrices
**Bus:** Powertrain High-Speed CAN (500 kbps), Chassis High-Speed CAN (500 kbps)

## 1. Message ID Table (Powertrain Bus)

| Message ID | Name | Source Module | Cycle Time | Key Signals |
| :--- | :--- | :--- | :--- | :--- |
| 0x0C0 | ECM_EngineData_01 | ECM | 10ms | EngineSpeed_rpm, MAF_gs, ThrottlePos_pct |
| 0x0C8 | ECM_FuelTrim_01 | ECM | 100ms | STFT_Bank1_pct, LTFT_Bank1_pct, O2Sensor1_V |
| 0x1A0 | TCM_ShiftStatus_01 | TCM | 20ms | CurrentGear, TCC_State, InputShaftSpeed_rpm |
| 0x1B4 | ABS_WheelSpeeds_01 | ABS | 10ms | WSS_FL_kph, WSS_FR_kph, WSS_RL_kph, WSS_RR_kph |
| 0x1C2 | ABS_BrakePressure_01 | ABS | 20ms | BrakePressPrimary_bar, BrakePressSecondary_bar |
| 0x2E0 | BCM_GatewayStatus_01 | BCM | 100ms | GatewayHealth_bit, BusLoad_pct |
| 0x3F1 | SRS_DeploymentStatus_01 | SRS | 100ms (event-driven on crash) | SquibLoopResistance_ohm, CrashSeverity_idx |

## 2. Signal Definitions Relevant to Current DTC Patterns

### MAF_gs (Mass Air Flow, grams/second)
- **Valid range:** 2–250 g/s.
- **Fault correlation:** Values pinned below 3 g/s at idle with throttle >0% indicate a MAF sensor circuit fault or false-lean condition contributing to **P0171**.
- **Signal quality note:** Known noise on this signal during throttle tip-in on Alpha Sedan pre-MY24 ECM calibration (see ECU Architecture Specs, Section 1).

### STFT_Bank1_pct / LTFT_Bank1_pct (Short/Long Term Fuel Trim)
- **Valid range:** -25% to +25%.
- **Fault correlation:** Sustained LTFT > +20% (adding fuel) combined with low MAF is the standard signature preceding a **P0171** logged fault, typically 30–90 seconds prior in raw CAN trace data.

### O2Sensor1_V (Upstream O2 Sensor Voltage)
- **Valid range:** 0.1–0.9V, oscillating.
- **Fault correlation:** Cross-count (oscillation frequency) below 8 counts per 10 seconds at steady cruise, combined with downstream O2 sensor tracking upstream too closely, is the pre-fault signature for **P0420**.

### BrakePressPrimary_bar / BrakePressSecondary_bar
- **Valid range:** 0–180 bar.
- **Fault correlation:** A stuck-at value (no variance over 5+ seconds while WSS shows vehicle in motion and brake pedal switch is active) is the signature for **P0546 / Brake Pressure Sensor B Malfunction**, distinguishing a sensor circuit fault from an actual hydraulic issue (which would show pressure variance, just out of expected range).

### GatewayHealth_bit
- **Valid range:** 0 (fault) / 1 (healthy).
- **Fault correlation:** Any 0 value lasting >500ms on this signal, cross-referenced against the timestamp of a **U0100** or **U0121** DTC in another module, confirms the fault originates at the BCM gateway rather than the reporting module itself.

### SquibLoopResistance_ohm
- **Valid range:** 2.0–2.5 ohms (nominal, per deployment loop).
- **Fault correlation:** Values below 1.5 ohms (short) or above 5.0 ohms / open-circuit reading correlate to **B0001/B0028** family codes. This is a static parameter checked at key-on self-test, not a continuously streamed signal — see Test Repository for the verification procedure.

## 3. Notes for RCA Correlation
When the RCA engine has access to raw CAN trace snippets (not just the parsed DTC row), it should prioritize checking the signal 30–90 seconds prior to the DTC timestamp against the ranges above, since most of these fault signatures are trend-based rather than instantaneous threshold crossings.
