const KEY = 'meu-controle-v1';
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => today().slice(0, 7);
const makeId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const monthOf = (date) => date.slice(0, 7);
const addMonths = (month, delta) => {
  const d = new Date(`${month}-01T12:00:00`);
  d.setMonth(d.getMonth() + delta);
  return d.toISOString().slice(0, 7);
};
const lastDayOfMonth = (month) => {
  const d = new Date(`${month}-01T12:00:00`);
  d.setMonth(d.getMonth() + 1, 0);
  return d.getDate();
};
const startOfWeek = () => {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
};

const categories = {
  expense: [
    { name: 'Alimentação', icon: '🍽️' },
    { name: 'Transporte', icon: '🚕' },
    { name: 'Mercado', icon: '🛒' },
    { name: 'Casa', icon: '🏠' },
    { name: 'Lazer', icon: '🎬' }
  ],
  income: [
    { name: 'Salário', icon: '💼' },
    { name: 'Extra', icon: '💸' },
    { name: 'Presente', icon: '🎁' }
  ]
};

const seed = {
  version: 4,
  selectedMonth: currentMonth(),
  budget: 2500,
  categoryBudgets: {},
  categories,
  accounts: [
    { id: 'cash', name: 'Carteira', icon: '👛', initialBalance: 0, kind: 'cash' },
    { id: 'bank', name: 'Conta principal', icon: '🏦', initialBalance: 0, kind: 'bank' },
    { id: 'card', name: 'Cartão de crédito', icon: '💳', initialBalance: 0, kind: 'credit', limit: 3000, closingDay: 25, dueDay: 5 }
  ],
  transactions: [
    { id: 'income-seed', type: 'income', category: 'Salário', icon: '💼', accountId: 'bank', amount: 5200, date: `${currentMonth()}-05`, note: 'Pagamento mensal' },
    { id: 'market-seed', type: 'expense', category: 'Mercado', icon: '🛒', accountId: 'bank', amount: 248.7, date: `${currentMonth()}-11`, note: 'Supermercado' },
    { id: 'ride-seed', type: 'expense', category: 'Transporte', icon: '🚕', accountId: 'cash', amount: 32.5, date: `${currentMonth()}-11`, note: 'Corrida' }
  ]
};

function migrate(old) {
  if (!old) return structuredClone(seed);
  const base = {
    ...seed,
    ...old,
    version: 4,
    selectedMonth: old.selectedMonth || currentMonth(),
    categoryBudgets: old.categoryBudgets || {},
    accounts: old.accounts && old.accounts.length ? old.accounts : seed.accounts,
    categories: old.categories || categories
  };
  base.transactions = (old.transactions || []).map(t => ({
    ...t,
    id: String(t.id || makeId()),
    accountId: t.accountId || 'cash'
  }));
  return base;
}

let state = migrate(JSON.parse(localStorage.getItem(KEY) || 'null'));
let page = 'home';
let lastDeleted = null;
let statsFilter = 'month';

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
}
persist();

const money = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const monthLabel = m => new Date(`${m}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, x => x.toUpperCase());
const dateText = d => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
const dateFull = d => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const changeMonth = (m, delta) => addMonths(m, delta);
const dateForSelectedMonth = () => today().startsWith(state.selectedMonth) ? today() : `${state.selectedMonth}-01`;
const inMonth = () => state.transactions.filter(t => t.date?.startsWith(state.selectedMonth));
const totals = (list = inMonth()) => list.reduce((a, t) => {
  if (t.type === 'income') a.income += Number(t.amount);
  if (t.type === 'expense') a.expense += Number(t.amount);
  return a;
}, { income: 0, expense: 0 });
const accountName = id => state.accounts.find(a => a.id === id)?.name || 'Conta';

const isCredit = (acc) => acc?.kind === 'credit';

function accountBalance(account) {
  if (isCredit(account)) return 0;
  return state.transactions.reduce((balance, t) => {
    const a = Number(t.amount || 0);
    if (t.type === 'income' && t.accountId === account.id) return balance + a;
    if (t.type === 'expense' && t.accountId === account.id) return balance - a;
    if (t.type === 'transfer' && t.fromAccountId === account.id) return balance - a;
    if (t.type === 'transfer' && t.toAccountId === account.id) return balance + a;
    if (t.type === 'invoice_payment' && t.fromAccountId === account.id) return balance - a;
    return balance;
  }, Number(account.initialBalance || 0));
}

function creditUsed(account) {
  const expenses = state.transactions
    .filter(t => t.type === 'expense' && t.accountId === account.id)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const paid = state.transactions
    .filter(t => t.type === 'invoice_payment' && t.cardId === account.id)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  return Math.max(expenses - paid, 0);
}

function creditInvoice(account, month) {
  return state.transactions.filter(t => {
    if (t.type !== 'expense' || t.accountId !== account.id) return false;
    if (t.invoiceMonth) return t.invoiceMonth === month;
    return monthOf(t.date) === month;
  });
}

function creditInvoiceTotal(account, month) {
  return creditInvoice(account, month).reduce((s, t) => s + Number(t.amount || 0), 0);
}

function invoiceMonthFor(account, date) {
  const m = monthOf(date);
  const day = Number(date.slice(8, 10));
  return day <= (account.closingDay || 25) ? m : addMonths(m, 1);
}

function buildInstallments({ account, category, icon, note, total, date, installments }) {
  const entries = [];
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / installments);
  let restCents = totalCents - baseCents * installments;
  const firstInvoice = invoiceMonthFor(account, date);

  for (let i = 1; i <= installments; i++) {
    const cents = i === installments ? baseCents + restCents : baseCents;
    restCents = 0;
    const amount = cents / 100;
    const invoiceMonth = addMonths(firstInvoice, i - 1);
    const dueDay = Math.min(account.dueDay || 5, lastDayOfMonth(invoiceMonth));
    const dueDate = `${invoiceMonth}-${String(dueDay).padStart(2, '0')}`;

    entries.push({
      id: makeId(),
      type: 'expense',
      category,
      icon,
      accountId: account.id,
      amount,
      date: dueDate,
      note: note ? `${note} (${i}/${installments})` : `Parcela ${i}/${installments}`,
      installment: { current: i, total: installments, purchaseDate: date, totalAmount: total },
      invoiceMonth,
      groupId: `g-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
    });
  }
  const groupId = entries[0].groupId;
  entries.forEach(e => e.groupId = groupId);
  return entries;
}

function escapeHtml(value) {
  const el = document.createElement('span');
  el.textContent = value || '';
  return el.innerHTML;
}

function monthChanger() {
  return `<button class="icon-btn" data-month="-1" aria-label="Mês anterior">‹</button><span class="period">${monthLabel(state.selectedMonth)}</span><button class="icon-btn" data-month="1" aria-label="Próximo mês">›</button>`;
}

