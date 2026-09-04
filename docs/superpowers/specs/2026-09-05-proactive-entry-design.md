# Proactive Entry Design

## Goal

Show CodeCoach as soon as a supported problem editor is ready, without revealing any solution information.

## Behavior

- Show one opening prompt about 1.5 seconds after the problem and editor are detected.
- Ask `How do you want to start?` / `어떻게 시작할까요?`.
- Offer `Write approach`, `Need a hint`, and `Not now` actions.
- Keep the opening prompt to once per problem.
- Show stuck coaching after 45 seconds and allow non-failure follow-ups after a 2-minute cooldown.
- Keep the existing three-intervention limit and solution-code blocking.

## Scope

Change inline coaching timing, opening actions, localized copy, and editor-local alignment. Keep AI routing unchanged.
