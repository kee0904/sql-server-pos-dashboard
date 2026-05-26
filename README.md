# SQL Server POS Dashboard

A local HTML dashboard for connecting to SQL Server, running POS queries, previewing tables, creating quick reports, and exporting data for Power BI.

## Features

- Connect to a local SQL Server instance such as `.\A2019`
- Select a database and show database size
- Run read-only `SELECT` queries
- Preview result tables with scrolling and resizable columns
- POS-focused report analysis for `Pos`, `PosDtl`, and `PosPayment`
- Filters for date range and item group
- Quick reports:
  - Daily Sales
  - Daily Transactions
  - Item Sales
  - Payment Summary
  - Top Items
  - Cancelled Sales
  - Printable Daily Sales Report Preview
- Bar chart preview
- CSV export
- Power BI query helper

## Run Locally

```powershell
node preview-server.js
```

Then open:

```text
http://127.0.0.1:8010/dashboard-preview.html
```

## Requirements

- Windows
- Node.js
- SQL Server
- PowerShell
- SQL Server access using Windows authentication or SQL username/password

## Files

- `dashboard-preview.html` - frontend dashboard
- `preview-server.js` - local server and SQL API
- `query-sql.ps1` - SQL Server query runner