function transactionHTML(t) {
  const transfer = t.type === 'transfer';
  const invoicePayment = t.type === 'invoice_payment';
  const card = state.accounts.find(a => a.id === t.accountId);
  const isCardTx = !transfer && !invoicePayment && isCredit(card);

  let meta;
  if (transfer) {
    meta = `${accountName(t.fromAccountId)} → ${accountName(t.toAccountId)}`;
  } else if (invoicePayment) {
    const c = state.accounts.find(a => a.id === t.cardId);
    meta = `Pagamento fatura ${c ? c.icon + ' ' + c.name : ''}`;
  } else if (isCardTx) {
    meta = `${card.icon} ${escapeHtml(card.name)}${t.note ? ` · ${escapeHtml(t.note)}` : ''}`;
  } else {
    meta = `${accountName(t.accountId)}${t.note ? ` · ${escapeHtml(t.note)}` : ''}`;
  }

  const instBadge = t.installment ? `<span class="badge-installment">${t.installment.current}/${t.installment.total}</span>` : '';
  const cardBadge = isCardTx ? `<span class="badge-card">💳</span>` : '';

  return `<article class="transaction" data-tx-id="${t.id}">
    <div class="category-icon">${t.icon || '↔️'}</div>
    <div class="transaction-info">
      <div class="transaction-name">${escapeHtml(t.category || 'Transferência')}${instBadge}${cardBadge}</div>
      <div class="transaction-note">${meta}</div>
    </div>
    <div class="amount ${transfer ? 'transfer' : invoicePayment ? 'income' : t.type}">${transfer ? '↔' : invoicePayment ? '✓' : t.type === 'income' ? '+' : '−'} ${money(t.amount)}</div>
  </article>`;
}

function groupedTransactions(limit, list = null) {
  const source = list || inMonth();
  const groups = {};
  [...source]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit || 999)
    .forEach(t => (groups[t.date] ??= []).push(t));

  return Object.entries(groups).map(([date, list]) => `
    <div class="day-group">
      <div class="day-label">${date === today() ? 'Hoje' : dateText(date)}</div>
      <div class="transactions">${list.map(transactionHTML).join('')}</div>
    </div>`).join('');
}

function home() {
  const t = totals();
  const balance = state.accounts.reduce((sum, a) => sum + accountBalance(a), 0);
  const cards = state.accounts.filter(isCredit);
  const totalInvoice = cards.reduce((s, c) => s + creditInvoiceTotal(c, state.selectedMonth), 0);

  const alertCards = cards.filter(c => {
    const used = creditUsed(c);
    return c.limit && used / c.limit >= 0.8;
  });

  return `<header class="top">
    <div class="topbar">${monthChanger()}</div>
    <div class="balance-label">Saldo total em contas</div>
    <div class="balance">${money(balance)}</div>
    <div class="summary">
      <div><span>↓ Receitas do mês</span><b>${money(t.income)}</b></div>
      <div><span>↑ Despesas do mês</span><b>${money(t.expense)}</b></div>
    </div>
    ${totalInvoice > 0 ? `<div class="summary" style="margin-top:10px"><div style="grid-column:1/-1"><span>💳 Fatura de ${monthLabel(state.selectedMonth)}</span><b>${money(totalInvoice)}</b></div></div>` : ''}
  </header>
  <div class="content">
    ${alertCards.map(c => {
      const used = creditUsed(c);
      const pct = Math.round(used / c.limit * 100);
      return `<div class="alert-banner ${pct >= 95 ? 'danger' : ''}">
        ⚠️ <span><b>${escapeHtml(c.name)}</b> está em ${pct}% do limite (${money(used)} de ${money(c.limit)})</span>
      </div>`;
    }).join('')}

    <div class="section-head">
      <h2 class="section-title">Lançamentos recentes</h2>
      <button class="link" data-go="all">Ver todos</button>
    </div>
    ${groupedTransactions(5) || '<div class="empty"><b>Nenhum lançamento neste mês</b>Use o botão + para registrar uma movimentação.</div>'}
  </div>`;
}

function stats() {
  const filterLabels = { day: 'Hoje', week: 'Semana', month: 'Mês', year: 'Ano', all: 'Tudo' };
  let list;
  if (statsFilter === 'day') list = state.transactions.filter(t => t.date === today());
  else if (statsFilter === 'week') list = state.transactions.filter(t => t.date >= startOfWeek() && t.date <= today());
  else if (statsFilter === 'month') list = inMonth();
  else if (statsFilter === 'year') list = state.transactions.filter(t => t.date?.startsWith(today().slice(0, 4)));
  else list = state.transactions;

  const t = totals(list);
  const percent = t.income ? Math.round(t.expense / t.income * 100) : 0;

  const byCategory = {};
  list.filter(x => x.type === 'expense').forEach(x => {
    if (!byCategory[x.category]) byCategory[x.category] = { icon: x.icon, total: 0, count: 0 };
    byCategory[x.category].total += Number(x.amount);
    byCategory[x.category].count++;
  });
  const topCats = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);
  const values = topCats.map(x => x[1].total);
  const max = Math.max(...values, 1);

  const prevMonth = addMonths(state.selectedMonth, -1);
  const prevList = state.transactions.filter(x => x.date?.startsWith(prevMonth));
  const prevTotals = totals(prevList);
  const compareExpense = prevTotals.expense ? ((t.expense - prevTotals.expense) / prevTotals.expense * 100) : 0;
  const compareIncome = prevTotals.income ? ((t.income - prevTotals.income) / prevTotals.income * 100) : 0;

  return `<header class="top">
    <div class="topbar">${monthChanger()}</div>
    <div class="balance-label">Saldo no período (${filterLabels[statsFilter]})</div>
    <div class="balance">${money(t.income - t.expense)}</div>
  </header>
  <div class="content">
    <div class="period-filter">
      ${Object.entries(filterLabels).map(([k, v]) => `<button data-filter="${k}" class="${statsFilter === k ? 'active' : ''}">${v}</button>`).join('')}
    </div>

    <h2 class="section-title">Despesas por categoria</h2>
    <div class="chart-card">
      <div class="legend"><span><i class="dot" style="background:#6958e8"></i>Top ${Math.min(values.length, 7)} categorias</span></div>
      <div class="chart">
        ${values.length
          ? values.slice(0, 7).map((v, i) => `<i class="bar" data-day="${i + 1}" style="height:${Math.max(12, v / max * 100)}%"></i>`).join('')
          : '<span class="empty">Sem despesas no período.</span>'}
      </div>
    </div>

    ${topCats.length ? `
    <div class="panel" style="margin-top:15px">
      <strong>Top categorias</strong>
      ${topCats.slice(0, 5).map(([name, data], i) => `
        <div class="top-cat-row">
          <div class="rank">${i + 1}</div>
          <div class="info">
            <b>${data.icon} ${escapeHtml(name)}</b>
            <small>${data.count} lançamento(s)</small>
          </div>
          <div class="val">${money(data.total)}</div>
        </div>`).join('')}
    </div>` : ''}

    <div class="panel" style="margin-top:15px">
      <strong>Resumo do período</strong>
      <div class="row">
        <span class="stat-number" style="color:var(--pink)">${money(t.expense)}</span>
        <span style="color:var(--muted);font-size:12px">${percent}% das receitas</span>
      </div>
      <div class="budget-progress ${percent > 100 ? 'danger' : percent > 80 ? 'warn' : ''}">
        <i style="width:${Math.min(percent, 100)}%"></i>
      </div>
    </div>

    ${prevList.length ? `
    <div class="panel" style="margin-top:15px">
      <strong>Comparativo com ${monthLabel(prevMonth)}</strong>
      <div class="comparison-row">
        <span>↑ Despesas</span>
        <span class="delta ${compareExpense > 0 ? 'up' : 'down'}">
          ${compareExpense > 0 ? '+' : ''}${compareExpense.toFixed(1)}%
        </span>
      </div>
      <div class="comparison-row">
        <span>↓ Receitas</span>
        <span class="delta ${compareIncome < 0 ? 'up' : 'down'}">
          ${compareIncome > 0 ? '+' : ''}${compareIncome.toFixed(1)}%
        </span>
      </div>
    </div>` : ''}
  </div>`;
}

