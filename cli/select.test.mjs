/**
 * The interactive path, which had no coverage at all.
 *
 * Faking a TTY turned out to be the wrong tool: `script` gives the CLI a
 * pseudo-terminal but piping stdin into it replaces the pty and readline
 * dies, and the syntax differs between macOS and Linux besides. The prompt
 * plumbing is thin and stable; the decision logic — preset, then Custom,
 * then flags overriding both — is where a bug would actually hide, and this
 * covers it directly.
 *
 *   node --test cli/select.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, GROUPS, PRESETS } from './modules.mjs';
import { presetChoices, resolveSelection } from './select.mjs';

/** A prompter that answers from a script and records what it was asked. */
function scripted(...answers) {
  const queue = [...answers];
  const asked = [];
  return {
    asked,
    prompts: {
      choose: async (prompt, options, fallback) => {
        asked.push({ kind: 'choose', prompt, keys: options.map((o) => o.key) });
        return queue.length ? queue.shift() : fallback;
      },
      confirm: async (prompt, fallback) => {
        asked.push({ kind: 'confirm', prompt });
        return queue.length ? queue.shift() : fallback;
      }
    }
  };
}

const noPrompts = {
  choose: async () => assert.fail('should not have prompted'),
  confirm: async () => assert.fail('should not have prompted')
};

test('--bare takes the minimal stack and asks nothing', async () => {
  const sel = await resolveSelection({ prompts: noPrompts, bare: true });
  assert.equal(sel.db, 'none');
  assert.equal(sel.auth, 'none');
  assert.equal(sel.docker, false);
  assert.deepEqual(
    Object.values(sel.modules).filter(Boolean),
    [],
    'minimal enabled a module'
  );
});

test('without a TTY the preset is used and nothing is asked', async () => {
  const sel = await resolveSelection({
    prompts: noPrompts,
    skipPrompts: true,
    preset: 'fullstack'
  });
  assert.equal(sel.db, PRESETS.fullstack.db);
  assert.equal(sel.auth, PRESETS.fullstack.auth);
  assert.equal(sel.modules.web, true);
});

test('without a TTY and no --preset it falls back to api', async () => {
  const sel = await resolveSelection({ prompts: noPrompts, skipPrompts: true });
  assert.equal(sel.db, PRESETS.api.db);
  assert.equal(sel.auth, PRESETS.api.auth);
});

test('the preset menu offers every preset plus Custom', async () => {
  const keys = presetChoices().map((c) => c.key);
  assert.deepEqual(keys.slice(0, -1), Object.keys(PRESETS));
  assert.equal(keys.at(-1), 'custom', 'Custom must be the last option');
});

test('picking a preset interactively expands that preset', async () => {
  const { prompts, asked } = scripted('lite');
  const sel = await resolveSelection({ prompts });

  assert.equal(sel.db, 'sqlite');
  assert.equal(sel.auth, 'jwt');
  assert.equal(asked.length, 1, 'picking a preset should ask exactly once');
});

test('--preset pre-selects the default in the menu', async () => {
  const { prompts, asked } = scripted();
  await resolveSelection({ prompts, preset: 'lite' });
  // No answer scripted, so the fallback is returned — it must be `lite`.
  assert.equal(asked[0].kind, 'choose');
});

test('Custom walks database, auth, every module, then Docker', async () => {
  const moduleKeys = Object.keys(MODULES);
  const { prompts, asked } = scripted(
    'custom',
    'postgres',
    'clerk',
    ...moduleKeys.map(() => false),
    true // Docker
  );

  const sel = await resolveSelection({ prompts });

  assert.equal(sel.db, 'postgres');
  assert.equal(sel.auth, 'clerk');
  assert.equal(sel.docker, true);

  // One preset choose, two group chooses, one confirm per module, one for Docker.
  assert.equal(asked.length, 3 + moduleKeys.length + 1);
  assert.deepEqual(
    asked.filter((a) => a.kind === 'choose').map((a) => a.keys),
    [
      presetChoices().map((c) => c.key),
      Object.keys(GROUPS.db.variants),
      Object.keys(GROUPS.auth.variants)
    ]
  );
});

test('Custom asks about every module in the catalog', async () => {
  // Adding a module without it appearing here would silently make it
  // unreachable for anyone using the interactive flow.
  const moduleKeys = Object.keys(MODULES);
  const { prompts, asked } = scripted('custom', 'none', 'none');
  const sel = await resolveSelection({ prompts });

  for (const key of moduleKeys) {
    assert.ok(key in sel.modules, `Custom never decided "${key}"`);
    assert.ok(
      asked.some(
        (a) => a.kind === 'confirm' && a.prompt.includes(MODULES[key].label)
      ),
      `Custom never asked about "${key}"`
    );
  }
});

test('explicit flags beat the preset', async () => {
  const sel = await resolveSelection({
    prompts: noPrompts,
    skipPrompts: true,
    preset: 'api', // postgres + jwt + sentry + docker
    db: 'mongo',
    auth: 'auth0',
    toggles: { sentry: false, web: true },
    docker: false
  });

  assert.equal(sel.db, 'mongo');
  assert.equal(sel.auth, 'auth0');
  assert.equal(sel.modules.sentry, false);
  assert.equal(sel.modules.web, true);
  assert.equal(sel.docker, false);
});

test('explicit flags beat what was answered interactively', async () => {
  const { prompts } = scripted('custom', 'sqlite', 'jwt', false, false, false, false, false); // prettier-ignore
  const sel = await resolveSelection({
    prompts,
    db: 'postgres',
    auth: 'clerk',
    toggles: { web: true },
    docker: true
  });

  assert.equal(sel.db, 'postgres', 'the --db flag lost to the prompt');
  assert.equal(sel.auth, 'clerk', 'the --auth flag lost to the prompt');
  assert.equal(sel.modules.web, true);
  assert.equal(sel.docker, true);
});

test('--bare still yields to explicit flags', async () => {
  const sel = await resolveSelection({
    prompts: noPrompts,
    bare: true,
    db: 'sqlite',
    toggles: { mcp: true }
  });
  assert.equal(sel.db, 'sqlite');
  assert.equal(sel.modules.mcp, true);
});

test('an absent --docker flag leaves the preset value alone', async () => {
  const withDocker = await resolveSelection({
    prompts: noPrompts,
    skipPrompts: true,
    preset: 'api'
  });
  assert.equal(withDocker.docker, true, 'api ships Docker');

  const off = await resolveSelection({
    prompts: noPrompts,
    skipPrompts: true,
    preset: 'api',
    docker: false
  });
  assert.equal(off.docker, false, '--no-docker did not override the preset');
});
