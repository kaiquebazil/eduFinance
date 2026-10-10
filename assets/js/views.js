/* Telas e renderização da interface do EduFinance. */
/* ==== HELPERS DE TELA ==== */
function monthChanger() {
  return `<button class="icon-btn" data-month="-1" aria-label="Mês anterior">‹</button><span class="period">${monthLabel(state.selectedMonth)}</span><button class="icon-btn" data-month="1" aria-label="Próximo mês">›</button>`;
}

function monthPickerModal() {
  const root = document.getElementById('modalRoot');
  let year = Number(state.selectedMonth.slice(0, 4));
  let selected = Number(state.selectedMonth.slice(5, 7)) - 1;
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(2020, i, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
      .replace(/^./, c => c.toUpperCase())
  );

  const renderPicker = () => {
    const title = new Date(year, selected, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      .replace(/^./, c => c.toUpperCase());
    root.innerHTML = `<div class="modal-backdrop month-picker-backdrop">
      <section class="month-picker-modal" role="dialog" aria-modal="true" aria-labelledby="monthPickerTitle">
        <h2 id="monthPickerTitle">${title}</h2>
        <div class="month-picker-year-row">
          <select id="monthPickerYear" aria-label="Ano">${Array.from({ length: 21 }, (_, i) => year - 10 + i).map(y => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select>
          <div class="month-picker-year-nav">
            <button type="button" data-year-step="-1" aria-label="Ano anterior">‹</button>
            <button type="button" data-year-step="1" aria-label="Próximo ano">›</button>
          </div>
        </div>
        <div class="month-picker-grid">${months.map((name, i) => `<button type="button" class="month-option ${i === selected ? 'selected' : ''}" data-month-option="${i}" aria-pressed="${i === selected}">${name}</button>`).join('')}</div>
        <div class="month-picker-actions">
          <button type="button" class="month-cancel" id="cancelMonthPicker">Cancelar</button>
          <button type="button" class="month-confirm" id="confirmMonthPicker">Confirmar</button>
        </div>
      </section>
    </div>`;

    root.querySelector('#monthPickerYear').addEventListener('change', e => {
      year = Number(e.target.value);
      renderPicker();
    });
    root.querySelectorAll('[data-year-step]').forEach(button => button.addEventListener('click', () => {
      year += Number(button.dataset.yearStep);
      renderPicker();
    }));
    root.querySelectorAll('[data-month-option]').forEach(button => button.addEventListener('click', () => {
      selected = Number(button.dataset.monthOption);
      renderPicker();
    }));
    root.querySelector('#cancelMonthPicker').addEventListener('click', closeModal);
    root.querySelector('#confirmMonthPicker').addEventListener('click', () => {
      state.selectedMonth = `${year}-${String(selected + 1).padStart(2, '0')}`;
      persist();
      closeModal();
      render();
    });
    root.querySelector('.month-picker-backdrop').addEventListener('click', e => {
      if (e.target === e.currentTarget) closeModal();
    });
  };

  renderPicker();
}

function transactionHTML(t) {
  const transfer       = t.type === 'transfer';
  const invoicePayment = t.type === 'invoice_payment';
  const card           = state.accounts.find(a => a.id === t.accountId);
  const isCardTx       = !transfer && !invoicePayment && isCredit(card);

  let meta;
  if (transfer) {
    meta = `${accountName(t.fromAccountId)} → ${accountName(t.toAccountId)}`;
  } else if (invoicePayment) {
    const c = state.accounts.find(a => a.id === t.cardId);
    meta = `Pagamento fatura ${c ? escapeHtml(c.icon) + ' ' + escapeHtml(c.name) : ''}`;
  } else if (isCardTx) {
    meta = `${escapeHtml(card.icon)} ${escapeHtml(card.name)}${t.note ? ` · ${escapeHtml(t.note)}` : ''}`;
  } else {
    meta = `${escapeHtml(accountName(t.accountId))}${t.note ? ` · ${escapeHtml(t.note)}` : ''}`;
  }

  const instBadge = t.installment ? `<span class="badge-installment">${t.installment.current}/${t.installment.total}</span>` : '';
  const cardBadge = isCardTx ? `<span class="badge-card">💳</span>` : '';

  return `<article class="transaction" data-tx-id="${escapeHtml(t.id)}">
    <div class="category-icon">${escapeHtml(t.icon || '↔️')}</div>
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

/* ==== TELAS ==== */

function home() {
  const t            = totals();
  const cards        = state.accounts.filter(isCredit);
  const balance      = state.accounts.reduce((sum, a) => sum + accountBalance(a), 0);
  const availableCredit = cards.reduce((sum, card) => sum + Math.max(Number(card.limit || 0) - creditUsed(card), 0), 0);
  const nextInvoice = cards.flatMap(card => {
    const months = [...new Set(state.transactions
      .filter(tx => tx.type === 'expense' && tx.accountId === card.id)
      .map(tx => tx.invoiceMonth || monthOf(tx.date)))];
    return months.map(month => ({
      card, month, remaining: invoiceRemaining(card, month),
      dueDate: `${month}-${String(Math.min(card.dueDay || 5, lastDayOfMonth(month))).padStart(2, '0')}`
    }));
  }).filter(invoice => invoice.remaining > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const alertCards = cards.filter(c => {
    const used = creditUsed(c);
    return c.limit && used / c.limit >= 0.8;
  });

  const monthDate = new Date(`${state.selectedMonth}-01T12:00:00`);
  const monthName = monthDate.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  const monthYear = monthDate.toLocaleDateString('pt-BR', { year: 'numeric' });
  const grouped = {};
  inMonth().sort((a, b) => b.date.localeCompare(a.date)).forEach(tx => (grouped[tx.date] ??= []).push(tx));
  const transactions = Object.entries(grouped).map(([date, list]) => {
    const dayTotals = totals(list);
    const labelDate = new Date(`${date}T12:00:00`);
    const weekday = labelDate.toLocaleDateString('pt-BR', { weekday: 'long' });
    const day = labelDate.toLocaleDateString('pt-BR', { day: '2-digit' });
    const totalLabel = dayTotals.expense ? `Despesas: ${money(dayTotals.expense)}` : `Receitas: ${money(dayTotals.income)}`;
    return `<div class="home-day">
      <div class="home-day-heading"><span>${day} · ${weekday}</span><span>${totalLabel}</span></div>
      <div class="home-transactions">${list.map(transactionHTML).join('')}</div>
    </div>`;
  }).join('');

  return `<div class="home-layout">
  <header class="top home-top">
    <div class="home-header">
      <button class="home-icon" data-go="settings" aria-label="Ajustes"><span aria-hidden="true">☰</span></button>
      <h1>EduFinance</h1>
      <button class="home-icon privacy-toggle" id="toggleAmounts" aria-label="${state.hideAmounts ? 'Mostrar valores' : 'Ocultar valores'}" aria-pressed="${state.hideAmounts}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${state.hideAmounts ? '<path d="m4 4 16 16"/>' : ''}</svg>
      </button>
      <button class="home-icon" id="searchBtn" aria-label="Buscar lançamentos"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg></button>
      <button class="home-icon" id="monthPickerBtn" aria-label="Escolher mês"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg></button>
    </div>
    <div class="home-summary">
      <div class="home-month"><span>${monthYear}</span><b>${monthName}<span class="month-arrows"><button data-month="-1" aria-label="Mês anterior">‹</button><button data-month="1" aria-label="Próximo mês">›</button></span></b></div>
      <div><span>Despesas</span><b>${money(t.expense)}</b></div>
      <div><span>Receitas</span><b>${money(t.income)}</b></div>
      <div><span>Saldo</span><b>${money(balance)}</b></div>
    </div>
  </header>
  <div class="content home-content">
    <div class="home-finance-heading">
      <h2>Cartões</h2>
      <button type="button" id="toggleHomeCards" aria-expanded="${!state.hideHomeCards}" aria-label="${state.hideHomeCards ? 'Mostrar resumos dos cartões' : 'Ocultar resumos dos cartões'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${state.hideHomeCards ? '<path d="m4 4 16 16"/>' : ''}</svg>
        ${state.hideHomeCards ? 'Mostrar' : 'Ocultar'}
      </button>
    </div>
    ${state.hideHomeCards ? '' : `<div class="home-finance-cards">
      <button type="button" class="home-finance-card" data-go="accounts">
        <span>Disponível nos cartões</span>
        <strong>${money(availableCredit)}</strong>
      </button>
      <button type="button" class="home-finance-card" data-go="invoices">
        <span>${nextInvoice ? (nextInvoice.dueDate < today() ? 'Fatura vencida' : 'Próximo vencimento') : 'Faturas abertas'}</span>
        <strong>${nextInvoice ? money(nextInvoice.remaining) : 'Tudo em dia'}</strong>
        <small>${nextInvoice ? `${escapeHtml(nextInvoice.card.name)} · vence ${dateFull(nextInvoice.dueDate)}` : 'Nenhuma fatura pendente'}</small>
      </button>
    </div>`}
    ${alertCards.map(c => {
      const used = creditUsed(c);
      const pct  = Math.round(used / c.limit * 100);
      return `<div class="alert-banner home-alert ${pct >= 95 ? 'danger' : ''}">
        <span class="home-alert-icon" aria-hidden="true">!</span><span><b>${escapeHtml(c.name)}</b> está em ${pct}% do limite (${money(used)} de ${money(c.limit)})</span>
      </div>`;
    }).join('')}

    <div class="section-head home-section-head">
      <h2 class="section-title">Movimentações</h2>
      <button class="link" data-go="all">Ver todas</button>
    </div>
    ${transactions || '<div class="empty"><b>Nenhum lançamento neste mês</b>Use o botão + para registrar uma movimentação.</div>'}
  </div>
  </div>`;
}

function stats() {
  const filterLabels = { day: 'Hoje', week: 'Semana', month: 'Mês', year: 'Ano', all: 'Tudo' };
  let list;
  if      (statsFilter === 'day')   list = state.transactions.filter(t => t.date === today());
  else if (statsFilter === 'week')  list = state.transactions.filter(t => t.date >= startOfWeek() && t.date <= today());
  else if (statsFilter === 'month') list = inMonth();
  else if (statsFilter === 'year')  list = state.transactions.filter(t => t.date?.startsWith(state.selectedMonth.slice(0, 4)));
  else                              list = state.transactions;

  const type = statsType === 'income' ? 'income' : 'expense';
  const typeLabel = type === 'income' ? 'Receitas' : 'Despesas';
  const byCategory = {};
  list.filter(x => x.type === type).forEach(x => {
    if (!byCategory[x.category]) byCategory[x.category] = { icon: x.icon, total: 0, count: 0 };
    byCategory[x.category].total += Number(x.amount);
    byCategory[x.category].count++;
  });
  const topCats = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);
  const total = topCats.reduce((sum, [, data]) => sum + data.total, 0);
  const colors = ['#2563eb', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6', '#64748b', '#0ea5e9'];
  let angle = 0;
  const slices = topCats.map(([, data], i) => {
    const start = angle;
    angle += total ? data.total / total * 360 : 0;
    return `${colors[i % colors.length]} ${start}deg ${angle}deg`;
  });
  const donut = total ? `conic-gradient(${slices.join(', ')})` : 'conic-gradient(var(--line) 0deg 360deg)';
  const periods = [-3, -2, -1, 0].map(delta => {
    const month = addMonths(currentMonth(), delta);
    const label = month === currentMonth() ? 'Este mês'
      : month === addMonths(currentMonth(), -1) ? 'Mês passado'
        : new Date(`${month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }).replace('.', '');
    return `<button data-stats-month="${month}" class="${statsFilter === 'month' && state.selectedMonth === month ? 'active' : ''}">${label}</button>`;
  }).join('');
  const periodLabel = statsFilter === 'month' ? monthLabel(state.selectedMonth) : filterLabels[statsFilter];
  const rangeFilters = Object.entries(filterLabels).map(([key, label]) =>
    `<option value="${key}" ${statsFilter === key ? 'selected' : ''}>${label}</option>`
  ).join('');

  return `<div class="report-page">
    <header class="report-top">
      <div class="report-topbar"><h1>Relatórios</h1><button class="report-calendar" id="monthPickerBtn" aria-label="Escolher mês"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg></button></div>
      <div class="report-type-switch">
        <button data-stats-type="expense" class="${type === 'expense' ? 'active' : ''}">Despesas</button>
        <button data-stats-type="income" class="${type === 'income' ? 'active' : ''}">Receitas</button>
      </div>
    </header>
    <div class="report-period-row">
      <div class="report-periods">${periods}</div>
      <select id="reportRange" aria-label="Filtrar período">${rangeFilters}</select>
    </div>
    <div class="report-content">
      <div class="report-chart-card">
        <div class="report-donut" style="--donut:${donut}">
          <div class="report-donut-hole"><strong>${money(total)}</strong><span>${typeLabel} · ${periodLabel}</span></div>
        </div>
        <div class="report-legend">
          ${topCats.length ? topCats.slice(0, 5).map(([name, data], i) => {
            const share = total ? data.total / total * 100 : 0;
            return `<div class="report-legend-row"><i style="--category-color:${colors[i % colors.length]}"></i><span>${escapeHtml(name)}</span><b>${share.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</b></div>`;
          }).join('') : '<div class="report-empty">Sem movimentações neste período.</div>'}
        </div>
      </div>
      <div class="report-category-list">
        ${topCats.length ? topCats.map(([name, data], i) => {
          const share = total ? data.total / total * 100 : 0;
          return `<button type="button" class="report-category-row" data-open-category="${escapeHtml(name)}" data-category-type="${type}" style="--category-color:${colors[i % colors.length]};--category-width:${share}%">
            <span class="report-category-icon">${escapeHtml(data.icon || '•')}</span>
            <div class="report-category-main"><strong>${escapeHtml(name)}</strong><div class="report-category-track"><i></i></div><small>${share.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</small></div>
            <b class="report-category-total">${money(data.total)}</b>
          </button>`;
        }).join('') : ''}
      </div>
    </div>
  </div>`;
}

function categoryDetail() {
  const type = selectedCategoryType === 'income' ? 'income' : 'expense';
  const category = state.categories[type].find(c => c.name === selectedCategoryName);
  let entries = state.transactions.filter(t => t.category === selectedCategoryName && t.type === type);
  if (statsFilter === 'day') entries = entries.filter(t => t.date === today());
  else if (statsFilter === 'week') entries = entries.filter(t => t.date >= startOfWeek() && t.date <= today());
  else if (statsFilter === 'month') entries = entries.filter(t => t.date?.startsWith(state.selectedMonth));
  else if (statsFilter === 'year') entries = entries.filter(t => t.date?.startsWith(state.selectedMonth.slice(0, 4)));

  const total = entries.reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const daysInMonth = statsFilter === 'month' ? lastDayOfMonth(state.selectedMonth) : 0;
  const perDay = {};
  entries.forEach(t => { perDay[t.date] = (perDay[t.date] || 0) + Number(t.amount || 0); });
  let chartDays;
  if (statsFilter === 'month') {
    chartDays = Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      return { label: String(i + 1), value: perDay[`${state.selectedMonth}-${day}`] || 0 };
    });
  } else {
    chartDays = Object.entries(perDay).sort(([a], [b]) => a.localeCompare(b)).slice(-31)
      .map(([date, value]) => ({ label: dateText(date), value }));
  }
  if (!chartDays.length) chartDays = [{ label: '', value: 0 }];
  const maxValue = Math.max(...chartDays.map(d => d.value), 1);
  const plotLeft = 30, plotRight = 330, plotTop = 14, plotBottom = 110;
  const points = chartDays.map((day, i) => {
    const x = chartDays.length === 1 ? (plotLeft + plotRight) / 2 : plotLeft + i / (chartDays.length - 1) * (plotRight - plotLeft);
    const y = plotBottom - day.value / maxValue * (plotBottom - plotTop);
    return { x, y, label: day.label, value: day.value };
  });
  const line = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dateLabels = points.filter((_, i) => i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2))
    .map(p => `<text x="${p.x}" y="128" text-anchor="middle">${escapeHtml(p.label)}</text>`).join('');
  const average = total / (statsFilter === 'month' ? daysInMonth : Math.max(Object.keys(perDay).length, 1));
  const sortedEntries = [...entries].sort((a, b) => categoryDetailSort === 'amount'
    ? Number(b.amount) - Number(a.amount) || b.date.localeCompare(a.date)
    : b.date.localeCompare(a.date) || Number(b.amount) - Number(a.amount));

  return `<div class="category-detail-page">
    <header class="category-detail-top">
      <div class="category-detail-header">
        <button class="category-back" data-go="stats" aria-label="Voltar aos relatórios">‹</button>
        <div class="category-detail-title"><span>${escapeHtml(category?.icon || '🏷️')}</span><h1>${escapeHtml(selectedCategoryName || 'Categoria')}</h1></div>
        <button class="category-detail-calendar" id="monthPickerBtn" aria-label="Escolher mês"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg></button>
      </div>
      <p>${statsFilter === 'month' ? monthLabel(state.selectedMonth) : ({ day: 'Hoje', week: 'Esta semana', year: `Ano ${state.selectedMonth.slice(0, 4)}`, all: 'Todo o período' }[statsFilter] || monthLabel(state.selectedMonth))}</p>
    </header>
    <div class="category-detail-content">
      <div class="category-detail-summary">
        <div><span>Total</span><strong>${money(total)}</strong></div>
        <div><span>Média diária</span><strong>${money(average)}</strong></div>
        <div><span>Lançamentos</span><strong>${entries.length}</strong></div>
      </div>
      <div class="category-detail-chart">
        <svg viewBox="0 0 360 138" role="img" aria-label="Valores diários em ${escapeHtml(selectedCategoryName)}">
          <line x1="30" y1="14" x2="30" y2="110" class="detail-chart-axis" />
          <line x1="30" y1="110" x2="330" y2="110" class="detail-chart-axis" />
          <text x="24" y="18" text-anchor="end">${money(maxValue)}</text>
          <text x="24" y="113" text-anchor="end">0</text>
          <polyline points="${line}" class="detail-chart-line" />
          ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="${p.value ? 3 : 2}" class="detail-chart-point" />`).join('')}
          ${dateLabels}
        </svg>
      </div>
      <div class="category-detail-list-head">
        <h2>${type === 'income' ? 'Receitas' : 'Despesas'}</h2>
        <div class="category-sort" role="group" aria-label="Ordenar movimentações">
          <button data-detail-sort="date" class="${categoryDetailSort === 'date' ? 'active' : ''}">Por data</button>
          <button data-detail-sort="amount" class="${categoryDetailSort === 'amount' ? 'active' : ''}">Por valor</button>
        </div>
      </div>
      <div class="category-detail-entries">
        ${sortedEntries.length ? sortedEntries.map(t => {
          const share = total ? Number(t.amount) / total * 100 : 0;
          return `<article class="category-detail-entry" data-tx-id="${escapeHtml(t.id)}">
            <span class="category-detail-entry-icon">${escapeHtml(t.icon || category?.icon || '🏷️')}</span>
            <div class="category-detail-entry-info">
              <strong>${escapeHtml(t.note || t.category || selectedCategoryName)}</strong>
              <div class="category-detail-entry-bar"><i style="width:${share}%"></i></div>
              <small>${dateFull(t.date)} · ${share.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</small>
            </div>
            <b class="amount ${type}">${money(t.amount)}</b>
          </article>`;
        }).join('') : '<div class="empty"><b>Sem lançamentos nessa categoria</b>Escolha outro período ou adicione uma movimentação.</div>'}
      </div>
    </div>
  </div>`;
}

function budget() {
  const t    = totals();
  const actualUsed = state.budget ? t.expense / state.budget * 100 : 0;
  const used = Math.min(actualUsed, 100);

  const byCategory = {};
  inMonth().filter(x => x.type === 'expense').forEach(x => {
    byCategory[x.category] = (byCategory[x.category] || 0) + Number(x.amount);
  });
  const goals = Object.entries(state.categoryBudgets)
    .map(([name, amount]) => {
      const category = state.categories.expense.find(c => c.name === name);
      const spent = byCategory[name] || 0;
      const progress = amount > 0 ? spent / amount * 100 : 0;
      return category && amount > 0 ? { category, amount, spent, progress } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.progress - a.progress);

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
        <span>${Math.round(actualUsed)}%</span>
      </div>
      <div class="budget-progress ${budgetHeatClass(actualUsed)}"><i style="width:${used}%"></i></div>
      <div class="row" style="font-size: 0.8125rem;color:var(--muted)">
        <span>${money(t.expense)} utilizado</span>
        <span>${money(Math.max(state.budget - t.expense, 0))} restante</span>
      </div>
    </div>
    <button class="save" id="editBudget" style="margin-top:12px">Definir orçamento geral</button>

    <div class="budget-goals-heading"><h2 class="section-title">Metas por categoria</h2><span>${goals.length} ${goals.length === 1 ? 'meta' : 'metas'}</span></div>
    ${goals.length ? `<div class="setting-list">
      ${goals.map(({ category, amount, spent, progress }) => `
        <div class="setting category-row" data-cat-budget="${escapeHtml(category.name)}">
          <span class="s-icon">${escapeHtml(category.icon)}</span>
          <span style="flex:1">
            <strong>${escapeHtml(category.name)}</strong>
            <small>${money(spent)} de ${money(amount)} · ${Math.round(progress)}%</small>
            <div class="budget-progress ${budgetHeatClass(progress)}" style="margin:6px 0 0"><i style="width:${Math.min(progress, 100)}%"></i></div>
          </span>
          <b class="chev">›</b>
        </div>`).join('')}
    </div>` : '<div class="empty">Nenhuma meta por categoria definida.</div>'}
    <button class="save budget-add-goal" id="addCategoryBudget">Adicionar meta por categoria</button>
  </div>`;
}

