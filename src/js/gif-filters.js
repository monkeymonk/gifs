const SEARCH_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>';

class GifFilters extends HTMLElement {
  constructor() {
    super();
    this._query = '';
    this._tags = [];
    this._viewMode = 'all';
    this._allTags = [];
    this._totalCount = 0;
    this._filteredCount = 0;
    this._favoritesCount = 0;
    this._initialized = false;
  }

  connectedCallback() {
    this._readURL();
    this._render();
    this._initialized = true;
    this._emitFilter();

    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== this._input) {
        e.preventDefault();
        this._input?.focus();
      }
      if (e.key === 'Escape') this._input?.blur();
    });
  }

  update({ allTags, totalCount, filteredCount, favoritesCount }) {
    if (allTags) this._allTags = allTags;
    if (totalCount !== undefined) this._totalCount = totalCount;
    if (filteredCount !== undefined) this._filteredCount = filteredCount;
    if (favoritesCount !== undefined) this._favoritesCount = favoritesCount;
    this._renderTags();
    this._renderCount();
    this._renderViewTabs();
  }

  get query() { return this._query; }
  get selectedTags() { return this._tags; }
  get viewMode() { return this._viewMode; }

  _readURL() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const tags = params.get('tags')?.split(',').map(t => t.trim()).filter(Boolean);
    if (q) this._query = q;
    if (tags?.length) this._tags = tags;
  }

  _syncURL() {
    const params = new URLSearchParams(window.location.search);
    params.delete('q');
    params.delete('tags');
    if (this._query) params.set('q', this._query);
    if (this._tags.length) params.set('tags', this._tags.join(','));
    const search = params.toString();
    const url = `${window.location.pathname}${search ? '?' + search : ''}${window.location.hash}`;
    history.replaceState(null, '', url);
  }

  _render() {
    this.innerHTML = `
      <search class="filter-bar" role="search" aria-label="Filter GIFs">
        <div class="filter-row">
          <div class="view-tabs" role="tablist" aria-label="View mode">
            <button type="button" role="tab" class="view-tab" data-mode="all" aria-selected="true">All</button>
            <button type="button" role="tab" class="view-tab" data-mode="favorites" aria-selected="false">Favorites<span class="view-tab-count"></span></button>
          </div>
          <div class="search-box">
            <span class="search-icon" aria-hidden="true">${SEARCH_SVG}</span>
            <input type="search" class="search-input" aria-label="Search GIFs by name, tag, or keyword" placeholder='Search...  "/"' value="${this._query}" />
            <button type="button" class="search-clear" aria-label="Clear search" style="${this._query ? '' : 'display:none'}">&#x2715;</button>
          </div>
          <div class="filter-actions">
            <button type="button" class="btn-sm palette-trigger" aria-label="Open command palette">
              <span style="font-size:0.625rem;padding:0.125rem 0.25rem;border-radius:3px;border:1px solid var(--border);color:var(--text-muted)">⌘K</span>
            </button>
            <button type="button" class="btn-sm clear-btn" style="display:none">Clear</button>
            <output class="count-display" aria-live="polite" aria-atomic="true">${this._totalCount}</output>
          </div>
        </div>
        <div class="tag-row">
          <button type="button" class="tag-toggle btn-sm" aria-expanded="false" aria-controls="tag-list">Tags</button>
          <div class="tag-list" id="tag-list" role="group" aria-label="Filter by tag"></div>
        </div>
      </search>
    `;

    this._input = this.querySelector('.search-input');
    this._input.addEventListener('input', () => {
      this._query = this._input.value;
      this._updateClearBtn();
      this._syncURL();
      this._emitFilter();
    });

    this.querySelector('.search-clear')?.addEventListener('click', () => {
      this._query = '';
      this._input.value = '';
      this._input.focus();
      this._updateClearBtn();
      this._syncURL();
      this._emitFilter();
    });

    this.querySelector('.clear-btn').addEventListener('click', () => {
      this._query = '';
      this._tags = [];
      this._input.value = '';
      this._input.focus();
      this._updateClearBtn();
      this._syncURL();
      this._renderTags();
      this._emitFilter();
    });

    this.querySelector('.tag-toggle').addEventListener('click', () => {
      const tagList = this.querySelector('.tag-list');
      const btn = this.querySelector('.tag-toggle');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', !expanded);
      tagList.classList.toggle('is-open', !expanded);
    });

    this.querySelector('.palette-trigger').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('gif:open-palette', { bubbles: true, composed: true }));
    });

    this.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._viewMode = tab.dataset.mode;
        this._renderViewTabs();
        this._emitFilter();
      });
    });

    this._updateClearBtn();
  }

  _renderTags() {
    const container = this.querySelector('.tag-list');
    if (!container) return;
    container.innerHTML = this._allTags.map(t => `
      <button type="button" class="tag-pill" aria-pressed="${this._tags.includes(t)}" data-tag="${t}">${t}</button>
    `).join('');
    container.querySelectorAll('.tag-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        if (this._tags.includes(tag)) {
          this._tags = this._tags.filter(t => t !== tag);
        } else {
          this._tags = [...this._tags, tag];
        }
        btn.setAttribute('aria-pressed', this._tags.includes(tag));
        this._updateClearBtn();
        this._syncURL();
        this._emitFilter();
      });
    });
  }

  _renderCount() {
    const display = this.querySelector('.count-display');
    if (!display) return;
    const hasFilters = this._query || this._tags.length;
    display.textContent = hasFilters && this._filteredCount !== this._totalCount
      ? `${this._filteredCount}/${this._totalCount}`
      : `${this._totalCount}`;
  }

  _renderViewTabs() {
    this.querySelectorAll('.view-tab').forEach(tab => {
      const mode = tab.dataset.mode;
      tab.setAttribute('aria-selected', mode === this._viewMode);
      const countEl = tab.querySelector('.view-tab-count');
      if (countEl) {
        if (mode === 'favorites' && this._favoritesCount > 0) {
          countEl.textContent = this._favoritesCount;
        } else {
          countEl.textContent = '';
        }
      }
    });
  }

  _updateClearBtn() {
    const btn = this.querySelector('.clear-btn');
    if (btn) btn.style.display = (this._query || this._tags.length) ? '' : 'none';
    const searchClear = this.querySelector('.search-clear');
    if (searchClear) searchClear.style.display = this._query ? '' : 'none';
  }

  _emitFilter() {
    if (!this._initialized) return;
    this.dispatchEvent(new CustomEvent('gif:filter', {
      bubbles: true,
      composed: true,
      detail: { query: this._query, tags: this._tags, viewMode: this._viewMode },
    }));
  }
}

customElements.define('gif-filters', GifFilters);
