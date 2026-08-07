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

describe('the jobs entrypoint', () => {
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

  it('aborts a long-running job on SIGTERM and shuts down', async () => {
    const file = fixture(
      'sigterm',
      `jobs.push({
         name: 'consumer',
         run: ({ signal }) =>
           new Promise((resolve) =>
             signal.addEventListener('abort', () => {
               console.log('CONSUMER-DRAINED');
               resolve();
             })
           )
       });`
    );

    const child = spawn(process.execPath, nodeArgs(file, []), spawnOpts);
    let output = '';

    const status = await new Promise<number | null>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString();
        // Wait until the harness says it is up, or SIGTERM races the boot.
        if (output.includes('Jobs running')) child.kill('SIGTERM');
      });
      child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
      child.on('error', reject);
      child.on('close', resolve);
    });

    expect(status).toBe(0);
    expect(output).toContain('SIGTERM received');
    expect(output).toContain('CONSUMER-DRAINED');
  }, 20_000);
});
