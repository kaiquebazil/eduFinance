/* ============================================================
   EduFinance — estado e regras financeiras
   ============================================================ */

const KEY = 'meu-controle-v1';
const themeOptions = [
  { id: 'default', label: 'Padrão' },
  { id: 'orange', label: 'Laranja' },
  { id: 'blue', label: 'Ciano' },
  { id: 'green', label: 'Verde' },
  { id: 'pink', label: 'Rosa' },
  { id: 'purple', label: 'Roxo' }
];
const fontScaleOptions = [0.88, 1, 1.12, 1.25];
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

// --- escapeHtml corrigido: escapa também aspas (previne injeção em atributos) ---
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// --- Parse de moeda robusto: aceita R$ 1.250,00 / 1250.00 / 125,00 ---
function parseMoney(raw) {
  let s = String(raw ?? '').trim().replace(/[^\d.,]/g, '');
  if (!s) return 0;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) {
    // ambos presentes: o que vier por último é o separador decimal
    s = lc > ld
      ? s.replace(/\./g, '').replace(',', '.')   // pt-BR: 1.250,00
      : s.replace(/,/g, '');                      // en-US: 1,250.00
  } else if (lc > -1) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (ld > -1) {
    const p = s.split('.');
    // 1.000 = milhar (3 dígitos após ponto único) → remover ponto
    if (p.length > 2 || (p[1] && p[1].length === 3)) s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// --- Máscara ATM: digita 1,2,5,0 → R$ 0,01 → R$ 0,12 → R$ 1,25 → R$ 12,50 ---
document.addEventListener('input', e => {
  const el = e.target;
  if (!el.matches?.('[data-money]')) return;
  const d = el.value.replace(/\D/g, '');
  el.value = d ? (Number(d) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
});

/* ==== CATEGORIAS PADRÃO ==== */
const categories = {
  expense: [
    { name: 'Alimentação', icon: '🍽️' },
    { name: 'Beleza', icon: '💇' },
    { name: 'Carro', icon: '🚗' },
    { name: 'Casa', icon: '🏠' },
    { name: 'Combustível', icon: '⛽' },
    { name: 'Compras', icon: '🛒' },
    { name: 'Diversos', icon: '💼' },
    { name: 'Dízimos', icon: '🙏' },
    { name: 'Educação', icon: '🎓' },
    { name: 'Entretenimento', icon: '🎮' },
    { name: 'Estacionamento/Pedágios', icon: '🅿️' },
    { name: 'Filhos', icon: '👨‍👩‍👧' },
    { name: 'Investimento', icon: '💰' },
    { name: 'IR', icon: '📌' },
    { name: 'Lanches', icon: '🍔' },
    { name: 'Lar', icon: '🏠' },
    { name: 'Lazer', icon: '🎉' },
    { name: 'Light', icon: '💡' },
    { name: 'Mercado', icon: '🛒' },
    { name: 'Ofertas', icon: '💰' },
    { name: 'Saúde', icon: '🩺' },
    { name: 'Taxas', icon: '💸' },
    { name: 'Telefone', icon: '📱' },
    { name: 'Transporte', icon: '🚕' }
  ],
  income: [
    { name: 'Aposentadoria/Pastoral', icon: '👴' },
    { name: 'Bolsa Família', icon: '👨‍👩‍👧' },
    { name: 'Cash Back', icon: '🏦' },
    { name: 'Consultoria financeira', icon: '💼' },
    { name: 'Décimo terceiro', icon: '💵' },
    { name: 'Extra', icon: '💸' },
    { name: 'Investimentos', icon: '💰' },
    { name: 'Outros', icon: '💰' },
    { name: 'Palestras', icon: '🎤' },
    { name: 'Presente', icon: '🎁' },
    { name: 'Repasse/Amor', icon: '❤️' },
    { name: 'Salário', icon: '💼' }
  ]
};

/* ==== ESTADO INICIAL (seed) ==== */
const seed = {
  version: 7,
  theme: 'default',
  colorMode: 'light',
  fontScale: 1,
  hideAmounts: false,
  hideHomeCards: false,
  soundEnabled: true,
  pinLock: null,
  selectedMonth: currentMonth(),
  budget: 2500,
  categoryBudgets: {
    Alimentação: 400,
    Casa: 1000,
    Mercado: 600,
    Saúde: 200,
    Transporte: 300
  },
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
  ],
  recurring: []
};

/* ==== SANITIZAÇÃO DE ESTADO (segurança na importação) ==== */
function sanitizeState(s) {
  const str = (v, max = 60) => String(v ?? '').slice(0, max);
  const id  = v => str(v, 64).replace(/[^\w-]/g, '');
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const dateOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
  const cat = c => ({ name: str(c?.name, 40), icon: str(c?.icon, 8), hidden: Boolean(c?.hidden) });

  s.selectedMonth = /^\d{4}-\d{2}$/.test(s.selectedMonth) ? s.selectedMonth : currentMonth();
  if (s.theme === 'dark') { s.colorMode = 'dark'; s.theme = 'default'; }
  if (s.theme === 'system') { s.colorMode = 'system'; s.theme = 'default'; }
  s.theme = themeOptions.some(theme => theme.id === s.theme) ? s.theme : 'default';
  s.colorMode = ['light', 'dark', 'system'].includes(s.colorMode) ? s.colorMode : 'light';
  s.hideAmounts = Boolean(s.hideAmounts);
  s.hideHomeCards = Boolean(s.hideHomeCards);
  s.soundEnabled = s.soundEnabled !== false;
  s.pinLock = s.pinLock?.enabled && /^[a-f0-9]{32}$/.test(s.pinLock.salt || '') && /^[a-f0-9]{64}$/.test(s.pinLock.hash || '')
    ? { enabled: true, salt: s.pinLock.salt, hash: s.pinLock.hash }
    : null;
  const fontScale = Number(s.fontScale ?? 1);
  s.fontScale = Number.isFinite(fontScale) ? Math.max(0, Math.min(fontScaleOptions.length - 1, Math.round(fontScale))) : 1;
  s.budget = num(s.budget);
  s.categoryBudgets = Object.fromEntries(
    Object.entries(s.categoryBudgets || {}).map(([k, v]) => [str(k, 40), num(v)])
  );
  s.categories = {
    expense: (s.categories?.expense || []).map(cat),
    income:  (s.categories?.income  || []).map(cat)
  };

  s.accounts = (s.accounts || []).map(a => ({
    ...a,
    id:   id(a.id),
    name: str(a.name, 40),
    icon: str(a.icon, 8),
    initialBalance: num(a.initialBalance),
    kind: ['cash', 'bank', 'credit'].includes(a.kind) ? a.kind : 'bank',
    ...(a.kind === 'credit'
      ? { limit: num(a.limit), closingDay: num(a.closingDay) || 25, dueDay: num(a.dueDay) || 5 }
      : {})
  }));

  s.transactions = (s.transactions || [])
    .filter(t => dateOk(t.date))
    .map(t => {
      const o = {
        ...t,
        id:       id(t.id),
        amount:   num(t.amount),
        category: str(t.category, 40),
        icon:     str(t.icon, 8),
        note:     str(t.note, 200)
      };
      ['accountId','fromAccountId','toAccountId','cardId','groupId','recurringId'].forEach(k => {
        if (o[k] != null) o[k] = id(o[k]);
      });
      if (o.invoiceMonth && !/^\d{4}-\d{2}$/.test(o.invoiceMonth)) delete o.invoiceMonth;
      return o;
    });

  s.recurring = (s.recurring || []).map(r => ({
    ...r,
    id:        id(r.id),
    accountId: id(r.accountId),
    amount:    num(r.amount),
    category:  str(r.category, 40),
    icon:      str(r.icon, 8),
    note:      str(r.note, 200),
    day:       Math.min(Math.max(num(r.day) || 1, 1), 31)
  }));

  return s;
}

/* ==== MIGRAÇÃO ==== */
function migrate(old) {
  if (!old) return structuredClone(seed);
  const sortCategories = Number(old.version || 0) < 5;
  const savedCategories = old.categories || {};
  const mergedCategories = Object.fromEntries(['expense', 'income'].map(type => {
    const saved = Array.isArray(savedCategories[type]) ? savedCategories[type] : [];
    const names = new Set(saved.map(c => String(c?.name || '').trim().toLocaleLowerCase()));
    return [type, [
      ...saved,
      ...categories[type].filter(c => !names.has(c.name.toLocaleLowerCase()))
    ]];
  }));
  if (sortCategories) {
    Object.values(mergedCategories).forEach(list => list.sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR', { sensitivity: 'base' })
    ));
  }
  const base = {
    ...seed,
    ...old,
    version: 7,
    selectedMonth: old.selectedMonth || currentMonth(),
    categoryBudgets: old.version < 7 && !Object.values(old.categoryBudgets || {}).some(amount => Number(amount) > 0)
      ? seed.categoryBudgets
      : (old.categoryBudgets ?? seed.categoryBudgets),
    accounts: old.accounts && old.accounts.length ? old.accounts : seed.accounts,
    categories: mergedCategories,
    recurring: Array.isArray(old.recurring) ? old.recurring : []
  };
  base.transactions = (old.transactions || []).map(t => ({
    ...t,
    id:        String(t.id || makeId()),
    accountId: t.accountId || 'cash'
  }));
  const validGoalNames = new Set(base.categories.expense.map(c => c.name));
  const goals = Object.entries(base.categoryBudgets)
    .filter(([name, amount]) => validGoalNames.has(name) && Number(amount) > 0)
    .map(([name, amount]) => {
      const spent = base.transactions.reduce((sum, tx) =>
        tx.type === 'expense' && tx.category === name && tx.date?.startsWith(base.selectedMonth)
          ? sum + Number(tx.amount || 0) : sum, 0);
      return { name, amount: Number(amount), progress: spent / Number(amount) };
    })
    .sort((a, b) => b.progress - a.progress);
  base.categoryBudgets = Object.fromEntries(goals.map(goal => [goal.name, goal.amount]));
  return sanitizeState(base);
}