function settings() {
  const recCount = (state.recurring || []).length;
  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" style="opacity:0" aria-hidden="true" tabindex="-1">‹</button>
      <span class="period">Meu Controle</span>
      <button class="icon-btn" id="searchBtn" aria-label="Buscar">🔍</button>
    </div>
    <div class="balance-label">Organize sua vida financeira</div>
    <div class="balance" style="font-size: 1.375rem">Configurações</div>
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
      <button class="setting" data-go="themes">
        <span class="s-icon">🎨</span>
        <span><strong>Temas</strong><small>${themeOptions.find(theme => theme.id === state.theme)?.label || 'Padrão'} · ${{ light: 'Claro', dark: 'Escuro', system: 'Seguir sistema' }[state.colorMode]}</small></span>
        <b class="chev">›</b>
      </button>
      <button class="setting" data-go="fontSize">
        <span class="s-icon">Aa</span>
        <span><strong>Tamanho da fonte</strong><small>${['Pequeno', 'Padrão', 'Grande', 'Muito grande'][state.fontScale] || 'Padrão'}</small></span>
        <b class="chev">›</b>
      </button>
      <button class="setting" data-go="privacy">
        <span class="s-icon">🔒</span>
        <span><strong>Privacidade e bloqueio</strong><small>${state.pinLock?.enabled ? 'PIN ativado' : 'Ocultar valores e configurar PIN'}</small></span>
        <b class="chev">›</b>
      </button>
      <button class="setting sound-setting" id="toggleTapSound" aria-pressed="${state.soundEnabled}" aria-label="Som dos toques ${state.soundEnabled ? 'ativado' : 'desativado'}">
        <span class="s-icon">${state.soundEnabled ? '🔊' : '🔇'}</span>
        <span><strong>Som dos toques</strong><small>${state.soundEnabled ? 'Ativado' : 'Desativado'}</small></span>
        <span class="setting-toggle ${state.soundEnabled ? 'enabled' : ''}" aria-hidden="true"><i></i></span>
      </button>
      <button class="setting" id="installApp">
        <span class="s-icon">⬇</span>
        <span><strong>${window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone ? 'EduFinance instalado' : 'Baixar o app'}</strong><small>Adicionar à tela inicial</small></span>
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
      <button class="setting" data-go="recurring">
        <span class="s-icon">🔁</span>
        <span><strong>Lançamentos recorrentes</strong><small>${recCount} ativo(s)</small></span>
        <b class="chev">›</b>
      </button>
    </div>

    <h2 class="section-title" style="margin-top:24px">Dados</h2>
    <div class="setting-list">
      <button class="setting" id="exportData">
        <span class="s-icon">📤</span>
        <span><strong>Exportar backup</strong><small>Baixar arquivo JSON</small></span>
        <b class="chev">›</b>
      </button>
      <button class="setting" id="importData">
        <span class="s-icon">📥</span>
        <span><strong>Importar dados</strong><small>Restaurar de um arquivo JSON</small></span>
        <b class="chev">›</b>
      </button>
      <button class="setting danger-setting" id="clearData">
        <span class="s-icon">⚠</span>
        <span><strong>Apagar todos os dados</strong><small>Apaga tudo deste dispositivo. Não dá para desfazer.</small></span>
        <b class="chev">›</b>
      </button>
    </div>
  </div>`;
}

function privacyPage() {
  const pinEnabled = Boolean(state.pinLock?.enabled);
  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings" aria-label="Voltar">‹</button>
      <span class="period">Privacidade</span>
      <span style="width:36px"></span>
    </div>
    <div class="balance-label">Proteja sua privacidade</div>
    <div class="balance" style="font-size:1.375rem">Valores e bloqueio</div>
  </header>
  <div class="content privacy-content">
    <div class="privacy-option">
      <div><strong>Ocultar valores</strong><small>Esconde os valores monetários nas telas.</small></div>
      <button type="button" id="privacyToggleAmounts" class="privacy-switch ${state.hideAmounts ? 'enabled' : ''}" role="switch" aria-checked="${state.hideAmounts}" aria-label="Ocultar valores"><span></span></button>
    </div>
    ${pinEnabled ? `<div class="privacy-panel">
      <h2>PIN de acesso ativado</h2>
      <p>Digite seu PIN atual para desativar o bloqueio.</p>
      <form id="disablePinForm">
        <label class="field"><span>PIN atual</span><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{6}" maxlength="6" placeholder="6 dígitos" required></label>
        <button class="save danger">Desativar PIN</button>
      </form>
      <button type="button" id="lockNow" class="modal-secondary privacy-lock-now">Bloquear agora</button>
    </div>` : `<div class="privacy-panel">
      <h2>Bloqueio por PIN</h2>
      <p>O app pedirá o PIN ao abrir e quando voltar do segundo plano.</p>
      <form id="setupPinForm">
        <label class="field"><span>Criar PIN de 6 dígitos</span><input name="pin" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{6}" maxlength="6" placeholder="6 dígitos" required></label>
        <label class="field"><span>Confirmar PIN</span><input name="confirmPin" type="password" inputmode="numeric" autocomplete="new-password" pattern="[0-9]{6}" maxlength="6" placeholder="Digite novamente" required></label>
        <button class="save">Ativar bloqueio</button>
      </form>
    </div>`}
    <p class="privacy-note">O PIN bloqueia o acesso pela interface do app. Os dados continuam armazenados neste dispositivo e não são criptografados pelo PIN. Guarde um backup exportado; se esquecer o PIN, será necessário limpar os dados locais e restaurar o backup.</p>
  </div>`;
}

