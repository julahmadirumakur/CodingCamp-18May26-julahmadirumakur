(function () {
  'use strict';

  /* ============================================================
     STORAGE UTILITY
     ============================================================ */
  const Store = {
    ok: false,
    init() {
      try {
        localStorage.setItem('__t', '1');
        localStorage.removeItem('__t');
        this.ok = true;
      } catch (e) { this.ok = false; }
    },
    get(key, fallback) {
      if (!this.ok) return fallback;
      try {
        const v = localStorage.getItem(key);
        return v !== null ? JSON.parse(v) : fallback;
      } catch (e) { return fallback; }
    },
    set(key, val) {
      if (!this.ok) return;
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
    }
  };

  /* ============================================================
     THEME MANAGER
     ============================================================ */
  const ThemeManager = {
    init() {
      const saved = Store.get('dashboard_theme', null);
      const theme = saved
        ? saved
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      this.apply(theme);
      document.getElementById('theme-toggle')
        .addEventListener('click', () => this.toggle());
    },
    toggle() {
      const cur = document.documentElement.getAttribute('data-theme');
      this.apply(cur === 'dark' ? 'light' : 'dark');
    },
    apply(theme) {
      document.documentElement.setAttribute('data-theme', theme);
      Store.set('dashboard_theme', theme);
      const btn = document.getElementById('theme-toggle');
      if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  };

  /* ============================================================
     GREETING WIDGET
     ============================================================ */
  const Greeting = {
    _lastHour: -1,
    init() {
      this._updateDate();
      this._tick();
      setInterval(() => this._tick(), 1000);
    },
    _getGreeting(h) {
      if (h >= 5  && h < 12) return 'Good Morning';
      if (h >= 12 && h < 15) return 'Good Afternoon';
      if (h >= 15 && h < 18) return 'Good Evening';
      return 'Good Night';
    },
    render() {
      const s    = Store.get('dashboard_settings', {});
      const name = (s.userName || '').trim();
      const h    = new Date().getHours();
      const g    = this._getGreeting(h);
      const el   = document.getElementById('greeting-text');
      if (el) el.textContent = name ? `${g}, ${name}!` : g;
    },
    _updateDate() {
      const el = document.getElementById('date-display');
      if (!el) return;
      el.textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
      });
    },
    _tick() {
      const now = new Date();
      const h   = now.getHours();
      const m   = String(now.getMinutes()).padStart(2, '0');
      const s   = String(now.getSeconds()).padStart(2, '0');
      const el  = document.getElementById('clock');
      if (el) el.textContent = `${String(h).padStart(2, '0')}:${m}:${s}`;
      if (h !== this._lastHour) {
        this._lastHour = h;
        this.render();
      }
    }
  };

  /* ============================================================
     FOCUS TIMER
     ============================================================ */
  const Timer = {
    _iv:  null,
    _rem: 0,
    _dur: 25,

    init() {
      this._dur = this._getDur();
      this._rem = this._dur * 60;
      this._draw();
      document.getElementById('timer-start').addEventListener('click', () => this.start());
      document.getElementById('timer-stop') .addEventListener('click', () => this.stop());
      document.getElementById('timer-reset').addEventListener('click', () => this.reset());
    },
    _getDur() {
      const s = Store.get('dashboard_settings', {});
      const d = parseInt(s.pomodoroDuration, 10);
      return (d >= 1 && d <= 120) ? d : 25;
    },
    _fmt(sec) {
      return `${String(Math.floor(sec / 60)).padStart(2,'0')}:${String(sec % 60).padStart(2,'0')}`;
    },
    _draw() {
      const el = document.getElementById('timer-display');
      if (el) el.textContent = this._fmt(this._rem);
    },
    _status(txt) {
      const el = document.getElementById('timer-status');
      if (el) el.textContent = txt;
    },
    start() {
      if (this._iv) return;
      document.getElementById('timer-start').disabled = true;
      document.getElementById('timer-stop') .disabled = false;
      document.getElementById('timer-display').classList.add('running');
      this._status('Sesi berjalan…');
      this._iv = setInterval(() => this._tick(), 1000);
    },
    stop() {
      clearInterval(this._iv); this._iv = null;
      document.getElementById('timer-start').disabled = false;
      document.getElementById('timer-stop') .disabled = true;
      document.getElementById('timer-display').classList.remove('running');
      this._status('Dijeda.');
    },
    reset() {
      this.stop();
      this._dur = this._getDur();
      this._rem = this._dur * 60;
      this._draw();
      document.getElementById('timer-display').classList.remove('done');
      this._status('');
    },
    _tick() {
      this._rem--;
      this._draw();
      if (this._rem <= 0) {
        this.stop();
        document.getElementById('timer-display').classList.add('done');
        this._status('✅ Sesi selesai! Waktunya istirahat.');
        setTimeout(() => alert('⏰ Sesi Pomodoro selesai! Waktunya istirahat.'), 100);
      }
    }
  };

  /* ============================================================
     TODO LIST
     ============================================================ */
  const Todo = {
    _tasks:  [],
    _sort:   'newest',
    _editId: null,

    init() {
      this._tasks = Store.get('dashboard_tasks', []);
      this._sort  = Store.get('dashboard_sort',  'newest');
      this._render();
      this._applySortBtn();

      document.getElementById('todo-add')
        .addEventListener('click', () => this._add());
      document.getElementById('todo-input')
        .addEventListener('keydown', e => { if (e.key === 'Enter') this._add(); });
      document.querySelectorAll('.btn-sort[data-sort]')
        .forEach(b => b.addEventListener('click', () => {
          this._sort = b.dataset.sort;
          Store.set('dashboard_sort', this._sort);
          this._applySortBtn();
          this._render();
        }));
    },

    _applySortBtn() {
      document.querySelectorAll('.btn-sort[data-sort]')
        .forEach(b => b.classList.toggle('active', b.dataset.sort === this._sort));
    },

    _add() {
      const inp  = document.getElementById('todo-input');
      const text = inp.value.trim();
      if (!text)                        { this._err('todo-error', 'Tugas tidak boleh kosong.'); return; }
      if (this._dup(text, null))        { this._err('todo-error', 'Tugas sudah ada dalam daftar.'); return; }
      this._tasks.push({ id: String(Date.now()), text, completed: false, createdAt: Date.now() });
      this._save(); this._render();
      inp.value = '';
      document.getElementById('todo-error').textContent = '';
    },

    _dup(text, excludeId) {
      const lo = text.toLowerCase();
      return this._tasks.some(t => t.id !== excludeId && t.text.toLowerCase() === lo);
    },

    _del(id) {
      this._tasks = this._tasks.filter(t => t.id !== id);
      this._save(); this._render();
    },

    _toggle(id) {
      const t = this._tasks.find(t => t.id === id);
      if (t) { t.completed = !t.completed; this._save(); this._render(); }
    },

    _startEdit(id) { this._editId = id; this._render(); },

    _saveEdit(id) {
      const inp = document.querySelector(`.task-edit-input[data-id="${id}"]`);
      if (!inp) return;
      const txt = inp.value.trim();
      if (!txt)                  { this._err('todo-error', 'Tugas tidak boleh kosong.'); return; }
      if (this._dup(txt, id))    { this._err('todo-error', 'Tugas sudah ada dalam daftar.'); return; }
      const t = this._tasks.find(t => t.id === id);
      if (t) t.text = txt;
      this._editId = null; this._save(); this._render();
    },

    _cancelEdit() { this._editId = null; this._render(); },

    _sorted() {
      const c = [...this._tasks];
      if (this._sort === 'oldest') c.sort((a,b) => a.createdAt - b.createdAt);
      else if (this._sort === 'status') c.sort((a,b) => Number(a.completed) - Number(b.completed));
      else c.sort((a,b) => b.createdAt - a.createdAt);
      return c;
    },

    _render() {
      const ul = document.getElementById('todo-items');
      ul.innerHTML = '';
      const list = this._sorted();
      if (!list.length) {
        ul.innerHTML = '<li class="task-empty">Belum ada tugas. Tambahkan sekarang!</li>';
        return;
      }
      list.forEach(t => {
        const li = document.createElement('li');
        li.className = 'task-item';
        if (this._editId === t.id) {
          li.innerHTML = `
            <input class="task-edit-input" data-id="${t.id}" value="${esc(t.text)}" type="text" />
            <div class="task-actions">
              <button class="task-btn save-edit" data-id="${t.id}" title="Simpan">✔️</button>
              <button class="task-btn cancel-edit" title="Batal">✖️</button>
            </div>`;
        } else {
          li.innerHTML = `
            <input class="task-check" type="checkbox" data-id="${t.id}"
                   ${t.completed ? 'checked' : ''} aria-label="Tandai selesai" />
            <span class="task-text ${t.completed ? 'done' : ''}">${esc(t.text)}</span>
            <div class="task-actions">
              <button class="task-btn edit-btn" data-id="${t.id}" title="Edit">✏️</button>
              <button class="btn btn-delete del-btn" data-id="${t.id}">Delete</button>
            </div>`;
        }
        ul.appendChild(li);
      });

      ul.querySelectorAll('.task-check')  .forEach(c => c.addEventListener('change', () => this._toggle(c.dataset.id)));
      ul.querySelectorAll('.edit-btn')    .forEach(b => b.addEventListener('click',  () => this._startEdit(b.dataset.id)));
      ul.querySelectorAll('.del-btn')     .forEach(b => b.addEventListener('click',  () => this._del(b.dataset.id)));
      ul.querySelectorAll('.save-edit')   .forEach(b => b.addEventListener('click',  () => this._saveEdit(b.dataset.id)));
      ul.querySelectorAll('.cancel-edit') .forEach(b => b.addEventListener('click',  () => this._cancelEdit()));
      ul.querySelectorAll('.task-edit-input').forEach(i => i.addEventListener('keydown', e => {
        if (e.key === 'Enter')  this._saveEdit(i.dataset.id);
        if (e.key === 'Escape') this._cancelEdit();
      }));
    },

    _save() { Store.set('dashboard_tasks', this._tasks); },

    _err(id, msg) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = msg;
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.textContent = ''; }, 3000);
    }
  };

  /* ============================================================
     QUICK LINKS
     ============================================================ */
  const Links = {
    _links: [],

    init() {
      this._links = Store.get('dashboard_links', []);
      this._render();
      document.getElementById('link-add')
        .addEventListener('click', () => this._add());
      ['link-name','link-url'].forEach(id =>
        document.getElementById(id)
          .addEventListener('keydown', e => { if (e.key === 'Enter') this._add(); }));
    },

    _add() {
      const nameEl = document.getElementById('link-name');
      const urlEl  = document.getElementById('link-url');
      const name   = nameEl.value.trim();
      const url    = urlEl.value.trim();
      if (!name)                { this._err('Nama tautan tidak boleh kosong.'); return; }
      if (!url)                 { this._err('URL tidak boleh kosong.'); return; }
      if (!url.startsWith('http://') && !url.startsWith('https://'))
                                { this._err('URL harus diawali http:// atau https://'); return; }
      this._links.push({ id: String(Date.now()), name, url });
      this._save(); this._render();
      nameEl.value = ''; urlEl.value = '';
      document.getElementById('link-error').textContent = '';
    },

    _del(id) {
      this._links = this._links.filter(l => l.id !== id);
      this._save(); this._render();
    },

    _render() {
      const c = document.getElementById('links-container');
      c.innerHTML = '';
      if (!this._links.length) {
        c.innerHTML = '<p class="links-empty">Belum ada tautan.</p>';
        return;
      }
      this._links.forEach(l => {
        const a = document.createElement('a');
        a.className = 'link-chip';
        a.href      = l.url;
        a.target    = '_blank';
        a.rel       = 'noopener noreferrer';
        a.innerHTML = `${esc(l.name)}<button class="link-chip-del" data-id="${l.id}" title="Hapus" aria-label="Hapus">✕</button>`;
        c.appendChild(a);
      });
      c.querySelectorAll('.link-chip-del').forEach(b =>
        b.addEventListener('click', e => { e.preventDefault(); this._del(b.dataset.id); }));
    },

    _save() { Store.set('dashboard_links', this._links); },

    _err(msg) {
      const el = document.getElementById('link-error');
      if (!el) return;
      el.textContent = msg;
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.textContent = ''; }, 3000);
    }
  };

  /* ============================================================
     SETTINGS PANEL
     ============================================================ */
  const Settings = {
    init() {
      this._load();
      document.getElementById('settings-open')    .addEventListener('click', () => this.open());
      document.getElementById('settings-close')   .addEventListener('click', () => this.close());
      document.getElementById('settings-backdrop').addEventListener('click', () => this.close());
      document.getElementById('settings-save')    .addEventListener('click', () => this._save());
      document.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    },
    open() {
      this._load();
      document.getElementById('settings-modal').classList.remove('hidden');
      document.getElementById('settings-name').focus();
    },
    close() {
      document.getElementById('settings-modal').classList.add('hidden');
      document.getElementById('settings-name-error').textContent     = '';
      document.getElementById('settings-duration-error').textContent = '';
    },
    _load() {
      const s = Store.get('dashboard_settings', {});
      document.getElementById('settings-name').value     = s.userName || '';
      document.getElementById('settings-duration').value = s.pomodoroDuration || 25;
    },
    _save() {
      const name   = document.getElementById('settings-name').value;
      const durRaw = document.getElementById('settings-duration').value;
      const dur    = parseInt(durRaw, 10);

      if (durRaw !== '' && (isNaN(dur) || dur < 1 || dur > 120)) {
        const el = document.getElementById('settings-duration-error');
        el.textContent = 'Durasi harus antara 1 – 120 menit.';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.textContent = ''; }, 3000);
        return;
      }

      const s = Store.get('dashboard_settings', {});
      s.userName         = name.trim();
      s.pomodoroDuration = (!isNaN(dur) && dur >= 1 && dur <= 120) ? dur : (s.pomodoroDuration || 25);
      Store.set('dashboard_settings', s);

      Greeting.render();
      Timer.reset();
      this.close();
    }
  };

  /* ============================================================
     HELPERS
     ============================================================ */
  function esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener('DOMContentLoaded', () => {
    Store.init();
    if (!Store.ok) document.getElementById('storage-warning').style.display = 'block';

    ThemeManager.init();
    Greeting.init();
    Timer.init();
    Todo.init();
    Links.init();
    Settings.init();
  });

})();
