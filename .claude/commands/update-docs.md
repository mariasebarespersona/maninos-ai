---
description: Update CLAUDE.md with the latest changes. Run this after every significant code change to keep documentation in sync. Pass a description of what changed as arguments.
---

# Auto-Update CLAUDE.md Documentation

Update `/Users/mariasebares/Documents/RAMA_AI/maninos-ai/docs/CLAUDE.md` to reflect the latest codebase changes.

## Step 1: Analyze What Changed

Run these commands to understand the scope of changes:

```bash
cd /Users/mariasebares/Documents/RAMA_AI/maninos-ai
git log --oneline -5
git diff HEAD~1 --stat
```

Also consider the user's description of changes: $ARGUMENTS

## Step 2: Determine What Sections Need Updates

Check each section of CLAUDE.md against the changes:

1. **Project Structure** — Did new files/directories get added? New routes, components, migrations?
2. **Tech Stack** — Were new dependencies or tools added?
3. **Database Tables** — Were new tables or columns added? Update the tables section.
4. **Migrations** — Update the migration range (e.g., `001-073`) to reflect the latest migration number.
5. **Recent Work** — Add a new bullet point to the "Recent Work" section summarizing the changes with the current date.
6. **Key File Paths** — Were important new files created that developers should know about?
7. **Business Rules** — Did any business logic or formulas change?
8. **Gotchas & Warnings** — Are there new gotchas from this change?

## Step 3: Make the Updates

Read the current CLAUDE.md:
```
Read /Users/mariasebares/Documents/RAMA_AI/maninos-ai/docs/CLAUDE.md
```

Then use the Edit tool to update ONLY the sections that need changes. Rules:
- Keep the overall structure intact
- Add to "Recent Work" section with today's date
- Update migration numbers if new migrations were added
- Update file tree if significant new files were added
- Keep descriptions concise (1-2 lines per item)
- Do NOT rewrite sections that haven't changed
- CLAUDE.md last-updated date should be updated in the header

## Step 4: Verify

After editing, verify the file is still well-formed:
```bash
wc -l /Users/mariasebares/Documents/RAMA_AI/maninos-ai/docs/CLAUDE.md
```
- Should be under 800 lines (warn if approaching limit)
- Ensure no broken markdown formatting

## Step 5: Report

Output a brief summary of what was updated:
```
Updated CLAUDE.md:
- [section name]: [what changed]
- [section name]: [what changed]
```
