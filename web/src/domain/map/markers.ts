// DOM builders for the map's markers. Plain elements (styled by RouteMap.vue's mm-* CSS)
// so they survive setStyle() theme flips untouched. Thumbnails swap in when decrypted —
// a failure just leaves the placeholder circle.
import type { Manifest, Photo } from '@/domain/album/types';

type Thumb = (nodeUid: string) => Promise<string | null>;

export function appendImg(el: HTMLElement, url: string): void {
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  el.appendChild(img);
}

function fillThumb(el: HTMLElement, thumb: Promise<string | null>): void {
  thumb.then((url) => { if (url) appendImg(el, url); }).catch(() => {});
}

// Stop marker: circular first-photo thumbnail with a count badge.
export function stopMarkerEl(stop: Manifest['stops'][number], title: string, thumb: Thumb, onClick: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'mm-wrap';
  wrap.title = title;
  const dot = document.createElement('div');
  dot.className = 'mm-dot';
  wrap.appendChild(dot);
  if (stop.photos.length > 1) { // a count of 1 is noise
    const badge = document.createElement('span');
    badge.className = 'mm-badge';
    badge.textContent = String(stop.photos.length);
    wrap.appendChild(badge);
  }
  wrap.addEventListener('click', onClick);
  fillThumb(dot, thumb(stop.photos[0]!.nodeUid));
  return wrap;
}

// Mini marker: an active day's individual photo, small and non-interactive.
export function miniEl(p: Photo, thumb: Thumb): HTMLElement {
  const div = document.createElement('div');
  div.className = 'mm-mini';
  fillThumb(div, thumb(p.nodeUid));
  return div;
}

// Hover-highlight marker, created bare; the caller swaps the thumbnail in itself because
// it must re-check the hover is still current when the decrypt resolves.
export function hlEl(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'mm-hl';
  return div;
}
