/**
 * The documentation site's table of contents.
 *
 * Every markdown file under docs/ must appear here — build.mjs fails if one
 * does not, so adding a doc forces adding it to the nav instead of quietly
 * shipping a page nobody can reach.
 */
export const SECTIONS = [
  {
    title: 'Overview',
    pages: [
      { file: 'README.md', title: 'Chassis', blurb: 'What it is, in one page' }
    ]
  },
  {
    title: 'Guides',
    pages: [
      { file: 'docs/getting-started.md', title: 'Getting started' },
      { file: 'docs/guides/building-an-api.md', title: 'Building an API' },
      { file: 'docs/guides/database.md', title: 'Database' },
      { file: 'docs/guides/authentication.md', title: 'Authentication' },
      { file: 'docs/guides/password-auth.md', title: 'Password sign-in' },
      { file: 'docs/guides/magic-link.md', title: 'Magic link' },
      { file: 'docs/guides/sessions.md', title: 'Sessions' },
      { file: 'docs/guides/transports.md', title: 'Mail & SMS transports' },
      { file: 'docs/guides/web.md', title: 'Web front end' },
      { file: 'docs/guides/mcp.md', title: 'MCP server' },
      { file: 'docs/guides/payments-x402.md', title: 'Payments (x402)' },
      { file: 'docs/guides/deployment.md', title: 'Deployment' }
    ]
  },
  {
    title: 'Concepts',
    pages: [
      { file: 'docs/architecture.md', title: 'Architecture' },
      { file: 'docs/modules.md', title: 'Modules' }
    ]
  },
  {
    title: 'Reference',
    pages: [
      { file: 'docs/reference/cli.md', title: 'CLI & scripts' },
      { file: 'docs/reference/configuration.md', title: 'Configuration' },
      { file: 'docs/reference/core-api.md', title: 'Core API' }
    ]
  },
  {
    title: 'Project',
    pages: [
      { file: 'AGENTS.md', title: 'Agent guide' },
      { file: 'docs/maintainers.md', title: 'Maintainers' },
      {
        file: 'docs/design/magic-link.md',
        title: 'Design: magic link',
        blurb: 'Magic-link auth and refresh sessions, as designed'
      }
    ]
  }
];

/** docs/README.md is the index those sections replace, so it is not a page. */
export const NOT_A_PAGE = ['docs/README.md'];
