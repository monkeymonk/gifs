function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

const CP_SEARCH_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';

const FORMAT_LABELS = { url: 'URL', markdown: 'Markdown', html: 'HTML' };

function formatLink(item, format) {
  const fullUrl = new URL(item.src, window.location.origin).toString();
  switch (format) {
    case 'markdown': return `![${item.title}](${fullUrl})`;
    case 'html': return `<img src="${fullUrl}" alt="${item.title}" />`;
    default: return fullUrl;
  }
}

class GifCommandPalette extends HTMLElement {
  constructor() {
    super();
    this._items = [];
    this._favorites = new Set();
    this._isOpen = false;
    this._query = '';
    this._selectedIndex = 0;
    this._copyFormat = 'url';
    this._results = [];
  }

  set items(val) { this._items = val; }
  set favorites(val) { this._favorites = val; }

  open() {
    this._isOpen = true;
    this._query = '';
    this._selectedIndex = 0;
    this._updateResults();
    this._render();
    setTimeout(() => this.querySelector('.palette-input')?.focus(), 50);
  }

  close() {
    this._isOpen = false;
    this.innerHTML = '';
  }

  get isOpen() { return this._isOpen; }

  _updateResults() {
    const q = this._query.trim().toLowerCase();
    if (!q) {
      this._results = this._items;
      return;
    }
    this._results = this._items
      .filter(item => {
        const search = `${item.title} ${(item.tags || []).join(' ')}`.toLowerCase();
        return search.includes(q);
      });
  }

