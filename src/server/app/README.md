# Server application components

This directory mirrors the component split described in `docs/SPEC.md`.

Each component should generally follow this shape:

- `model.ts`: domain types and ADTs
- `schema.ts`: runtime validation for external input, when needed
- `services/`: pure logic with no I/O
- `workflows/`: use-case transaction scripts and side effects
- `routes.ts`: HTTP boundary, only for components exposed through the API
- `adapters/`: external-system adapters, when needed
