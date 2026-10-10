/* Inicialização e eventos. Carregado após core, views, modals e data. */

/* ==== EVENTOS GLOBAIS ==== */
let deferredInstallPrompt = null;
let tapAudioSource = null;
let tapAudioElement = null;

function makeTapSoundSource() {
  const sampleRate = 22050, samples = Math.floor(sampleRate * 0.075);
  const bytes = new ArrayBuffer(44 + samples * 2), view = new DataView(bytes);
  const write = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples * 2, true);
  let phase = 0;
  for (let i = 0; i < samples; i++) {
    const progress = i / samples;
    const frequency = 920 - 360 * progress;
    phase += 2 * Math.PI * frequency / sampleRate;
    const envelope = Math.exp(-progress * 8) * Math.min(1, i / 55);
    view.setInt16(44 + i * 2, Math.round(Math.sin(phase) * envelope * 22000), true);
  }
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function playTapSound() {
  try {
    tapAudioSource ||= makeTapSoundSource();
    tapAudioElement ||= new Audio(tapAudioSource);
    tapAudioElement.volume = 0.45;
    tapAudioElement.currentTime = 0;
    tapAudioElement.play().catch(() => {});
  } catch { /* Audio unavailable or blocked: keep the app usable without sound. */ }
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  toast('EduFinance instalado');
});

const privacyObserver = new MutationObserver(records => {
  if (!state.hideAmounts) return;
  for (const record of records) {
    const root = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
    if (root) maskVisibleAmounts(root);
    record.addedNodes?.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) maskVisibleAmounts(node);
      else if (node.nodeType === Node.TEXT_NODE && /R\$\s*[\d.,]+/.test(node.nodeValue)) {
        node.nodeValue = node.nodeValue.replace(/R\$\s*[\d.,]+/g, 'R$ •••••');
      }
    });
  }
});
['screen', 'modalRoot'].forEach(id => {
  const root = document.getElementById(id);
  if (root) privacyObserver.observe(root, { childList: true, subtree: true });
});

