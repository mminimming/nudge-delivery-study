"""Fetch public OSM data once; no participant information is sent.
Run with Python 3. The raw snapshot is cached for reproducibility.
"""
import json
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
BBOX = '35.692,139.767,35.733,139.813'
QUERY = f'''[out:json][timeout:45];
way[highway~"^(primary|secondary|tertiary|unclassified|residential|living_street|service|primary_link|secondary_link|tertiary_link)$"]({BBOX})->.roads;
(.roads;node(w.roads);rel(bw.roads)[type=restriction];);out body;
way[building]({BBOX});out center;
'''

if __name__ == '__main__':
    target = ROOT / 'data' / 'taito-osm-raw.json'
    if target.exists():
        print('Using existing snapshot:', target)
    else:
        url = 'https://overpass-api.de/api/interpreter'
        request = urllib.request.Request(url, data=urllib.parse.urlencode({'data': QUERY}).encode(),
                                         headers={'User-Agent': 'TaitoDeliveryResearchPrototype/1.0'})
        with urllib.request.urlopen(request, timeout=58) as response:
            content = response.read()
        parsed = json.loads(content)
        if parsed.get('remark') or not parsed.get('elements'):
            raise RuntimeError(parsed.get('remark', 'Empty OSM response'))
        target.write_bytes(content)
        (ROOT / 'data' / 'overpass-query.txt').write_text(QUERY)
        print('Saved', len(content), 'bytes;', len(parsed['elements']), 'elements')
