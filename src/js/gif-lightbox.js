function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

const ARROW_LEFT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>';
const ARROW_RIGHT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>';
const DL_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatLink(item, format) {
  const fullUrl = new URL(item.src, window.location.origin).toString();
  switch (format) {
    case 'markdown': return `![${item.title}](${fullUrl})`;
    case 'html': return `<img src="${fullUrl}" alt="${item.title}" />`;
    default: return fullUrl;
  }
}

class GifLightbox extends HTMLElement {
  constructor() {
    super();
    this._item = null;
    this._items = [];
    this._currentIndex = 0;
    this._isFavorite = false;
    this._previousFocus = null;
  }

  open(item, items, isFavorite, loadedSrcs) {
    this._item = item;
    this._items = items;
    this._currentIndex = items.findIndex(i => i.id === item.id);
    this._isFavorite = isFavorite;
    this._loadedSrcs = loadedSrcs || new Map();
    this._previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    this._render();
    this.querySelector('.lightbox')?.focus();
  }

  close() {
    document.body.style.overflow = '';
    this.innerHTML = '';
    this._previousFocus?.focus();
    this._item = null;
  }

  updateFavorite(isFav) {
    this._isFavorite = isFav;
    const btn = this.querySelector('.lb-fav-btn');
    if (btn) {
      btn.textContent = isFav ? '★' : '☆';
      btn.classList.toggle('is-fav', isFav);
      btn.setAttribute('aria-pressed', isFav);
    }
  }

  get isOpen() { return !!this._item; }

  _render() {
    const d = this._item;
    if (!d) return;

    const isVideo = d.ext === 'webm' || d.ext === 'mp4';
    const imgSrc = this._loadedSrcs?.get(d.id) || d.src;
    const hasPrev = this._currentIndex > 0;
    const hasNext = this._currentIndex < this._items.length - 1;

    this.innerHTML = `
      <div class="lightbox-backdrop" role="presentation">
        <div class="lightbox" role="dialog" aria-modal="true" aria-label="Preview: ${esc(d.title)}" tabindex="-1">
          <div class="lightbox-hints">
            <span class="lightbox-hint-text">←→ prev/next · C=URL · M=MD · H=HTML · D=save · F=fav</span>
            <div style="display:flex;align-items:center;gap:0.75rem">
              <span class="lightbox-counter">${this._currentIndex + 1}/${this._items.length}</span>
              <button type="button" class="lightbox-close" aria-label="Close preview">&#x2715;</button>
            </div>
          </div>
          <div class="lightbox-content">
            ${hasPrev ? `<button type="button" class="lightbox-nav lightbox-nav-prev" aria-label="Previous GIF">${ARROW_LEFT_SVG}</button>` : ''}
            ${hasNext ? `<button type="button" class="lightbox-nav lightbox-nav-next" aria-label="Next GIF">${ARROW_RIGHT_SVG}</button>` : ''}
            ${isVideo
              ? `<video autoplay loop muted playsinline class="lightbox-media" src="${d.src}"></video>`
              : `<img src="${imgSrc}" alt="${esc(d.title)}" class="lightbox-media" decoding="sync" />`
            }
            <div class="lightbox-info">
              <div class="lightbox-title-row">
                <div style="flex:1;min-width:0">
                  <div class="lightbox-title">${esc(d.title)}</div>
                  <div class="lightbox-meta">
                    ${(d.tags || []).map(t => `<span class="lightbox-tag">#${t}</span>`).join('')}
                    ${d.bytes ? `<span class="lightbox-size">${formatBytes(d.bytes)}</span>` : ''}
                  </div>
                </div>
                <button type="button" class="lightbox-fav-btn lb-fav-btn ${this._isFavorite ? 'is-fav' : ''}"
                        aria-label="${this._isFavorite ? 'Remove from favorites' : 'Add to favorites'}"
                        aria-pressed="${this._isFavorite}">
                  ${this._isFavorite ? '★' : '☆'}
                </button>
              </div>
              <div class="lightbox-copy-row">
                <span class="lightbox-copy-label">Copy as</span>
                <button type="button" class="lightbox-copy-btn" data-format="url">URL</button>
                <button type="button" class="lightbox-copy-btn" data-format="markdown">Markdown</button>
                <button type="button" class="lightbox-copy-btn" data-format="html">HTML</button>
                <button type="button" class="lightbox-download-btn lb-dl-btn">
                  ${DL_SVG} Download
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Event listeners
    this.querySelector('.lightbox-backdrop').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this._emitClose();
    });
    this.querySelector('.lightbox-close').addEventListener('click', () => this._emitClose());
    this.querySelector('.lightbox-nav-prev')?.addEventListener('click', () => this._navigate(-1));
    this.querySelector('.lightbox-nav-next')?.addEventListener('click', () => this._navigate(1));
    this.querySelector('.lb-fav-btn').addEventListener('click', () => {
      this._dispatch('gif:favorite', { id: d.id });
    });
    this.querySelector('.lb-dl-btn').addEventListener('click', () => this._download());

    this.querySelectorAll('.lightbox-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => this._copyAs(btn.dataset.format));
    });

    this.querySelector('.lightbox').addEventListener('keydown', (e) => this._handleKeyDown(e));
  }

  _navigate(delta) {
    const newIndex = this._currentIndex + delta;
    if (newIndex < 0 || newIndex >= this._items.length) return;
    this._currentIndex = newIndex;
    this._item = this._items[newIndex];
    this._dispatch('gif:lightbox-change', { id: this._item.id });
    this._render();
    this.querySelector('.lightbox')?.focus();
  }

  async _copyAs(format) {
    const text = formatLink(this._item, format);
    const labels = { url: 'URL', markdown: 'Markdown', html: 'HTML' };
    try {
      await navigator.clipboard.writeText(text);
      this._dispatch('gif:toast', { message: `Copied as ${labels[format]}` });

    } catch {
      this._dispatch('gif:toast', { message: 'Copy failed' });
    }
  }

  async _download() {
    const d = this._item;
    try {
      const res = await fetch(d.src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${d.id}.${d.ext || 'gif'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this._dispatch('gif:toast', { message: 'Downloading...' });
      this._dispatch('gif:recent', { id: d.id });
    } catch {
      this._dispatch('gif:toast', { message: 'Download failed' });
    }
  }

  _handleKeyDown(e) {
    if (e.key === 'Escape') { this._emitClose(); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); this._navigate(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); this._navigate(1); return; }

    // Focus trap
    if (e.key === 'Tab') {
      const dialog = this.querySelector('.lightbox');
      if (!dialog) return;
      const focusable = dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    if (!e.ctrlKey && !e.metaKey) {
      if (e.key === 'c') { e.preventDefault(); this._copyAs('url'); }
      if (e.key === 'd') { e.preventDefault(); this._download(); }
      if (e.key === 'f') { e.preventDefault(); this._dispatch('gif:favorite', { id: this._item.id }); }
      if (e.key === 'm') { e.preventDefault(); this._copyAs('markdown'); }
      if (e.key === 'h') { e.preventDefault(); this._copyAs('html'); }
    }
  }

  _emitClose() {
    this._dispatch('gif:lightbox-close', {});
  }

  _dispatch(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
  }
}

customElements.define('gif-lightbox', GifLightbox);