function budget() {
  const t = totals();
  const used = state.budget ? Math.min(t.expense / state.budget * 100, 100) : 0;
  const over = t.expense > state.budget;

  const byCategory = {};
  inMonth().filter(x => x.type === 'expense').forEach(x => {
    byCategory[x.category] = (byCategory[x.category] || 0) + Number(x.amount);
  });

  return `<header class="top">
    <div class="topbar">${monthChanger()}</div>
    <div class="balance-label">Orçamento mensal</div>
    <div class="balance">${money(state.budget)}</div>
  </header>
  <div class="content">
    <h2 class="section-title">Seu orçamento</h2>
    <div class="panel">
      <div class="row">
        <strong>Despesas de ${monthLabel(state.selectedMonth)}</strong>
        <span>${Math.round(used)}%</span>
      </div>
      <div class="budget-progress ${over ? 'danger' : used > 80 ? 'warn' : ''}"><i style="width:${used}%"></i></div>
      <div class="row" style="font-size:13px;color:var(--muted)">
        <span>${money(t.expense)} utilizado</span>
        <span>${money(Math.max(state.budget - t.expense, 0))} restante</span>
      </div>
    </div>
    <button class="save" id="editBudget" style="margin-top:12px">Definir orçamento geral</button>

    <h2 class="section-title" style="margin-top:24px">Metas por categoria</h2>
    <div class="setting-list">
      ${state.categories.expense.map(c => {
        const spent = byCategory[c.name] || 0;
        const budgetCat = state.categoryBudgets[c.name] || 0;
        const pct = budgetCat ? Math.min(spent / budgetCat * 100, 100) : 0;
        return `
        <div class="setting category-row" data-cat-budget="${c.name}">
          <span class="s-icon">${c.icon}</span>
          <span style="flex:1">
            <strong>${escapeHtml(c.name)}</strong>
            <small>${budgetCat ? `${money(spent)} de ${money(budgetCat)}` : 'Sem meta definida'}</small>
            ${budgetCat ? `<div class="budget-progress ${spent > budgetCat ? 'danger' : pct > 80 ? 'warn' : ''}" style="margin:6px 0 0"><i style="width:${pct}%"></i></div>` : ''}
          </span>
          <b class="chev">›</b>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function settings() {
  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" style="opacity:0">‹</button>
      <span class="period">Meu Controle</span>
      <button class="icon-btn" id="searchBtn" aria-label="Buscar">🔍</button>
    </div>
    <div class="balance-label">Organize sua vida financeira</div>
    <div class="balance" style="font-size:22px">Configurações</div>
  </header>
  <div class="content">
    <div class="setting-list">
      <button class="setting" data-go="accounts">
        <span class="s-icon">👛</span>
        <span><strong>Contas e cartões</strong><small>${state.accounts.length} cadastrado(s)</small></span>
        <b class="chev">›</b>
      </button>
      <button class="setting" data-go="categories">
        <span class="s-icon">▦</span>
        <span><strong>Categorias</strong><small>Receitas e despesas</small></span>
        <b class="chev">›</b>
      </button>
      <button class="setting" data-go="installments">
        <span class="s-icon">💳</span>
        <span><strong>Compras parceladas</strong><small>Parcelas em aberto</small></span>
        <b class="chev">›</b>
      </button>
      <button class="setting" data-go="invoices">
        <span class="s-icon">🧾</span>
        <span><strong>Faturas do cartão</strong><small>Pagar faturas abertas</small></span>
        <b class="chev">›</b>
      </button>
    </div>

    <h2 class="section-title" style="margin-top:24px">Dados</h2>
    <div class="setting-list">
      <button class="setting" id="exportData">
        <span class="s-icon">📤</span>
        <span><strong>Exportar dados</strong><small>Baixar backup em JSON</small></span>
        <b class="chev">›</b>
      </button>
      <button class="setting" id="importData">
        <span class="s-icon">📥</span>
        <span><strong>Importar dados</strong><small>Restaurar de um arquivo JSON</small></span>
        <b class="chev">›</b>
      </button>
      <button class="setting" id="clearData">
        <span class="s-icon">♲</span>
        <span><strong>Recomeçar dados</strong><small>Apaga todos os lançamentos</small></span>
        <b class="chev">›</b>
      </button>
    </div>
  </div>`;
}

function accounts() {
  const total = state.accounts.reduce((sum, a) => sum + accountBalance(a), 0);
  const cards = state.accounts.filter(isCredit);

  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings">‹</button>
      <span class="period">Suas contas</span>
      <button class="icon-btn" id="addAccount">+</button>
    </div>
    <div class="balance-label">Patrimônio disponível</div>
    <div class="balance">${money(total)}</div>
  </header>
  <div class="content">
    <h2 class="section-title">Contas</h2>
    <div class="cards">
      ${state.accounts.filter(a => !isCredit(a)).map(a => `
        <div class="info-card" data-edit-account="${a.id}">
          <div class="info-icon">${a.icon}</div>
          <div style="flex:1"><strong>${escapeHtml(a.name)}</strong><small>${money(accountBalance(a))}</small></div>
          <b class="chev" style="color:#b1afbd">›</b>
        </div>`).join('')}
    </div>
    <button class="save" id="addAccountBtn" style="margin-top:12px;background:#efedf5;color:#625e73">+ Adicionar conta</button>

    <h2 class="section-title" style="margin-top:22px">Cartões de crédito</h2>
    ${cards.length ? `<div class="cards">
      ${cards.map(c => {
        const used = creditUsed(c);
        const limit = Number(c.limit || 0);
        const available = Math.max(limit - used, 0);
        const pct = limit ? Math.min((used / limit) * 100, 100) : 0;
        const invoice = creditInvoiceTotal(c, state.selectedMonth);
        return `
        <div class="info-card" style="flex-direction:column;align-items:stretch;gap:10px" data-edit-card="${c.id}">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="info-icon">${c.icon}</div>
            <div style="flex:1"><strong>${escapeHtml(c.name)}</strong><small>Fecha dia ${c.closingDay} · Vence dia ${c.dueDay}</small></div>
          </div>
          <div class="budget-progress ${pct >= 95 ? 'danger' : pct >= 80 ? 'warn' : ''}"><i style="width:${pct}%"></i></div>
          <div class="row" style="font-size:12px;color:var(--muted)">
            <span>Usado ${money(used)}</span>
            <span>Disponível ${money(available)}</span>
          </div>
          <div class="row" style="font-size:12px;color:var(--muted)">
            <span>Fatura de ${monthLabel(state.selectedMonth)}</span>
            <b style="color:var(--pink)">${money(invoice)}</b>
          </div>
        </div>`;
      }).join('')}
    </div>` : '<div class="empty"><b>Nenhum cartão cadastrado</b>Adicione um cartão para começar a parcelar compras.</div>'}

    <button class="save" id="addCard" style="margin-top:16px">💳 Adicionar cartão de crédito</button>
  </div>`;
}

function installmentsPage() {
  const purchasesMap = {};
  state.transactions
    .filter(t => t.installment)
    .forEach(t => {
      const key = t.groupId || `${t.installment.purchaseDate}|${t.installment.totalAmount}|${t.category}|${t.accountId}`;
      if (!purchasesMap[key]) {
        purchasesMap[key] = {
          category: t.category, icon: t.icon,
          note: (t.note || '').replace(/\s\(\d+\/\d+\)$/, ''),
          accountId: t.accountId,
          purchaseDate: t.installment.purchaseDate,
          totalAmount: t.installment.totalAmount,
          total: t.installment.total,
          paid: 0, paidAmount: 0, remaining: 0, remainingAmount: 0
        };
      }
      const p = purchasesMap[key];
      const month = t.invoiceMonth || monthOf(t.date);
      if (month <= currentMonth()) { p.paid++; p.paidAmount += Number(t.amount); }
      else { p.remaining++; p.remainingAmount += Number(t.amount); }
    });

  const purchases = Object.values(purchasesMap).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));

  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings">‹</button>
      <span class="period">Compras parceladas</span>
      <button class="icon-btn" style="opacity:0">·</button>
    </div>
    <div class="balance-label">${purchases.length} compra(s) parcelada(s)</div>
    <div class="balance" style="font-size:22px">Parcelas</div>
  </header>
  <div class="content">
    ${purchases.length ? purchases.map(p => {
      const card = state.accounts.find(a => a.id === p.accountId);
      const pct = Math.round(p.paid / p.total * 100);
      return `
      <div class="panel" style="margin-bottom:12px">
        <div class="row">
          <strong>${p.icon} ${escapeHtml(p.category)}</strong>
          <span style="color:var(--muted);font-size:12px">${card ? card.icon + ' ' + escapeHtml(card.name) : ''}</span>
        </div>
        ${p.note ? `<small style="color:var(--muted);font-size:12px;display:block;margin-top:3px">${escapeHtml(p.note)}</small>` : ''}
        <div class="row" style="margin-top:10px;font-size:13px">
          <span>${money(p.totalAmount)} em ${p.total}x</span>
          <b>${p.paid}/${p.total} pagas</b>
        </div>
        <div class="budget-progress"><i style="width:${pct}%"></i></div>
        <div class="row" style="font-size:12px;color:var(--muted)">
          <span>Compra: ${dateText(p.purchaseDate)}</span>
          <span>Falta ${money(p.remainingAmount)}</span>
        </div>
      </div>`;
    }).join('') : '<div class="empty"><b>Nenhuma compra parcelada</b>Cadastre um cartão e faça uma compra em várias parcelas.</div>'}
  </div>`;
}

function invoicesPage() {
  const cards = state.accounts.filter(isCredit);
  const months = [-2, -1, 0, 1, 2].map(d => addMonths(state.selectedMonth, d));

  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings">‹</button>
      <span class="period">Faturas do cartão</span>
      <button class="icon-btn" style="opacity:0">·</button>
    </div>
    <div class="balance-label">Acompanhe suas faturas</div>
    <div class="balance" style="font-size:22px">Faturas</div>
  </header>
  <div class="content">
    ${cards.length ? cards.map(c => {
      const invoice = creditInvoiceTotal(c, state.selectedMonth);
      const used = creditUsed(c);
      return `
      <div class="panel" style="margin-bottom:14px">
        <div class="row">
          <strong>${c.icon} ${escapeHtml(c.name)}</strong>
          <span style="color:var(--muted);font-size:12px">Limite ${money(c.limit)}</span>
        </div>
        <div class="row" style="margin-top:10px">
          <div>
            <small style="color:var(--muted);font-size:11px">Fatura de ${monthLabel(state.selectedMonth)}</small>
            <div class="stat-number" style="color:var(--pink);margin:4px 0">${money(invoice)}</div>
          </div>
          <div style="text-align:right">
            <small style="color:var(--muted);font-size:11px">Em aberto</small>
            <div class="stat-number" style="margin:4px 0">${money(used)}</div>
          </div>
        </div>
        ${invoice > 0 ? `<button class="save" data-pay-invoice="${c.id}" data-invoice-month="${state.selectedMonth}" data-invoice-amount="${invoice}">💸 Pagar fatura de ${monthLabel(state.selectedMonth)}</button>` : '<div style="text-align:center;color:var(--muted);font-size:13px;padding:10px">Sem fatura para este mês</div>'}
      </div>`;
    }).join('') : '<div class="empty"><b>Nenhum cartão cadastrado</b>Cadastre um cartão em Contas e cartões.</div>'}

    ${cards.length ? `<h2 class="section-title" style="margin-top:14px">Histórico de faturas</h2>
    ${months.map(m => {
      const total = cards.reduce((s, c) => s + creditInvoiceTotal(c, m), 0);
      if (!total) return '';
      return `<div class="invoice-row">
        <span>${monthLabel(m)}</span>
        <b>${money(total)}</b>
      </div>`;
    }).join('')}` : ''}
  </div>`;
}