function lockScreen() {
  return `<section class="app-lock-screen">
    <img src="./icon.svg" alt="" width="72" height="72">
    <h1>EduFinance bloqueado</h1>
    <p>Digite seu PIN para continuar.</p>
    <form id="unlockForm">
      <label class="field"><span>PIN de 6 dígitos</span><input name="pin" type="password" inputmode="numeric" autocomplete="current-password" pattern="[0-9]{6}" maxlength="6" placeholder="••••••" required autofocus></label>
      <button class="save">Desbloquear</button>
    </form>
  </section>`;
}

function themesPage() {
  const modeLabels = { light: 'Claro', dark: 'Escuro', system: 'Seguir o sistema' };
  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings" aria-label="Voltar">‹</button>
      <span class="period">Temas</span>
      <span style="width:36px"></span>
    </div>
    <div class="balance-label">Personalize as cores do EduFinance</div>
    <div class="balance" style="font-size: 1.375rem">Aparência</div>
  </header>
  <div class="content theme-content">
    <section class="theme-mode-section" aria-label="Modo de aparência">
      <h2>Modo</h2>
      <div class="theme-mode-options">
        ${Object.entries(modeLabels).map(([mode, label]) => `<button type="button" data-color-mode="${mode}" class="${state.colorMode === mode ? 'selected' : ''}" aria-pressed="${state.colorMode === mode}">${label}</button>`).join('')}
      </div>
    </section>
    <h2 class="theme-colors-title">Cor de destaque</h2>
    <div class="theme-grid">
      ${themeOptions.map(theme => `<button type="button" class="theme-card ${state.theme === theme.id ? 'selected' : ''}" data-theme-choice="${theme.id}" aria-pressed="${state.theme === theme.id}">
        <span class="theme-preview" data-theme-preview="${theme.id}" aria-hidden="true"><i></i><b>${state.theme === theme.id ? '✓' : ''}</b></span>
        <span class="theme-name">${theme.label}</span>
      </button>`).join('')}
    </div>
  </div>`;
}

function fontSizePage() {
  const labels = ['Pequeno', 'Padrão', 'Grande', 'Muito grande'];
  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings" aria-label="Voltar">‹</button>
      <span class="period">Tamanho da fonte</span>
      <span style="width:36px"></span>
    </div>
    <div class="balance-label">Ajuste a leitura do EduFinance</div>
    <div class="balance" style="font-size: 1.375rem">Tamanho do texto</div>
  </header>
  <div class="content font-size-content">
    <label class="font-size-control" for="fontSizeRange">
      <span class="font-size-current">${labels[state.fontScale]}</span>
      <input id="fontSizeRange" type="range" min="0" max="3" step="1" value="${state.fontScale}" aria-label="Tamanho da fonte" aria-valuetext="${labels[state.fontScale]}">
    </label>
    <div class="font-size-samples" aria-hidden="true">
      <span class="sample-small">A</span><span class="sample-medium">A</span><span class="sample-large">A</span><span class="sample-xlarge">A</span>
    </div>
  </div>`;
}

