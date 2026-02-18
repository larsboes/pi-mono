---
name: github
description: "Interact with GitHub using the `gh` CLI. Scripts for PR creation, review, releases, and CI management."
---

<!--
🌐 COMMUNITY SKILL

Part of the pi-mono open skills collection.
- Repository: https://github.com/larsboes/pi-mono
- License: MIT
- Author: {{author}}

Contributions welcome via GitHub issues and PRs.
Last synced: 2026-02-18 21:06:30
-->

# GitHub Skill

Use the `gh` CLI and helper scripts to interact with GitHub.

## Scripts

All scripts are in `./scripts/` directory.

### PR Creation

```bash
./scripts/pr-create.sh --title "feat: add auth" --body "Implements OAuth2"
./scripts/pr-create.sh --template --draft --reviewer octocat
./scripts/pr-create.sh --title "fix: typo" --base develop --label bug
```

Options:
- `--title "Title"` - PR title
- `--body "Body"` - PR body
- `--template` - Use .github/pull_request_template.md
- `--draft` - Create as draft
- `--base <branch>` - Target branch (default: main)
- `--reviewer <user>` - Request reviewer
- `--label <label>` - Add label

### PR Review

```bash
./scripts/pr-review.sh 123 --approve --body "LGTM!"
./scripts/pr-review.sh 123 --request-changes --body "Fix the typo"
./scripts/pr-review.sh 123 --checkout --comment
```

Options:
- `--approve [comment]` - Approve PR
- `--request-changes [msg]` - Request changes
- `--comment [msg]` - Add comment
- `--checkout` - Checkout PR locally first

### Release Management

```bash
./scripts/release.sh v1.0.0 --generate-notes
./scripts/release.sh v2.0.0-rc1 --prerelease --draft
./scripts/release.sh v1.0.0 --notes "Major release" --attach ./dist/app.zip
```

Options:
- `--name "Title"` - Release title
- `--notes "Notes"` - Release notes
- `--generate-notes` - Auto-generate from commits
- `--draft` - Create as draft
- `--prerelease` - Mark as prerelease
- `--target <commit>` - Target commit/branch
- `--attach <file>` - Attach file

### CI Status

```bash
./scripts/ci-status.sh --watch
./scripts/ci-status.sh --pr 123
./scripts/ci-status.sh --branch feature/auth --fail-fast
```

Options:
- `--watch` - Watch until completion
- `--fail-fast` - Exit on first failure
- `--pr <number>` - Check specific PR
- `--branch <name>` - Check specific branch

### CI Logs

```bash
./scripts/ci-logs.sh --failed
./scripts/ci-logs.sh --run 1234567890
./scripts/ci-logs.sh --latest --failed
```

Options:
- `--failed` - Show only failed step logs
- `--run <id>` - Show specific run
- `--latest` - Show latest run
- `--branch <name>` - Filter by branch

## Quick Reference

| Task | Command |
|------|---------|
| PR list | `gh pr list` |
| PR view | `gh pr view 123` |
| PR checkout | `gh pr checkout 123` |
| PR checks | `gh pr checks 123` |
| Issues list | `gh issue list --label bug` |
| CI runs | `gh run list` |
| CI view | `gh run view <id>` |

## Workflows

### PR Review Workflow

```bash
# 1. Checkout PR locally
gh pr checkout 123

# 2. Review changes
gh pr diff 123
gh pr view 123

# 3. Check CI status
gh pr checks 123 --watch
# OR using script:
./scripts/ci-status.sh --watch

# 4. Submit review
./scripts/pr-review.sh 123 --approve --body "LGTM"

# 5. Merge when ready
gh pr merge 123 --squash --delete-branch
```

### CI Debugging Decision Tree

```bash
# 1. See which jobs failed
gh pr checks <pr-number>

# 2. Get the run ID
gh run list --branch <branch> --limit 5

# 3. View failed logs
./scripts/ci-logs.sh --failed
# OR:
gh run view <run-id> --log-failed

# 4. Re-run if needed
gh run rerun <run-id> --failed
```

### Issue Triage

```bash
# List open issues
gh issue list --label "bug" --state open
gh issue list --label "help wanted"

# Search issues
gh issue list --search "authentication error"

# Close with comment
gh issue close 456 --comment "Fixed in #123"
```

## Common jq Recipes

```bash
# PRs with key fields
gh pr list --json number,title,author,headRefName --jq '.[] | "#\(.number): \(.title) by @\(.author.login)"'

# Count issues by label
gh issue list --json labels --jq '[.[].labels[].name] | group_by(.) | map({label: .[0], count: length}) | sort_by(-.count)'

# Failed workflow runs
gh run list --json conclusion,displayTitle,databaseId --jq '.[] | select(.conclusion == "failure")'

# Review decisions on PR
gh api repos/{owner}/{repo}/pulls/123/reviews --jq '.[] | "@\(.user.login): \(.state)"'
```

## API Examples

```bash
# Get PR files changed
gh api repos/owner/repo/pulls/55/files --jq '.[] | "\(.status): \(.filename)"'

# Get rate limit
gh api rate_limit --jq '.rate | "\(.remaining)/\(.limit) remaining"'

# List contributors
gh api repos/owner/repo/contributors --jq '.[] | "\(.login): \(.contributions) commits"'
```

## Tips

- Always specify `--repo owner/repo` when not in a git directory
- Use `--json` + `--jq` for structured output
- Scripts handle common patterns with better error messages
- CI logs can be huge; use `--failed` to filter