function categoriesPage() {
  const list = (type, title) => `
    <h2 class="section-title" style="margin-top:22px">${title}</h2>
    <div class="setting-list">
      ${state.categories[type].map(c => `
        <div class="setting category-row">
          <span class="s-icon">${c.icon}</span>
          <span><strong>${escapeHtml(c.name)}</strong><small>${type === 'income' ? 'Receita' : 'Despesa'}</small></span>
          <button class="remove-category" data-remove-category="${type}" data-category-name="${escapeHtml(c.name)}" aria-label="Remover ${escapeHtml(c.name)}">×</button>
        </div>`).join('')}
    </div>`;

  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings">‹</button>
      <span class="period">Categorias</span>
      <button class="icon-btn" id="addCategory" aria-label="Adicionar categoria">+</button>
    </div>
    <div class="balance-label">Personalize seus lançamentos</div>
    <div class="balance" style="font-size:22px">Categorias</div>
  </header>
  <div class="content">
    ${list('expense', 'Despesas')}
    ${list('income', 'Receitas')}
    <button class="save" id="addCategoryBtn">Adicionar categoria</button>
  </div>`;
}

function all() {
  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="home">‹</button>
      <span class="period">Todos os lançamentos</span>
      <button class="icon-btn" id="searchBtn" aria-label="Buscar">🔍</button>
    </div>
    <div class="balance-label">${monthLabel(state.selectedMonth)}</div>
    <div class="balance">Histórico</div>
  </header>
  <div class="content">
    ${groupedTransactions() || '<div class="empty">Nenhum lançamento neste período.</div>'}
  </div>`;
}

