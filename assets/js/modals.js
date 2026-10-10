/* Criação e edição de lançamentos, contas, cartões e categorias. */
/* ==== MODAIS ==== */

function modal() {
  /* ── estado interno ───────────────────────────────────────────── */
  let type         = 'expense';
  let selected     = selectableCategories('expense')[0];
  let payment      = 'account';
  let installments = 1;

  const root      = document.getElementById('modalRoot');
  const cards     = state.accounts.filter(isCredit);
  const nonCredit = state.accounts.filter(a => !isCredit(a));
  const hasCards  = cards.length > 0;

  /* ── helper show/hide sem recriar elementos ───────────────────── */
  const $  = sel => root.querySelector(sel);
  const show = (sel, v) => { const el = $(sel); if (el) el.style.display = v ? '' : 'none'; };

  /* ── monta o HTML UMA ÚNICA VEZ ──────────────────────────────── */
  root.innerHTML = `
  <div class="modal-backdrop" id="_msBd">
    <form class="modal" id="_msForm">
      <div class="handle"></div>
      <h2 class="modal-title">Novo lançamento</h2>

      <!-- tipo -->
      <div class="type-switch">
        <button type="button" data-type="expense"  class="selected">Despesa</button>
        <button type="button" data-type="income">Receita</button>
      </div>

      <!-- valor -->
      <input class="amount-input" name="amount" inputmode="decimal" placeholder="R$ 0,00" data-money required>

      <!-- forma de pagamento (só aparece em despesa com cartão) -->
      <div id="_ms_payment">
        <label class="field"><span>Forma de pagamento</span>
          <div class="type-switch" style="grid-template-columns:1fr 1fr">
            <button type="button" data-pay="account" class="selected">Conta</button>
            <button type="button" data-pay="credit">Crédito</button>
          </div>
        </label>
      </div>

      <!-- seção: despesa / receita -->
      <div id="_ms_normal">
        <label class="field"><span>Categoria</span>
          <div class="categories" id="_ms_cats"></div>
        </label>

        <!-- conta de débito -->
        <div id="_ms_acct">
          <label class="field"><span>Conta</span>
            <select name="accountId">
              ${nonCredit.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('')}
            </select>
          </label>
        </div>

        <!-- cartão + parcelas (name="cardId" para não conflitar com accountId) -->
        <div id="_ms_credit">
          <label class="field"><span>Cartão</span>
            <select name="cardId">
              ${cards.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>Parcelas</span>
            <select name="installments">
              ${Array.from({ length: 24 }, (_, i) => i + 1).map(n => `<option value="${n}">${n}x</option>`).join('')}
            </select>
          </label>
        </div>

        <!-- repetir todo mês -->
        <div id="_ms_repeat">
          <label class="field" style="display:flex;gap:10px;align-items:center;cursor:pointer">
            <input type="checkbox" name="repeat" style="width:auto;cursor:pointer">
            <span style="margin:0">Repetir todo mês</span>
          </label>
        </div>
      </div>

      <label class="field"><span>Descrição</span>
        <input name="note" placeholder="Ex.: almoço com amigos">
      </label>
      <label class="field"><span>Data da compra</span>
        <input name="date" type="date" value="${dateForSelectedMonth()}">
      </label>
      <button class="save">Salvar lançamento</button>
    </form>
  </div>`;

  /* ── atualiza APENAS classes e display — sem recriar backdrop ── */
  function updateView() {
    const isCreditPay = type === 'expense' && payment === 'credit' && hasCards;

    root.querySelectorAll('[data-type]').forEach(b =>
      b.classList.toggle('selected', b.dataset.type === type)
    );
    root.querySelectorAll('[data-pay]').forEach(b =>
      b.classList.toggle('selected', b.dataset.pay === payment)
    );

    show('#_ms_payment',  type === 'expense' && hasCards);
    show('#_ms_normal',   true);
    show('#_ms_credit',   isCreditPay);
    show('#_ms_acct',     !isCreditPay);
    show('#_ms_repeat',   !isCreditPay);

    /* recria apenas o interior do grid de categorias */
    const cats    = selectableCategories(type, selected?.name || '');
    if (!cats.some(c => c.name === selected?.name)) selected = cats[0];
    const catGrid = $('#_ms_cats');
    if (catGrid) {
      catGrid.innerHTML = cats.map(c =>
        `<button type="button" class="cat-choice${selected.name === c.name ? ' selected' : ''}" data-cat="${escapeHtml(c.name)}" data-icon="${escapeHtml(c.icon)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</button>`
      ).join('');
      catGrid.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
        selected = { name: b.dataset.cat, icon: b.dataset.icon };
        catGrid.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('selected', x === b));
      }));
    }
  }

  /* ── event listeners — registrados uma única vez ─────────────── */
  root.querySelectorAll('[data-type]').forEach(b => b.addEventListener('click', () => {
    type = b.dataset.type;
    payment = 'account'; installments = 1;
    selected = selectableCategories(type)[0];
    updateView();
  }));

  root.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => {
    payment = b.dataset.pay;
    updateView();
  }));

  $('[name=installments]').addEventListener('change', e => {
    installments = Number(e.target.value);
  });

  $('#_msBd').addEventListener('click', e => {
    if (e.target === e.currentTarget) root.innerHTML = '';
  });

  $('#_msForm').addEventListener('submit', e => {
    e.preventDefault();
    const f      = new FormData(e.target);
    const amount = parseMoney(f.get('amount'));
    if (!amount) return toast('Informe um valor válido.');
    const date = f.get('date');

    if (payment === 'credit' && type === 'expense') {
      const card    = state.accounts.find(a => a.id === f.get('cardId'));
      const n       = Number(f.get('installments')) || 1;
      const entries = buildInstallments({
        account: card, category: selected.name, icon: selected.icon,
        note: f.get('note'), total: amount, date, installments: n
      });
      state.transactions.push(...entries);
      state.selectedMonth = monthOf(entries[0].date);
    } else {
      const accountId = f.get('accountId');
      state.transactions.push({
        id: makeId(), type, amount, date, note: f.get('note'),
        category: selected.name, icon: selected.icon, accountId
      });
      if (f.get('repeat')) {
        state.recurring.push({
          id: makeId(), type, category: selected.name, icon: selected.icon,
          accountId, amount,
          day: Number(date.slice(8, 10)),
          note: f.get('note'),
          startMonth: monthOf(date), lastGenerated: monthOf(date),
          active: true
        });
      }
      state.selectedMonth = monthOf(date);
    }

    persist();
    if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
    root.innerHTML = '';
    render();
    toast(payment === 'credit' && type === 'expense' && installments > 1
      ? `${installments} parcelas adicionadas`
      : 'Lançamento salvo com sucesso');
  });

  /* ── renderização inicial das seções ────────────────────────── */
  updateView();
}

