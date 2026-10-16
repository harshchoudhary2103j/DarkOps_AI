---
trigger: always_on
---

# DarkOps AI Engineering Standards

- Follow the repository's AGENTS.md, README.md, and architecture documentation.
- Write clean, simple, readable, maintainable code.
- Prefer the simplest correct solution. Avoid overengineering, premature optimization, unnecessary abstractions, and speculative features.
- Follow SOLID principles pragmatically.
- Keep functions and modules focused on clear responsibilities.
- Use meaningful names and explicit error handling.
- Keep domain logic separate from controllers, persistence adapters, and external integrations.
- Respect module ownership and established API contracts.
- Never hardcode fabricated operational metrics, forecasts, or optimization outcomes.
- Write and run appropriate tests for changes. Report actual results honestly.
- Do not introduce unrelated changes or dependencies.
- Never expose secrets or bypass security, authorization, or business invariants.
- Review the final diff for unnecessary complexity before completing a task.
- Ask before making significant architectural changes that are outside the approved task scope.