function render() {
  const screens = {
    home, stats, budget, settings, accounts,
    categories: categoriesPage, all,
    installments: installmentsPage,
    invoices: invoicesPage
  };
  document.getElementById('screen').innerHTML = (screens[page] || home)();
  document.querySelectorAll('.nav-item').forEach(x => x.classList.toggle('active', x.dataset.page === page));
}

/* ============ MODAIS ============ */

function modal() {
  let type = 'expense';
  let selected = state.categories.expense[0];
  let payment = 'account';
  let installments = 1;
  const root = document.getElementById('modalRoot');

  function draw() {
    const cats = type === 'income' ? state.categories.income : state.categories.expense;
    if (type !== 'transfer' && !cats.some(c => c.name === selected.name)) selected = cats[0];

    const cards = state.accounts.filter(isCredit);
    const nonCredit = state.accounts.filter(a => !isCredit(a));
    const showCredit = type === 'expense' && cards.length > 0;

    root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal">
        <div class="handle"></div>
        <h2 class="modal-title">Novo lançamento</h2>

        <div class="type-switch">
          ${[['expense', 'Despesa'], ['income', 'Receita'], ['transfer', 'Transferir']]
            .map(x => `<button type="button" data-type="${x[0]}" class="${type === x[0] ? 'selected' : ''}">${x[1]}</button>`).join('')}
        </div>

        <input class="amount-input" name="amount" inputmode="decimal" placeholder="R$ 0,00" required>

        ${showCredit ? `
          <label class="field"><span>Forma de pagamento</span>
            <div class="type-switch" style="grid-template-columns:1fr 1fr">
              <button type="button" data-pay="account" class="${payment === 'account' ? 'selected' : ''}">Conta</button>
              <button type="button" data-pay="credit" class="${payment === 'credit' ? 'selected' : ''}">Crédito</button>
            </div>
          </label>` : ''}

        ${type === 'transfer' ? `
          <label class="field"><span>Da conta</span>
            <select name="fromAccountId">${nonCredit.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
          </label>
          <label class="field"><span>Para a conta</span>
            <select name="toAccountId">${nonCredit.map((a, i) => `<option value="${a.id}" ${i === 1 ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
          </label>`
        : `
          <label class="field"><span>Categoria</span>
            <div class="categories">
              ${cats.map(c => `<button type="button" class="cat-choice ${selected.name === c.name ? 'selected' : ''}" data-cat="${c.name}" data-icon="${c.icon}">${c.icon} ${escapeHtml(c.name)}</button>`).join('')}
            </div>
          </label>

          ${payment === 'credit' && showCredit ? `
            <label class="field"><span>Cartão</span>
              <select name="accountId">${cards.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Parcelas</span>
              <select name="installments">
                ${Array.from({ length: 24 }, (_, i) => i + 1).map(n => `<option value="${n}" ${n === installments ? 'selected' : ''}>${n}x</option>`).join('')}
              </select>
            </label>`
          : `
            <label class="field"><span>Conta</span>
              <select name="accountId">${nonCredit.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('')}</select>
            </label>`}
        `}

        <label class="field"><span>Descrição</span><input name="note" placeholder="Ex.: almoço com amigos"></label>
        <label class="field"><span>Data da compra</span><input name="date" type="date" value="${dateForSelectedMonth()}"></label>
        <button class="save">Salvar lançamento</button>
      </form>
    </div>`;

    root.querySelectorAll('[data-type]').forEach(b => b.onclick = () => {
      type = b.dataset.type; payment = 'account'; installments = 1;
      if (type !== 'transfer') selected = (type === 'income' ? state.categories.income : state.categories.expense)[0];
      draw();
    });
    root.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      selected = { name: b.dataset.cat, icon: b.dataset.icon }; draw();
    });
    root.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => {
      payment = b.dataset.pay; draw();
    });
    root.querySelector('[name=installments]')?.addEventListener('change', e => {
      installments = Number(e.target.value);
    });
    root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) root.innerHTML = ''; };
    root.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const amount = Number(String(f.get('amount')).replace(/[^\d,]/g, '').replace(',', '.'));
      if (!amount) return toast('Informe um valor válido.');
      const date = f.get('date');

      if (type === 'transfer') {
        if (f.get('fromAccountId') === f.get('toAccountId')) return toast('Escolha contas diferentes.');
        state.transactions.push({
          id: makeId(), type, amount, date, note: f.get('note'),
          category: 'Transferência', icon: '↔️',
          fromAccountId: f.get('fromAccountId'), toAccountId: f.get('toAccountId')
        });
      } else if (payment === 'credit' && type === 'expense') {
        const card = state.accounts.find(a => a.id === f.get('accountId'));
        const n = Number(f.get('installments')) || 1;
        const entries = buildInstallments({
          account: card, category: selected.name, icon: selected.icon,
          note: f.get('note'), total: amount, date, installments: n
        });
        state.transactions.push(...entries);
        state.selectedMonth = monthOf(entries[0].date);
      } else {
        state.transactions.push({
          id: makeId(), type, amount, date, note: f.get('note'),
          category: selected.name, icon: selected.icon, accountId: f.get('accountId')
        });
        state.selectedMonth = monthOf(date);
      }
      persist(); root.innerHTML = ''; render();
      toast(payment === 'credit' && type === 'expense' && installments > 1 ? `${installments} parcelas adicionadas` : 'Lançamento salvo com sucesso');
    };
  }
  draw();
}

