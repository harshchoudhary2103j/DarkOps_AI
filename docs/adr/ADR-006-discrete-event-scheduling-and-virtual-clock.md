# ADR-006: Discrete-Event Scheduling and Simulated Time

- **Status**: Accepted
- **Date**: 2026-10-16
- **Context**: Simulating a 24-hour quick-commerce operational cycle with multi-hour supplier lead times and picking queues cannot wait 24 hours of real wall-clock time. We must decouple simulated time from wall-clock time.

## Decision
1. **Virtual Clock**: The simulation engine operates a virtual discrete-event clock (`SimulationClock`) that advances instantaneously from the timestamp of the current event to the timestamp of the next earliest event in the queue.
2. **Deterministic Priority Queue**: Events are queued in a heap/priority queue ordered by `(timestamp, priority, sequence_number)`. The monotonic sequence counter guarantees deterministic execution order when multiple events occur at the exact same virtual millisecond.
3. **No Real-Time Sleeps**: Prohibit all `time.sleep()`, `setTimeout()`, or `setInterval()` within the simulation engine.
4. **Execution Pace Controls**: For interactive visualization in the Simulation Lab, an optional throttled pacing loop can map virtual time progression to wall-clock time (e.g., 10x, 50x speed).

## Alternatives Considered
- *Time-stepped simulation (fixed $\Delta t$ ticks)*: Computationally wasteful when no activity occurs; imprecise when multiple rapid events occur within one step.

## Consequences
- **Positive**: 24 simulated hours execute in seconds during headless evaluation; 100% deterministic time progression; easy pausing, fast-forwarding, and replaying.
- **Negative**: Virtual clock state must be passed through all simulated domain handlers rather than relying on system `Date.now()` or `datetime.now()`.
