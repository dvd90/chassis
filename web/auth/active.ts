/**
 * The auth provider this project uses.
 *
 * create-chassis rewrites the line below to the provider you chose
 * (`--auth clerk` makes it `./providers/clerk`) and deletes the rest.
 * Everything else in the app imports auth from here and never names a
 * provider directly — swapping providers is this one line.
 */
export * from './providers/none';