function editTransactionModal(txId) {
  const tx = state.transactions.find(t => t.id === txId);
  if (!tx) return;
  const root = document.getElementById('modalRoot');

  if (tx.type === 'invoice_payment' || tx.type === 'transfer') {
    root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal dialog-modal">
        <div class="handle"></div>
        <h2 class="modal-title">${tx.type === 'invoice_payment' ? 'Pagamento de fatura' : 'Transferência'}</h2>
        <p class="dialog-copy">
          <b>Valor:</b> ${money(tx.amount)}<br>
          <b>Data:</b> ${dateFull(tx.date)}<br>
          <b>Descrição:</b> ${escapeHtml(tx.note || '—')}
        </p>
        <button class="save danger" id="deleteTx">Excluir lançamento</button>
        <button class="modal-secondary" id="cancelModal" style="width:100%;margin-top:8px">Fechar</button>
      </section>
    </div>`;
    root.querySelector('#cancelModal').onclick = closeModal;
    root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
    root.querySelector('#deleteTx').onclick = () => { closeModal(); deleteTransaction(txId); };
    return;
  }

  const isCard = isCredit(state.accounts.find(a => a.id === tx.accountId));
  let type = tx.type;
  let selected = { name: tx.category, icon: tx.icon };
  let accountId = tx.accountId;

  function draw() {
    const cats = type === 'income' ? state.categories.income : state.categories.expense;
    const accounts = state.accounts.filter(a => type === 'expense' && isCard ? isCredit(a) : !isCredit(a));

    root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal">
        <div class="handle"></div>
        <h2 class="modal-title">Editar lançamento</h2>
        ${tx.installment ? `<p class="dialog-copy" style="margin-top:-6px">⚠️ Esta é a parcela ${tx.installment.current}/${tx.installment.total}. Alterações afetam só esta parcela.</p>` : ''}

        <div class="type-switch" style="grid-template-columns:1fr 1fr">
          <button type="button" data-edit-type="expense" class="${type === 'expense' ? 'selected' : ''}">Despesa</button>
          <button type="button" data-edit-type="income" class="${type === 'income' ? 'selected' : ''}">Receita</button>
        </div>

        <input class="amount-input" name="amount" inputmode="decimal" value="${String(tx.amount).replace('.', ',')}" required>

        <label class="field"><span>Categoria</span>
          <div class="categories">
            ${cats.map(c => `<button type="button" class="cat-choice ${selected.name === c.name ? 'selected' : ''}" data-edit-cat="${c.name}" data-icon="${c.icon}">${c.icon} ${escapeHtml(c.name)}</button>`).join('')}
          </div>
        </label>

        <label class="field"><span>${isCard ? 'Cartão' : 'Conta'}</span>
          <select name="accountId">
            ${accounts.map(a => `<option value="${a.id}" ${a.id === accountId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
          </select>
        </label>

        <label class="field"><span>Descrição</span><input name="note" value="${escapeHtml(tx.note || '')}"></label>
        <label class="field"><span>Data</span><input name="date" type="date" value="${tx.date}"></label>

        <button class="save">Salvar alterações</button>
        <button type="button" class="save danger" id="deleteTx" style="margin-top:8px">Excluir</button>
      </form>
    </div>`;

    root.querySelectorAll('[data-edit-type]').forEach(b => b.onclick = () => {
      type = b.dataset.editType;
      const newCats = type === 'income' ? state.categories.income : state.categories.expense;
      if (!newCats.some(c => c.name === selected.name)) selected = newCats[0];
      draw();
    });
    root.querySelectorAll('[data-edit-cat]').forEach(b => b.onclick = () => {
      selected = { name: b.dataset.editCat, icon: b.dataset.icon }; draw();
    });
    root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) root.innerHTML = ''; };
    root.querySelector('#deleteTx').onclick = () => { closeModal(); deleteTransaction(txId); };
    root.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const f = new FormData(e.target);
      const amount = Number(String(f.get('amount')).replace(/[^\d,]/g, '').replace(',', '.'));
      if (!amount) return toast('Informe um valor válido.');
      Object.assign(tx, {
        type,
        amount,
        category: selected.name,
        icon: selected.icon,
        accountId: f.get('accountId'),
        note: f.get('note'),
        date: f.get('date')
      });
      persist(); closeModal(); render(); toast('Lançamento atualizado');
    };
  }
  draw();
}

function payInvoiceModal(cardId, month, amount) {
  const card = state.accounts.find(a => a.id === cardId);
  const sources = state.accounts.filter(a => !isCredit(a));
  if (!sources.length) return toast('Nenhuma conta disponível para pagar.');

  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal dialog-modal" id="payForm">
        <div class="handle"></div>
        <h2 class="modal-title">Pagar fatura</h2>
        <p class="dialog-copy">
          ${card.icon} <b>${escapeHtml(card.name)}</b><br>
          Fatura de ${monthLabel(month)}: <b>${money(amount)}</b>
        </p>
        <label class="field"><span>Pagar com</span>
          <select name="fromAccountId">
            ${sources.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${money(accountBalance(a))})</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Valor a pagar</span>
          <input name="amount" inputmode="decimal" value="${String(amount).replace('.', ',')}" required>
        </label>
        <label class="field"><span>Data</span>
          <input name="date" type="date" value="${today()}">
        </label>
        <div class="dialog-actions">
          <button type="button" class="modal-secondary" id="cancelModal">Cancelar</button>
          <button class="save">Confirmar pagamento</button>
        </div>
      </form>
    </div>`;

  root.querySelector('#cancelModal').onclick = closeModal;
  root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
  root.querySelector('#payForm').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const value = Number(String(f.get('amount')).replace(/[^\d,]/g, '').replace(',', '.'));
    if (!value) return toast('Valor inválido.');
    state.transactions.push({
      id: makeId(),
      type: 'invoice_payment',
      amount: value,
      date: f.get('date'),
      note: `Pagamento fatura ${monthLabel(month)}`,
      category: 'Pagamento fatura',
      icon: '🧾',
      cardId,
      invoiceMonth: month,
      fromAccountId: f.get('fromAccountId')
    });
    persist(); closeModal(); render(); toast('Fatura paga');
  };
}

function searchModal() {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal search-modal">
        <div class="handle"></div>
        <h2 class="modal-title">Buscar lançamentos</h2>
        <input class="search-input" id="searchInput" placeholder="Descrição, categoria, valor..." autofocus>
        <p class="search-count" id="searchCount" style="margin-top:12px"></p>
        <div class="search-results" id="searchResults"></div>
        <button class="modal-secondary" id="cancelModal" style="width:100%;margin-top:14px">Fechar</button>
      </section>
    </div>`;

  const input = root.querySelector('#searchInput');
  const results = root.querySelector('#searchResults');
  const count = root.querySelector('#searchCount');

  function doSearch() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      count.textContent = '';
      results.innerHTML = '<div class="empty">Digite para buscar...</div>';
      return;
    }
    const found = state.transactions.filter(t => {
      const hay = `${t.category || ''} ${t.note || ''} ${t.amount} ${accountName(t.accountId)}`.toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => b.date.localeCompare(a.date));

    count.textContent = `${found.length} resultado(s)`;
    results.innerHTML = found.length
      ? found.map(t => transactionHTML(t)).join('')
      : '<div class="empty">Nada encontrado.</div>';
  }

  input.addEventListener('input', doSearch);
  doSearch();
  root.querySelector('#cancelModal').onclick = closeModal;
  root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
}

function confirmationModal(title, message, onConfirm, confirmLabel = 'Confirmar') {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal dialog-modal" role="dialog" aria-modal="true">
        <div class="handle"></div>
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        <p class="dialog-copy">${escapeHtml(message)}</p>
        <div class="dialog-actions">
          <button class="modal-secondary" id="cancelModal">Cancelar</button>
          <button class="save" id="confirmModal">${escapeHtml(confirmLabel)}</button>
        </div>
      </section>
    </div>`;
  root.querySelector('#cancelModal').onclick = closeModal;
  root.querySelector('#confirmModal').onclick = () => { closeModal(); onConfirm(); };
  root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
}

function inputModal({ title, label, placeholder, value = '', action }) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal dialog-modal" id="inputModal">
        <div class="handle"></div>
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        <label class="field">
          <span>${escapeHtml(label)}</span>
          <input id="modalValue" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" required autofocus>
        </label>
        <div class="dialog-actions">
          <button type="button" class="modal-secondary" id="cancelModal">Cancelar</button>
          <button class="save">Salvar</button>
        </div>
      </form>
    </div>`;
  root.querySelector('#cancelModal').onclick = closeModal;
  root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
  root.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const value = root.querySelector('#modalValue').value.trim();
    if (value) { closeModal(); action(value); }
  };
  root.querySelector('#modalValue').focus();
}

function categoryModal() {
  const root = document.getElementById('modalRoot');
  let type = 'expense';
  let icon = '🏷️';

  function draw() {
    root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal dialog-modal" id="categoryModal">
        <div class="handle"></div>
        <h2 class="modal-title">Nova categoria</h2>
        <div class="type-switch" style="grid-template-columns:1fr 1fr">
          <button type="button" data-category-type="expense" class="${type === 'expense' ? 'selected' : ''}">Despesa</button>
          <button type="button" data-category-type="income" class="${type === 'income' ? 'selected' : ''}">Receita</button>
        </div>
        <label class="field"><span>Nome da categoria</span><input name="name" placeholder="Ex.: Saúde" required autofocus></label>
        <label class="field"><span>Ícone</span>
          <div class="categories">
            ${['🏷️', '🍽️', '🛍️', '🏥', '📚', '🐾', '💡', '🎯', '✈️', '🎮'].map(x => `<button type="button" class="cat-choice ${icon === x ? 'selected' : ''}" data-icon-choice="${x}">${x}</button>`).join('')}
          </div>
        </label>
        <div class="dialog-actions">
          <button type="button" class="modal-secondary" id="cancelModal">Cancelar</button>
          <button class="save">Criar categoria</button>
        </div>
      </form>
    </div>`;

    root.querySelectorAll('[data-category-type]').forEach(b => b.onclick = () => { type = b.dataset.categoryType; draw(); });
    root.querySelectorAll('[data-icon-choice]').forEach(b => b.onclick = () => { icon = b.dataset.iconChoice; draw(); });
    root.querySelector('#cancelModal').onclick = closeModal;
    root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
    root.querySelector('form').onsubmit = e => {
      e.preventDefault();
      const name = new FormData(e.target).get('name').trim();
      if (state.categories[type].some(c => c.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
        return toast('Essa categoria já existe.');
      state.categories[type].push({ name, icon });
      persist(); closeModal(); render(); toast('Categoria criada');
    };
    root.querySelector('[name=name]').focus();
  }
  draw();
}

function cardModal(existingId = null) {
  const root = document.getElementById('modalRoot');
  const card = existingId ? state.accounts.find(a => a.id === existingId) : null;

  root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal dialog-modal" id="cardForm">
        <div class="handle"></div>
        <h2 class="modal-title">${card ? 'Editar cartão' : 'Novo cartão de crédito'}</h2>
        <label class="field"><span>Nome do cartão</span><input name="name" placeholder="Ex.: Nubank" value="${card ? escapeHtml(card.name) : ''}" required autofocus></label>
        <label class="field"><span>Limite (R$)</span><input name="limit" inputmode="decimal" placeholder="Ex.: 3000" value="${card ? card.limit : ''}" required></label>
        <label class="field"><span>Dia de fechamento</span><input name="closingDay" type="number" min="1" max="28" value="${card ? card.closingDay : 25}" required></label>
        <label class="field"><span>Dia de vencimento</span><input name="dueDay" type="number" min="1" max="28" value="${card ? card.dueDay : 5}" required></label>
        <div class="dialog-actions">
          <button type="button" class="modal-secondary" id="cancelModal">Cancelar</button>
          <button class="save">${card ? 'Salvar' : 'Criar cartão'}</button>
        </div>
        ${card ? `<button type="button" class="save danger" id="deleteCard" style="margin-top:8px">Excluir cartão</button>` : ''}
      </form>
    </div>`;

  root.querySelector('#cancelModal').onclick = closeModal;
  root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) closeModal(); };

  root.querySelector('#deleteCard')?.addEventListener('click', () => {
    closeModal();
    confirmationModal('Excluir cartão', `Excluir "${card.name}"? Lançamentos existentes serão mantidos no histórico.`, () => {
      state.accounts = state.accounts.filter(a => a.id !== card.id);
      persist(); render(); toast('Cartão excluído');
    }, 'Excluir');
  });

  root.querySelector('#cardForm').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const limit = Number(String(f.get('limit')).replace(/[^\d,]/g, '').replace(',', '.'));
    if (!limit) return toast('Informe um limite válido.');

    if (card) {
      Object.assign(card, {
        name: f.get('name').trim(),
        limit,
        closingDay: Number(f.get('closingDay')),
        dueDay: Number(f.get('dueDay'))
      });
      toast('Cartão atualizado');
    } else {
      state.accounts.push({
        id: makeId(), name: f.get('name').trim(), icon: '💳',
        initialBalance: 0, kind: 'credit', limit,
        closingDay: Number(f.get('closingDay')),
        dueDay: Number(f.get('dueDay'))
      });
      toast('Cartão criado');
    }
    persist(); closeModal(); render();
  };
}

function accountModal(existingId = null) {
  const root = document.getElementById('modalRoot');
  const acc = existingId ? state.accounts.find(a => a.id === existingId) : null;

  root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal dialog-modal" id="accForm">
        <div class="handle"></div>
        <h2 class="modal-title">${acc ? 'Editar conta' : 'Nova conta'}</h2>
        <label class="field"><span>Nome</span><input name="name" placeholder="Ex.: Poupança" value="${acc ? escapeHtml(acc.name) : ''}" required autofocus></label>
        <label class="field"><span>Saldo inicial (R$)</span><input name="initialBalance" inputmode="decimal" value="${acc ? String(acc.initialBalance).replace('.', ',') : '0'}"></label>
        <div class="dialog-actions">
          <button type="button" class="modal-secondary" id="cancelModal">Cancelar</button>
          <button class="save">${acc ? 'Salvar' : 'Criar conta'}</button>
        </div>
        ${acc ? `<button type="button" class="save danger" id="deleteAcc" style="margin-top:8px">Excluir conta</button>` : ''}
      </form>
    </div>`;

  root.querySelector('#cancelModal').onclick = closeModal;
  root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) closeModal(); };

  root.querySelector('#deleteAcc')?.addEventListener('click', () => {
    closeModal();
    confirmationModal('Excluir conta', `Excluir "${acc.name}"?`, () => {
      state.accounts = state.accounts.filter(a => a.id !== acc.id);
      persist(); render(); toast('Conta excluída');
    }, 'Excluir');
  });

  root.querySelector('#accForm').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const initial = Number(String(f.get('initialBalance') || '0').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    if (acc) {
      Object.assign(acc, { name: f.get('name').trim(), initialBalance: initial });
      toast('Conta atualizada');
    } else {
      state.accounts.push({ id: makeId(), name: f.get('name').trim(), icon: '🏦', initialBalance: initial, kind: 'bank' });
      toast('Conta criada');
    }
    persist(); closeModal(); render();
  };
}