function accounts() {
  const total = state.accounts.reduce((sum, a) => sum + accountBalance(a), 0);
  const cards = state.accounts.filter(isCredit);

  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings" aria-label="Voltar">‹</button>
      <span class="period">Suas contas</span>
      <button class="icon-btn" id="addAccount" aria-label="Adicionar conta">+</button>
    </div>
    <div class="balance-label">Patrimônio disponível</div>
    <div class="balance">${money(total)}</div>
  </header>
  <div class="content">
    <h2 class="section-title">Contas</h2>
    <div class="cards">
      ${state.accounts.filter(a => !isCredit(a)).map(a => `
        <div class="info-card" data-edit-account="${escapeHtml(a.id)}">
          <div class="info-icon">${escapeHtml(a.icon)}</div>
          <div style="flex:1"><strong>${escapeHtml(a.name)}</strong><small>${money(accountBalance(a))}</small></div>
          <b class="chev" style="color:var(--muted-2)">›</b>
        </div>`).join('')}
    </div>
    <button class="save" id="addAccountBtn" style="margin-top:12px;background:#f1f5f9;color:#475569;box-shadow:none">+ Adicionar conta</button>

    <h2 class="section-title" style="margin-top:22px">Cartões de crédito</h2>
    ${cards.length ? `<div class="cards">
      ${cards.map(c => {
        const used      = creditUsed(c);
        const limit     = Number(c.limit || 0);
        const available = Math.max(limit - used, 0);
        const pct       = limit ? Math.min((used / limit) * 100, 100) : 0;
        const invoice   = creditInvoiceTotal(c, state.selectedMonth);
        return `
        <div class="info-card" style="flex-direction:column;align-items:stretch;gap:10px" data-edit-card="${escapeHtml(c.id)}">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="info-icon">${escapeHtml(c.icon)}</div>
            <div style="flex:1"><strong>${escapeHtml(c.name)}</strong><small>Fecha dia ${c.closingDay} · Vence dia ${c.dueDay}</small></div>
          </div>
          <div class="budget-progress ${pct >= 95 ? 'danger' : pct >= 80 ? 'warn' : ''}"><i style="width:${pct}%"></i></div>
          <div class="row" style="font-size: 0.75rem;color:var(--muted)">
            <span>Comprometido ${money(used)}</span>
            <span>Disponível ${money(available)}</span>
          </div>
          <div class="row" style="font-size: 0.75rem;color:var(--muted)">
            <span>Fatura de ${monthLabel(state.selectedMonth)}</span>
            <b style="color:var(--expense)">${money(invoice)}</b>
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
      const p     = purchasesMap[key];
      const month = t.invoiceMonth || monthOf(t.date);
      if (month <= currentMonth()) { p.paid++; p.paidAmount += Number(t.amount); }
      else                         { p.remaining++; p.remainingAmount += Number(t.amount); }
    });

  const purchases = Object.values(purchasesMap).sort((a, b) => b.purchaseDate.localeCompare(a.purchaseDate));

  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings" aria-label="Voltar">‹</button>
      <span class="period">Compras parceladas</span>
      <button class="icon-btn" style="opacity:0" aria-hidden="true" tabindex="-1">·</button>
    </div>
    <div class="balance-label">${purchases.length} compra(s) parcelada(s)</div>
    <div class="balance" style="font-size: 1.375rem">Parcelas</div>
  </header>
  <div class="content">
    ${purchases.length ? purchases.map(p => {
      const card = state.accounts.find(a => a.id === p.accountId);
      const pct  = Math.round(p.paid / p.total * 100);
      return `
      <div class="panel" style="margin-bottom:12px">
        <div class="row">
          <strong>${escapeHtml(p.icon)} ${escapeHtml(p.category)}</strong>
          <span style="color:var(--muted);font-size: 0.75rem">${card ? escapeHtml(card.icon) + ' ' + escapeHtml(card.name) : ''}</span>
        </div>
        ${p.note ? `<small style="color:var(--muted);font-size: 0.75rem;display:block;margin-top:3px">${escapeHtml(p.note)}</small>` : ''}
        <div class="row" style="margin-top:10px;font-size: 0.8125rem">
          <span>${money(p.totalAmount)} em ${p.total}x</span>
          <b>${p.paid}/${p.total} pagas</b>
        </div>
        <div class="budget-progress"><i style="width:${pct}%"></i></div>
        <div class="row" style="font-size: 0.75rem;color:var(--muted)">
          <span>Compra: ${dateText(p.purchaseDate)}</span>
          <span>Falta ${money(p.remainingAmount)}</span>
        </div>
      </div>`;
    }).join('') : '<div class="empty"><b>Nenhuma compra parcelada</b>Cadastre um cartão e faça uma compra em várias parcelas.</div>'}
  </div>`;
}

function invoicesPage() {
  const cards  = state.accounts.filter(isCredit);
  const months = [-2, -1, 0, 1, 2].map(d => addMonths(state.selectedMonth, d));

  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings" aria-label="Voltar">‹</button>
      <span class="period">Faturas do cartão</span>
      <button class="icon-btn" style="opacity:0" aria-hidden="true" tabindex="-1">·</button>
    </div>
    <div class="balance-label">Acompanhe suas faturas</div>
    <div class="balance" style="font-size: 1.375rem">Faturas</div>
  </header>
  <div class="content">
    <div class="topbar" style="justify-content:center;margin-bottom:14px">${monthChanger()}</div>
    ${cards.length ? cards.map(c => {
      const invoice   = creditInvoiceTotal(c, state.selectedMonth);
      const used      = creditUsed(c);
      const remaining = invoiceRemaining(c, state.selectedMonth);
      return `
      <div class="panel" style="margin-bottom:14px">
        <div class="row">
          <strong>${escapeHtml(c.icon)} ${escapeHtml(c.name)}</strong>
          <span style="color:var(--muted);font-size: 0.75rem">Limite ${money(c.limit)}</span>
        </div>
        <div class="row" style="margin-top:10px">
          <div>
            <small style="color:var(--muted);font-size: 0.6875rem">Fatura de ${monthLabel(state.selectedMonth)}</small>
            <div class="stat-number" style="color:var(--expense);margin:4px 0">${money(invoice)}</div>
          </div>
          <div style="text-align:right">
            <small style="color:var(--muted);font-size: 0.6875rem">Limite comprometido</small>
            <div class="stat-number" style="margin:4px 0">${money(used)}</div>
          </div>
        </div>
        ${remaining > 0
          ? `<button class="save" data-pay-invoice="${escapeHtml(c.id)}" data-invoice-month="${state.selectedMonth}" data-invoice-amount="${remaining}">💸 Pagar ${money(remaining)} · ${monthLabel(state.selectedMonth)}</button>`
          : invoice > 0
            ? '<div style="text-align:center;color:var(--income);font-size: 0.8125rem;padding:10px;font-weight:700">✓ Fatura paga</div>'
            : '<div style="text-align:center;color:var(--muted);font-size: 0.8125rem;padding:10px">Sem fatura para este mês</div>'}
      </div>`;
    }).join('') : '<div class="empty"><b>Nenhum cartão cadastrado</b>Cadastre um cartão em Contas e cartões.</div>'}

    ${cards.length ? `<h2 class="section-title" style="margin-top:14px">Histórico de faturas</h2>
    ${months.map(m => {
      const total = cards.reduce((s, c) => s + creditInvoiceTotal(c, m), 0);
      if (!total) return '';
      return `<div class="invoice-row"><span>${monthLabel(m)}</span><b>${money(total)}</b></div>`;
    }).join('')}` : ''}
  </div>`;
}

