# Chassis documentation

**Start here:** [Getting started](getting-started.md) — from zero to a running, tested API in ~10 minutes.

**Using an AI agent?** See [AGENTS.md](../AGENTS.md) — conventions, do/don't, and the definition of done that agents follow.

## Tutorials & guides

| Doc                                          | What it covers                                                    |
| -------------------------------------------- | ----------------------------------------------------------------- |
| [Getting started](getting-started.md)        | Step-by-step: scaffold, run, add your first endpoint, test, build |
| [Building an API](guides/building-an-api.md) | A complete CRUD resource: model, validation, errors, tests        |
| [Database](guides/database.md)               | Choosing Mongo/Postgres/SQLite, the ORM, migrations, DB-aware gen |
| [Authentication](guides/authentication.md)   | Auth0, local JWT, Clerk, or plugging in any other provider        |
| [MCP server](guides/mcp.md)                  | Exposing the API to AI agents as MCP tools                        |
| [Payments (x402)](guides/payments-x402.md)   | Payment-gating routes with `@paidRoute` and the x402 protocol     |
| [Deployment](guides/deployment.md)           | Docker, docker-compose, health probes, production checklist       |

## Concepts

| Doc                             | What it covers                                                      |
| ------------------------------- | ------------------------------------------------------------------- |
| [Architecture](architecture.md) | Request lifecycle, the decorator flow, error paths, the app factory |
| [Modules](modules.md)           | The opt-in integration system and the `chassis:` marker convention  |

## Reference

| Doc                                         | What it covers                                                      |
| ------------------------------------------- | ------------------------------------------------------------------- |
| [Configuration](reference/configuration.md) | Every environment variable and feature flag                         |
| [Core API](reference/core-api.md)           | `Routable`, decorators, `ResponseHandler`, `AppError`, `validate()` |
| [CLI & scripts](reference/cli.md)           | `create-chassis`, `npm run gen`, and every npm script               |

## For maintainers

| Doc                                 | What it covers                                                       |
| ----------------------------------- | -------------------------------------------------------------------- |
| [Maintainers guide](maintainers.md) | Publishing the CLI, the template switch, Renovate, release checklist |
