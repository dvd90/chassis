import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * src/jobs/run.ts is a process, not a function: it parses argv, picks exit
 * codes and installs signal handlers, and none of that is observable from an
 * import. So these run it for real.
 *
 * The registry ships empty, so each case writes a fixture that pushes the jobs
 * it needs and then imports the entrypoint — same module instance, because
 * both resolve the same absolute path.
 */
// `process.cwd()` rather than `import.meta.url`: these files compile as
// CommonJS, where import.meta is unavailable. Vitest runs from the package
// root, and beforeAll fails loudly if that ever stops being true.
const projectRoot = process.cwd();
const here = path.join(projectRoot, 'src', 'jobs');
const quoted = (file: string) => JSON.stringify(path.join(here, file));

/**
 * `node --import tsx`, not the `tsx` binary: the binary is a wrapper that
 * spawns its own child, so a SIGTERM sent here would kill the wrapper and
 * never reach the handler under test.
 */
const nodeArgs = (file: string, args: string[]) => [
  '--import',
  'tsx',
  file,
  ...args
];

let tmp: string;

beforeAll(() => {
  if (!fs.existsSync(path.join(here, 'run.ts'))) {
    throw new Error(`expected the jobs entrypoint under ${here}`);
  }
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chassis-jobs-'));
});

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Write a fixture that registers `body`'s jobs, then boots the entrypoint. */
function fixture(name: string, body: string): string {
  const file = path.join(tmp, `${name}.mts`);
  fs.writeFileSync(
    file,
    `import { jobs } from ${quoted('index.ts')};\n` +
      `${body}\n` +
      `await import(${quoted('run.ts')});\n`
  );
  return file;
}

// NODE_ENV=development because the logger is silent under `test`, and the log
// is the only thing a one-shot run leaves behind.
const env = { ...process.env, NODE_ENV: 'development' };
const spawnOpts = { env, cwd: projectRoot };

function runSync(file: string, args: string[] = []) {
  const result = spawnSync(process.execPath, nodeArgs(file, args), {
    ...spawnOpts,
    encoding: 'utf8'
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`
  };
}

describe('the jobs entrypoint', { timeout: 30_000 }, () => {
  it('exits cleanly when nothing is registered', () => {
    const { status, output } = runSync(fixture('empty', ''));

    expect(status).toBe(0);
    expect(output).toContain('No jobs registered');
  });

  it('runs one named job once, then exits', () => {
    const marker = path.join(tmp, 'ran.txt');
    const { status, output } = runSync(
      fixture(
        'oneshot',
        `import fs from 'node:fs';
         jobs.push({
           name: 'alpha',
           async run() { fs.appendFileSync(${JSON.stringify(marker)}, 'x'); }
         });
         jobs.push({ name: 'beta', async run() { throw new Error('must not run'); } });`
      ),
      ['alpha']
    );

    expect(status).toBe(0);
    expect(output).toContain('job alpha finished');
    expect(fs.readFileSync(marker, 'utf8')).toBe('x');
  });

  it('exits non-zero on an unknown job and names the ones it has', () => {
    const { status, output } = runSync(
      fixture('unknown', `jobs.push({ name: 'alpha', async run() {} });`),
      ['ghost']
    );

    expect(status).toBe(1);
    expect(output).toContain('Unknown job: ghost');
    expect(output).toContain('alpha');
  });

  it('still exits 0 when the job it ran threw — failure is logged, not fatal', () => {
    const { status, output } = runSync(
      fixture(
        'throws',
        `jobs.push({ name: 'alpha', async run() { throw new Error('nope'); } });`
      ),
      ['alpha']
    );

    expect(status).toBe(0);
    expect(output).toContain('job alpha failed');
    expect(output).toContain('nope');
  });

  // "a cron job does not fire at boot" lives in index.test.ts, where it costs
  // nothing. Every case here spawns a real process, so the file is kept to the
  // behaviour that genuinely needs one — anything else just starves the rest
  // of the suite on a small runner.

  /** A job that parks until shutdown and holds no handle of its own. */
  const consumer = (onAbort = '') => `jobs.push({
    name: 'consumer',
    run: ({ signal }) =>
      new Promise((resolve) =>
        signal.addEventListener('abort', () => { ${onAbort} resolve(); })
      )
  });`;

  interface Exit {
    code: number | null;
    /** Non-null when the process was killed rather than exiting by itself. */
    signal: NodeJS.Signals | null;
    output: string;
  }

  /**
   * Spawn the entrypoint and SIGTERM it once `ready` shows up in its output —
   * or immediately, if `ready` is null.
   *
   * Both `code` and `signal` are reported because the interesting failure is
   * `code: null, signal: 'SIGTERM'`: the default disposition killed the
   * process, meaning no handler was installed when the signal landed.
   */
  function runUntil(file: string, ready: RegExp | null): Promise<Exit> {
    const child = spawn(process.execPath, nodeArgs(file, []), spawnOpts);
    let output = '';
    let signalled = false;

    const signalOnce = () => {
      if (signalled) return;
      signalled = true;
      // Once only: every later chunk still matches, and re-signalling a
      // process that is already draining races its exit.
      child.kill('SIGTERM');
    };

    return new Promise<Exit>((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        output += chunk.toString();
        if (ready?.test(output)) signalOnce();
      };
      child.stdout.on('data', onData);
      child.stderr.on('data', onData);
      child.on('error', reject);
      child.on('close', (code, signal) => resolve({ code, signal, output }));
      if (!ready) signalOnce();
    });
  }

  it('stays up for a long-running job that holds no handle of its own', async () => {
    const child = spawn(
      process.execPath,
      nodeArgs(fixture('keepalive', consumer()), []),
      spawnOpts
    );
    let exited = false;
    child.on('close', () => (exited = true));

    // An unsettled promise holds nothing open, so without the harness's
    // keep-alive this process is gone within a second of boot — reporting
    // success, having run nothing. The two outcomes are an immediate exit
    // versus staying up forever, so a short wait separates them decisively.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(exited).toBe(false);

    child.kill('SIGTERM');
    await new Promise((resolve) => child.on('close', resolve));
  });

  it('handles SIGTERM that arrives during boot', async () => {
    // The integrations line is written by `initIntegrations`, well before the
    // harness is up, so this lands in the boot window — where SIGTERM used to
    // hit a process with no handler yet and kill it outright.
    const exit = await runUntil(
      fixture('sigterm-boot', consumer()),
      /ntegrations/i
    );

    expect(exit).toMatchObject({ code: 0, signal: null });
    expect(exit.output).toContain('SIGTERM received');
  });

  it('aborts a long-running job on SIGTERM and shuts down', async () => {
    const exit = await runUntil(
      fixture('sigterm', consumer(`console.log('CONSUMER-DRAINED');`)),
      /Jobs running/
    );

    expect(exit).toMatchObject({ code: 0, signal: null });
    expect(exit.output).toContain('SIGTERM received');
    expect(exit.output).toContain('CONSUMER-DRAINED');
  });
});