function categoriesPage() {
  const list = (type, title) => {
    const cats = state.categories[type];
    const rows = (hidden) => cats.map((c, index) => ({ c, index })).filter(({ c }) => Boolean(c.hidden) === hidden).map(({ c, index }) => `
      <div class="setting category-row ${c.hidden ? 'is-hidden' : ''}">
        <span class="s-icon">${escapeHtml(c.icon)}</span>
        <span class="category-label"><strong>${escapeHtml(c.name)}</strong><small>${c.hidden ? 'Oculta' : type === 'income' ? 'Receita' : 'Despesa'}</small></span>
        <div class="category-actions">
          <button type="button" data-category-move="${type}" data-category-index="${index}" data-direction="-1" aria-label="Mover ${escapeHtml(c.name)} para cima" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-category-move="${type}" data-category-index="${index}" data-direction="1" aria-label="Mover ${escapeHtml(c.name)} para baixo" ${index === cats.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-edit-category="${type}" data-category-index="${index}" aria-label="Editar ${escapeHtml(c.name)}">✎</button>
          <button type="button" data-toggle-category="${type}" data-category-index="${index}" aria-label="${c.hidden ? 'Reativar' : 'Ocultar'} ${escapeHtml(c.name)}" ${!c.hidden && cats.filter(item => !item.hidden).length <= 1 ? 'disabled' : ''}>${c.hidden ? '↺' : '◉'}</button>
          <button type="button" data-remove-category="${type}" data-category-name="${escapeHtml(c.name)}" aria-label="Excluir ${escapeHtml(c.name)}">×</button>
        </div>
      </div>`).join('');
    const visibleRows = rows(false);
    const hiddenRows = rows(true);
    return `
      <h2 class="section-title" style="margin-top:22px">${title}</h2>
      <div class="setting-list">${visibleRows || '<div class="category-empty">Nenhuma categoria ativa.</div>'}</div>
      ${hiddenRows ? `<h3 class="category-hidden-title">Ocultas</h3><div class="setting-list">${hiddenRows}</div>` : ''}`;
  };

  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings" aria-label="Voltar">‹</button>
      <span class="period">Categorias</span>
      <button class="icon-btn" id="addCategory" aria-label="Adicionar categoria">+</button>
    </div>
    <div class="balance-label">Personalize seus lançamentos</div>
    <div class="balance" style="font-size: 1.375rem">Categorias</div>
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
      <button class="icon-btn" data-go="home" aria-label="Voltar">‹</button>
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

function recurringPage() {
  const list = state.recurring || [];
  return `<header class="top">
    <div class="topbar">
      <button class="icon-btn" data-go="settings" aria-label="Voltar">‹</button>
      <span class="period">Recorrentes</span>
      <span style="width:36px"></span>
    </div>
    <div class="balance-label">Lançamentos que se repetem todo mês</div>
    <div class="balance" style="font-size: 1.375rem">${list.length} ativo(s)</div>
  </header>
  <div class="content">
    ${list.length ? `<div class="setting-list">${list.map(r => `
      <div class="setting category-row">
        <span class="s-icon">${escapeHtml(r.icon)}</span>
        <span>
          <strong>${escapeHtml(r.category)} · ${money(r.amount)}</strong>
          <small>${r.type === 'income' ? 'Receita' : 'Despesa'} · todo dia ${r.day} · ${escapeHtml(accountName(r.accountId))}${r.note ? ` · ${escapeHtml(r.note)}` : ''}</small>
        </span>
        <button class="remove-category" data-remove-recurring="${escapeHtml(r.id)}" aria-label="Parar de repetir">×</button>
      </div>`).join('')}</div>`
    : '<div class="empty"><b>Nenhum lançamento recorrente</b>Ao criar um lançamento, ative "Repetir todo mês".</div>'}
  </div>`;
}

function maskVisibleAmounts(root) {
  if (!state.hideAmounts || !root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (/R\$\s*[\d.,]+/.test(node.nodeValue)) {
      node.nodeValue = node.nodeValue.replace(/R\$\s*[\d.,]+/g, 'R$ •••••');
    }
  }
}

/* ==== RENDER ==== */
function render() {
  const screens = {
    home, stats, categoryDetail, budget, settings, privacy: privacyPage, lock: lockScreen, themes: themesPage, fontSizePage, accounts,
    categories:   categoriesPage,
    all,
    installments: installmentsPage,
    invoices:     invoicesPage,
    recurring:    recurringPage
  };
  screens.fontSize = fontSizePage;
  const screen = document.getElementById('screen');
  const html   = (screens[page] || home)();

  screen.style.animation = 'none';
  screen.offsetHeight; // reflow
  screen.innerHTML = html;
  screen.style.animation = '';
  document.body.dataset.appLocked = page === 'lock' && Boolean(state.pinLock?.enabled) ? 'true' : 'false';
  maskVisibleAmounts(screen);

  screen.querySelectorAll('.balance, .stat-number').forEach(el => {
    el.style.opacity   = '0';
    el.style.transform = 'translateY(8px)';
    requestAnimationFrame(() => {
      el.style.transition = 'opacity .5s ease, transform .5s cubic-bezier(.22,1,.36,1)';
      el.style.opacity    = '1';
      el.style.transform  = 'translateY(0)';
    });
  });

  document.querySelectorAll('.nav-item').forEach(x => {
    x.classList.toggle('active', x.dataset.page === page);
    x.toggleAttribute('aria-current', x.dataset.page === page);
  });

  // Acessibilidade: tornar elementos clicáveis focáveis via teclado
  screen.querySelectorAll('[data-tx-id],[data-edit-account],[data-edit-card],[data-cat-budget]')
    .forEach(el => { el.tabIndex = 0; el.setAttribute('role', 'button'); });

  // Rotular icon-btns sem aria-label
  screen.querySelectorAll('.icon-btn:not([aria-label])').forEach(b => {
    if (b.getAttribute('style')?.includes('opacity:0')) {
      b.setAttribute('aria-hidden', 'true'); b.tabIndex = -1; return;
    }
    b.setAttribute('aria-label', { '‹': 'Voltar', '+': 'Adicionar' }[b.textContent.trim()] || 'Ação');
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}
