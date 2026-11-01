# Backup Recovery Copy (documented separately from agent execution)

Status: **Recovery copy only. Unverified.** Decision D-029. Nothing here is part of an agent run.

## 1. Purpose and boundaries

| Item | Value |
|---|---|
| Spreadsheet | `CSC Booking - Backup` |
| URL | https://docs.google.com/spreadsheets/d/10YjhBUPpJBEnbXz5zTqGoXEIVEIuuMZT4cCyiYJ7p3Q/edit |
| ID | `10YjhBUPpJBEnbXz5zTqGoXEIVEIuuMZT4cCyiYJ7p3Q` |
| Worksheet | `Calls DONE` |
| Role | **Recovery copy of the original source only** |
| Original (operational source) | `CSC  Booking - All Agents`, ID `1jRNPM4GJ4ctV5lgUVzyJhhq15tFdnT3jZ5TjHsAPbsI`, worksheet `Calls DONE`, GID `1314582701` |

- The backup is **not an agent input**. Agent runs, workflows, skills and configuration read only the original. The agent never reads or writes the backup.
- The synchronisation (script, schedule, trigger) is maintained **outside this repository**. This project does not run, modify, schedule or document its code. It is not part of the daily workflow (`workflows/daily-post-call-run.md`).
- Direction: original → backup. The original must never be modified by synchronisation.

## 2. What is unknown (nothing here is verified)

- Whether the backup is complete, current, and how often it refreshes.
- Whether it copies or overwrites rows, and how it treats columns the original does not have (such as a future AD).
- Whether it would erase or overwrite agent-owned data in column AD (blocks any source write, OD-43, `call-id-strategy.md` §0).
- Who owns the backup, who can edit it, and whether it has protected ranges.
- Whether a restore from it has ever been tested.

**Do not describe the backup as reliable until it has been independently verified** (read-only comparison of headers and row counts with the original, a documented refresh schedule, and a tested restore).

## 3. Use in recovery

Only after an incident and with the user's decision: compare the backup with the original read-only, and restore by a documented, user-approved procedure. The agent does not perform restores.
