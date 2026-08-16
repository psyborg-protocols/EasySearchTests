# Inventory Transition Module (Access → Odoo)

A **temporary, standalone** module that bridges the gap while inventory
management moves from the old Access DB export to Odoo Online.

## What it does

While the module is active:

- A banner tells users that **live on-hand counts are now in Odoo** — the app
  no longer shows inventory numbers. Any inventory cell the app renders is
  replaced with **"Check Odoo"**.
- The stock moves that were still **pending in Access at cutover** (customer
  orders not yet shipped, supplier orders not yet received) are listed in a
  **Pending Inventory Adjustments** panel — 69 lines across 37 parts, exported
  2026-08-12. These moves are *not* part of Odoo's starting inventory, so they
  must be recorded in Odoo when they actually happen.
- If a part with pending moves shows up in the product table, its inventory
  cell also shows a badge like `3 pending: +3,000 in / −1,200 out`. Clicking
  it jumps to the panel filtered to that part, with per-part totals.
- Each move has a **check-off box**. Check it when the shipment/receipt has
  actually been posted in Odoo. Check-off state is saved automatically to
  OneDrive and survives refreshes, new sessions and redeploys.

## Where the data lives

- **The pending moves themselves** are frozen in `transition-data.js`
  (generated from `tblOrder_hdr`/`tblOrder_detail` and
  `tblSupplierOrder_hdr`/`tblSupplierOrder_detail`: lines with remaining
  quantity > 0 whose order was not yet marked shipped/received).
- **Check-off state** is a small JSON file created automatically on first
  sign-in at `OneDrive → BWEasySearch-Transition/pending-adjustments-state.json`
  (in the signed-in user's OneDrive). It only stores which lines are done,
  when, and by whom — safe to keep as a record after the transition.

> **Multiple users?** By default each user gets their own state file in their
> own OneDrive. To share one checklist, put the file on a shared document
> library: set `driveId` in the `CONFIG` block at the top of `transition.js`
> to the shared drive's Graph drive id.

## Configuration

All settings are in the `CONFIG` block at the top of `transition.js`:

| Setting | Default | Purpose |
|---|---|---|
| `enabled` | `true` | Master switch — set `false` to turn the module off without removing it |
| `stateFolder` / `stateFileName` | `BWEasySearch-Transition/pending-adjustments-state.json` | Where check-off state is stored in OneDrive |
| `driveId` | `null` | Set to a shared drive id to share one checklist between users |
| `odooUrl` | `null` | If set, "Check Odoo" becomes a link to your Odoo inventory page |
| `tableSelector` etc. | `#productTable` | How the module finds the app's inventory cells |

## Removal (when the transition is done)

1. Delete the `src/transition/` folder.
2. Remove the marked `BEGIN/END INVENTORY TRANSITION MODULE` script block in
   `index.html`.
3. In `src/auth.js`, revert the login scope from `Files.ReadWrite` back to
   `Files.Read` (marked with a `TRANSITION MODULE` comment).
4. (Optional) Delete `BWEasySearch-Transition/` from OneDrive, or keep it as a
   record of the transition.

Nothing else in the app references the module.
