# Background jobs

A second entrypoint off the same build: `src/jobs/run.ts` schedules everything
registered in `src/jobs/index.ts` and stays up. Same config, same integrations,
same image as the API — a different process.

```bash
npm run jobs                 # schedule everything, stay up
npm run jobs -- purge-old    # run one job once and exit
```

## Defining a job

```ts
// src/jobs/index.ts
import { now } from '../utils/clock';

export const jobs: JobDefinition[] = [
  {
    name: 'purge-expired-tokens',
    schedule: '0 3 * * *',
    async run({ logger }) {
      const cutoff = now();
      logger.info(`purging tokens issued before ${cutoff.toISOString()}`);
    }
  }
];
```

There is no job _type_. A job with a `schedule` runs on that cron expression;
a job without one starts at boot and keeps running. A queue consumer is the
second kind:

```ts
{
  name: 'inbox-consumer',
  async run({ logger, signal }) {
    while (!signal.aborted) {
      const message = await receive({ signal });
      if (message) await handle(message);
    }
    logger.info('consumer drained');
  }
}
```

`signal` is aborted on SIGTERM. A long-running job **must** watch it — the
shutdown failsafe kills the process ten seconds later either way.

Read the clock through `now()` from `src/utils/clock.ts`, never `new Date()`.
That is what lets a test drive a job's date logic with `setClock`, exactly as
the session and magic-link services do.

## Failure

A throwing job is logged and swallowed. That is deliberate: one bad run must
not take the process — and every other schedule with it — down. Overlapping
runs are also prevented; a run still going when the next tick arrives skips
that tick rather than stacking a second copy.

So the process never tells you a job is broken. Sentry does.

## Sentry Crons

With the `sentry` module kept, every run opens a check-in before it starts and
closes it as `ok` or `error`. The check-in is what catches the failure mode
plain error reporting cannot: a schedule that stops firing at all reports
nothing, and a missed check-in is exactly what Sentry alerts on.

Create a monitor in Sentry whose slug matches the job's `name`, and give it the
same schedule. Without the `sentry` module the check-in lines prune away and the
jobs run unwatched.

## Deploying

The jobs process is the same image as the API with a different command:

```yaml
# one service per entrypoint, one image
api:
  image: your-app
  command: node dist/server.js
jobs:
  image: your-app
  command: node dist/jobs/run.js
```

Run exactly one jobs replica unless every job is idempotent — nothing here
coordinates schedules across processes.

```
ponytail: no distributed lock. Two replicas run every cron twice. Add an
advisory lock keyed on the job name the day you need to scale out.
```
