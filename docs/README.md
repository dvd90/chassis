# Chassis documentation

**Start here:** [Getting started](getting-started.md) — from zero to a running, tested API in ~10 minutes.

## Tutorials & guides

| Doc                                          | What it covers                                                    |
| -------------------------------------------- | ----------------------------------------------------------------- |
| [Getting started](getting-started.md)        | Step-by-step: scaffold, run, add your first endpoint, test, build |
| [Building an API](guides/building-an-api.md) | A complete CRUD resource: model, validation, errors, tests        |
| [Authentication](guides/authentication.md)   | Enabling Auth0 step-by-step, or plugging in any other provider    |
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
