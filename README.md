# Office Games Expense Tracker (ReactJS)

This project is rebuilt from scratch using **ReactJS + Vite**.

## Features
- Add game sessions with date, hours, payer, players, note.
- Billing rule: **₹200/hour**, with up to **4 players** per session.
- Track balances:
  - Positive = should receive money
  - Negative = owes money
- See suggested settlements (who pays whom).
- Data persisted in browser `localStorage`.

## Development
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

## Deploy to GitHub Pages
- Build with `npm run build`.
- Deploy the generated `dist/` folder using your preferred Pages workflow.
