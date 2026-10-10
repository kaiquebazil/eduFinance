/* Ações de dados, mensagens e importação/exportação. */
function toast(message, undoAction = null) {
  const e = document.getElementById('toast');
  e.innerHTML = `${escapeHtml(message)}${undoAction ? ' <button id="undoBtn">Desfazer</button>' : ''}`;
  e.className = 'show';
  if (navigator.vibrate) navigator.vibrate(10);
  if (undoAction) {
    e.querySelector('#undoBtn').onclick = () => {
      undoAction();
      e.className = '';
      if (navigator.vibrate) navigator.vibrate(15);
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

  const grouped   = tx.groupId ? state.transactions.filter(t => t.groupId === tx.groupId) : [];
  const isGrouped = grouped.length > 1;

  function doDelete(toRemove, label) {
    state.transactions = state.transactions.filter(t => !toRemove.some(r => r.id === t.id));
    persist(); render();
    toast(label, () => { state.transactions.push(...toRemove); persist(); render(); toast('Restaurado'); });
  }

  if (isGrouped) {
    const root = document.getElementById('modalRoot');
    root.innerHTML = `
      <div class="modal-backdrop">
        <section class="modal dialog-modal" role="dialog" aria-modal="true">
          <div class="handle"></div>
          <h2 class="modal-title">Excluir parcela</h2>
          <p class="dialog-copy">Esta é a parcela ${tx.installment?.current ?? '?'}/${tx.installment?.total ?? grouped.length}. O que deseja excluir?</p>
          <button class="save danger" id="_delThis" style="width:100%">Só esta parcela</button>
          <button class="save danger" id="_delAll"  style="width:100%;margin-top:8px;background:#7f1d1d">Todas as ${grouped.length} parcelas</button>
          <button class="modal-secondary" id="cancelModal" style="width:100%;margin-top:8px">Cancelar</button>
        </section>
      </div>`;
    root.querySelector('#cancelModal').onclick  = closeModal;
    root.querySelector('.modal-backdrop').onclick = e => { if (e.target === e.currentTarget) closeModal(); };
    root.querySelector('#_delThis').onclick = () => { closeModal(); doDelete([tx], 'Parcela excluída'); };
    root.querySelector('#_delAll').onclick  = () => { closeModal(); doDelete(grouped, `${grouped.length} parcelas excluídas`); };
  } else {
    confirmationModal('Excluir lançamento', 'Esta ação não pode ser desfeita.',
      () => doDelete([tx], 'Lançamento excluído'), 'Excluir');
  }
}

function exportData() {
  const backup = { ...state };
  delete backup.pinLock;
  delete backup.hideAmounts;
  delete backup.hideHomeCards;
  delete backup.soundEnabled;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `meu-controle-${today()}.json`; a.click();
  URL.revokeObjectURL(url);
  toast('Backup exportado');
}

function importData() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'application/json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.transactions || !data.accounts) throw new Error('Formato inválido');
        const localPrivacy = { pinLock: state.pinLock, hideAmounts: state.hideAmounts, hideHomeCards: state.hideHomeCards, soundEnabled: state.soundEnabled };
        state = migrate(data); // sanitizeState é chamado dentro de migrate
        Object.assign(state, localPrivacy);
        applyTheme();
        applyFontScale();
        persist(); render();
        toast('Dados importados');
      } catch {
        toast('Arquivo inválido');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}
