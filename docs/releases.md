# Application versions and releases

The desktop profile menu and the signed-in mobile account menu display the
application version beside logout, for example `v0.2.0 · a1b2c3d`.
`GET /api/version` returns `version`, full `commit`, `builtAt` (UTC ISO timestamp),
and `environment`. The response is public and contains no credentials.

## Build identity

Next embeds one metadata snapshot in both server and browser bundles when
`npm run build` compiles the application. Restarting `npm start` does not
regenerate it. `npm run dev` takes a snapshot when the development server starts;
restart it to reflect new commits or package versions.

The version comes from `package.json`. The commit comes from
`VERCEL_GIT_COMMIT_SHA`, then `GITHUB_SHA`, then `git rev-parse HEAD`.
If no valid commit is available (for example in a source archive without Git),
the identifier is explicitly `unknown`. Environment comes from `VERCEL_ENV`,
falling back to production/development according to `NODE_ENV`.
On other CI providers, pass `GITHUB_SHA` with the full source commit to the build.
Do not override `NEXT_PUBLIC_APP_BUILD_INFO`: Next config owns that value.

## Release workflow

Release Please runs after pushes to `main`, which is this repository's integration
branch. It maintains a release PR updating `package.json`, `package-lock.json`,
the version manifest and `CHANGELOG.md`. Merge that PR to create a `vX.Y.Z` tag
and GitHub Release. It does not publish an npm package or deploy the application.
The initial manifest is `0.1.0`; the bootstrap commit excludes older history
from the first generated changelog.

Use Conventional Commits for changes merged into `main`:

- `fix(offers): correct address coordinates` increments the patch version.
- `feat(account): display application version` increments the minor version.
- `feat!: change the account contract` denotes a breaking change.
- `docs: ...`, `test: ...` and `chore: ...` alone do not trigger a release.

Before 1.0, breaking changes increment the minor version and ordinary fixes
increment the patch version. After 1.0, breaking changes increment the major.
For squash merges, use a Conventional Commit PR title as the squash message.
For regular merges, ensure the individual commits have Conventional Commit
messages. The release PR is the single manual checkpoint: review the changelog
and version before merging. Do not edit package versions for ordinary feature PRs.

## One-time GitHub setup

In repository **Settings → Actions → General → Workflow permissions**, enable
**Allow GitHub Actions to create and approve pull requests**. The workflow grants
its built-in `GITHUB_TOKEN` contents, issues and pull-request write access.
No additional secret is needed for release PRs, tags and GitHub Releases.

Resources created with `GITHUB_TOKEN` do not trigger other GitHub Actions
workflows. If checks on bot-created release PRs or tag-triggered deployment
workflows are needed, configure a GitHub App token or a scoped PAT and pass it
to Release Please's `token` input. Do not assume a tag will trigger deployment
with the default token.

## Releases versus deployments

A GitHub Release records a source version; it does not prove deployment succeeded.
If production deploys every merge to `main`, several builds can share the package
version. Their commit and build timestamp distinguish them. Preview deployments
also carry their own build identity. Rollbacks serve the old artifact's metadata.
To deploy only numbered releases, configure the hosting pipeline separately.

References: [Release Please Action](https://github.com/googleapis/release-please-action),
[manifest configuration](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md),
[Vercel system variables](https://vercel.com/docs/environment-variables/system-environment-variables).
