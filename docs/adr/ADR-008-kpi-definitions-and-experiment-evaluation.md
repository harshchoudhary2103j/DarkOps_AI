# ADR-008: KPI Definitions and Fair Experiment Comparison

- **Status**: Accepted
- **Date**: 2026-10-16
- **Context**: Operational metrics must be trustworthy, scientifically sound, and impossible to fake. In quick-commerce demonstrations, claims of "improved efficiency" must be grounded in mathematically verifiable event data.

## Decision
1. **100% Event-Derived KPIs**: All metrics reported by the system must be computed by post-processing recorded simulation event logs:
   - *Fill Rate*: $\frac{\sum \text{Delivered Units}}{\sum \text{Requested Units}}$.
   - *Stockout Rate*: $\frac{\sum \text{Unfulfilled Units}}{\sum \text{Requested Units}}$.
   - *Mean Picking Distance*: $\frac{\sum \text{Picker Path Distance}}{\text{Total Picking Tasks}}$.
   - *Fulfillment Turnaround*: $\text{Time}_{\text{Order Ready}} - \text{Time}_{\text{Order Created}}$.
   - *Total Operating Cost*: $\text{Holding Cost} + \text{Stockout Penalties} + \text{Travel Time Cost} + \text{PO Order Cost}$.
2. **Strict Prohibition on Fabricated Metrics**: Code containing hardcoded metric values or uncalculated savings percentages will be rejected.
3. **Fair Comparison Protocol**: Baseline and optimized policy evaluations must be run with:
   - Identical starting inventory and store catalog.
   - Identical random seed and customer order arrival stream.
   - Identical cost coefficients and evaluation horizons.
4. **Mandatory Disclaimer**: All dashboards and exported reports must display: "Simulated estimates from synthetic quick-commerce environment — not verified real-world operational results."

## Alternatives Considered
- *Real-time KPI calculation during simulation*: Can introduce performance bottlenecks and complicates event replay.

## Consequences
- **Positive**: Complete auditability; mathematical integrity; defensible scientific evaluations.
- **Negative**: Post-run metric aggregation adds a brief compute step at the conclusion of a simulation run.
