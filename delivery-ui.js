(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const num = (value, digits = 1) => (Math.abs(value) < .5 * 10 ** -digits ? 0 : value).toFixed(digits);
  const scenarioKey = 'taito-shared-empty-v1';
  function readScenario(engine) { const saved = localStorage.getItem(scenarioKey); return saved ? JSON.parse(saved) : engine.baseline(); }
  function writeScenario(state) { localStorage.setItem(scenarioKey, JSON.stringify(state)); }
  let loaded;
  async function load() {
    if (!loaded) loaded = fetch('data/taito-network.json').then(r => { if (!r.ok) throw Error('Road data could not be loaded'); return r.json(); }).then(data => TaitoDelivery.createEngine(data)).catch(e => { loaded = null; throw e; });
    return loaded;
  }
  function map(container, data, { destinationId, routePointSequence = [], onPick } = {}) {
    const south = 35.696, north = 35.727, west = 139.773, east = 139.806;
    const xy = (lat, lon) => [((lon - west) / (east - west) * 800).toFixed(1), ((north - lat) / (north - south) * 580).toFixed(1)];
    const coords = data.road_nodes.map(n => xy(...n));
    const road = data.road_segments.map(([a, b]) => `M${coords[a]}L${coords[b]}`).join('');
    let path = '';
    for (let i = 1; i < routePointSequence.length; i++) {
      const cell = data.matrix[routePointSequence[i - 1]][routePointSequence[i]];
      path += 'M' + cell.nodes.map(n => coords[n].join(',')).join('L');
    }
    const dots = data.points.map(p => {
      const [x, y] = xy(p.lat, p.lon), selected = p.id === destinationId;
      if (p.id === 'depot') return `<g><rect x="${+x - 7}" y="${+y - 7}" width="14" height="14" rx="3" fill="#172338" stroke="white" stroke-width="2"/><text x="${+x + 13}" y="${+y + 4}" class="map-label">元浅草 拠点</text></g>`;
      if (p.kind === 'background') return '';
      return `<g class="map-destination ${selected ? 'is-selected' : ''}" data-point="${escape(p.id)}" ${onPick ? `role="button" tabindex="0" aria-label="${escape(p.name)}" aria-pressed="${selected}"` : ''}><circle cx="${x}" cy="${y}" r="${selected ? 11 : 7}" fill="${selected ? '#db7138' : '#625bb3'}" stroke="white" stroke-width="2"/><title>${escape(p.name)}</title>${selected ? `<text class="map-label" x="${+x + 15}" y="${+y - 12}">${escape(p.name)}</text>` : ''}</g>`;
    }).join('');
    container.innerHTML = `<svg viewBox="0 0 800 580" class="road-map" aria-label="台東区の道路、配送拠点と配送地点"><rect width="800" height="580" fill="#f2f4f6"/><path d="${road}" stroke="#d0d6dc" stroke-width="1.3" fill="none"/><path d="${path}" stroke="#4f46a5" stroke-width="3.5" fill="none" stroke-linejoin="round" opacity=".85"/>${dots}<text x="20" y="32" class="map-title">TAITO · TOKYO</text></svg><div class="map-caption"><span>■ 拠点　<span class="purple">●</span> 配送候補　<span class="orange">●</span> 選択地点</span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></div>`;
    if (onPick) container.querySelectorAll('[data-point]').forEach(el => {
      el.onclick = () => onPick(el.dataset.point);
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(el.dataset.point); } };
    });
  }
  function nudge(option) {
    if (!option.isRecommended) return null;
    const carbon = num(option.savedCO2VsEarliest, 2), minutes = num(option.savedActiveVsEarliest, 1);
    return `最も早い配送枠と比べ、走行CO₂を約${carbon} kg、運転・配達の作業時間を約${minutes}分減らせる見込みです。`;
  }
  root.TaitoUI = { load, map, escape, num, readScenario, writeScenario, nudge };
})(window);
