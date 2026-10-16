---
trigger: model_decision
description: "Frontend development standards for React, TypeScript, Tailwind CSS, presentation invariants, and state management."
---

# DarkOps AI Frontend Rules

## 1. Stack & Presentation-Only Discipline
- Use React, TypeScript, and Tailwind CSS.
- The frontend is strictly a presentation and interaction layer. It must **never**:
  - Calculate authoritative inventory positions or available stock balances.
  - Fabricate or mock operational KPIs, cost savings, or optimization results.
  - Bypass backend authorization or business validation.

## 2. Component Organization & Aesthetics
- Maintain a clean component structure: UI primitives, layout wrappers, domain feature views, and API hooks.
- Follow rich, modern aesthetics: clean dark-mode friendly palettes, clear typographic hierarchy, subtle interactive states, and proper feedback indicators.
- Provide descriptive `id` and `aria-label` attributes on interactive elements for automated browser testing and accessibility.

## 3. Asynchronous Data & Error Handling
- Every API call must explicitly handle loading, success, empty, and error states.
- Display backend error messages and structured failure details clearly to the operator.
- Long-running simulation runs must show real-time progress indicators with polling or event subscriptions, with explicit failure handling if the background job crashes.

## 4. Simulation Lab & Copilot Interaction
- Simulation results must be clearly and visibly labeled as **Simulated Estimates** — never represented as verified real-world operational outcomes.
- AI Copilot actions that modify system state must render an explicit confirmation dialog showing the exact payload, affected entities, and require manual operator confirmation.