/* ==== ESTADO GLOBAL ==== */
let state = migrate(JSON.parse(localStorage.getItem(KEY) || 'null'));
let page = state.pinLock?.enabled ? 'lock' : 'home';
let statsFilter = 'month';
let statsType = 'expense';
let selectedCategoryName = '';
let selectedCategoryType = 'expense';
let categoryDetailSort = 'date';

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
}
persist();

function applyTheme() {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = state.theme;
  document.documentElement.dataset.mode = state.colorMode === 'system' ? (prefersDark ? 'dark' : 'light') : state.colorMode;
}
applyTheme();
function applyFontScale() {
  document.documentElement.style.setProperty('--font-scale', fontScaleOptions[state.fontScale] || 1);
}
applyFontScale();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (state.colorMode === 'system') applyTheme();
});

/* ==== UTILITÁRIOS DE FORMATAÇÃO ==== */
const money      = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const monthLabel = m => new Date(`${m}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, x => x.toUpperCase());
const dateText   = d => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
const dateFull   = d => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const changeMonth = (m, delta) => addMonths(m, delta);
const dateForSelectedMonth = () => today().startsWith(state.selectedMonth) ? today() : `${state.selectedMonth}-01`;
const inMonth = () => state.transactions.filter(t => t.date?.startsWith(state.selectedMonth));
const totals = (list = inMonth()) => list.reduce((a, t) => {
  if (t.type === 'income')  a.income  += Number(t.amount);
  if (t.type === 'expense') a.expense += Number(t.amount);
  return a;
}, { income: 0, expense: 0 });
const accountName = id => state.accounts.find(a => a.id === id)?.name || 'Conta';
const isCredit = (acc) => acc?.kind === 'credit';
const selectableCategories = (type, currentName = '') =>
  (state.categories[type] || []).filter(c => !c.hidden || c.name === currentName);
const budgetHeatClass = percent => percent >= 100 ? 'heat-4'
  : percent >= 85 ? 'heat-3'
    : percent >= 70 ? 'heat-2'
      : percent >= 50 ? 'heat-1' : 'heat-0';

/* ==== FINANÇAS ==== */
function accountBalance(account) {
  if (isCredit(account)) return 0;
  return state.transactions.reduce((balance, t) => {
    const a = Number(t.amount || 0);
    if (t.type === 'income'          && t.accountId      === account.id) return balance + a;
    if (t.type === 'expense'         && t.accountId      === account.id) return balance - a;
    if (t.type === 'transfer'        && t.fromAccountId  === account.id) return balance - a;
    if (t.type === 'transfer'        && t.toAccountId    === account.id) return balance + a;
    if (t.type === 'invoice_payment' && t.fromAccountId  === account.id) return balance - a;
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

// Quanto já foi pago da fatura de um mês específico
function invoicePaidTotal(account, month) {
  return state.transactions
    .filter(t => t.type === 'invoice_payment' && t.cardId === account.id && t.invoiceMonth === month)
    .reduce((s, t) => s + Number(t.amount || 0), 0);
}

// Quanto ainda resta para pagar (0 se já estiver quitada)
function invoiceRemaining(account, month) {
  const total = creditInvoiceTotal(account, month);
  const paid  = invoicePaidTotal(account, month);
  return Math.max(Math.round((total - paid) * 100) / 100, 0);
}

function invoiceMonthFor(account, date) {
  const m   = monthOf(date);
  const day = Number(date.slice(8, 10));
  return day <= (account.closingDay || 25) ? m : addMonths(m, 1);
}

function buildInstallments({ account, category, icon, note, total, date, installments }) {
  const entries = [];
  const totalCents = Math.round(total * 100);
  const baseCents  = Math.floor(totalCents / installments);
  let restCents    = totalCents - baseCents * installments;
  const firstInvoice = invoiceMonthFor(account, date);

  for (let i = 1; i <= installments; i++) {
    const cents = i === installments ? baseCents + restCents : baseCents;
    restCents = 0;
    const amount       = cents / 100;
    const invoiceMonth = addMonths(firstInvoice, i - 1);
    const dueDay       = Math.min(account.dueDay || 5, lastDayOfMonth(invoiceMonth));
    const dueDate      = `${invoiceMonth}-${String(dueDay).padStart(2, '0')}`;

    entries.push({
      id: makeId(), type: 'expense', category, icon,
      accountId: account.id, amount, date: dueDate,
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

/* ==== LANÇAMENTOS RECORRENTES ==== */
function applyRecurring() {
  state.recurring ??= [];
  let changed   = false;
  let generated = 0;
  state.recurring.forEach(r => {
    if (!r.active) return;
    let m = r.lastGenerated ? addMonths(r.lastGenerated, 1) : r.startMonth;
    while (m <= currentMonth()) {
      const day = String(Math.min(r.day, lastDayOfMonth(m))).padStart(2, '0');
      state.transactions.push({
        id: makeId(), type: r.type, category: r.category, icon: r.icon,
        accountId: r.accountId, amount: r.amount, date: `${m}-${day}`,
        note: r.note, recurringId: r.id
      });
      r.lastGenerated = m;
      m = addMonths(m, 1);
      changed = true;
      generated++;
    }
  });
  if (changed) {
    persist();
    // aviso exibido após render()
    window._recurringGenerated = generated;
  }
}
