(() => {
  const API = '/api/list';
  const PIN_KEY = 'family-list-pin-2026';

  let state = { people: [] };
  let activePersonId = null;
  let viewMode = 'overview'; // 'person' | 'overview' — lands on Overview after login
  let activeFilter = 'all';
  const overviewFilters = { person: 'all', purchaser: 'all', holiday: 'all', status: 'all', search: '' };
  const saveTimers = {}; // debounce timers per-field, keyed by "personId:itemId:field"

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function getPin() {
    return localStorage.getItem(PIN_KEY) || '';
  }

  function showToast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------- Screens ----------
  const landingEl = $('#landing');
  const lockEl = $('#lock');
  const appEl = $('#app');

  function showLanding() {
    landingEl.hidden = false;
    lockEl.hidden = true;
    appEl.hidden = true;
  }
  function showLock() {
    landingEl.hidden = true;
    lockEl.hidden = false;
    appEl.hidden = true;
    $('#pin-input').focus();
  }
  async function showApp() {
    landingEl.hidden = true;
    lockEl.hidden = true;
    appEl.hidden = false;
    await loadFullData();
  }

  $('#countdown-widget').addEventListener('click', showLock);
  $('#lock-back').addEventListener('click', showLanding);

  // ---------- Countdown ----------
  function updateCountdown() {
    const now = new Date();
    let target = new Date(now.getFullYear(), 11, 25, 0, 0, 0);
    if (target <= now) target = new Date(now.getFullYear() + 1, 11, 25, 0, 0, 0);
    const diff = target - now;
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    $('#countdown-days').textContent = `${days} day${days === 1 ? '' : 's'}`;
    $('#countdown-clock').textContent =
      `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // ---------- Public quick-add ----------
  async function populateQuickPersonList() {
    try {
      const res = await fetch(API);
      const data = await res.json();
      const select = $('#quick-person');
      select.innerHTML = '';
      data.people.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
      });
    } catch (err) {
      // Quick-add will just fail on submit if this didn't load; not fatal here.
    }
  }

  $('#quickadd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#quickadd-msg');
    msg.hidden = true;
    msg.classList.remove('is-error');

    const personId = $('#quick-person').value;
    const item = $('#quick-item').value.trim();
    const link = $('#quick-link').value.trim();
    const notes = $('#quick-notes').value.trim();
    if (!personId || !item) return;

    try {
      const res = await fetch(`${API}?action=quickadd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, item, link, notes })
      });
      const data = await res.json();
      if (data.ok) {
        $('#quick-item').value = '';
        $('#quick-link').value = '';
        $('#quick-notes').value = '';
        msg.textContent = 'Added! 🎁';
        msg.hidden = false;
      } else {
        msg.textContent = data.error || "Couldn't add that — try again.";
        msg.classList.add('is-error');
        msg.hidden = false;
      }
    } catch (err) {
      msg.textContent = "Couldn't reach the list — check your connection.";
      msg.classList.add('is-error');
      msg.hidden = false;
    }
  });

  // ---------- Passcode ----------
  $('#lock-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const candidate = $('#pin-input').value.trim();
    if (!candidate) return;
    const errorEl = $('#lock-error');
    errorEl.hidden = true;
    try {
      const res = await fetch(`${API}?action=verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: candidate })
      });
      const data = await res.json();
      if (data.ok) {
        localStorage.setItem(PIN_KEY, candidate);
        await showApp();
      } else {
        errorEl.textContent = "That's not it — try again.";
        errorEl.hidden = false;
        $('#pin-input').select();
      }
    } catch (err) {
      errorEl.textContent = "Couldn't reach the list — check your connection and try again.";
      errorEl.hidden = false;
    }
  });

  $('#lock-btn').addEventListener('click', () => {
    localStorage.removeItem(PIN_KEY);
    location.reload();
  });

  // ---------- Authed API helper ----------
  async function callApi(action, body) {
    const res = await fetch(`${API}?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Family-Pin': getPin() },
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      showToast('Passcode expired — locking this device.');
      setTimeout(() => {
        localStorage.removeItem(PIN_KEY);
        location.reload();
      }, 1200);
      throw new Error('unauthorized');
    }
    return res.json();
  }

  function debouncedSave(key, fn, delay = 500) {
    clearTimeout(saveTimers[key]);
    saveTimers[key] = setTimeout(fn, delay);
  }

  function flashSaved() {
    $('#save-indicator').textContent = 'Saved';
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(() => { $('#save-indicator').textContent = ''; }, 1400);
  }

  // ---------- Full data (authenticated app) ----------
  async function loadFullData() {
    const res = await fetch(API);
    state = await res.json();
    if (!activePersonId && state.people.length) activePersonId = state.people[0].id;
    renderTabs();
    renderSheet();
  }

  function currentPerson() {
    return state.people.find(p => p.id === activePersonId);
  }

  // ---------- Tabs ----------
  function renderTabs() {
    const tabsEl = $('#tabs');
    tabsEl.innerHTML = '';

    const overviewBtn = document.createElement('button');
    overviewBtn.className = 'tab tab-overview' + (viewMode === 'overview' ? ' is-active' : '');
    overviewBtn.textContent = '📊 Overview';
    overviewBtn.addEventListener('click', () => {
      viewMode = 'overview';
      renderTabs();
      renderSheet();
    });
    tabsEl.appendChild(overviewBtn);
    tabsEl.appendChild(document.createElement('hr')).className = 'tabs-divider';

    state.people.forEach(person => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (viewMode === 'person' && person.id === activePersonId ? ' is-active' : '');
      const openCount = person.items.filter(i => !i.purchased).length;
      btn.innerHTML = `${escapeHtml(person.name)}<span class="tab-count">${openCount}</span>`;
      btn.addEventListener('click', () => {
        viewMode = 'person';
        activePersonId = person.id;
        activeFilter = 'all';
        $$('.filter-chip').forEach(c => c.classList.toggle('is-active', c.dataset.filter === 'all'));
        renderTabs();
        renderSheet();
      });
      tabsEl.appendChild(btn);
    });
    const addBtn = document.createElement('button');
    addBtn.className = 'add-tab';
    addBtn.textContent = '+ Add a list';
    addBtn.addEventListener('click', async () => {
      const name = prompt("Whose list is this?");
      if (!name || !name.trim()) return;
      try {
        const data = await callApi('addPerson', { name: name.trim() });
        if (data.ok) {
          state.people.push(data.person);
          viewMode = 'person';
          activePersonId = data.person.id;
          activeFilter = 'all';
          renderTabs();
          renderSheet();
          flashSaved();
        }
      } catch (err) { /* handled in callApi */ }
    });
    tabsEl.appendChild(addBtn);
  }

  // ---------- Sheet ----------
  function renderSheet() {
    const personView = $('#person-view');
    const overviewView = $('#overview-view');
    if (viewMode === 'overview') {
      personView.hidden = true;
      overviewView.hidden = false;
      renderOverview();
      return;
    }
    personView.hidden = false;
    overviewView.hidden = true;
    const person = currentPerson();
    if (!person) {
      $('#sheet-title').textContent = 'No lists yet';
      $('#rows').innerHTML = '<p class="empty-note">Add a list to get started.</p>';
      return;
    }
    $('#sheet-title').textContent = person.name;
    renderRows(person);
  }

  // ---------- Overview dashboard ----------
  function populateOverviewPersonFilter() {
    const select = $('#ov-person');
    const prev = select.value || 'all';
    select.innerHTML = '<option value="all">Everyone\'s lists</option>';
    state.people.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
    select.value = state.people.some(p => p.id === prev) ? prev : 'all';
  }

  function renderOverview() {
    populateOverviewPersonFilter();

    let allItems = [];
    state.people.forEach(person => {
      person.items.forEach(item => allItems.push({ person, item }));
    });

    const totalItems = allItems.length;
    const purchasedCount = allItems.filter(x => x.item.purchased).length;
    const openCount = totalItems - purchasedCount;

    $('#stat-row').innerHTML = `
      <div class="stat-card"><div class="stat-num">${totalItems}</div><div class="stat-label">Total wishes</div></div>
      <div class="stat-card"><div class="stat-num">${openCount}</div><div class="stat-label">Still to buy</div></div>
      <div class="stat-card"><div class="stat-num">${purchasedCount}</div><div class="stat-label">Already bought</div></div>
      <div class="stat-card"><div class="stat-num">${state.people.length}</div><div class="stat-label">Lists</div></div>
    `;

    const progressList = $('#progress-list');
    progressList.innerHTML = '';
    state.people.forEach(person => {
      const total = person.items.length;
      const done = person.items.filter(i => i.purchased).length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'progress-item';
      row.innerHTML = `
        <span class="progress-name">${escapeHtml(person.name)}</span>
        <span class="progress-track"><span class="progress-fill" style="width:${pct}%"></span></span>
        <span class="progress-count">${done}/${total}</span>
      `;
      progressList.appendChild(row);
    });

    // Apply filters
    let filtered = allItems.filter(({ person, item }) => {
      if (overviewFilters.person !== 'all' && person.id !== overviewFilters.person) return false;
      if (overviewFilters.purchaser !== 'all' && (item.purchaser || '') !== overviewFilters.purchaser) return false;
      if (overviewFilters.holiday !== 'all' && (item.holiday || 'Either') !== overviewFilters.holiday) return false;
      if (overviewFilters.status === 'open' && item.purchased) return false;
      if (overviewFilters.status === 'done' && !item.purchased) return false;
      if (overviewFilters.search && !(item.item || '').toLowerCase().includes(overviewFilters.search.toLowerCase())) return false;
      return true;
    });

    const rowsEl = $('#overview-rows');
    rowsEl.innerHTML = '';
    if (!filtered.length) {
      rowsEl.innerHTML = '<p class="empty-note">Nothing matches these filters.</p>';
      return;
    }

    const template = $('#row-template');
    filtered.forEach(({ person, item }) => {
      const node = template.content.cloneNode(true);
      const row = $('.row', node);
      row.dataset.id = item.id;
      if (item.purchased) row.classList.add('is-done');

      const personTag = document.createElement('span');
      personTag.className = 'row-person';
      personTag.textContent = person.name;
      row.insertBefore(personTag, row.firstChild);

      function patch(fields) {
        Object.assign(item, fields);
        const key = `${person.id}:${item.id}:${Object.keys(fields)[0]}`;
        debouncedSave(key, async () => {
          try {
            await callApi('updateItem', { personId: person.id, itemId: item.id, patch: fields });
            flashSaved();
          } catch (err) { /* handled in callApi */ }
        });
      }

      const check = $('.row-check', node);
      check.checked = !!item.purchased;
      check.addEventListener('change', () => {
        patch({ purchased: check.checked });
        renderTabs();
        renderOverview();
      });

      const itemInput = $('.row-item', node);
      itemInput.value = item.item || '';
      itemInput.readOnly = true; // overview is for triage, not renaming — edit from the person's own list

      const purchaserSelect = $('.row-purchaser', node);
      purchaserSelect.value = item.purchaser || '';
      purchaserSelect.addEventListener('change', () => patch({ purchaser: purchaserSelect.value }));

      const holidaySelect = $('.row-holiday', node);
      holidaySelect.value = item.holiday || 'Either';
      holidaySelect.addEventListener('change', () => patch({ holiday: holidaySelect.value }));

      const linkInput = $('.row-link', node);
      linkInput.value = item.link || '';
      linkInput.readOnly = true;
      const openLink = $('.row-open', node);
      if (item.link) {
        openLink.href = item.link;
        openLink.classList.add('has-link');
      }

      const notesInput = $('.row-notes', node);
      notesInput.value = item.notes || '';
      notesInput.readOnly = true;

      $('.row-delete', node).remove();

      rowsEl.appendChild(node);
    });
  }

  ['ov-person', 'ov-purchaser', 'ov-holiday', 'ov-status'].forEach(id => {
    $('#' + id).addEventListener('change', (e) => {
      const key = id.replace('ov-', '');
      overviewFilters[key] = e.target.value;
      renderOverview();
    });
  });
  $('#ov-search').addEventListener('input', (e) => {
    overviewFilters.search = e.target.value;
    renderOverview();
  });

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

      function patch(fields) {
        Object.assign(item, fields);
        const key = `${person.id}:${item.id}:${Object.keys(fields)[0]}`;
        debouncedSave(key, async () => {
          try {
            await callApi('updateItem', { personId: person.id, itemId: item.id, patch: fields });
            flashSaved();
          } catch (err) { /* handled in callApi */ }
        });
      }

      const check = $('.row-check', node);
      check.checked = !!item.purchased;
      check.addEventListener('change', () => {
        row.classList.toggle('is-done', check.checked);
        patch({ purchased: check.checked });
        renderTabs();
      });

      const itemInput = $('.row-item', node);
      itemInput.value = item.item || '';
      itemInput.addEventListener('input', () => patch({ item: itemInput.value }));

      const purchaserSelect = $('.row-purchaser', node);
      purchaserSelect.value = item.purchaser || '';
      purchaserSelect.addEventListener('change', () => patch({ purchaser: purchaserSelect.value }));

      const holidaySelect = $('.row-holiday', node);
      holidaySelect.value = item.holiday || 'Either';
      holidaySelect.addEventListener('change', () => patch({ holiday: holidaySelect.value }));

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
        patch({ link: linkInput.value });
      });

      const notesInput = $('.row-notes', node);
      notesInput.value = item.notes || '';
      notesInput.addEventListener('input', () => patch({ notes: notesInput.value }));

      $('.row-delete', node).addEventListener('click', async () => {
        if (!confirm(`Remove "${item.item || 'this item'}" from the list?`)) return;
        try {
          await callApi('deleteItem', { personId: person.id, itemId: item.id });
          person.items = person.items.filter(i => i.id !== item.id);
          renderTabs();
          renderRows(person);
          flashSaved();
        } catch (err) { /* handled in callApi */ }
      });

      rowsEl.appendChild(node);
    });
  }

  $('#add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const person = currentPerson();
    if (!person) return;
    const itemInput = $('#add-item');
    const linkInput = $('#add-link');
    const notesInput = $('#add-notes');
    const text = itemInput.value.trim();
    if (!text) return;
    try {
      const data = await callApi('addItem', {
        personId: person.id,
        item: text,
        link: linkInput.value.trim(),
        notes: notesInput.value.trim(),
        purchaser: '',
        holiday: 'Either'
      });
      if (data.ok) {
        person.items.push(data.item);
        itemInput.value = '';
        linkInput.value = '';
        notesInput.value = '';
        renderTabs();
        renderRows(person);
        flashSaved();
      }
    } catch (err) { /* handled in callApi */ }
  });

  $$('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter;
      $$('.filter-chip').forEach(c => c.classList.toggle('is-active', c === chip));
      renderRows(currentPerson());
    });
  });

  $('#remove-person').addEventListener('click', async () => {
    const person = currentPerson();
    if (!person) return;
    if (!confirm(`Remove "${person.name}"'s whole list? This can't be undone.`)) return;
    try {
      await callApi('removePerson', { personId: person.id });
      state.people = state.people.filter(p => p.id !== person.id);
      activePersonId = state.people.length ? state.people[0].id : null;
      renderTabs();
      renderSheet();
      flashSaved();
    } catch (err) { /* handled in callApi */ }
  });

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  // ---------- Boot ----------
  if (getPin()) {
    showApp();
  } else {
    showLanding();
    populateQuickPersonList();
  }
})();
