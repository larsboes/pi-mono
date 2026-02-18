# Scripts

Helper scripts for managing the pi-mono skills repository.

## install-skills.sh

Install skills from this repository to your local pi setup.

### Usage

```bash
# Install all skills
./install-skills.sh

# Install specific skill
./install-skills.sh github

# Preview installation (dry run)
./install-skills.sh --dry-run

# List available skills
./install-skills.sh --list

# Show help
./install-skills.sh --help
```

### What it does

1. Copies skills from `pi-mono/skills/` to `~/.pi/skills/`
2. Creates the `~/.pi/skills/` directory if it doesn't exist
3. Overwrites existing skills (updates them)
4. Shows progress and summary

### Requirements

- pi must be installed
- `~/.pi/skills/` directory will be created if needed
