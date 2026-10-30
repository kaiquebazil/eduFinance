/* Criação e edição de lançamentos, contas, cartões e categorias. */
/* ==== MODAIS ==== */

function modal(initialType = 'expense', selectedCategoryName = '') {
  const isLaunchPage = page === 'launch';
  /* ── estado interno ───────────────────────────────────────────── */
  let type         = initialType;
  let selected     = selectableCategories(initialType).find(c => c.name === selectedCategoryName) || selectableCategories(initialType)[0];
  let categoryQuery = '';
  let payment      = 'account';
  let installments = 1;

  const root      = document.getElementById(isLaunchPage ? 'screen' : 'modalRoot');
  const cards     = state.accounts.filter(isCredit);
  const nonCredit = state.accounts.filter(a => !isCredit(a));
  const defaultAccountId = nonCredit[0]?.id || 'bank';
  const hasCards  = cards.length > 0;
  let firstDueDateTouched = false;
  const defaultFirstDueDate = card => {
    const purchaseDate = root.querySelector('[name=date]')?.value || today();
    const month = addMonths(monthOf(purchaseDate), 1);
    const day = Math.min(Number(card?.dueDay || 5), lastDayOfMonth(month));
    return `${month}-${String(day).padStart(2, '0')}`;
  };

  /* ── helper show/hide sem recriar elementos ───────────────────── */
  const $  = sel => root.querySelector(sel);
  const show = (sel, v) => { const el = $(sel); if (el) el.style.display = v ? '' : 'none'; };

  /* ── monta o HTML UMA ÚNICA VEZ ──────────────────────────────── */
  root.innerHTML = isLaunchPage ? `
  <section class="launch-page">
    <header class="launch-header"><button type="button" class="launch-back" id="cancelLaunch" aria-label="Voltar">‹</button><h1>Novo lançamento</h1></header>
    <form class="launch-form" id="_msForm"></form>
  </section>` : `
  <div class="modal-backdrop" id="_msBd">
    <form class="modal" id="_msForm"></form>
  </div>`;
  root.querySelector('#_msForm').insertAdjacentHTML('afterbegin', `
      <div class="handle"></div>
      ${isLaunchPage ? '' : '<h2 class="modal-title">Novo lançamento</h2>'}

      <!-- tipo -->
      <div class="type-switch">
        <button type="button" data-type="expense"  class="selected">Despesa</button>
        <button type="button" data-type="income">Receita</button>
      </div>

      <!-- categoria primeiro -->
      <label class="field"><span>Categoria</span>
        <div class="category-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m16 16 5 5"></path></svg>
          <input type="search" id="_ms_category_search" placeholder="Buscar categoria" aria-label="Buscar categoria">
        </div>
        <div class="categories" id="_ms_cats"></div>
      </label>
      <div class="category-guidance"><span>Tem dúvidas sobre qual categoria escolher?</span><button type="button" id="browseCategoriesFromLaunch">Clique aqui</button></div>

      <!-- valor depois da categoria -->
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
        <!-- cartão + parcelas (name="cardId" para não conflitar com accountId) -->
        <div id="_ms_credit">
          <label class="field"><span>Cartão</span>
            <select name="cardId" id="_ms_card">
              ${cards.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name)} · ${escapeHtml(a.brand || 'Outros')}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>Parcelas</span>
            <select name="installments">
              ${Array.from({ length: 24 }, (_, i) => i + 1).map(n => `<option value="${n}">${n}x</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>Data do primeiro vencimento</span><input name="firstDueDate" id="_ms_first_due" type="date" value="${cards.length ? defaultFirstDueDate(cards[0]) : today()}" required></label>
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
        <input name="date" type="date" value="${today()}">
      </label>
      <button class="save">Salvar lançamento</button>
      <button type="button" class="add-category-from-launch" id="addCategoryFromLaunch">Adicionar nova categoria</button>
  `);

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
    show('#_ms_repeat',   type === 'expense');
    const repeatLabel = $('#_ms_repeat span');
    if (repeatLabel) repeatLabel.textContent = isCreditPay ? 'Repetir todo mês no cartão (compra à vista)' : 'Repetir todo mês';
    const installmentSelect = $('[name=installments]');
    if (installmentSelect) {
      if (isCreditPay && $('[name=repeat]').checked && installmentSelect.value !== '1') installmentSelect.value = '1';
      installmentSelect.disabled = isCreditPay && $('[name=repeat]').checked;
      installments = Number(installmentSelect.value) || 1;
    }

    /* recria apenas o interior do grid de categorias */
    const cats    = selectableCategories(type, selected?.name || '');
    if (!cats.some(c => c.name === selected?.name)) selected = cats[0];
    const catGrid = $('#_ms_cats');
    if (catGrid) {
      const query = normalizeSearchText(categoryQuery.trim());
      const visibleCats = query ? cats.filter(c => normalizeSearchText(c.name).includes(query)) : cats;
      catGrid.innerHTML = visibleCats.length ? visibleCats.map(c =>
        `<button type="button" class="cat-choice${selected.name === c.name ? ' selected' : ''}" data-cat="${escapeHtml(c.name)}" data-icon="${escapeHtml(c.icon)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</button>`
      ).join('') : '<span class="category-search-empty">Nenhuma categoria encontrada.</span>';
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

  $('#_ms_category_search').addEventListener('input', e => {
    categoryQuery = e.target.value;
    updateView();
  });

  root.querySelector('#addCategoryFromLaunch').addEventListener('click', () => categoryModal(type, null, name => modal(type, name)));
  root.querySelector('#browseCategoriesFromLaunch').addEventListener('click', () => {
    closeModal();
    page = 'categories';
    render();
  });

  root.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => {
    payment = b.dataset.pay;
    updateView();
  }));

  $('[name=firstDueDate]').addEventListener('input', () => { firstDueDateTouched = true; });
  $('[name=cardId]').addEventListener('change', () => {
    if (!firstDueDateTouched) $('[name=firstDueDate]').value = defaultFirstDueDate(cards.find(card => card.id === $('[name=cardId]').value));
  });
  $('[name=date]').addEventListener('change', () => {
    if (!firstDueDateTouched) $('[name=firstDueDate]').value = defaultFirstDueDate(cards.find(card => card.id === $('[name=cardId]').value));
  });

  $('[name=installments]').addEventListener('change', e => {
    installments = Number(e.target.value);
  });
  $('[name=repeat]').addEventListener('change', updateView);

  if (isLaunchPage) root.querySelector('#cancelLaunch').addEventListener('click', () => { page = 'home'; render(); });
  else $('#_msBd').addEventListener('click', e => { if (e.target === e.currentTarget) root.innerHTML = ''; });

  $('#_msForm').addEventListener('submit', e => {
    e.preventDefault();
    const f      = new FormData(e.target);
    const amount = parseMoney(f.get('amount'));
    if (!amount) return toast('Informe um valor válido.');
    const date = f.get('date');

    if (payment === 'credit' && type === 'expense') {
      const card    = state.accounts.find(a => a.id === f.get('cardId'));
      const n       = Number(f.get('installments')) || 1;
      const firstDueDate = f.get('firstDueDate');
      if (!firstDueDate || firstDueDate < date) return toast('O primeiro vencimento não pode ser anterior à compra.');
      let entries;
      if (f.get('repeat')) {
        const recurringId = makeId();
        entries = [{
          id: makeId(), type: 'expense', category: selected.name, icon: selected.icon,
          accountId: card.id, amount, date: firstDueDate, invoiceMonth: monthOf(firstDueDate),
          note: f.get('note'), recurringId
        }];
        state.recurring.push({
          id: recurringId, type: 'expense', category: selected.name, icon: selected.icon,
          accountId: card.id, amount, day: Number(firstDueDate.slice(8, 10)),
          note: f.get('note'), startMonth: monthOf(firstDueDate),
          lastGenerated: monthOf(firstDueDate), active: true
        });
      } else {
        entries = buildInstallments({
          account: card, category: selected.name, icon: selected.icon,
          note: f.get('note'), total: amount, date, installments: n, firstDueDate,
          borrowedTo: String(f.get('borrowedTo') || '').trim()
        });
      }
      state.transactions.push(...entries);
      state.selectedMonth = currentMonth();
    } else {
      const accountId = defaultAccountId;
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
    if (isLaunchPage) page = 'home';
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
    const q = normalizeSearchText(input.value.trim());
    if (!q) {
      count.textContent  = '';
      results.innerHTML  = '<div class="empty">Digite para buscar...</div>';
      return;
    }
    const found = state.transactions.filter(t => {
      const hay = normalizeSearchText(`${t.category || ''} ${t.note || ''} ${t.amount} ${accountName(t.accountId)}`);
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

function categoryHelpModal(type, categoryIndex) {
  const category = state.categories[type]?.[categoryIndex];
  if (!category) return;
  const descriptions = {
    'Acessórios': 'Bolsas, cintos, óculos, joias, películas e capas para celular.',
    'Alimentação': 'Açougues, mercados, padarias e sacolões.',
    'Animais de Estimação': 'Rações, consultas veterinárias, banhos e tosas, brinquedos e produtos para pets.',
    'Assinaturas': 'Serviços de streaming, aplicativos, jornais, clubes e planos de celular.',
    'Cuidados Pessoais': 'Cabeleireiros, salões, cosméticos, produtos de higiene, maquiagens, manicures, serviços de estética e produtos para skincare.',
    'Datas Comemorativas': 'Festas, decorações, comemorações, vaquinhas e feriados.',
    'Doações': 'Contribuições, doações para instituições, causas sociais e cestas básicas.',
    'Educação': 'Mensalidades, cursos, livros, materiais escolares, consultorias, treinamentos e uniformes.',
    'Empréstimos': 'Parcelas, empréstimos e financiamentos.',
    'Estacionamentos/Pedágios': 'Estacionamentos, tarifas de zona azul e pedágios.',
    'Filhos': 'Mesadas, atividades, cuidados e itens infantis.',
    'Lanches': 'Cafés, salgados e doces.',
    'Lazer': 'Passeios, parques, atividades recreativas, sessões de cinema, clubes e pescarias.',
    'Moradia': 'Aluguéis ou financiamentos, IPTU, contas de energia, gás, internet e água, serviços de diaristas, condomínios e prestações da casa.',
    'Outros': 'Outras receitas.',
    'Presentes': 'Presentes e lembranças.',
    'Roupas': 'Roupas, calçados, ajustes, serviços de lavanderia e costureiras.',
    'Salário': 'Salários, pagamentos e remunerações.',
    'Saúde': 'Consultas, exames, medicamentos, tratamentos, planos de saúde, medicamentos de farmácia, academias, terapias, atendimentos odontológicos e atividades esportivas.',
    'Taxas': 'Tarifas bancárias, taxas administrativas, multas, anuidades e juros de cartão.',
    'Trabalho': 'Ferramentas, materiais, despesas profissionais e taxas.',
    'Transporte': 'Passagens de ônibus e metrô, corridas de táxi e aplicativos, combustíveis, IPVA, seguros, manutenções, estacionamentos, pedágios e lavagens de veículos.',
    'Viagens': 'Passagens, hospedagens e refeições.'
  };
  const description = category.suggestions?.length
    ? category.suggestions.join(', ')
    : descriptions[category.name] || (type === 'income' ? 'Receitas relacionadas a esta categoria.' : 'Despesas relacionadas a esta categoria.');
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><section class="modal dialog-modal" role="dialog" aria-modal="true" aria-labelledby="categoryHelpTitle">
    <div class="handle"></div>
    <h2 class="modal-title" id="categoryHelpTitle">${escapeHtml(category.icon)} ${escapeHtml(category.name)}</h2>
    <p class="dialog-copy">${escapeHtml(description)}</p>
    <div class="dialog-actions"><button type="button" class="save" id="closeCategoryHelp">Entendi</button></div>
  </section></div>`;
  root.querySelector('#closeCategoryHelp').addEventListener('click', closeModal);
  root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
}

function categoryModal(initialType = 'expense', editIndex = null, onCreated = null) {
  const root = document.getElementById('modalRoot');
  let type = initialType;
  const editing = Number.isInteger(editIndex);
  const existing = editing ? state.categories[type][editIndex] : null;
  let icon = existing?.icon || '🏷️';
  const ICONS = ['🏷️','🍽️','🚕','🛒','🏠','🎉','🙏','⛽','🚗','🩺','💇','🍔','📱','🎮','🎓','💡','🅿️','💰','💸','👨‍👩‍👧','💼','📌','💵','🏦','🎤','👴','❤️','🎁','📚','🐾','🎯','✈️'];
  const customSuggestions = (existing?.suggestions || []).map(name => [name, '🏷️']);

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
      <div class="field"><span>Sugestões</span><div class="category-suggestion-entry"><input id="categorySuggestionInput" maxlength="80" placeholder="Digite uma sugestão"><button type="button" class="modal-secondary" id="addCategorySuggestion">Adicionar</button></div><div class="category-suggestions" id="categorySuggestions"></div></div>
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
    const suggestions = $c('#categorySuggestions');
    if (suggestions) {
      suggestions.innerHTML = customSuggestions.length
        ? customSuggestions.map(([text]) => `<span class="category-suggestion">${escapeHtml(text)}</span>`).join('')
        : '<span class="category-suggestions-empty">Digite uma sugestão e toque em Adicionar.</span>';
    }
  }

  /* ── event listeners registrados uma vez ─────────────────────── */
  root.querySelectorAll('[data-category-type]').forEach(b => b.addEventListener('click', () => {
    type = b.dataset.categoryType; updateCatView();
  }));
  {
    const addSuggestion = () => {
      const input = $c('#categorySuggestionInput');
      const text = input.value.trim();
      if (!text) return;
      if (customSuggestions.some(([savedText]) => savedText.toLocaleLowerCase('pt-BR') === text.toLocaleLowerCase('pt-BR'))) {
        input.value = '';
        return;
      }
      customSuggestions.push([text, '🏷️']);
      input.value = '';
      updateCatView();
    };
    $c('#categorySuggestionInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addSuggestion(); }
    });
    $c('#addCategorySuggestion').addEventListener('click', addSuggestion);
  }
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
    if ($c('#categorySuggestionInput')?.value.trim()) {
      const input = $c('#categorySuggestionInput');
      const pendingSuggestion = input.value.trim();
      if (!customSuggestions.some(([text]) => text.toLocaleLowerCase('pt-BR') === pendingSuggestion.toLocaleLowerCase('pt-BR'))) {
        customSuggestions.push([pendingSuggestion, '🏷️']);
      }
    }
    const name = new FormData(e.target).get('name').trim();
    const normalizeName = value => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR')
      .replace(/[^\p{L}\p{N}]/gu, '');
    const normalizedName = normalizeName(name);
    const duplicate = state.categories[type].some((c, index) =>
      index !== editIndex && normalizeName(c.name) === normalizedName
    );
    if (!name) return toast('Informe um nome para a categoria.');
    if (duplicate)
      return toast('Essa categoria já existe.');
    if (editing) {
      const category = state.categories[type][editIndex];
      const previousName = category.name;
      category.name = name;
      category.icon = icon || '🏷️';
      category.suggestions = customSuggestions.map(([text]) => text);
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
      renameCategoryBudgets(type, previousName, name);
    } else {
      state.categories[type].push({ name, icon: icon || '🏷️', hidden: false, suggestions: customSuggestions.map(([text]) => text) });
    }
    state.categories[type].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );
    persist(); closeModal(); render(); toast(editing ? 'Categoria atualizada' : 'Categoria criada');
    if (!editing) onCreated?.(name);
  });

  updateCatView();
  $c('[name=name]').focus();
}

function cardModal(existingId = null) {
  const root = document.getElementById('modalRoot');
  const card = existingId ? state.accounts.find(a => a.id === existingId) : null;
  const brands = ['Mastercard', 'Visa', 'Amex', 'Diners', 'Elo', 'Hipercard', 'Outros'];

  root.innerHTML = `
    <div class="modal-backdrop">
      <form class="modal dialog-modal" id="cardForm">
        <div class="handle"></div>
        <h2 class="modal-title">${card ? 'Editar cartão' : 'Novo cartão de crédito'}</h2>
        <label class="field"><span>Banco / nome do cartão</span><input name="name" placeholder="Ex.: Nubank" value="${card ? escapeHtml(card.name) : ''}" required autofocus></label>
        <label class="field"><span>Bandeira</span><select name="brand">${brands.map(brand => `<option value="${brand}" ${card?.brand === brand || (!card?.brand && brand === 'Outros') ? 'selected' : ''}>${brand}</option>`).join('')}</select></label>
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
        name: f.get('name').trim(), brand: f.get('brand'), limit,
        closingDay: Number(f.get('closingDay')),
        dueDay:     Number(f.get('dueDay'))
      });
      toast('Cartão atualizado');
    } else {
      state.accounts.push({
        id: makeId(), name: f.get('name').trim(), icon: '💳',
        initialBalance: 0, kind: 'credit', brand: f.get('brand'), limit,
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

function categoryBudgetModal(catName = '', type = 'expense') {
  const budgetMap = categoryBudgetMap(type, state.selectedMonth, true);
  if (!catName) {
    const available = selectableCategories(type).filter(c => !Object.prototype.hasOwnProperty.call(budgetMap, c.name));
    if (!available.length) return toast('Não há outras categorias disponíveis para criar uma meta.');

    const root = document.getElementById('modalRoot');
    root.innerHTML = `<div class="modal-backdrop">
      <form class="modal dialog-modal" id="categoryBudgetForm">
        <div class="handle"></div>
        <h2 class="modal-title">Nova meta de ${type === 'income' ? 'receita' : 'despesa'} por categoria</h2>
        <label class="field"><span>Categoria</span><select name="category">${available.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('')}</select></label>
        <label class="field budget-amount-field"><span>${type === 'income' ? 'Meta mensal' : 'Limite mensal'}</span><div class="budget-amount-row"><input name="amount" inputmode="decimal" data-money placeholder="R$ 0,00" required><button type="button" id="toggleBudgetCalculator" aria-expanded="false" aria-controls="budgetCalculator" aria-label="Abrir calculadora"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><rect x="6" y="8" width="2" height="2" rx=".4"/><rect x="11" y="8" width="2" height="2" rx=".4"/><rect x="16" y="8" width="2" height="2" rx=".4"/><rect x="6" y="12" width="2" height="2" rx=".4"/><rect x="11" y="12" width="2" height="2" rx=".4"/><rect x="16" y="12" width="2" height="2" rx=".4"/><path d="M7 16h10"/></svg></button></div></label>
        <section class="budget-calculator" id="budgetCalculator" aria-label="Calculadora" hidden>
          <output class="budget-calculator-screen" id="budgetCalculatorExpression" aria-live="polite">0</output>
          <div class="budget-calculator-keys">
            ${[['7','8','9','/'],['4','5','6','*'],['1','2','3','-'],['clear','0',',','+']].map(row => row.map(key => `<button type="button" data-calculator-key="${key}" class="${['/','*','-','+'].includes(key) ? 'operator' : ''}">${({ clear: 'C', '/': '÷', '*': '×', '-': '−', '+': '+' })[key] || key}</button>`).join('')).join('')}
            <button type="button" data-calculator-key="backspace" aria-label="Apagar último dígito">⌫</button>
            <button type="button" data-calculator-key="equals" class="operator">=</button>
            <button type="button" id="useBudgetCalculatorResult" class="use-calculator-result" disabled>Usar resultado</button>
          </div>
        </section>
        <div class="dialog-actions">
          <button type="button" class="modal-secondary" id="cancelModal">Cancelar</button>
          <button class="save">Criar meta</button>
        </div>
      </form>
    </div>`;
    root.querySelector('#cancelModal').addEventListener('click', closeModal);
    root.querySelector('.modal-backdrop').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
    let calculatorExpression = '';
    let calculatorResult = null;
    const calculatorScreen = root.querySelector('#budgetCalculatorExpression');
    const useCalculatorResult = root.querySelector('#useBudgetCalculatorResult');
    const updateCalculator = () => {
      calculatorScreen.textContent = calculatorExpression.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−').replace(/\./g, ',') || '0';
      calculatorResult = null;
      try {
        const tokens = calculatorExpression.match(/(?:\d+(?:\.\d*)?|\.\d+|[()+\-*/])/g) || [];
        if (tokens.join('') !== calculatorExpression || !tokens.length) throw new Error('Invalid expression');
        let index = 0;
        const factor = () => {
          if (tokens[index] === '-') { index++; return -factor(); }
          if (tokens[index] === '+') { index++; return factor(); }
          if (tokens[index] === '(') {
            index++;
            const value = expression();
            if (tokens[index++] !== ')') throw new Error('Missing parenthesis');
            return value;
          }
          const token = tokens[index++];
          if (!token || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) throw new Error('Number expected');
          return Number(token);
        };
        const term = () => {
          let value = factor();
          while (tokens[index] === '*' || tokens[index] === '/') {
            const operator = tokens[index++], next = factor();
            if (operator === '/' && next === 0) throw new Error('Division by zero');
            value = operator === '*' ? value * next : value / next;
          }
          return value;
        };
        const expression = () => {
          let value = term();
          while (tokens[index] === '+' || tokens[index] === '-') {
            const operator = tokens[index++], next = term();
            value = operator === '+' ? value + next : value - next;
          }
          return value;
        };
        const value = expression();
        if (index !== tokens.length || !Number.isFinite(value)) throw new Error('Invalid result');
        calculatorResult = Math.round(value * 100) / 100;
      } catch {}
      useCalculatorResult.disabled = calculatorResult === null || calculatorResult < 0;
      useCalculatorResult.textContent = calculatorResult === null ? 'Usar resultado' : money(calculatorResult);
      if (calculatorResult === null) useCalculatorResult.textContent = 'Usar resultado';
    };
    root.querySelector('#toggleBudgetCalculator').addEventListener('click', e => {
      const panel = root.querySelector('#budgetCalculator');
      panel.hidden = !panel.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
    });
    root.querySelectorAll('[data-calculator-key]').forEach(button => button.addEventListener('click', () => {
      const key = button.dataset.calculatorKey;
      if (key === 'clear') calculatorExpression = '';
      else if (key === 'backspace') calculatorExpression = calculatorExpression.slice(0, -1);
      else if (key === 'equals') {
        updateCalculator();
        if (calculatorResult !== null) calculatorExpression = String(calculatorResult);
      } else {
        const digit = key === ',' ? '.' : key;
        const last = calculatorExpression.slice(-1);
        if (/^[+*/-]$/.test(digit) && (!calculatorExpression || /[+*/-]$/.test(last))) return;
        if (digit === '.' && /(?:^|[+*/-])\d*\.\d*$/.test(calculatorExpression)) return;
        calculatorExpression += digit;
      }
      updateCalculator();
    }));
    useCalculatorResult.addEventListener('click', () => {
      if (calculatorResult === null || calculatorResult < 0) return;
      root.querySelector('[name=amount]').value = money(calculatorResult);
      root.querySelector('[name=amount]').dispatchEvent(new Event('input', { bubbles: true }));
    });
    root.querySelector('#categoryBudgetForm').addEventListener('submit', e => {
      e.preventDefault();
      const form = new FormData(e.target);
      const name = form.get('category');
      const amount = parseMoney(form.get('amount'));
      if (!String(form.get('amount') || '').trim()) return toast('Informe um limite mensal.');
      budgetMap[name] = amount;
      persist(); render(); toast('Meta definida');
      const remaining = selectableCategories(type).filter(c => !Object.prototype.hasOwnProperty.call(budgetMap, c.name));
      const select = root.querySelector('[name=category]');
      if (remaining.length) {
        select.innerHTML = remaining.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.icon)} ${escapeHtml(c.name)}</option>`).join('');
        root.querySelector('[name=amount]').value = '';
        root.querySelector('#budgetCalculator').hidden = true;
        root.querySelector('#toggleBudgetCalculator').setAttribute('aria-expanded', 'false');
        calculatorExpression = '';
        updateCalculator();
        root.querySelector('[name=amount]').focus();
      } else {
        root.querySelector('#categoryBudgetForm').innerHTML = `<div class="handle"></div><h2 class="modal-title">Metas definidas</h2><p class="dialog-copy">Todas as categorias disponíveis já têm uma meta.</p><div class="dialog-actions"><button type="button" class="save" id="finishCategoryBudgets">Fechar</button></div>`;
        root.querySelector('#finishCategoryBudgets').addEventListener('click', closeModal);
      }
    });
    root.querySelector('[name=amount]').focus();
    return;
  }

  const current = budgetMap[catName] || 0;
  inputModal({
    title:       `Meta para ${catName}`,
    label:       `Valor mensal (R$) — deixe 0 para remover`,
    placeholder: 'R$ 0,00',
    value:       current ? money(current) : '',
    money:       true,
    action: value => {
      const amount = parseMoney(value) || 0;
      if (amount > 0) budgetMap[catName] = amount;
      else            delete budgetMap[catName];
      persist(); render(); toast(amount ? 'Meta definida' : 'Meta removida');
    }
  });
}

/* ==== AÇÕES ==== */
