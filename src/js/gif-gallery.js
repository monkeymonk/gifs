const FAVORITES_KEY = 'gif-vault-favorites';

function loadSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}
function saveSet(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

class GifGallery extends HTMLElement {
  constructor() {
    super();
    this._items = [];
    this._filteredItems = [];
    this._favorites = loadSet(FAVORITES_KEY);
    this._query = '';
    this._selectedTags = [];
    this._viewMode = 'all';
    this._toastTimer = null;
  }

  connectedCallback() {
    this._baseUrl = this.dataset.baseUrl || '';
    requestAnimationFrame(() => this._init());
  }

  _init() {
    this._cards = Array.from(this.querySelectorAll('gif-card'));
    this._items = this._cards.map(card => card.data);

    this._items.forEach(item => {
      item._search = `${item.title} ${(item.tags || []).join(' ')}`.toLowerCase();
    });

    this._allTags = Array.from(
      new Set(this._items.flatMap(i => [i.category, i.subcategory].filter(Boolean)))
    ).sort();

    this._lightbox = document.createElement('gif-lightbox');
    this.appendChild(this._lightbox);

    this._palette = document.createElement('gif-command-palette');
    this._palette.items = this._items;
    this._palette.favorites = this._favorites;
    this.appendChild(this._palette);

    this._filteredItems = [...this._items];
    this._filters = this.querySelector('gif-filters');

    this._cards.forEach(card => {
      card.favorite = this._favorites.has(card.data.id);
    });

    this._updateFilters();

    this.addEventListener('gif:filter', (e) => this._onFilter(e.detail));
    this.addEventListener('gif:preview', (e) => this._onPreview(e.detail));
    this.addEventListener('gif:favorite', (e) => this._onFavorite(e.detail));
    this.addEventListener('gif:toast', (e) => this._showToast(e.detail.message));
    this.addEventListener('gif:download-zip', () => this._downloadZip());
    this.addEventListener('gif:lightbox-close', () => this._lightbox.close());
    this.addEventListener('gif:lightbox-change', (e) => {
      this._lightbox.updateFavorite(this._favorites.has(e.detail.id));
    });
    this.addEventListener('gif:open-palette', () => {
      this._palette.items = this._items;
      this._palette.favorites = this._favorites;
      this._palette.open();
    });

    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (this._palette.isOpen) {
          this._palette.close();
        } else {
          this._palette.items = this._items;
          this._palette.favorites = this._favorites;
          this._palette.open();
        }
      }
    });
  }

  _onFilter({ query, tags, viewMode }) {
    this._query = query || '';
    this._selectedTags = tags || [];
    this._viewMode = viewMode || 'all';
    this._applyFilters();
  }

  _applyFilters() {
    const q = this._query.trim().toLowerCase();

    this._cards.forEach(card => {
      const item = card.data;
      let visible = true;

      if (this._viewMode === 'favorites') {
        visible = this._favorites.has(item.id);
      }

      if (visible && q) {
        visible = item._search.includes(q);
      }

      if (visible && this._selectedTags.length > 0) {
        visible = this._selectedTags.every(tag => (item.tags || []).includes(tag));
      }

      card.style.display = visible ? '' : 'none';
    });

    const visibleCount = this._cards.filter(c => c.style.display !== 'none').length;
    this._filteredItems = this._items.filter((_, i) => this._cards[i].style.display !== 'none');

    this._filters?.update({
      filteredCount: visibleCount,
      totalCount: this._items.length,
      favoritesCount: this._favorites.size,
    });

    this._updateEmptyState(visibleCount);
  }

  _updateEmptyState(count) {
    let empty = this.querySelector('.gif-empty-state');
    if (count === 0) {
      if (!empty) {
        empty = document.createElement('div');
        empty.className = 'state-container gif-empty-state';
        empty.setAttribute('role', 'status');
        empty.innerHTML = '<div class="state-empty"><div class="state-empty-icon" aria-hidden="true">:/</div><div class="state-text" style="color:var(--text-muted)">No GIFs match your search</div></div>';
        this.querySelector('.gif-grid')?.after(empty);
      }
      empty.style.display = '';
    } else if (empty) {
      empty.style.display = 'none';
    }
  }

  _onPreview(item) {
    const loadedSrcs = new Map();
    for (const card of this._cards) {
      const img = card.querySelector('img.card-media.is-loaded');
      if (img) loadedSrcs.set(card.data.id, img.src);
    }
    this._lightbox.open(item, this._filteredItems, this._favorites.has(item.id), loadedSrcs);
  }

  _onFavorite({ id }) {
    if (this._favorites.has(id)) {
      this._favorites.delete(id);
    } else {
      this._favorites.add(id);
    }
    saveSet(FAVORITES_KEY, this._favorites);

    const card = this._cards.find(c => c.data.id === id);
    if (card) card.favorite = this._favorites.has(id);

    if (this._lightbox.isOpen) {
      this._lightbox.updateFavorite(this._favorites.has(id));
    }

    this._palette.favorites = this._favorites;
    this._filters?.update({ favoritesCount: this._favorites.size });

    if (this._viewMode === 'favorites') this._applyFilters();
  }

  _updateFilters() {
    this._filters?.update({
      allTags: this._allTags,
      totalCount: this._items.length,
      filteredCount: this._items.length,
      favoritesCount: this._favorites.size,
    });
  }

  async _downloadZip() {
    if (typeof JSZip === 'undefined') {
      this._showToast('JSZip not loaded');
      return;
    }
    const favItems = this._items.filter(item => this._favorites.has(item.id));
    if (!favItems.length) return;

    const zip = new JSZip();
    let done = 0;
    this._filters?.setZipProgress(0, favItems.length);
    this._showToast(`Fetching 0/${favItems.length}...`);

    for (const item of favItems) {
      try {
        const res = await fetch(item.src);
        const blob = await res.blob();
        const folder = item.category || 'uncategorized';
        zip.file(`${folder}/${item.id}.${item.ext}`, blob);
      } catch {
        // skip failed files
      }
      done++;
      this._filters?.setZipProgress(done, favItems.length);
      this._showToast(`Fetching ${done}/${favItems.length}...`);
    }

    this._showToast('Creating ZIP...');
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gifs-${favItems.length}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this._showToast('Download started');
  }

  _showToast(message) {
    clearTimeout(this._toastTimer);
    let toast = this.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      this.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.display = '';
    toast.style.animation = 'none';
    toast.offsetHeight;
    toast.style.animation = '';

    this._toastTimer = setTimeout(() => {
      toast.style.display = 'none';
    }, 2000);
  }
}

customElements.define('gif-gallery', GifGallery);