async function derivePinHash(pin, saltHex) {
  if (!crypto.subtle) throw new Error('Secure context required');
  const salt = Uint8Array.from(saltHex.match(/.{2}/g), byte => parseInt(byte, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sameSecret(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

document.addEventListener('click', e => {
  const soundControl = e.target.closest?.('button, [role="button"], a');
  if (e.isTrusted && state.soundEnabled && soundControl && !soundControl.disabled) playTapSound();
  if (e.target.closest('#modalRoot')) return;
  if (page === 'lock' && !e.target.closest('#unlockForm')) return;

  if (e.target.closest('#toggleHomeCards')) {
    state.hideHomeCards = !state.hideHomeCards;
    persist(); render();
    return;
  }

  if (e.target.closest('#toggleTapSound')) {
    state.soundEnabled = !state.soundEnabled;
    persist(); render();
    if (state.soundEnabled) playTapSound();
    toast(state.soundEnabled ? 'Som ativado' : 'Som desativado');
    return;
  }

  if (e.target.closest('#toggleAmounts') || e.target.closest('#privacyToggleAmounts')) {
    state.hideAmounts = !state.hideAmounts;
    persist(); render();
    return;
  }

  if (e.target.closest('#lockNow')) {
    page = 'lock'; render();
    return;
  }

  if (e.target.closest('#installApp')) {
    if (deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      promptEvent.prompt();
      promptEvent.userChoice.then(result => {
        if (result.outcome === 'accepted') toast('Instalação iniciada');
      });
    } else if (location.protocol === 'file:') {
      toast('Abra o EduFinance por localhost ou por um endereço HTTPS para instalar.');
    } else {
      toast('Use o menu do navegador e escolha “Adicionar à tela inicial” ou “Instalar app”.');
    }
    return;
  }

  const modeChoice = e.target.closest('[data-color-mode]');
  if (modeChoice) {
    state.colorMode = modeChoice.dataset.colorMode;
    persist(); applyTheme(); render();
    return;
  }

  const themeChoice = e.target.closest('[data-theme-choice]');
  if (themeChoice) {
    state.theme = themeChoice.dataset.themeChoice;
    persist(); applyTheme(); render();
    return;
  }

  const rmRec = e.target.closest('[data-remove-recurring]');
  if (rmRec) {
    confirmationModal(
      'Parar recorrência',
      'Os lançamentos já criados serão mantidos.',
      () => {
        state.recurring = state.recurring.filter(r => r.id !== rmRec.dataset.removeRecurring);
        persist(); render(); toast('Recorrência removida');
      },
      'Parar'
    );
    return;
  }

  const nav = e.target.closest('[data-page]');
  if (nav) {
    page = nav.dataset.page;
    if (navigator.vibrate) navigator.vibrate(6);
    render(); return;
  }

  const go = e.target.closest('[data-go]');
  if (go) { page = go.dataset.go; render(); return; }

  const month = e.target.closest('[data-month]');
  if (month) {
    state.selectedMonth = changeMonth(state.selectedMonth, Number(month.dataset.month));
    persist(); render(); return;
  }

  const filterBtn = e.target.closest('[data-filter]');
  if (filterBtn) { statsFilter = filterBtn.dataset.filter; render(); return; }

  const statsTypeBtn = e.target.closest('[data-stats-type]');
  if (statsTypeBtn) { statsType = statsTypeBtn.dataset.statsType; render(); return; }

  const statsMonthBtn = e.target.closest('[data-stats-month]');
  if (statsMonthBtn) {
    state.selectedMonth = statsMonthBtn.dataset.statsMonth;
    statsFilter = 'month';
    persist(); render(); return;
  }

  const openCategory = e.target.closest('[data-open-category]');
  if (openCategory) {
    selectedCategoryName = openCategory.dataset.openCategory;
    selectedCategoryType = openCategory.dataset.categoryType;
    categoryDetailSort = 'date';
    page = 'categoryDetail';
    render(); return;
  }

  const detailSort = e.target.closest('[data-detail-sort]');
  if (detailSort) { categoryDetailSort = detailSort.dataset.detailSort; render(); return; }

  const txEl = e.target.closest('[data-tx-id]');
  if (txEl) { editTransactionModal(txEl.dataset.txId); return; }

  if (e.target.closest('#addTransaction')) { modal(); return; }
  if (e.target.closest('#searchBtn'))      { searchModal(); return; }
  if (e.target.closest('#monthPickerBtn')) { monthPickerModal(); return; }

  if (e.target.closest('#addAccount') || e.target.closest('#addAccountBtn')) { accountModal(); return; }
  if (e.target.closest('#addCard'))   { cardModal(); return; }
  if (e.target.closest('#addCategory') || e.target.closest('#addCategoryBtn')) { categoryModal(); return; }

  const editCategory = e.target.closest('[data-edit-category]');
  if (editCategory) {
    categoryModal(editCategory.dataset.editCategory, Number(editCategory.dataset.categoryIndex));
    return;
  }

  const toggleCategory = e.target.closest('[data-toggle-category]');
  if (toggleCategory) {
    const list = state.categories[toggleCategory.dataset.toggleCategory];
    const category = list[Number(toggleCategory.dataset.categoryIndex)];
    if (!category) return;
    if (!category.hidden && list.filter(item => !item.hidden).length <= 1) {
      toast('Mantenha ao menos uma categoria ativa.');
      return;
    }
    category.hidden = !category.hidden;
    persist(); render();
    toast(category.hidden ? 'Categoria ocultada' : 'Categoria reativada');
    return;
  }

  const moveCategory = e.target.closest('[data-category-move]');
  if (moveCategory) {
    const list = state.categories[moveCategory.dataset.categoryMove];
    const index = Number(moveCategory.dataset.categoryIndex);
    const target = index + Number(moveCategory.dataset.direction);
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    persist(); render();
    return;
  }

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
        state.categories[remove.dataset.removeCategory] =
          state.categories[remove.dataset.removeCategory].filter(c => c.name !== remove.dataset.categoryName);
        delete state.categoryBudgets[remove.dataset.categoryName];
        persist(); render(); toast('Categoria removida');
      },
      'Remover'
    );
    return;
  }

  if (e.target.closest('#editBudget')) {
    inputModal({
      title:       'Orçamento mensal',
      label:       'Valor do orçamento (R$)',
      placeholder: 'R$ 0,00',
      value:       state.budget ? money(state.budget) : '',
      money:       true,
      action: value => {
        const amount = parseMoney(value);
        if (!amount) return toast('Informe um valor válido.');
        state.budget = amount;
        persist(); render(); toast('Orçamento atualizado');
      }
    });
    return;
  }

  if (e.target.closest('#addCategoryBudget')) { categoryBudgetModal(); return; }

  if (e.target.closest('#exportData'))  { exportData();  return; }
  if (e.target.closest('#importData'))  { importData();  return; }

  if (e.target.closest('#clearData')) {
    confirmationModal(
      'Apagar TODOS os dados?',
      'Isso remove permanentemente deste dispositivo todos os lançamentos, contas e cartões cadastrados, categorias personalizadas, orçamentos, recorrências, PIN e preferências. O EduFinance voltará à configuração inicial, sem lançamentos. Exporte um backup antes se quiser guardar seus dados.',
      () => {
        const backup = structuredClone(state);
        state = structuredClone(seed);
        state.transactions = [];
        page = 'home';
        applyTheme(); applyFontScale();
        persist(); render();
        toast('Todos os dados foram apagados', () => {
          state = backup;
          page = state.pinLock?.enabled ? 'lock' : 'home';
          applyTheme(); applyFontScale();
          persist(); render(); toast('Dados restaurados');
        });
      },
      'APAGAR TUDO',
      true
    );
    return;
  }
});

document.addEventListener('submit', async e => {
  const form = e.target;
  if (!['setupPinForm', 'disablePinForm', 'unlockForm'].includes(form.id)) return;
  e.preventDefault();
  const data = new FormData(form);
  const pin = String(data.get('pin') || '');
  try {
    if (form.id === 'setupPinForm') {
      if (!/^\d{6}$/.test(pin)) return toast('O PIN precisa ter 6 números.');
      if (pin !== data.get('confirmPin')) return toast('Os PINs não correspondem.');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const saltHex = [...salt].map(byte => byte.toString(16).padStart(2, '0')).join('');
      state.pinLock = { enabled: true, salt: saltHex, hash: await derivePinHash(pin, saltHex) };
      persist(); page = 'lock'; render(); toast('Bloqueio por PIN ativado');
      return;
    }

    const valid = await derivePinHash(pin, state.pinLock.salt).then(hash => sameSecret(hash, state.pinLock.hash));
    if (!valid) {
      form.reset(); form.querySelector('[name="pin"]')?.focus();
      toast('PIN incorreto.');
      return;
    }

    if (form.id === 'disablePinForm') {
      state.pinLock = null;
      persist(); page = 'privacy'; render(); toast('Bloqueio por PIN desativado');
      return;
    }

    page = 'home';
    applyRecurring();
    render();
    if (window._recurringGenerated) {
      toast(`🔁 ${window._recurringGenerated} lançamento(s) recorrente(s) gerado(s) automaticamente`);
      window._recurringGenerated = 0;
    }
  } catch {
    toast('Não foi possível usar o PIN neste contexto. Abra o app por localhost ou HTTPS.');
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.pinLock?.enabled && page !== 'lock') {
    page = 'lock';
    render();
  }
});

document.addEventListener('input', e => {
  if (e.target.id !== 'fontSizeRange') return;
  const labels = ['Pequeno', 'Padrão', 'Grande', 'Muito grande'];
  state.fontScale = Number(e.target.value);
  applyFontScale();
  e.target.setAttribute('aria-valuetext', labels[state.fontScale]);
  document.querySelector('.font-size-current').textContent = labels[state.fontScale];
  persist();
});

document.addEventListener('change', e => {
  if (e.target.id !== 'reportRange') return;
  statsFilter = e.target.value;
  render();
});

// Suporte a teclado: Enter/Espaço em elementos clicáveis
document.addEventListener('keydown', e => {
  const clickable = e.target.closest?.('[data-tx-id],[data-edit-account],[data-edit-card],[data-cat-budget]');
  if (clickable && clickable === e.target && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault(); clickable.click(); return;
  }

  const modalRoot = document.getElementById('modalRoot');
  if (!modalRoot.firstElementChild) return;

  if (e.key === 'Escape') { closeModal(); return; }

  // Focus trap dentro do modal
  if (e.key === 'Tab') {
    const focusable = [...modalRoot.querySelectorAll('button, input, select, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Gerenciamento de foco ao abrir/fechar modais
;(function setupModalFocus() {
  const modalRoot = document.getElementById('modalRoot');
  let lastFocus   = null;

  new MutationObserver(() => {
    const open = modalRoot.childElementCount > 0;
    if (open) {
      if (!lastFocus) lastFocus = document.activeElement;
      const m = modalRoot.querySelector('.modal, section.modal, [role=dialog]');
      if (m) { m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); }
      setTimeout(() => {
        const first = modalRoot.querySelector('input:not([type=checkbox]), select, button:not(.handle)');
        first?.focus();
      }, 80);
    } else {
      lastFocus?.focus?.();
      lastFocus = null;
    }
  }).observe(modalRoot, { childList: true });
})();

/* ==== INICIALIZAÇÃO ==== */
if (page === 'lock') {
  render();
} else {
  applyRecurring();
  render();
  if (window._recurringGenerated) {
    toast(`🔁 ${window._recurringGenerated} lançamento(s) recorrente(s) gerado(s) automaticamente`);
    window._recurringGenerated = 0;
  }
}
