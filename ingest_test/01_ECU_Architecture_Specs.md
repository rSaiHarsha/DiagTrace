# ECU Architecture Specification
**Category:** Architectures
**Document Type:** ECU Architecture Specs
**Applies To:** Alpha Sedan, Beta Sedan, Gamma SUV, Delta EV, Omega Truck platforms
**Revision:** A.3

## 1. Engine Control Module (ECM)
- **Function:** Manages fuel injection timing, ignition timing, idle control, and emissions (catalyst, O2 sensors, EVAP).
- **Bus Interface:** High-speed CAN (500 kbps), node ID 0x7E0/0x7E8 (diagnostic request/response).
- **Key Inputs:** Mass Air Flow (MAF) sensor, upstream/downstream O2 sensors, crankshaft/camshaft position sensors, coolant temp sensor.
- **Key Outputs:** Fuel injector pulse width, ignition coil dwell, idle air control valve position.
- **Common Fault Domains:**
  - Misfire detection (crankshaft position sensor noise, injector coking, ignition coil degradation) → surfaces as **P0300** (random/multiple cylinder misfire).
  - Catalyst monitor (O2 sensor cross-count, catalyst substrate aging, exhaust leaks upstream of catalyst) → surfaces as **P0420** (catalyst efficiency below threshold).
  - Fuel trim / air metering (vacuum leaks, MAF sensor drift, PCV valve failure) → surfaces as **P0171** (system too lean, bank 1).
- **Known Design Note:** On Alpha Sedan builds prior to MY24, the ECM firmware sampled MAF at 10ms intervals, which was later increased to 5ms to reduce false-lean triggers under throttle tip-in — relevant when triaging P0171 by build date.

## 2. Transmission Control Module (TCM)
- **Function:** Shift scheduling, torque converter clutch (TCC) control, line pressure control.
- **Bus Interface:** High-speed CAN, node ID 0x7E1/0x7E9.
- **Key Inputs:** Input/output shaft speed sensors, transmission fluid temp, ECM torque request over CAN.
- **Common Fault Domains:**
  - Internal self-test and CAN timeout logic → surfaces as **P0700** (transmission control system malfunction — this is an umbrella code; the TCM's internal DTC, retrievable via UDS ReadDTC, holds the actual failure).
  - Loss of ECM↔TCM torque coordination messages → contributes to **U0100** (lost communication with ECM/PCM) when reported *from* the TCM's perspective.

## 3. Anti-lock Braking System (ABS) Module
- **Function:** Wheel speed monitoring, hydraulic modulator control for ABS/traction control/stability control.
- **Bus Interface:** High-speed CAN, node ID 0x7E2/0x7EA.
- **Key Inputs:** Four wheel speed sensors, brake pressure sensor (primary + secondary circuit), yaw rate sensor (Gamma SUV, Delta EV only).
- **Common Fault Domains:**
  - Brake pressure sensor circuit (open/short, connector corrosion at the HCU) → surfaces as **P0546 / "Brake Pressure Sensor B Malfunction"**.
  - Wheel speed sensor dropout at low speed → contributes to false traction-control activations.
  - CAN transceiver fault or bus-off condition → surfaces as **U0121** (lost communication with ABS control module), typically observed from the ECM/BCM side.

## 4. Body Control Module (BCM)
- **Function:** Gateway node for body electrical functions; also acts as CAN gateway between chassis bus and comfort/convenience bus on Beta Sedan and Omega Truck.
- **Common Fault Domains:** Gateway timeout logic is the most frequent contributor to **U0100/U0121-class** communication-loss codes across *other* modules, because the BCM is the physical gateway — a BCM reset or gateway firmware hang can manifest as "lost communication" DTCs in ECM, TCM, and ABS simultaneously. When triaging a U0xxx code, always check whether other modules logged the same code in the same time window before assuming a point failure.

## 5. Supplemental Restraint System (SRS) Module
- **Function:** Airbag deployment control, seatbelt pretensioner control, crash severity discrimination.
- **Key Inputs:** Front/side impact sensors, seat occupancy sensor, seatbelt buckle switch.
- **Common Fault Domains:**
  - Deployment loop resistance out of spec (squib circuit open/short, connector pin backout) → surfaces as **B0001 (Driver Frontal Deployment Control)** or **B0028 (Right Side Airbag Deployment Control)** depending on which loop is affected.
  - **Safety note:** SRS DTCs should never be closed on a "clear code and retest" basis alone; squib circuit resistance must be verified with a dedicated airbag simulator per the test procedure in the Test Repository document, since a fault-code clear does not confirm deployment-circuit integrity.

## 6. Other Modules (Reference)
- **EPS** (Electric Power Steering): torque assist motor control, shared CAN with ABS for vehicle speed input.
- **ADAS**: forward radar/camera fusion, present on Gamma SUV and Delta EV only.
- **ICM** (Instrument Cluster Module): displays MIL/warning lamps driven by ECM/TCM/ABS/SRS status bits.
- **EPB** (Electric Parking Brake): motor-driven caliper actuation, interlocked with ABS hydraulic state.