function categoryBudgetModal(catName) {
  const current = state.categoryBudgets[catName] || 0;
  inputModal({
    title: `Meta para ${catName}`,
    label: 'Valor mensal (R$) — deixe 0 para remover',
    placeholder: 'Ex.: 400',
    value: current ? String(current) : '',
    action: value => {
      const amount = Number(String(value).replace(/[^\d,]/g, '').replace(',', '.')) || 0;
      if (amount > 0) state.categoryBudgets[catName] = amount;
      else delete state.categoryBudgets[catName];
      persist(); render(); toast(amount ? 'Meta definida' : 'Meta removida');
    }
  });
}

/* ============ AÇÕES ============ */

function toast(message, undoAction = null) {
  const e = document.getElementById('toast');
  e.innerHTML = `${escapeHtml(message)}${undoAction ? ' <button id="undoBtn">Desfazer</button>' : ''}`;
  e.className = 'show';
  if (undoAction) {
    e.querySelector('#undoBtn').onclick = () => {
      undoAction();
      e.className = '';
    };
  }
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => e.className = '', 4000);
}

function closeModal() {
  document.getElementById('modalRoot').innerHTML = '';
}

function deleteTransaction(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  const isGrouped = tx.groupId && state.transactions.filter(t => t.groupId === tx.groupId).length > 1;

  confirmationModal(
    'Excluir lançamento',
    isGrouped
      ? 'Este lançamento faz parte de uma compra parcelada. Deseja excluir TODAS as parcelas?'
      : 'Esta ação não pode ser desfeita.',
    () => {
      const removed = isGrouped
        ? state.transactions.filter(t => t.groupId === tx.groupId)
        : [tx];
      state.transactions = state.transactions.filter(t => !removed.some(r => r.id === t.id));
      persist(); render();
      toast(isGrouped ? `${removed.length} parcelas excluídas` : 'Lançamento excluído', () => {
        state.transactions.push(...removed);
        persist(); render(); toast('Restaurado');
      });
    },
    'Excluir'
  );
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meu-controle-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup exportado');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.transactions || !data.accounts) throw new Error('Formato inválido');
        state = migrate(data);
        persist(); render();
        toast('Dados importados');
      } catch (err) {
        toast('Arquivo inválido');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

/* ============ EVENTOS ============ */

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-page]');
  if (nav) { page = nav.dataset.page; render(); return; }

  const go = e.target.closest('[data-go]');
  if (go) { page = go.dataset.go; render(); return; }

  const month = e.target.closest('[data-month]');
  if (month) {
    state.selectedMonth = changeMonth(state.selectedMonth, Number(month.dataset.month));
    persist(); render(); return;
  }

  const filterBtn = e.target.closest('[data-filter]');
  if (filterBtn) { statsFilter = filterBtn.dataset.filter; render(); return; }

  // Clicar em transação abre edição
  const txEl = e.target.closest('[data-tx-id]');
  if (txEl && !e.target.closest('.modal-backdrop')) {
    editTransactionModal(txEl.dataset.txId);
    return;
  }

  if (e.target.closest('#addTransaction')) modal();
  if (e.target.closest('#searchBtn')) searchModal();

  if (e.target.closest('#addAccount') || e.target.closest('#addAccountBtn')) accountModal();
  if (e.target.closest('#addCard')) cardModal();
  if (e.target.closest('#addCategory') || e.target.closest('#addCategoryBtn')) categoryModal();

  const editAcc = e.target.closest('[data-edit-account]');
  if (editAcc) { accountModal(editAcc.dataset.editAccount); return; }

  const editCard = e.target.closest('[data-edit-card]');
  if (editCard) { cardModal(editCard.dataset.editCard); return; }

  const catBudget = e.target.closest('[data-cat-budget]');
  if (catBudget) { categoryBudgetModal(catBudget.dataset.catBudget); return; }

  const payInvoiceBtn = e.target.closest('[data-pay-invoice]');
  if (payInvoiceBtn) {
    payInvoiceModal(
      payInvoiceBtn.dataset.payInvoice,
      payInvoiceBtn.dataset.invoiceMonth,
      Number(payInvoiceBtn.dataset.invoiceAmount)
    );
    return;
  }

  const remove = e.target.closest('[data-remove-category]');
  if (remove) {
    confirmationModal(
      'Remover categoria',
      `Remover "${remove.dataset.categoryName}" das categorias disponíveis?`,
      () => {
        state.categories[remove.dataset.removeCategory] = state.categories[remove.dataset.removeCategory].filter(c => c.name !== remove.dataset.categoryName);
        persist(); render(); toast('Categoria removida');
      },
      'Remover'
    );
    return;
  }

  if (e.target.closest('#editBudget')) {
    inputModal({
      title: 'Orçamento mensal',
      label: 'Valor do orçamento (R$)',
      placeholder: 'Ex.: 2500',
      value: String(state.budget),
      action: value => {
        const amount = Number(value.replace(/[^\d,]/g, '').replace(',', '.'));
        if (!amount) return toast('Informe um valor válido.');
        state.budget = amount;
        persist(); render(); toast('Orçamento atualizado');
      }
    });
  }

  if (e.target.closest('#exportData')) exportData();
  if (e.target.closest('#importData')) importData();

  if (e.target.closest('#clearData')) {
    confirmationModal(
      'Apagar lançamentos',
      'Todos os seus lançamentos serão removidos definitivamente.',
      () => {
        const backup = structuredClone(state.transactions);
        state.transactions = [];
        persist(); render();
        toast('Lançamentos apagados', () => {
          state.transactions = backup;
          persist(); render(); toast('Restaurado');
        });
      },
      'Apagar'
    );
  }
});

render();