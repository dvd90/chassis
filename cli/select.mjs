/**
 * Resolving what to scaffold: presets, the interactive walk-through, and the
 * rule that explicit flags beat both.
 *
 * Kept apart from index.mjs and free of I/O — it is handed the prompts it
 * needs — so the interactive path can be tested without a terminal. Faking a
 * TTY is fragile and platform-specific; the logic below is where the bugs
 * actually live, and this way it is covered directly.
 */
import { MODULES, GROUPS, PRESETS } from './modules.mjs';

/** A preset expanded into a concrete selection. */
export function presetSelection(name) {
  const preset = PRESETS[name] ?? PRESETS.api;
  return {
    db: preset.db,
    auth: preset.auth,
    modules: { ...preset.modules },
    docker: preset.docker
  };
}

/** The preset menu, with the Custom escape hatch appended. */
export function presetChoices() {
  return [
    ...Object.entries(PRESETS).map(([key, p]) => ({ key, label: p.label })),
    { key: 'custom', label: 'Custom — pick each module' }
  ];
}

const variantChoices = (group) =>
  Object.entries(GROUPS[group].variants).map(([key, v]) => ({
    key,
    label: v.label
  }));

/**
 * @param {object} options
 * @param {{choose: Function, confirm: Function, bold?: Function}} options.prompts
 * @param {boolean} options.bare        --bare: minimal, no questions
 * @param {boolean} options.skipPrompts no TTY, or --yes
 * @param {string}  [options.preset]    --preset
 * @param {string}  [options.db]        --db (already validated)
 * @param {string}  [options.auth]      --auth (already validated)
 * @param {object}  [options.toggles]   only the module flags actually passed
 * @param {boolean} [options.docker]    --docker / --no-docker, else undefined
 */
export async function resolveSelection({
  prompts,
  bare = false,
  skipPrompts = false,
  preset,
  db,
  auth,
  toggles = {},
  docker
}) {
  const bold = prompts.bold ?? ((s) => s);
  let sel;

  if (bare) {
    sel = presetSelection('minimal');
  } else if (skipPrompts) {
    sel = presetSelection(preset ?? 'api');
  } else {
    const picked = await prompts.choose(
      'Choose a preset:',
      presetChoices(),
      preset ?? 'api'
    );

    if (picked === 'custom') {
      const dbChoice = await prompts.choose(
        GROUPS.db.prompt,
        variantChoices('db'),
        GROUPS.db.default
      );
      const authChoice = await prompts.choose(
        GROUPS.auth.prompt,
        variantChoices('auth'),
        GROUPS.auth.default
      );

      const modules = {};
      // Every module is asked about, so adding one to the catalog cannot be
      // silently skipped in the interactive path.
      for (const [key, mod] of Object.entries(MODULES)) {
        modules[key] = await prompts.confirm(
          `Include ${bold(mod.label)}?`,
          false
        );
      }

      sel = {
        db: dbChoice,
        auth: authChoice,
        modules,
        docker: await prompts.confirm(
          `Include ${bold('Docker')} (Dockerfile + compose)?`,
          false
        )
      };
    } else {
      sel = presetSelection(picked);
    }
  }

  // Explicit flags always win over the preset and over what was answered.
  if (db) sel.db = db;
  if (auth) sel.auth = auth;
  for (const [key, on] of Object.entries(toggles)) sel.modules[key] = on;
  if (docker !== undefined) sel.docker = docker;

  return sel;
}