function editTransactionModal(txId) {
  const tx   = state.transactions.find(t => t.id === txId);
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

  const isCard  = isCredit(state.accounts.find(a => a.id === tx.accountId));
  let type      = tx.type;
  let selected  = { name: tx.category, icon: tx.icon };
  let accountId = tx.accountId;

  const $e = sel => root.querySelector(sel);

  /* ── constrói HTML uma única vez ──────────────────────────────── */
  const debitAccounts  = state.accounts.filter(a => !isCredit(a));
  const creditAccounts = state.accounts.filter(a => isCredit(a));
  const accountList    = isCard ? creditAccounts : debitAccounts;

  root.innerHTML = `
  <div class="modal-backdrop">
    <form class="modal" id="_etForm">
      <div class="handle"></div>
      <h2 class="modal-title">Editar lançamento</h2>
      ${tx.installment ? `<p class="dialog-copy" style="margin-top:-6px">⚠️ Esta é a parcela ${tx.installment.current}/${tx.installment.total}. Alterações afetam só esta parcela.</p>` : ''}

      <div class="type-switch" style="grid-template-columns:1fr 1fr">
        <button type="button" data-edit-type="expense">Despesa</button>
        <button type="button" data-edit-type="income">Receita</button>
      </div>

      <input class="amount-input" name="amount" inputmode="decimal" data-money value="${money(tx.amount)}" required>

      <label class="field"><span>Categoria</span>
        <div class="categories" id="_et_cats"></div>
      </label>

      <label class="field"><span>${isCard ? 'Cartão' : 'Conta'}</span>
        <select name="accountId">
          ${accountList.map(a => `<option value="${escapeHtml(a.id)}"${a.id === accountId ? ' selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
        </select>
      </label>

      <label class="field"><span>Descrição</span><input name="note" value="${escapeHtml(tx.note || '')}"></label>
      <label class="field"><span>Data</span><input name="date" type="date" value="${tx.date}"></label>

      <button class="save">Salvar alterações</button>
      <button type="button" class="save danger" id="deleteTx" style="margin-top:8px">Excluir</button>
    </form>
  </div>`;

  /* ── atualiza só categorias e botões de tipo — sem recriar backdrop ── */
  function updateEditView() {
    root.querySelectorAll('[data-edit-type]').forEach(b =>
      b.classList.toggle('selected', b.dataset.editType === type)
    );
    const cats = selectableCategories(type, selected?.name || '');
    if (!cats.some(c => c.name === selected?.name)) selected = cats[0];
    const catGrid = $e('#_et_cats');
    if (catGrid) {
      catGrid.innerHTML = cats.map(c =>
        `<button type="button" class="cat-choice${selected.name === c.name ? ' selected' : ''}" data-edit-cat="${escapeHtml(c.name)}" data-icon="${escapeHtml(c.icon)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</button>`
      ).join('');
      catGrid.querySelectorAll('[data-edit-cat]').forEach(b => b.addEventListener('click', () => {
        selected = { name: b.dataset.editCat, icon: b.dataset.icon };
        catGrid.querySelectorAll('[data-edit-cat]').forEach(x => x.classList.toggle('selected', x === b));
      }));
    }
  }

  /* ── event listeners — registrados uma única vez ─────────────── */
  root.querySelectorAll('[data-edit-type]').forEach(b => b.addEventListener('click', () => {
    type = b.dataset.editType;
    updateEditView();
  }));

  $e('.modal-backdrop').addEventListener('click', e => { if (e.target === e.currentTarget) root.innerHTML = ''; });
  $e('#deleteTx').addEventListener('click', () => { closeModal(); deleteTransaction(txId); });
  $e('#_etForm').addEventListener('submit', e => {
    e.preventDefault();
    const f      = new FormData(e.target);
    const amount = parseMoney(f.get('amount'));
    if (!amount) return toast('Informe um valor válido.');
    Object.assign(tx, {
      type, amount,
      category: selected.name, icon: selected.icon,
      accountId: f.get('accountId'),
      note: f.get('note'), date: f.get('date')
    });
    persist();
    if (navigator.vibrate) navigator.vibrate(8);
    closeModal(); render(); toast('Lançamento atualizado');
  });

  updateEditView();
}

