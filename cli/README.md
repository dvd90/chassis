# create-chassis

Scaffold a [Chassis](https://github.com/dvd90/chassis) backend —
a lightweight, decorator-driven Express + TypeScript starter.

```bash
npm create chassis my-api
```

The CLI asks which modules you want — **MongoDB**, **Auth0**, **Sentry**,
**Docker** — and generates a project containing only what you chose. Zero
dependencies, works with Node 20+.

Flags:

- `--yes` / `-y` — skip prompts, include everything (also the default when
  stdin is not a TTY).

For development of the CLI itself, point it at a local template checkout:

```bash
CHASSIS_TEMPLATE=/path/to/chassis node index.mjs /tmp/test-app --yes
```
