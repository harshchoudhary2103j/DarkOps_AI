# ADR-005: Demand Generation Model and Reproducibility

- **Status**: Accepted
- **Date**: 2026-10-16
- **Context**: Evaluating operational and optimization policies requires realistic, stochastic demand patterns (order arrival times, basket sizes, SKU popularity). For policy evaluations to be scientifically fair, runs must be reproducible.

## Decision
1. **Stochastic Arrival Model**: Customer order arrivals follow a non-homogeneous (time-varying) Poisson process parameterised by hour-of-day intensity curves $\lambda(t)$.
2. **Basket Composition**: Basket size follows a truncated Poisson or negative binomial distribution ($1 \le N \le 15$ items). SKU selection uses weighted category probabilities reflecting realistic convenience grocery profiles.
3. **Seeded Pseudo-Random Number Generation**: All random sampling uses an explicit seed integer with isolated PRNG instances (e.g., Python `random.Random(seed)` or `numpy.random.default_rng(seed)`).
4. **Common Random Numbers (CRN)**: When evaluating baseline vs. optimized policies, both runs use identical random seeds so policy differences reflect algorithmic quality rather than random demand variance.

## Alternatives Considered
- *Trace-driven replay of static JSON orders*: Lacks dynamism, cannot react to stockout substitutions or time delays.
- *Unseeded random generation*: Completely non-reproducible; impossible to conduct scientifically sound A/B policy evaluations.

## Consequences
- **Positive**: High realism; 100% deterministic reproducibility; rigorous experimental controls for policy comparisons.
- **Negative**: Parameter configuration requires careful tuning so arrival rates and basket sizes mirror realistic quick-commerce load.
