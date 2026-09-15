(() => {
  const API = '/api/list';
  const PIN_KEY = 'family-list-pin-2026';

  let state = { people: [] };
  let activePersonId = null;
  let activeFilter = 'all';
  let saveTimer = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }

  function getPin() {
    return localStorage.getItem(PIN_KEY) || '';
  }

  // ---------- Lock screen ----------
  const lockEl = $('#lock');
  const appEl = $('#app');
  const lockForm = $('#lock-form');
  const pinInput = $('#pin-input');
  const lockError = $('#lock-error');

  lockForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const candidate = pinInput.value.trim();
    if (!candidate) return;
    lockError.hidden = true;
    try {
      const res = await fetch(`${API}?action=verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: candidate })
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem(PIN_KEY, candidate);
        enterApp();
      } else {
        lockError.hidden = false;
        pinInput.select();
      }
    } catch (err) {
      lockError.textContent = "Couldn't reach the list — check your connection and try again.";
      lockError.hidden = false;
    }
  });

  $('#lock-btn').addEventListener('click', () => {
    localStorage.removeItem(PIN_KEY);
    location.reload();
  });

  async function enterApp() {
    lockEl.hidden = true;
    appEl.hidden = false;
    await loadData();
  }

  // ---------- Data ----------
  async function loadData() {
    const res = await fetch(API);
    state = await res.json();
    if (!activePersonId && state.people.length) activePersonId = state.people[0].id;
    renderTabs();
    renderSheet();
    refreshPurchaserSuggestions();
  }

  function scheduleSave() {
    showSaveState('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveData, 500);
  }

  async function saveData() {
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Family-Pin': getPin()
        },
        body: JSON.stringify(state)
      });
      if (res.status === 401) {
        showSaveState('Passcode expired');
        setTimeout(() => {
          localStorage.removeItem(PIN_KEY);
          location.reload();
        }, 1200);
        return;
      }
      showSaveState('Saved just now');
    } catch (err) {
      showSaveState("Couldn't save — check connection");
    }
  }

  function showSaveState(text) {
    $('#save-indicator').textContent = text;
  }

  // ---------- Tabs ----------
  function renderTabs() {
    const tabsEl = $('#tabs');
    tabsEl.innerHTML = '';
    state.people.forEach(person => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (person.id === activePersonId ? ' is-active' : '');
      const openCount = person.items.filter(i => !i.purchased).length;
      btn.innerHTML = `${escapeHtml(person.name)}<span class="tab-count">${openCount}</span>`;
      btn.addEventListener('click', () => {
        activePersonId = person.id;
        activeFilter = 'all';
        renderTabs();
        renderSheet();
      });
      tabsEl.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab';
    addBtn.textContent = '+ Add a list';
    addBtn.addEventListener('click', () => {
      const name = prompt("Whose list is this?");
      if (!name || !name.trim()) return;
      const person = { id: uid(), name: name.trim(), items: [] };
      state.people.push(person);
      activePersonId = person.id;
      activeFilter = 'all';
      renderTabs();
      renderSheet();
      scheduleSave();
    });
    tabsEl.appendChild(addBtn);
  }

  function currentPerson() {
    return state.people.find(p => p.id === activePersonId);
  }

  // ---------- Sheet ----------
  function renderSheet() {
    const person = currentPerson();
    if (!person) {
      $('#sheet-title').textContent = 'No lists yet';
      $('#rows').innerHTML = '<p class="empty-note">Add a list to get started.</p>';
      return;
    }
    $('#sheet-title').textContent = person.name;
    renderRows(person);
  }

  function renderRows(person) {
    const rowsEl = $('#rows');
    rowsEl.innerHTML = '';
    const template = $('#row-template');

    let items = person.items;
    if (activeFilter === 'open') items = items.filter(i => !i.purchased);
    if (activeFilter === 'done') items = items.filter(i => i.purchased);

    if (!items.length) {
      const msg = person.items.length
        ? "Nothing matches this filter."
        : "Nothing on this list yet — add the first thing below.";
      rowsEl.innerHTML = `<p class="empty-note">${msg}</p>`;
      return;
    }

    items.forEach(item => {
      const node = template.content.cloneNode(true);
      const row = $('.row', node);
      row.dataset.id = item.id;
      if (item.purchased) row.classList.add('is-done');

      const check = $('.row-check', node);
      check.checked = !!item.purchased;
      check.addEventListener('change', () => {
        item.purchased = check.checked;
        row.classList.toggle('is-done', item.purchased);
        scheduleSave();
      });

      const itemInput = $('.row-item', node);
      itemInput.value = item.item || '';
      itemInput.addEventListener('input', () => {
        item.item = itemInput.value;
        scheduleSave();
      });

      const purchaserInput = $('.row-purchaser', node);
      purchaserInput.value = item.purchaser || '';
      purchaserInput.addEventListener('input', () => {
        item.purchaser = purchaserInput.value;
        scheduleSave();
      });
      purchaserInput.addEventListener('change', refreshPurchaserSuggestions);

      const holidaySelect = $('.row-holiday', node);
      holidaySelect.value = item.holiday || 'Either';
      holidaySelect.addEventListener('change', () => {
        item.holiday = holidaySelect.value;
        scheduleSave();
      });

      const linkInput = $('.row-link', node);
      linkInput.value = item.link || '';
      const openLink = $('.row-open', node);
      function syncLink() {
        if (item.link) {
          openLink.href = item.link;
          openLink.classList.add('has-link');
        } else {
          openLink.classList.remove('has-link');
        }
      }
      syncLink();
      linkInput.addEventListener('input', () => {
        item.link = linkInput.value;
        syncLink();
        scheduleSave();
      });

      $('.row-delete', node).addEventListener('click', () => {
        if (!confirm(`Remove "${item.item || 'this item'}" from the list?`)) return;
        person.items = person.items.filter(i => i.id !== item.id);
        renderTabs();
        renderRows(person);
        scheduleSave();
      });

      rowsEl.appendChild(node);
    });
  }

  $('#add-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const person = currentPerson();
    if (!person) return;
    const input = $('#add-item');
    const text = input.value.trim();
    if (!text) return;
    person.items.push({ id: uid(), item: text, purchaser: '', purchased: false, holiday: 'Either', link: '' });
    input.value = '';
    renderTabs();
    renderRows(person);
    scheduleSave();
  });

  $$('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter;
      $$('.filter-chip').forEach(c => c.classList.toggle('is-active', c === chip));
      renderRows(currentPerson());
    });
  });

  $('#remove-person').addEventListener('click', () => {
    const person = currentPerson();
    if (!person) return;
    if (!confirm(`Remove "${person.name}"'s whole list? This can't be undone.`)) return;
    state.people = state.people.filter(p => p.id !== person.id);
    activePersonId = state.people.length ? state.people[0].id : null;
    renderTabs();
    renderSheet();
    scheduleSave();
  });

  function refreshPurchaserSuggestions() {
    const names = new Set();
    state.people.forEach(p => p.items.forEach(i => { if (i.purchaser) names.add(i.purchaser.trim()); }));
    const dl = $('#purchaser-suggestions');
    dl.innerHTML = '';
    Array.from(names).sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      dl.appendChild(opt);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  // ---------- Boot ----------
  if (getPin()) {
    enterApp();
  }
})();
