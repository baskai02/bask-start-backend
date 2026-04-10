---
name: exercise-library
description: Use when adding or updating exercise metadata in Bask. Covers movement pattern, primary/secondary/stabilizer muscles, equipment, contribution weights, alternatives, fatigue score, recovery time, and keeping the exercise library normalized and internally consistent.
---

# Exercise Library

Use this skill only for exercise metadata work in:

- `src/exercises/library.ts`
- `src/exercises/types.ts`

Do not use it for:

- readiness or recovery algorithm changes
- frontend explanation changes
- reporting how changes should be presented

## Checklist

When adding or updating an exercise, verify:

- `movementPattern` matches the main action
- `primaryMuscles`, `secondaryMuscles`, and `stabilizers` are realistic
- `equipment` and `equipmentType` match how the lift is actually performed
- `alternatives` point to believable substitutions already in the library
- `contributionWeights` fit the lift context
- `fatigueScore` and `recoveryTimeHours` are in family with similar exercises
- `trainingEffects` are specific enough for planning and readiness

## Rules

- Compare against existing nearby exercises before changing values.
- Keep compound lifts meaningfully different from supported/isolation variants.
- Do not add metadata that the current backend does not use.
- Change enums/types only when necessary.

## Validation

- Check at least one nearby exercise family for consistency.
- Add a focused regression only if behavior changed.

- supported row vs unsupported row
- cable chest isolation vs machine chest isolation
- squat vs unilateral leg variation