function payInvoiceModal(cardId, month, amount) {
  const card = state.accounts.find(a => a.id === cardId);
  if (!card) return;
  const sources = state.accounts.filter(a => !isCredit(a));
  if (!sources.length) return toast('Nenhuma conta disponível para pagar.');

  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal dialog-modal" id="payForm">
        <div class="handle"></div>
        <h2 class="modal-title">Pagar fatura</h2>
        <p class="dialog-copy">
          ${escapeHtml(card.icon)} <b>${escapeHtml(card.name)}</b><br>
          Restante de ${monthLabel(month)}: <b>${money(amount)}</b>
        </p>
        <label class="field"><span>Pagar com</span>
          <select name="fromAccountId">
            ${sources.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} (${money(accountBalance(a))})</option>`).join('')}
          </select>
        </label>
        <label class="field"><span>Valor a pagar</span>
          <input name="amount" inputmode="decimal" data-money value="${money(amount)}" required>
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
    const f     = new FormData(e.target);
    const value = parseMoney(f.get('amount'));
    if (!value) return toast('Valor inválido.');
    if (value > amount + 0.005) return toast('Valor maior que o restante da fatura.');
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
    persist();
    if (navigator.vibrate) navigator.vibrate([8, 30, 8]);
    closeModal(); render(); toast('Fatura paga');
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

  const input   = root.querySelector('#searchInput');
  const results = root.querySelector('#searchResults');
  const count   = root.querySelector('#searchCount');

  function doSearch() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      count.textContent  = '';
      results.innerHTML  = '<div class="empty">Digite para buscar...</div>';
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

function confirmationModal(title, message, onConfirm, confirmLabel = 'Confirmar', danger = false) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal dialog-modal" role="dialog" aria-modal="true">
        <div class="handle"></div>
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        <p class="dialog-copy">${escapeHtml(message)}</p>
        <div class="dialog-actions">
          <button class="modal-secondary" id="cancelModal">Cancelar</button>
          <button class="save${danger ? ' danger' : ''}" id="confirmModal">${escapeHtml(confirmLabel)}</button>
        </div>
      </section>
    </div>`;
  root.querySelector('#cancelModal').onclick = closeModal;
  root.querySelector('#confirmModal').onclick = () => { closeModal(); onConfirm(); };
  root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
}