  _render() {
    if (!this._isOpen) { this.innerHTML = ''; return; }

    this.innerHTML = `
      <div class="palette-backdrop" role="presentation">
        <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette — search and copy GIFs">
          <div class="palette-input-row">
            <span aria-hidden="true">${CP_SEARCH_SVG}</span>
            <input type="search" class="palette-input" placeholder="Search GIFs to copy..." aria-label="Search GIFs"
                   role="combobox" aria-expanded="true" aria-controls="cp-results" aria-autocomplete="list" />
            <div class="palette-formats">
              ${['url', 'markdown', 'html'].map(fmt => `
                <button type="button" class="palette-format-btn" data-format="${fmt}"
                        aria-label="Copy as ${FORMAT_LABELS[fmt]}" aria-pressed="${this._copyFormat === fmt}"
                        tabindex="-1">${FORMAT_LABELS[fmt]}</button>
              `).join('')}
            </div>
          </div>
          <div class="palette-results" id="cp-results" role="listbox">
            ${this._results.length === 0
              ? '<div class="palette-empty">No matches</div>'
              : this._results.map((item, i) => `
                <div class="palette-item ${i === this._selectedIndex ? 'is-selected' : ''}"
                     id="cp-item-${item.id}" role="option" aria-selected="${i === this._selectedIndex}"
                     data-index="${i}">
                  <img src="${item.src}" alt="" class="palette-item-thumb" loading="lazy" />
                  <div class="palette-item-info">
                    <div class="palette-item-title">${esc(item.title)}</div>
                    <div class="palette-item-tags">${(item.tags || []).map(t => '#' + esc(t)).join(' ')}</div>
                  </div>
                  <div class="palette-item-icons">
                    ${this._favorites.has(item.id) ? '<span class="palette-item-fav" aria-label="Favorited">★</span>' : ''}
                    ${i === this._selectedIndex ? '<span class="palette-item-enter">↵</span>' : ''}
                  </div>
                </div>
              `).join('')
            }
          </div>
          <div class="palette-footer">
            <span>↑↓ navigate</span>
            <span>↵ copy ${FORMAT_LABELS[this._copyFormat]}</span>
            <span>Tab cycle format</span>
            <span>Ctrl+F fav</span>
            <span>Esc close</span>
          </div>
        </div>
      </div>
    `;

    // Event listeners
    this.querySelector('.palette-backdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

    const input = this.querySelector('.palette-input');
    input.value = this._query;
    input.addEventListener('input', () => {
      this._query = input.value;
      this._selectedIndex = 0;
      this._updateResults();
      this._renderResults();
    });

    this.querySelectorAll('.palette-format-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._copyFormat = btn.dataset.format;
        this._render();
        this.querySelector('.palette-input')?.focus();
      });
    });

    // Bind initial result items
    this.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10);
        if (this._results[idx]) this._copyItem(this._results[idx]);
      });
      el.addEventListener('mouseenter', () => {
        this._selectedIndex = parseInt(el.dataset.index, 10);
        this._updateSelection();
      });
    });

    this.querySelector('.palette').addEventListener('keydown', (e) => this._handleKeyDown(e));
  }

  _renderResults() {
    const container = this.querySelector('.palette-results');
    if (!container) return;

    if (this._results.length === 0) {
      container.innerHTML = '<div class="palette-empty">No matches</div>';
      return;
    }

    container.innerHTML = this._results.map((item, i) => `
      <div class="palette-item ${i === this._selectedIndex ? 'is-selected' : ''}"
           id="cp-item-${item.id}" role="option" aria-selected="${i === this._selectedIndex}"
           data-index="${i}">
        <img src="${item.src}" alt="" class="palette-item-thumb" loading="lazy" />
        <div class="palette-item-info">
          <div class="palette-item-title">${esc(item.title)}</div>
          <div class="palette-item-tags">${(item.tags || []).map(t => '#' + esc(t)).join(' ')}</div>
        </div>
        <div class="palette-item-icons">
          ${this._favorites.has(item.id) ? '<span class="palette-item-fav" aria-label="Favorited">★</span>' : ''}
          ${i === this._selectedIndex ? '<span class="palette-item-enter">↵</span>' : ''}
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index, 10);
        if (this._results[idx]) this._copyItem(this._results[idx]);
      });
      el.addEventListener('mouseenter', () => {
        this._selectedIndex = parseInt(el.dataset.index, 10);
        this._updateSelection();
      });
    });

    const selected = container.querySelector('.is-selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  _updateSelection() {
    this.querySelectorAll('.palette-item').forEach((el, i) => {
      el.classList.toggle('is-selected', i === this._selectedIndex);
      el.setAttribute('aria-selected', i === this._selectedIndex);
      const enterEl = el.querySelector('.palette-item-enter');
      if (enterEl) enterEl.style.display = i === this._selectedIndex ? '' : 'none';
      if (i === this._selectedIndex) el.scrollIntoView({ block: 'nearest' });
    });
  }

  async _copyItem(item) {
    const text = formatLink(item, this._copyFormat);
    try {
      await navigator.clipboard.writeText(text);
      this._dispatch('gif:toast', { message: `Copied ${FORMAT_LABELS[this._copyFormat]}` });
      this.close();
    } catch {
      this._dispatch('gif:toast', { message: 'Copy failed' });
    }
  }

  _handleKeyDown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._selectedIndex = Math.min(this._selectedIndex + 1, this._results.length - 1);
        this._updateSelection();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._selectedIndex = Math.max(this._selectedIndex - 1, 0);
        this._updateSelection();
        break;
      case 'Enter':
        e.preventDefault();
        if (this._results[this._selectedIndex]) this._copyItem(this._results[this._selectedIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
      case 'Tab': {
        e.preventDefault();
        const formats = ['url', 'markdown', 'html'];
        const nextIdx = (formats.indexOf(this._copyFormat) + (e.shiftKey ? -1 : 1) + formats.length) % formats.length;
        this._copyFormat = formats[nextIdx];
        this._render();
        this.querySelector('.palette-input')?.focus();
        break;
      }
      case 'f':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          if (this._results[this._selectedIndex]) {
            this._dispatch('gif:favorite', { id: this._results[this._selectedIndex].id });
          }
        }
        break;
    }
  }

  _dispatch(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }
}

customElements.define('gif-command-palette', GifCommandPalette);
