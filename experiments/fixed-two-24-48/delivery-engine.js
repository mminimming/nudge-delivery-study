/* Offline research routing engine. No network, DOM, or hidden random inputs. */
(function (root) {
  'use strict';
  const VERSION = 'taito-flex-v2.1-fixed-two';
  const SLOTS = [
    { id: 'slot_10', start: 600, end: 720, time: '10:00–12:00' },
    { id: 'slot_12', start: 720, end: 840, time: '12:00–14:00' },
    { id: 'slot_14', start: 840, end: 960, time: '14:00–16:00' },
    { id: 'slot_16', start: 960, end: 1080, time: '16:00–18:00' },
    { id: 'slot_18', start: 1080, end: 1200, time: '18:00–20:00' },
    { id: 'slot_20', start: 1200, end: 1320, time: '20:00–22:00' }
  ];
  const CONFIG = Object.freeze({
    vehicleCount: 3, capacityKg: 100, capacityLitres: 450,
    shiftStart: 540, shiftEnd: 1350, maxWorkMinutes: 510,
    breakStart: 750, breakEnd: 780,
    fuelEconomyKmPerLitre: 10, fuelKgCO2PerLitre: 2.32,
    walkKph: 4, demandSeed: 20260914,
    emissionBoundary: 'Modeled gasoline combustion CO2 only; excludes upstream energy, depot, manufacturing and redelivery',
    trafficSource: 'Uncalibrated research speed scenarios; not live traffic',
    serviceTimeSource: 'Research assumptions; not measured courier workload'
  });
  const round = (n, d = 3) => Number(n.toFixed(d));
  const copy = obj => JSON.parse(JSON.stringify(obj));
  const timeLabel = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const traffic = {
    normal: [[0, 540, 1], [540, 660, .80], [660, 960, 1], [960, 1080, .75], [1080, 1440, 1]],
    congested: [[0, 540, .85], [540, 660, .55], [660, 960, .75], [960, 1080, .50], [1080, 1440, .85]]
  };
  function travelMinutes(baseMinutes, departure, profile = 'normal') {
    if (!Number.isFinite(baseMinutes) || baseMinutes < 0 || !traffic[profile]) throw Error('Invalid travel input');
    let remaining = baseMinutes, t = departure;
    // Integrate speed across period boundaries; FIFO is preserved.
    while (remaining > 1e-9) {
      const band = traffic[profile].find(b => t >= b[0] && t < b[1]);
      if (!band) return t - departure + remaining;
      const available = (band[1] - t) * band[2];
      if (remaining <= available) { t += remaining / band[2]; break; }
      remaining -= available; t = band[1];
    }
    return t - departure;
  }
  function serviceMinutes(input, parcel, point, config = CONFIG) {
    const housing = { house: 1, apartment: 2.5, office: 3 }[input.buildingType];
    const reception = { doorstep: .7, locker: 1, handover: 2 }[input.receptionMethod];
    if (housing === undefined || reception === undefined || !['yes', 'no', 'na'].includes(input.elevator)) throw Error('Invalid building or reception');
    const accessWalk = 2 * point.access_km / config.walkKph * 60;
    const stairs = input.buildingType !== 'house' && input.elevator === 'no' ? 2 : 0;
    return 1.5 + housing + reception + accessWalk + stairs + parcel.weightKg * .12 + parcel.litres * .015;
  }
  function createEngine(data, overrides = {}) {
    const cfg = { ...CONFIG, ...overrides };
    const points = data.points;
    const pointIndex = new Map(points.map((p, i) => [p.id, i]));
    const destinations = points.filter(p => p.kind === 'destination');
    function leg(a, b) {
      const cell = data.matrix[a]?.[b];
      if (!cell || !Number.isFinite(cell.base_minutes)) throw Error('Road path unavailable');
      return cell;
    }
    function simulate(stops, profile = 'normal') {
      if (!stops.length) return { feasible: true, distanceKm: 0, workMinutes: 0, driveMinutes: 0, serviceMinutes: 0, waitMinutes: 0, breakMinutes: 0, returnMinute: cfg.shiftStart, visits: [], pointSequence: [0] };
      if (stops.reduce((a, s) => a + s.weightKg, 0) > cfg.capacityKg + 1e-8 || stops.reduce((a, s) => a + s.litres, 0) > cfg.capacityLitres + 1e-8) return { feasible: false, reason: 'capacity' };
      let t = cfg.shiftStart, last = 0, distanceKm = 0, driveMinutes = 0, service = 0, wait = 0, rest = 0;
      const visits = [];
      function waitUntil(target) {
        if (target <= t) return;
        const overlap = Math.max(0, Math.min(target, cfg.breakEnd) - Math.max(t, cfg.breakStart));
        rest += overlap; wait += target - t - overlap; t = target;
      }
      function clearBreak(duration) {
        if (t < cfg.breakEnd && t + duration > cfg.breakStart) waitUntil(cfg.breakEnd);
      }
      for (const stop of [...stops, { id: 'return', point: 0, serviceMinutes: 0, window: [cfg.shiftStart, cfg.shiftEnd] }]) {
        const cell = leg(last, stop.point);
        let duration = travelMinutes(cell.base_minutes, t, profile);
        clearBreak(duration);
        duration = travelMinutes(cell.base_minutes, t, profile);
        t += duration; driveMinutes += duration; distanceKm += cell.distance_km;
        const arrival = t;
        waitUntil(stop.window[0]);
        clearBreak(stop.serviceMinutes);
        const serviceStart = t;
        // The promised window covers completion of the handover, not just arrival.
        t += stop.serviceMinutes; service += stop.serviceMinutes;
        if (t > stop.window[1] + 1e-8) return { feasible: false, reason: 'time_window', failedStop: stop.id };
        if (stop.id !== 'return') visits.push({ id: stop.id, point: stop.point, arrivalMinute: arrival, serviceStart, departureMinute: t, slackMinutes: stop.window[1] - t });
        last = stop.point;
      }
      const work = driveMinutes + service + wait;
      if (t > cfg.shiftEnd + 1e-8 || work > cfg.maxWorkMinutes + 1e-8) return { feasible: false, reason: 'shift' };
      return { feasible: true, distanceKm, workMinutes: work, driveMinutes, serviceMinutes: service, waitMinutes: wait, breakMinutes: rest, returnMinute: t, visits, pointSequence: [0, ...stops.map(s => s.point), 0] };
    }
    function metrics(routes, profile) {
      const runs = routes.map(r => simulate(r, profile));
      if (runs.some(r => !r.feasible)) throw Error('An existing route is infeasible');
      const sum = key => runs.reduce((s, r) => s + r[key], 0);
      const distanceKm = sum('distanceKm');
      return { distanceKm, co2Kg: distanceKm / cfg.fuelEconomyKmPerLitre * cfg.fuelKgCO2PerLitre,
        workMinutes: sum('workMinutes'), activeMinutes: sum('driveMinutes') + sum('serviceMinutes'), maxWorkMinutes: Math.max(...runs.map(r => r.workMinutes)),
        driverWorkMinutes: runs.map(r => r.workMinutes), runs };
    }
    function bestInsertion(routes, order, profile, baseMetrics) {
      const before = baseMetrics || metrics(routes, profile);
      let best = null;
      for (let v = 0; v < routes.length; v++) {
        for (let pos = 0; pos <= routes[v].length; pos++) {
          const route = [...routes[v].slice(0, pos), order, ...routes[v].slice(pos)];
          // Fixed-fleet pilot: preserve the required count of nonempty routes.
          const candidateRoutes = routes.map((r, idx) => idx === v ? route : r);
          const orders = candidateRoutes.reduce((n, r) => n + r.length, 0);
          const required = Math.min(cfg.minimumActiveVehicles || 0, orders);
          if (candidateRoutes.filter(r => r.length).length < required) continue;
          const run = simulate(route, profile);
          if (!run.feasible) continue;
          const old = before.runs[v];
          // Same objective and existing-order sequence for every slot.
          const score = run.distanceKm - old.distanceKm + .02 * (run.driveMinutes + run.serviceMinutes - old.driveMinutes - old.serviceMinutes) + .001 * (run.workMinutes - old.workMinutes);
          if (!best || score < best.score - 1e-9 || (Math.abs(score - best.score) < 1e-9 && run.distanceKm - old.distanceKm < best.deltaDistanceKm)) best = { vehicle: v, position: pos, score, route, run, deltaDistanceKm: run.distanceKm - old.distanceKm };
        }
      }
      return best;
    }
    // Reposition accepted flexible orders across vehicles without changing their promises.
    // Bounded deterministic local search; the current feasible plan is always retained.
    function objective(routes) {
      const m = metrics(routes, 'normal');
      return m.distanceKm + .02 * m.activeMinutes + .001 * m.workMinutes;
    }
    function replan(routes) {
      let best = copy(routes), score = objective(best);
      for (let pass = 0; pass < 2; pass++) {
        let improved = false;
        const movable = best.flat().filter(o => o.flexible).map(o => o.id).sort();
        for (const id of movable) {
          const order = best.flat().find(o => o.id === id);
          const removed = best.map(r => r.filter(o => o.id !== id));
          const ins = bestInsertion(removed, order, 'normal');
          if (!ins) continue;
          const candidate = removed.map((r,v) => v === ins.vehicle ? ins.route : r);
          const nextScore = objective(candidate);
          if (nextScore < score - 1e-8) { best = candidate; score = nextScore; improved = true; }
        }
        if (!improved) break;
      }
      return best;
    }
    function baseline(profile = 'normal') {
      if (profile !== 'normal') throw Error('Traffic is fixed to normal');
      const routes = Array.from({ length: cfg.vehicleCount }, () => []);
      const orders = [];
      return { id: `${VERSION}-${data.version}-${profile}`, revision: 0, profile, routes, orders,
        networkVersion: data.version, networkSha256: data.raw_sha256, config: copy(cfg), bookings: [] };
    }
    function validateInput(input, parcel) {
      const i = pointIndex.get(input.destinationId);
      if (i === undefined || points[i].kind !== 'destination') throw Error('Choose a supported destination');
      if (!Number.isFinite(parcel.weightKg) || parcel.weightKg <= 0 || !Number.isFinite(parcel.litres) || parcel.litres <= 0) throw Error('Invalid parcel dimensions');
      if (!['all', 'morning', 'afternoon', 'late'].includes(input.availability)) throw Error('Unknown receiving window');
      return i;
    }
    function evaluate(state, input, parcel) {
      const point = validateInput(input, parcel);
      const base = metrics(state.routes, state.profile);
      const service = serviceMinutes(input, parcel, points[point], cfg);
      const receiving = input.receptionMethod !== 'handover' ? [600,1320] :
        ({all:[600,1320], morning:[600,720], afternoon:[720,1320], late:[960,1320]})[input.availability];
      function candidate(slot, seedRoutes) {
        const order = { id: `booking-${state.revision + 1}`, point, weightKg: parcel.weightKg, litres: parcel.litres, serviceMinutes: service, window: [slot.start, slot.end], flexible: slot.id === 'flexible' };
        let routes;
        if (seedRoutes) routes = seedRoutes.map(r => r.map(o => o.id === order.id ? order : o));
        else {
          const ins = bestInsertion(state.routes, order, 'normal', base);
          if (!ins) return null;
          routes = state.routes.map((r,v) => v === ins.vehicle ? ins.route : r);
        }
        routes = replan(routes);
        const after = metrics(routes, 'normal');
        const vehicle = routes.findIndex(r => r.some(o => o.id === order.id));
        const run = after.runs[vehicle], visit = run.visits.find(v => v.id === order.id);
        return { ...slot, feasible: true, fee: 0, day: '翌日', vehicle,
          arrivalMinute: visit.serviceStart, completionMinute: visit.departureMinute,
          additionalDistanceKm: after.distanceKm - base.distanceKm,
          additionalCO2Kg: after.co2Kg - base.co2Kg,
          additionalWorkMinutes: after.workMinutes - base.workMinutes,
          additionalActiveMinutes: after.activeMinutes - base.activeMinutes,
          maxDriverWorkMinutes: after.maxWorkMinutes, driverWorkMinutes: after.driverWorkMinutes,
          totalDistanceKm: after.distanceKm, totalCO2Kg: after.co2Kg, totalWorkMinutes: after.workMinutes,
          routePointSequence: run.pointSequence, routeSchedule: run.visits, returnMinute: run.returnMinute,
          plannedRoutes: routes, order, scenarioRevision: state.revision, modelVersion: VERSION,
          isEarliest: false, isRecommended: false };
      }
      let earliestOption = null;
      for (const slot of SLOTS) {
        if (slot.start < receiving[0] || slot.end > receiving[1]) continue;
        earliestOption = candidate({...slot, id:'earliest', kind:'earliest'});
        if (earliestOption) break;
      }
      const options = [];
      if (earliestOption) options.push(earliestOption);
      const flexStart = earliestOption ? earliestOption.start : receiving[0];
      if (receiving[1] - flexStart > 120) {
        const slot = {id:'flexible',kind:'flexible',start:flexStart,end:receiving[1],time:`${timeLabel(flexStart)}–${timeLabel(receiving[1])}`};
        const seeded = earliestOption ? candidate(slot, earliestOption.plannedRoutes) : null;
        const direct = candidate(slot);
        const flex = !seeded ? direct : !direct ? seeded : objective(direct.plannedRoutes) < objective(seeded.plannedRoutes) ? direct : seeded;
        if (flex) options.push(flex);
      }
      const feasible = options.filter(o => o.feasible);
      const earliest = feasible.find(o => o.kind === 'earliest');
      if (earliest) {
        earliest.isEarliest = true;
        // No arbitrary weighted sum of kg CO2 and minutes. Do not worsen team or maximum individual work.
        const eligible = feasible.filter(o => o.additionalWorkMinutes <= earliest.additionalWorkMinutes + 1e-8 && o.additionalActiveMinutes <= earliest.additionalActiveMinutes + 1e-8 && o.maxDriverWorkMinutes <= earliest.maxDriverWorkMinutes + 1e-8);
        const best = eligible.sort((a, b) => a.additionalCO2Kg - b.additionalCO2Kg || a.start - b.start)[0];
        if (best && earliest.additionalCO2Kg - best.additionalCO2Kg >= .01) best.isRecommended = true;
        for (const option of feasible) {
          option.savedCO2VsEarliest = earliest.additionalCO2Kg - option.additionalCO2Kg;
          option.savedWorkVsEarliest = earliest.additionalWorkMinutes - option.additionalWorkMinutes;
          option.savedActiveVsEarliest = earliest.additionalActiveMinutes - option.additionalActiveMinutes;
        }
      }
      return { modelVersion: VERSION, scenarioId: state.id, revision: state.revision, input: copy(input), parcel: copy(parcel),
        baseline: { distanceKm: base.distanceKm, co2Kg: base.co2Kg, workMinutes: base.workMinutes, activeMinutes: base.activeMinutes, driverWorkMinutes: base.driverWorkMinutes },
        options, assumptions: copy(cfg), networkVersion: data.version, networkSha256: data.raw_sha256,
        method: 'Normal traffic; earliest feasible 2h promise versus flexible promise; 2-pass relocation of flexible orders; objective km + 0.02 active minutes + 0.001 work minutes; pre-dispatch planning, no future-demand forecast or global-optimality claim' };
    }
    function commit(state, evaluation, slotId) {
      if (state.revision !== evaluation.revision || state.id !== evaluation.scenarioId) throw Error('Stale calculation; recalculate before booking');
      const fresh = evaluate(state, evaluation.input, evaluation.parcel);
      const option = fresh.options.find(o => o.id === slotId && o.feasible);
      if (!option) throw Error('Slot unavailable');
      const next = copy(state);
      next.routes = copy(option.plannedRoutes);
      next.revision++;
      next.bookings.push({ slotId, window: copy(option.order.window), time: option.time, flexible: option.order.flexible, orderId: option.order.id, input: copy(evaluation.input), parcel: copy(evaluation.parcel), beforeRevision: state.revision });
      metrics(next.routes, next.profile); // Fail closed if any commitment is violated.
      return next;
    }
    return { config: cfg, destinations, points, baseline, evaluate, commit, simulate, metrics, serviceMinutes, data };
  }
  const api = { createEngine, VERSION, CONFIG, SLOTS, traffic, travelMinutes, timeLabel, round };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TaitoDelivery = api;
})(typeof window !== 'undefined' ? window : globalThis);