function inputModal({ title, label, placeholder, value = '', action, money: isMoney = false }) {
  const root = document.getElementById('modalRoot');
  const moneyAttrs = isMoney ? ' inputmode="decimal" data-money' : '';
  root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal dialog-modal" id="inputModal">
        <div class="handle"></div>
        <h2 class="modal-title">${escapeHtml(title)}</h2>
        <label class="field">
          <span>${escapeHtml(label)}</span>
          <input id="modalValue"${moneyAttrs} value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" required autofocus>
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

function categoryModal(initialType = 'expense', editIndex = null) {
  const root = document.getElementById('modalRoot');
  let type = initialType;
  const editing = Number.isInteger(editIndex);
  const existing = editing ? state.categories[type][editIndex] : null;
  let icon = existing?.icon || '🏷️';
  const ICONS = ['🏷️','🍽️','🚕','🛒','🏠','🎉','🙏','⛽','🚗','🩺','💇','🍔','📱','🎮','🎓','💡','🅿️','💰','💸','👨‍👩‍👧','💼','📌','💵','🏦','🎤','👴','❤️','🎁','📚','🐾','🎯','✈️'];

  const $c = sel => root.querySelector(sel);

  /* ── constrói HTML uma única vez ──────────────────────────────── */
  root.innerHTML = `
  <div class="modal-backdrop">
    <form class="modal dialog-modal" id="_catForm">
      <div class="handle"></div>
      <h2 class="modal-title">${editing ? 'Editar categoria' : 'Nova categoria'}</h2>
      ${!editing ? `<div class="type-switch" style="grid-template-columns:1fr 1fr">
        <button type="button" data-category-type="expense">Despesa</button>
        <button type="button" data-category-type="income">Receita</button>
      </div>` : `<p class="category-edit-type">${type === 'income' ? 'Categoria de receita' : 'Categoria de despesa'}</p>`}
      <label class="field"><span>Nome da categoria</span><input name="name" maxlength="40" placeholder="Ex.: Saúde" value="${existing ? escapeHtml(existing.name) : ''}" required autofocus></label>
      <label class="field"><span>Ícone</span><input id="categoryIconInput" name="icon" maxlength="8" value="${escapeHtml(icon)}" aria-label="Emoji da categoria">
        <div class="categories" id="_cat_icons">
          ${ICONS.map(x => `<button type="button" class="cat-choice${icon === x ? ' selected' : ''}" data-icon-choice="${x}">${x}</button>`).join('')}
        </div>
      </label>
      <div class="dialog-actions">
        <button type="button" class="modal-secondary" id="cancelModal">Cancelar</button>
        <button class="save">${editing ? 'Salvar alterações' : 'Criar categoria'}</button>
      </div>
    </form>
  </div>`;

  /* ── atualiza só classes — sem recriar backdrop ── */
  function updateCatView() {
    root.querySelectorAll('[data-category-type]').forEach(b =>
      b.classList.toggle('selected', b.dataset.categoryType === type)
    );
    root.querySelectorAll('[data-icon-choice]').forEach(b =>
      b.classList.toggle('selected', b.dataset.iconChoice === icon)
    );
  }

  /* ── event listeners registrados uma vez ─────────────────────── */
  root.querySelectorAll('[data-category-type]').forEach(b => b.addEventListener('click', () => {
    type = b.dataset.categoryType; updateCatView();
  }));
  root.querySelectorAll('[data-icon-choice]').forEach(b => b.addEventListener('click', () => {
    icon = b.dataset.iconChoice;
    $c('#categoryIconInput').value = icon;
    updateCatView();
  }));
  $c('#categoryIconInput').addEventListener('input', e => {
    icon = e.target.value.trim() || '🏷️';
    updateCatView();
  });

  $c('#cancelModal').addEventListener('click', closeModal);
  $c('.modal-backdrop').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
  $c('#_catForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = new FormData(e.target).get('name').trim();
    const duplicate = state.categories[type].some((c, index) =>
      index !== editIndex && c.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    );
    if (!name) return toast('Informe um nome para a categoria.');
    if (duplicate)
      return toast('Essa categoria já existe.');
    if (editing) {
      const category = state.categories[type][editIndex];
      const previousName = category.name;
      category.name = name;
      category.icon = icon || '🏷️';
      state.transactions.forEach(tx => {
        if (tx.type === type && tx.category === previousName) {
          tx.category = category.name;
          tx.icon = category.icon;
        }
      });
      state.recurring.forEach(item => {
        if (item.type === type && item.category === previousName) {
          item.category = category.name;
          item.icon = category.icon;
        }
      });
      if (previousName !== name && Object.prototype.hasOwnProperty.call(state.categoryBudgets, previousName)) {
        state.categoryBudgets[name] = state.categoryBudgets[previousName];
        delete state.categoryBudgets[previousName];
      }
    } else {
      state.categories[type].push({ name, icon: icon || '🏷️', hidden: false });
    }
    persist(); closeModal(); render(); toast(editing ? 'Categoria atualizada' : 'Categoria criada');
  });

  updateCatView();
  $c('[name=name]').focus();
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
        <label class="field"><span>Limite (R$)</span><input name="limit" inputmode="decimal" data-money placeholder="R$ 0,00" value="${card ? money(card.limit) : ''}" required></label>
        <label class="field"><span>Dia de fechamento</span><input name="closingDay" type="number" min="1" max="31" value="${card ? card.closingDay : 25}" required></label>
        <label class="field"><span>Dia de vencimento</span><input name="dueDay" type="number" min="1" max="31" value="${card ? card.dueDay : 5}" required></label>
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
    const f     = new FormData(e.target);
    const limit = parseMoney(f.get('limit'));
    if (!limit) return toast('Informe um limite válido.');

    if (card) {
      Object.assign(card, {
        name: f.get('name').trim(), limit,
        closingDay: Number(f.get('closingDay')),
        dueDay:     Number(f.get('dueDay'))
      });
      toast('Cartão atualizado');
    } else {
      state.accounts.push({
        id: makeId(), name: f.get('name').trim(), icon: '💳',
        initialBalance: 0, kind: 'credit', limit,
        closingDay: Number(f.get('closingDay')),
        dueDay:     Number(f.get('dueDay'))
      });
      toast('Cartão criado');
    }
    persist(); closeModal(); render();
  };
}

