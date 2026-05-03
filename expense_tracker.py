#!/usr/bin/env python3
"""Office game expense tracker.

Tracks sessions, payer/participants, and computes net balances where:
- Positive => person should receive money.
- Negative => person owes money.
"""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List


RATE_PER_HOUR = 200.0  # charged per hour for a group of up to 4 people
MAX_GROUP_SIZE = 4


@dataclass
class Session:
    date: str
    hours: float
    payer: str
    players: List[str]
    note: str = ""

    @property
    def total_cost(self) -> float:
        return self.hours * RATE_PER_HOUR


def normalize_name(name: str) -> str:
    return " ".join(name.strip().split())


def load_data(path: Path) -> Dict:
    if not path.exists():
        return {"team": [], "sessions": []}
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_data(path: Path, data: Dict) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def ensure_team_members(team: List[str], names: List[str]) -> None:
    known = set(team)
    for name in names:
        if name not in known:
            team.append(name)
            known.add(name)


def add_session(data: Dict, date: str, hours: float, payer: str, players: List[str], note: str = "") -> None:
    if hours <= 0:
        raise ValueError("Hours must be greater than 0")
    if len(players) == 0:
        raise ValueError("At least 1 player is required")
    if len(players) > MAX_GROUP_SIZE:
        raise ValueError(f"A session supports maximum {MAX_GROUP_SIZE} players")

    payer = normalize_name(payer)
    players = [normalize_name(p) for p in players]

    datetime.strptime(date, "%Y-%m-%d")  # validate date format

    ensure_team_members(data["team"], [payer] + players)

    data["sessions"].append(
        {
            "date": date,
            "hours": hours,
            "payer": payer,
            "players": players,
            "note": note,
        }
    )


def compute_balances(data: Dict) -> Dict[str, float]:
    balances: Dict[str, float] = {member: 0.0 for member in data.get("team", [])}

    for raw in data.get("sessions", []):
        session = Session(**raw)
        split = session.total_cost / len(session.players)

        balances.setdefault(session.payer, 0.0)
        balances[session.payer] += session.total_cost

        for player in session.players:
            balances.setdefault(player, 0.0)
            balances[player] -= split

    return balances


def suggest_settlements(balances: Dict[str, float], precision: float = 0.01) -> List[str]:
    creditors = sorted(
        [(name, amount) for name, amount in balances.items() if amount > precision],
        key=lambda x: x[1],
        reverse=True,
    )
    debtors = sorted(
        [(name, -amount) for name, amount in balances.items() if amount < -precision],
        key=lambda x: x[1],
        reverse=True,
    )

    i, j = 0, 0
    result = []

    while i < len(debtors) and j < len(creditors):
        debtor, debt = debtors[i]
        creditor, credit = creditors[j]

        transfer = min(debt, credit)
        result.append(f"{debtor} pays {creditor}: ₹{transfer:.2f}")

        debtors[i] = (debtor, debt - transfer)
        creditors[j] = (creditor, credit - transfer)

        if debtors[i][1] <= precision:
            i += 1
        if creditors[j][1] <= precision:
            j += 1

    return result


def print_sessions(data: Dict) -> None:
    sessions = data.get("sessions", [])
    if not sessions:
        print("No sessions recorded yet.")
        return

    print("\nSessions:")
    print("-" * 80)
    print(f"{'Date':<12} {'Hours':<7} {'Payer':<18} {'Players':<30} {'Cost':>8}")
    print("-" * 80)

    for s in sorted(sessions, key=lambda x: x["date"]):
        total = s["hours"] * RATE_PER_HOUR
        players = ", ".join(s["players"])
        print(f"{s['date']:<12} {s['hours']:<7.2f} {s['payer']:<18} {players:<30} ₹{total:>7.2f}")


def print_balances(data: Dict) -> None:
    balances = compute_balances(data)

    print("\nBalances (credit/debit):")
    print("-" * 40)
    for name, bal in sorted(balances.items(), key=lambda x: x[0]):
        sign = "+" if bal >= 0 else ""
        print(f"{name:<20} {sign}{bal:.2f}")

    settlements = suggest_settlements(balances)
    print("\nSuggested settlements:")
    if settlements:
        for s in settlements:
            print(f"- {s}")
    else:
        print("- No transfers needed.")


def export_csv(data: Dict, output: Path) -> None:
    sessions = sorted(data.get("sessions", []), key=lambda x: x["date"])
    with output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["date", "hours", "payer", "players", "total_cost", "note"])
        for s in sessions:
            writer.writerow(
                [
                    s["date"],
                    s["hours"],
                    s["payer"],
                    "|".join(s["players"]),
                    s["hours"] * RATE_PER_HOUR,
                    s.get("note", ""),
                ]
            )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Office game expense tracker")
    parser.add_argument("--db", default="tracker_data.json", help="Path to data file")

    sub = parser.add_subparsers(dest="command", required=True)

    add = sub.add_parser("add-session", help="Record a new game session")
    add.add_argument("--date", required=True, help="Date in YYYY-MM-DD")
    add.add_argument("--hours", type=float, required=True, help="Session duration in hours")
    add.add_argument("--payer", required=True, help="Who paid the bill")
    add.add_argument(
        "--players",
        nargs="+",
        required=True,
        help="Players who attended this session (1-4 names)",
    )
    add.add_argument("--note", default="", help="Optional note")

    sub.add_parser("report", help="Show sessions + balances")

    export = sub.add_parser("export-csv", help="Export session history to CSV")
    export.add_argument("--out", required=True, help="Output CSV path")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    db_path = Path(args.db)
    data = load_data(db_path)

    if args.command == "add-session":
        add_session(data, args.date, args.hours, args.payer, args.players, note=args.note)
        save_data(db_path, data)
        print("Session added.")
    elif args.command == "report":
        print_sessions(data)
        print_balances(data)
    elif args.command == "export-csv":
        export_csv(data, Path(args.out))
        print(f"Exported CSV: {args.out}")


if __name__ == "__main__":
    main()
