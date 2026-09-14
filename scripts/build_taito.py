"""Build an offline, directed road matrix from the archived OSM snapshot.
Standard-library only. Modeled speeds are NOT measured congestion speeds.
"""
import collections
import hashlib
import heapq
import json
import math
import pathlib
import random

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'taito-osm-raw.json'
SPEEDS = {'primary': 25, 'secondary': 22, 'tertiary': 20, 'unclassified': 16,
          'residential': 14, 'living_street': 10, 'service': 10,
          'primary_link': 20, 'secondary_link': 18, 'tertiary_link': 16}
DENIED = {'no', 'private', 'agricultural', 'forestry'}

def distance(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371 * 2 * math.asin(min(1, math.sqrt(h)))

def allowed(tags):
    return tags.get('motorcar', tags.get('motor_vehicle', tags.get('vehicle', tags.get('access', 'yes')))) not in DENIED

def build():
    raw_bytes = RAW.read_bytes()
    raw = json.loads(raw_bytes)
    nodes = {e['id']: e for e in raw['elements'] if e['type'] == 'node'}
    ways = {e['id']: e for e in raw['elements'] if e['type'] == 'way' and e.get('tags', {}).get('highway') in SPEEDS}
    graph = collections.defaultdict(list)
    edges = []
    for way in ways.values():
        tags = way.get('tags', {})
        if not allowed(tags) or tags.get('service') in {'parking_aisle', 'driveway'}:
            continue
        speed = SPEEDS[tags['highway']]
        try:
            speed = min(speed, float(tags.get('maxspeed', speed)))
        except ValueError:
            pass
        oneway = tags.get('oneway', 'yes' if tags.get('junction') == 'roundabout' else 'no')
        for u, v in zip(way['nodes'], way['nodes'][1:]):
            if u not in nodes or v not in nodes:
                continue
            blocked = False
            for node in (nodes[u], nodes[v]):
                t = node.get('tags', {})
                if not allowed(t) or (t.get('barrier') in {'bollard', 'block', 'cycle_barrier'} and t.get('motor_vehicle') != 'yes'):
                    blocked = True
            if blocked:
                continue
            km = distance((nodes[u]['lat'], nodes[u]['lon']), (nodes[v]['lat'], nodes[v]['lon']))
            pairs = [(v, u)] if oneway == '-1' else [(u, v)] if oneway in {'yes', '1', 'true'} else [(u, v), (v, u)]
            for a, b in pairs:
                edge = (a, b, way['id'], km, km / speed * 60)
                graph[a].append(len(edges))
                edges.append(edge)

    restrictions = collections.defaultdict(list)
    unsupported = 0
    for rel in (e for e in raw['elements'] if e['type'] == 'relation'):
        tags = rel.get('tags', {})
        if tags.get('type') != 'restriction' or {'motorcar', 'motor_vehicle'} & set(tags.get('except', '').split(';')):
            continue
        members = rel['members']
        via = [m['ref'] for m in members if m['role'] == 'via' and m['type'] == 'node']
        frm = [m['ref'] for m in members if m['role'] == 'from']
        to = [m['ref'] for m in members if m['role'] == 'to']
        rule = tags.get('restriction:motorcar', tags.get('restriction', ''))
        if len(via) == len(frm) == len(to) == 1 and rule.startswith(('no_', 'only_')):
            restrictions[(via[0], frm[0])].append((to[0], rule))
        else:
            unsupported += 1

    def nearest(lat, lon):
        return min(graph, key=lambda n: distance((lat, lon), (nodes[n]['lat'], nodes[n]['lon'])))

    depot_node = nearest(35.707, 139.7884444)
    def reachable(reverse=False):
        adjacency = collections.defaultdict(list)
        for u, v, *_ in edges:
            adjacency[v if reverse else u].append(u if reverse else v)
        seen, stack = {depot_node}, [depot_node]
        while stack:
            for v in adjacency[stack.pop()]:
                if v not in seen:
                    seen.add(v); stack.append(v)
        return seen
    component = reachable() & reachable(True)
    road_nodes = sorted(component)
    def snap(lat, lon):
        n = min(road_nodes, key=lambda n: distance((lat, lon), (nodes[n]['lat'], nodes[n]['lon'])))
        return n, distance((lat, lon), (nodes[n]['lat'], nodes[n]['lon']))

    # Seeded synthetic demand, sampled at actual building centers; no residents' data.
    rng = random.Random(20260914)
    clusters = [('ueno', '東上野', 35.7115, 139.7815), ('iriya', '入谷・松が谷', 35.720, 139.788),
                ('asakusa', '浅草', 35.717, 139.797), ('kuramae', '蔵前・寿', 35.703, 139.790)]
    buildings = {e['id']: e for e in raw['elements'] if e['type'] == 'way' and 'building' in e.get('tags', {}) and 'center' in e}
    points = [{'id': 'depot', 'name': '元浅草営業所', 'lat': 35.707, 'lon': 139.7884444,
               'road_node': depot_node, 'access_km': round(distance((35.707,139.7884444),(nodes[depot_node]['lat'],nodes[depot_node]['lon'])),5),
               'address': '東京都台東区元浅草4丁目7-9',
               'source_url': 'https://locations.kuronekoyamato.co.jp/p/yamato01/shop_dtl.htm?kid=038563&p_f2=1'}]
    used = set()
    for cluster_id, name, lat, lon in clusters:
        candidates = [b for b in buildings.values() if distance((lat, lon), (b['center']['lat'], b['center']['lon'])) < .52]
        candidates.sort(key=lambda b: b['id'])
        rng.shuffle(candidates)
        chosen = 0
        for b in candidates:
            if b['id'] in used:
                continue
            c = b['center']; n, access = snap(c['lat'], c['lon'])
            if access > .10 or n in {p['road_node'] for p in points}:
                continue
            used.add(b['id']); chosen += 1
            points.append({'id': f'{cluster_id}-{chosen:02}', 'name': f'{name} · 地点{chosen:02}', 'cluster': cluster_id,
                           'lat': c['lat'], 'lon': c['lon'], 'road_node': n, 'access_km': round(access, 5),
                           'building_osm_id': b['id'], 'building_type_osm': b['tags']['building'],
                           'kind': 'destination' if chosen <= 3 else 'background'})
            if chosen == 12:
                break
        if chosen != 12:
            raise RuntimeError(f'Not enough reachable buildings in {cluster_id}')

    def dijkstra(source, targets):
        # State = incoming directed edge; allows node-via turn restrictions.
        start = -1
        best, parent, queue = {start: 0}, {}, [(0, start)]
        found = {source: {'distance_km': 0, 'base_minutes': 0, 'nodes': [source]}}
        while queue and len(found.keys() & targets) < len(targets):
            cost, state = heapq.heappop(queue)
            if cost != best[state]:
                continue
            u = source if state == start else edges[state][1]
            if u in targets and u not in found:
                path, s = [], state
                while s != start:
                    path.append(s); s = parent[s]
                path.reverse()
                found[u] = {'distance_km': round(sum(edges[e][3] for e in path),6), 'base_minutes': round(cost,6),
                            'nodes': [source]+[edges[e][1] for e in path]}
            for ei in graph[u]:
                e = edges[ei]
                if state != start:
                    prev = edges[state]
                    invalid = False
                    for to, rule in restrictions.get((u, prev[2]), []):
                        same = e[2] == to
                        if rule == 'no_u_turn':
                            invalid |= same and e[1] == prev[0]
                        elif rule.startswith('no_'):
                            invalid |= same
                        elif rule.startswith('only_'):
                            invalid |= not same
                    if invalid:
                        continue
                value = cost + e[4]
                if value < best.get(ei, math.inf):
                    best[ei] = value; parent[ei] = state; heapq.heappush(queue,(value,ei))
        return found

    index = {n:i for i,n in enumerate(sorted({u for e in edges for u in e[:2]}))}
    matrix = []
    targets = {p['road_node'] for p in points}
    for i,p in enumerate(points):
        paths = dijkstra(p['road_node'], targets)
        if targets - paths.keys():
            raise RuntimeError(f'Unreachable destinations from {p["id"]}')
        matrix.append([{**paths[q['road_node']], 'nodes':[index[n] for n in paths[q['road_node']]['nodes']]} for q in points])
        print(f'Matrix {i+1}/{len(points)}', flush=True)
    all_nodes = sorted(index, key=index.get)
    result = {'version':'taito-osm-v1', 'snapshot_utc':raw['osm3s']['timestamp_osm_base'],
              'raw_sha256':hashlib.sha256(raw_bytes).hexdigest(),
              'attribution':'© OpenStreetMap contributors · ODbL 1.0', 'license_url':'https://www.openstreetmap.org/copyright',
              'routing':'Directed minimum modeled free-flow-time paths; node-via turn restrictions; offline matrix',
              'modeled_speed_kph':SPEEDS, 'unsupported_restriction_relations':unsupported,
              'node_via_restriction_count':sum(map(len,restrictions.values())),
              'bounds':[35.692,139.767,35.733,139.813], 'points':points, 'matrix':matrix,
              'road_nodes':[[nodes[n]['lat'],nodes[n]['lon']] for n in all_nodes],
              'road_segments':sorted({(min(index[u],index[v]),max(index[u],index[v])) for u,v,*_ in edges}),
              'directed_edge_count':len(edges), 'demand_seed':20260914,
              'limitations':['Synthetic orders at real building centers, not observed deliveries',
                             'Building centers snapped to road nodes; entrances/parking are not surveyed',
                             'Modeled speeds, not live or census-calibrated traffic',
                             'Time-dependent and via-way restrictions, curb access and vehicle dimensions are not fully modeled',
                             'Road graph is clipped to the study buffer; no claim of global fastest routes']}
    output=ROOT/'data'/'taito-network.json'
    output.write_text(json.dumps(result, ensure_ascii=False, separators=(',',':')))
    print('Built',output.stat().st_size,'bytes;',len(edges),'directed edges;',len(buildings),'buildings')

if __name__ == '__main__':
    build()
