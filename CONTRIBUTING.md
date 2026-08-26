# Contributing to Tablinum

This repository uses a standard GitHub flow: **feature branches**, **pull requests**, **tags**, and **releases**. Direct commits to `main` are reserved for emergencies.

## Branching

```bash
git checkout main
git pull origin main
git checkout -b feat/short-description
```

| Prefix | Use |
| --- | --- |
| `feat/` | New behaviour |
| `fix/` | Bug fix |
| `docs/` | Documentation only |
| `chore/` | Tooling, CI, dependencies |

## Commits

Commits describe **why** the change exists, in the imperative mood (e.g. “Add frozen column headers”).

Keep unrelated work off the same commit. Do not commit `.env` files, secrets, or `node_modules`.

## Pull requests

1. `git push -u origin HEAD`
2. Open a pull request targeting `main`
3. Merge after review (squash or merge commit; avoid rewriting published `main` history)

## Releases

Versions follow [SemVer](https://semver.org/) (`MAJOR.MINOR.PATCH`).

```bash
git checkout main
git pull origin main
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --notes "Summary of the release."
```

A GitHub **Release** is a tag plus notes (and optional assets). The **Packages** sidebar is a different product (npm, Docker, etc. published to GitHub Packages) and is not used until a package is actually published.
