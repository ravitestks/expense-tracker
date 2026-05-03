import { useEffect, useMemo, useState } from 'react';

const RATE_PER_HOUR = 200;
const MAX_PLAYERS = 4;
const STORAGE_KEY = 'office-games-expense-tracker-v2';

const normalizeName = (value) => value.trim().replace(/\s+/g, ' ');

const computeBalances = (members, sessions) => {
  const balances = Object.fromEntries(members.map((name) => [name, 0]));

  sessions.forEach((s) => {
    const total = s.hours * RATE_PER_HOUR;
    const split = total / s.players.length;

    balances[s.payer] = (balances[s.payer] || 0) + total;
    s.players.forEach((p) => {
      balances[p] = (balances[p] || 0) - split;
    });
  });

  return balances;
};

const suggestedSettlements = (balances) => {
  const eps = 0.01;
  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > eps)
    .sort((a, b) => b[1] - a[1]);

  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < -eps)
    .map(([name, amount]) => [name, -amount])
    .sort((a, b) => b[1] - a[1]);

  const moves = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const [debtor, debt] = debtors[i];
    const [creditor, credit] = creditors[j];
    const payment = Math.min(debt, credit);

    moves.push(`${debtor} pays ${creditor}: ₹${payment.toFixed(2)}`);

    debtors[i][1] -= payment;
    creditors[j][1] -= payment;

    if (debtors[i][1] <= eps) i += 1;
    if (creditors[j][1] <= eps) j += 1;
  }

  return moves;
};

function App() {
  const [team, setTeam] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState('');

  const [form, setForm] = useState({
    date: '',
    hours: '',
    payer: '',
    players: '',
    note: ''
  });

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      setTeam(data.team || []);
      setSessions(data.sessions || []);
    } catch {
      setMessage('Could not read saved data.');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ team, sessions }));
  }, [team, sessions]);

  const balances = useMemo(() => computeBalances(team, sessions), [team, sessions]);
  const settlements = useMemo(() => suggestedSettlements(balances), [balances]);

  const updateField = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onAddSession = (e) => {
    e.preventDefault();
    setMessage('');

    try {
      const payer = normalizeName(form.payer);
      const players = form.players
        .split(',')
        .map(normalizeName)
        .filter(Boolean);
      const hours = Number(form.hours);

      if (!form.date) throw new Error('Date is required.');
      if (!(hours > 0)) throw new Error('Hours must be greater than 0.');
      if (players.length < 1 || players.length > MAX_PLAYERS) {
        throw new Error(`Players must be between 1 and ${MAX_PLAYERS}.`);
      }
      if (!payer) throw new Error('Payer is required.');

      const nextSession = {
        date: form.date,
        hours,
        payer,
        players,
        note: form.note.trim()
      };

      setSessions((prev) => [...prev, nextSession]);
      setTeam((prev) => {
        const names = new Set(prev);
        [payer, ...players].forEach((n) => names.add(n));
        return [...names];
      });

      setForm({ date: '', hours: '', payer: '', players: '', note: '' });
      setMessage('Session added.');
    } catch (err) {
      setMessage(err.message);
    }
  };

  const clearAll = () => {
    if (!window.confirm('Delete all sessions and balances?')) return;
    setTeam([]);
    setSessions([]);
    setMessage('All data cleared.');
  };

  return (
    <div className="container">
      <h1>Office Games Expense Tracker</h1>
      <p className="subtitle">React app • ₹200/hour • up to 4 players per session</p>

      <section className="card">
        <h2>Add Session</h2>
        <form onSubmit={onAddSession}>
          <div className="grid">
            <label>
              Date
              <input type="date" name="date" value={form.date} onChange={updateField} required />
            </label>

            <label>
              Hours
              <input type="number" min="0.5" step="0.5" name="hours" value={form.hours} onChange={updateField} required />
            </label>

            <label>
              Payer
              <input name="payer" value={form.payer} onChange={updateField} placeholder="Alice" required />
            </label>

            <label>
              Players (comma separated)
              <input name="players" value={form.players} onChange={updateField} placeholder="Alice, Bob, Carol" required />
            </label>
          </div>

          <label>
            Note
            <textarea rows="2" name="note" value={form.note} onChange={updateField} />
          </label>

          <div className="actions">
            <button type="submit">Add Session</button>
            <button type="button" className="danger" onClick={clearAll}>Clear All</button>
          </div>
        </form>
        {message && <p className="message">{message}</p>}
      </section>

      <section className="card">
        <h2>Session History</h2>
        <table>
          <thead>
            <tr><th>Date</th><th>Hours</th><th>Payer</th><th>Players</th><th>Total</th></tr>
          </thead>
          <tbody>
            {[...sessions].sort((a, b) => a.date.localeCompare(b.date)).map((s, idx) => (
              <tr key={`${s.date}-${idx}`}>
                <td>{s.date}</td>
                <td>{s.hours.toFixed(2)}</td>
                <td>{s.payer}</td>
                <td>{s.players.join(', ')}</td>
                <td>₹{(s.hours * RATE_PER_HOUR).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Balances</h2>
        <table>
          <thead><tr><th>Name</th><th>Balance</th></tr></thead>
          <tbody>
            {Object.entries(balances).sort((a, b) => a[0].localeCompare(b[0])).map(([name, amount]) => (
              <tr key={name}>
                <td>{name}</td>
                <td className={amount >= 0 ? 'pos' : 'neg'}>{amount >= 0 ? '+' : ''}{amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Suggested Settlements</h2>
        <ul>
          {settlements.length ? settlements.map((s, i) => <li key={i}>{s}</li>) : <li>No settlements needed.</li>}
        </ul>
      </section>
    </div>
  );
}

export default App;