function accountModal(existingId = null) {
  const root = document.getElementById('modalRoot');
  const acc  = existingId ? state.accounts.find(a => a.id === existingId) : null;

  root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal dialog-modal" id="accForm">
        <div class="handle"></div>
        <h2 class="modal-title">${acc ? 'Editar conta' : 'Nova conta'}</h2>
        <label class="field"><span>Nome</span><input name="name" placeholder="Ex.: Poupança" value="${acc ? escapeHtml(acc.name) : ''}" required autofocus></label>
        <label class="field"><span>Saldo inicial (R$)</span>
          <input name="initialBalance" inputmode="decimal" data-money placeholder="R$ 0,00" value="${acc ? money(acc.initialBalance) : ''}">
        </label>
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
    const f       = new FormData(e.target);
    const initial = parseMoney(f.get('initialBalance')) || 0;
    if (acc) {
      Object.assign(acc, { name: f.get('name').trim(), initialBalance: initial });
      toast('Conta atualizada');
    } else {
      state.accounts.push({
        id: makeId(), name: f.get('name').trim(), icon: '🏦',
        initialBalance: initial, kind: 'bank'
      });
      toast('Conta criada');
    }
    persist(); closeModal(); render();
  };
}

function categoryBudgetModal(catName = '') {
  if (!catName) {
    const available = selectableCategories('expense').filter(c => !state.categoryBudgets[c.name]);
    if (!available.length) return toast('Não há outras categorias disponíveis para criar uma meta.');

    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal-backdrop">
      <form class="modal dialog-modal" id="categoryBudgetForm">
        <div class="handle"></div>
        <h2 class="modal-title">Nova meta por categoria</h2>
        <label class="field"><span>Categoria</span><select name="category">${available.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Limite mensal</span><input name="amount" inputmode="decimal" data-money placeholder="R$ 0,00" required></label>
        <div class="dialog-actions">
          <button type="button" class="modal-secondary" id="cancelModal">Cancelar</button>
          <button class="save">Criar meta</button>
        </div>
      </form>
    </div>`;
    root.querySelector('#cancelModal').addEventListener('click', closeModal);
    root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
    root.querySelector('#categoryBudgetForm').addEventListener('submit', e => {
      e.preventDefault();
      const form = new FormData(e.target);
      const name = form.get('category');
      const amount = parseMoney(form.get('amount'));
      if (!amount) return toast('Informe um limite maior que zero.');
      state.categoryBudgets[name] = amount;
      persist(); closeModal(); render(); toast('Meta definida');
    });
    root.querySelector('[name=amount]').focus();
    return;
  }

  const current = state.categoryBudgets[catName] || 0;
  inputModal({
    title:       `Meta para ${catName}`,
    label:       'Valor mensal (R$) — deixe 0 para remover',
    placeholder: 'R$ 0,00',
    value:       current ? money(current) : '',
    money:       true,
    action: value => {
      const amount = parseMoney(value) || 0;
      if (amount > 0) state.categoryBudgets[catName] = amount;
      else            delete state.categoryBudgets[catName];
      persist(); render(); toast(amount ? 'Meta definida' : 'Meta removida');
    }
  });
}

/* ==== AÇÕES ==== */
