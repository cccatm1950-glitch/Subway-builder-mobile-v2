/* Subway Builder mobile track-topology primitives.
 * Kept DOM/map independent so geometry splitting can be tested without Android.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SBTrackTopology = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function projectPointToPolyline(point, points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
        !Array.isArray(points) || points.length < 2) return null;
    let best = null;
    let totalLength = 0;
    const lengths = [];
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      const length = Math.hypot(dx, dy);
      lengths.push(length);
      totalLength += length;
    }
    if (totalLength <= 1e-9) return null;
    let traversed = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared <= 1e-18 ? 0 :
        Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
      const x = a.x + dx * t, y = a.y + dy * t;
      const distance = Math.hypot(point.x - x, point.y - y);
      const segmentLength = lengths[i];
      const along = traversed + segmentLength * t;
      if (!best || distance < best.distance) {
        best = { segmentIndex: i, t, x, y, distance, along, totalLength,
          fraction: along / totalLength };
      }
      traversed += segmentLength;
    }
    return best;
  }

  function splitPolylineAtProjection(points, projection) {
    if (!Array.isArray(points) || points.length < 2 || !projection ||
        !Number.isInteger(projection.segmentIndex) ||
        projection.segmentIndex < 0 || projection.segmentIndex >= points.length - 1 ||
        !Number.isFinite(projection.t)) return null;
    const a = points[projection.segmentIndex], b = points[projection.segmentIndex + 1];
    const t = Math.max(0, Math.min(1, projection.t));
    const splitPoint = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    };
    const first = points.slice(0, projection.segmentIndex + 1).map(p => ({ x: p.x, y: p.y }));
    const second = points.slice(projection.segmentIndex + 1).map(p => ({ x: p.x, y: p.y }));
    const same = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) <= 1e-7;
    if (!same(first[first.length - 1], splitPoint)) first.push(splitPoint);
    else first[first.length - 1] = splitPoint;
    if (!same(second[0], splitPoint)) second.unshift(splitPoint);
    else second[0] = splitPoint;
    if (first.length < 2 || second.length < 2) return null;
    return { first, second, point: splitPoint, fraction: projection.fraction,
      along: projection.along, totalLength: projection.totalLength };
  }

  function getConnectedTrackCandidates(tracks, currentTrackIndex, nodeIndex, preferredLineIds) {
    if (!Array.isArray(tracks) || !Number.isInteger(nodeIndex)) return [];
    const preferred = Array.isArray(preferredLineIds) ? preferredLineIds.filter(id => typeof id === 'string') : [];
    return tracks.map((track, trackIndex) => ({ track, trackIndex }))
      .filter(({ track, trackIndex }) => track && trackIndex !== currentTrackIndex &&
        (track.a === nodeIndex || track.b === nodeIndex))
      .filter(({ track }) => !preferred.length ||
        (Array.isArray(track.lineIds) && track.lineIds.some(id => preferred.includes(id))))
      .map(({ track, trackIndex }) => ({
        track, trackIndex, fromNodeIndex: nodeIndex,
        toNodeIndex: track.a === nodeIndex ? track.b : track.a
      }));
  }

  function interpolateElevationAtDistance(anchors, distance) {
    if (!Array.isArray(anchors) || !anchors.length || !Number.isFinite(distance)) return null;
    const sorted = anchors.filter(anchor => anchor &&
      Number.isFinite(anchor.distance) && Number.isFinite(anchor.height))
      .slice().sort((a, b) => a.distance - b.distance);
    if (!sorted.length) return null;
    let right = sorted.findIndex(anchor => anchor.distance >= distance);
    if (right < 0) return sorted[sorted.length - 1].height;
    if (right === 0) return sorted[0].height;
    const left = sorted[right - 1], next = sorted[right];
    const span = next.distance - left.distance;
    const ratio = span > 0 ? Math.max(0, Math.min(1, (distance - left.distance) / span)) : 0;
    return left.height + (next.height - left.height) * ratio;
  }

  function findTrackGroupPath(tracks, startIndex, endIndex) {
    if (!Array.isArray(tracks) || !Number.isInteger(startIndex) ||
        !Number.isInteger(endIndex) || startIndex === endIndex) return null;
    const groups = [...new Set(tracks.map(track => track && track.trackGroupId)
      .filter(id => typeof id === 'string' && id.length))];
    const matches = [];
    for (const groupId of groups) {
      const queue = [startIndex], previous = new Map([[startIndex, null]]), previousTrack = new Map();
      for (let cursor = 0; cursor < queue.length && !previous.has(endIndex); cursor++) {
        const node = queue[cursor];
        tracks.forEach((track, trackIndex) => {
          if (!track || track.trackGroupId !== groupId) return;
          let next = null;
          if (track.a === node) next = track.b;
          else if (track.b === node) next = track.a;
          if (next === null || previous.has(next)) return;
          previous.set(next, node);
          previousTrack.set(next, trackIndex);
          queue.push(next);
        });
      }
      if (!previous.has(endIndex)) continue;
      const path = [];
      let node = endIndex;
      while (node !== startIndex) {
        const edge = previousTrack.get(node);
        if (!Number.isInteger(edge)) { path.length = 0; break; }
        path.unshift(edge);
        node = previous.get(node);
      }
      if (path.length) matches.push(path);
    }
    return matches.length === 1 ? matches[0] : null;
  }

  // Resolve station platform bearings into correctly directed Bezier controls.
  // The controls make the route tangent flush with each platform axis at its end.
  function calculateStationTangentControls(start, end, startBearing, endBearing) {
    if (!start || !end || !Number.isFinite(start.x) || !Number.isFinite(start.y) ||
        !Number.isFinite(end.x) || !Number.isFinite(end.y)) return null;
    const dx = end.x - start.x, dy = end.y - start.y;
    const chord = Math.hypot(dx, dy);
    if (chord < 1e-6) return { chord, startBearing: null, endBearing: null,
      firstControl: null, secondControl: null };
    const routeBearing = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const alignBearing = (value, targetBearing) => {
      if (!Number.isFinite(value)) return null;
      let bearing = ((value % 360) + 360) % 360;
      const difference = Math.abs(((bearing - targetBearing + 540) % 360) - 180);
      if (difference > 90) bearing = (bearing + 180) % 360;
      return bearing;
    };
    // Each handle is directed by its own endpoint tangent. Reversing the
    // start platform must never flip the end handle: the end control always
    // sits behind the destination along the route's arrival direction.
    const resolvedStart = alignBearing(startBearing, routeBearing);
    const endControlBearing = alignBearing(endBearing, routeBearing);
    const resolvedEnd = endControlBearing === null ? null : (endControlBearing + 180) % 360;
    const endControlDirection = -1;
    // Shorter independent handles preserve each station's local platform axis
    // without allowing two sharply different endpoint alignments to create a
    // broad hook or snake through the shared service corridor.
    const handleLength = chord * 0.28;
    const controlPoint = (origin, bearing, direction) => {
      if (bearing === null) return null;
      const radians = bearing * Math.PI / 180;
      return { x: origin.x + Math.sin(radians) * handleLength * direction,
        y: origin.y - Math.cos(radians) * handleLength * direction };
    };
    return { chord, startBearing: resolvedStart, endBearing: resolvedEnd,
      firstControl: controlPoint(start, resolvedStart, 1),
      secondControl: controlPoint(end, endControlBearing, endControlDirection) };
  }

  // Junctions have no platform bearing: preserve the local route tangent there.
  // Only physical stations should rotate the parallel pair to a platform axis.
  function resolveEndpointPlatformBearing(nodeType, bearing, defaultBearing = 90) {
    if (nodeType === 'junction') return null;
    return Number.isFinite(bearing) ? bearing : defaultBearing;
  }

  // Resolve an endpoint normal from the saved station bearing rather than
  // the last sampled curve segment. This gives connected parallel sections
  // the same physical rail endpoints even when approach directions reverse.
  function calculateEndpointAlignedNormal(routeEast, routeNorth, stationBearing) {
    if (!Number.isFinite(routeEast) || !Number.isFinite(routeNorth)) return null;
    const magnitude = Math.hypot(routeEast, routeNorth);
    if (magnitude < 1e-12) return null;
    let east = routeEast / magnitude, north = routeNorth / magnitude;
    if (Number.isFinite(stationBearing)) {
      const radians = stationBearing * Math.PI / 180;
      let bearingEast = Math.sin(radians), bearingNorth = Math.cos(radians);
      if (bearingEast * east + bearingNorth * north < 0) {
        bearingEast = -bearingEast;
        bearingNorth = -bearingNorth;
      }
      east = bearingEast;
      north = bearingNorth;
    }
    return { east: Object.is(-north, -0) ? 0 : -north, north: Object.is(east, -0) ? 0 : east };
  }

  // Blend the route normal into each station's saved platform normal over
  // the approach transition. This avoids a one-sample kink at curved station
  // entries while keeping both parallel rails aligned to the same platform face.
  function calculateBlendedEndpointNormal(routeEast, routeNorth, startBearing, endBearing, startWeight = 0, endWeight = 0) {
    if (![routeEast, routeNorth, startWeight, endWeight].every(Number.isFinite) ||
        startWeight < 0 || endWeight < 0) return null;
    const magnitude = Math.hypot(routeEast, routeNorth);
    if (magnitude < 1e-12) return null;
    const east = routeEast / magnitude, north = routeNorth / magnitude;
    const routeNormal = { east: -north, north: east };
    const stationNormal = bearing => {
      if (!Number.isFinite(bearing)) return null;
      const radians = bearing * Math.PI / 180;
      let tangentEast = Math.sin(radians), tangentNorth = Math.cos(radians);
      if (tangentEast * east + tangentNorth * north < 0) {
        tangentEast = -tangentEast;
        tangentNorth = -tangentNorth;
      }
      return { east: -tangentNorth, north: tangentEast };
    };
    const startNormal = stationNormal(startBearing);
    const endNormal = stationNormal(endBearing);
    const start = startNormal ? Math.min(1, startWeight) : 0;
    const end = endNormal ? Math.min(1, endWeight) : 0;
    const base = Math.max(0, 1 - start - end);
    const total = base + start + end;
    let blendedEast = routeNormal.east * base +
      (startNormal?.east || 0) * start + (endNormal?.east || 0) * end;
    let blendedNorth = routeNormal.north * base +
      (startNormal?.north || 0) * start + (endNormal?.north || 0) * end;
    const blendedLength = Math.hypot(blendedEast, blendedNorth);
    if (blendedLength < 1e-12 || total <= 0) return routeNormal;
    blendedEast /= blendedLength;
    blendedNorth /= blendedLength;
    return {
      east: Math.abs(blendedEast) < 1e-12 ? 0 : blendedEast,
      north: Math.abs(blendedNorth) < 1e-12 ? 0 : blendedNorth
    };
  }

  // Return the physical station end nearest the route's departure/arrival
  // direction. Coordinates are [latitude, longitude]; bearing is clockwise
  // from north and halfLength is measured in metres.
  function calculateStationEndpoint(center, bearing, reference, halfLength) {
    if (!center || !reference ||
        !Number.isFinite(center.lat) || !Number.isFinite(center.lng) ||
        !Number.isFinite(reference.lat) || !Number.isFinite(reference.lng) ||
        !Number.isFinite(bearing) || !Number.isFinite(halfLength) || halfLength < 0) return null;
    const latitudeRadians = center.lat * Math.PI / 180;
    const east = (reference.lng - center.lng) * Math.cos(latitudeRadians);
    const north = reference.lat - center.lat;
    if (Math.hypot(east, north) < 1e-12) return null;
    const radians = bearing * Math.PI / 180;
    const axisEast = Math.sin(radians), axisNorth = Math.cos(radians);
    const sign = east * axisEast + north * axisNorth >= 0 ? 1 : -1;
    const distance = halfLength * sign;
    const lat = center.lat + axisNorth * distance / 111320;
    const lng = center.lng + axisEast * distance / (111320 * Math.max(1e-8, Math.cos(latitudeRadians)));
    return { lat, lng, sign };
  }

  // Project a rectangular platform onto the route-normal axis. The returned
  // clearance is the exact lateral distance needed to keep a parallel rail
  // outside the platform footprint, independent of route direction.
  function calculatePlatformNormalClearance(fromPoint, toPoint, bearing, halfLength, halfWidth, clearance = 0) {
    if (!Array.isArray(fromPoint) || !Array.isArray(toPoint) ||
        fromPoint.length < 2 || toPoint.length < 2 ||
        !fromPoint.every(Number.isFinite) || !toPoint.every(Number.isFinite) ||
        !Number.isFinite(bearing) || !Number.isFinite(halfLength) ||
        !Number.isFinite(halfWidth) || !Number.isFinite(clearance) ||
        halfLength < 0 || halfWidth < 0 || clearance < 0) return null;
    const latitude = (fromPoint[0] + toPoint[0]) / 2 * Math.PI / 180;
    const east = (toPoint[1] - fromPoint[1]) * Math.cos(latitude);
    const north = toPoint[0] - fromPoint[0];
    const magnitude = Math.hypot(east, north);
    if (magnitude < 1e-12) return null;
    const routeEast = east / magnitude, routeNorth = north / magnitude;
    const normalEast = -routeNorth, normalNorth = routeEast;
    const radians = bearing * Math.PI / 180;
    const axisEast = Math.sin(radians), axisNorth = Math.cos(radians);
    const normalAlignment = -axisNorth * normalEast + axisEast * normalNorth;
    const axisAlignment = axisEast * normalEast + axisNorth * normalNorth;
    const projectedHalfExtent = halfLength * Math.abs(axisAlignment) +
      halfWidth * Math.abs(normalAlignment);
    return projectedHalfExtent + clearance;
  }

  // Return only the extra flare beyond the standard half-spacing already
  // applied to each rail. This prevents counting the base parallel spacing twice.
  function calculateParallelTrackExtraClearance(platformEdgeClearance, standardTrackSpacing = 3.81) {
    if (!Number.isFinite(platformEdgeClearance) || !Number.isFinite(standardTrackSpacing) ||
        platformEdgeClearance < 0 || standardTrackSpacing <= 0) return null;
    return Math.max(0, platformEdgeClearance - standardTrackSpacing / 2);
  }

  // Fade parallel half-spacing to zero where a parallel route meets a
  // single-track junction. Station endpoints retain their platform clearance.
  function calculateParallelJunctionMergeProfile(cumulativeDistances, totalLength, startIsJunction, endIsJunction, transitionLength = 50) {
    if (!Array.isArray(cumulativeDistances)) return [];
    if (!Number.isFinite(totalLength) || totalLength < 0 ||
        !Number.isFinite(transitionLength) || transitionLength <= 0) {
      return cumulativeDistances.map(() => 0);
    }
    const extent = Math.min(transitionLength, totalLength / 2);
    if (extent <= 0) return cumulativeDistances.map(() => 0);
    const smoothstep = value => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
    return cumulativeDistances.map(distance => {
      if (!Number.isFinite(distance)) return 0;
      const fromStart = startIsJunction ? 1 - smoothstep(distance / extent) : 0;
      const fromEnd = endIsJunction ? 1 - smoothstep((totalLength - distance) / extent) : 0;
      return Math.max(fromStart, fromEnd);
    });
  }

  // Project the platform rectangle onto the route axis. This is the distance
  // from a station node to the far end of its platform footprint along the track.
  function calculatePlatformAlongTrackExtent(fromPoint, toPoint, bearing, halfLength, halfWidth) {
    if (!Array.isArray(fromPoint) || !Array.isArray(toPoint) ||
        fromPoint.length < 2 || toPoint.length < 2 ||
        !fromPoint.every(Number.isFinite) || !toPoint.every(Number.isFinite) ||
        !Number.isFinite(bearing) || !Number.isFinite(halfLength) ||
        !Number.isFinite(halfWidth) || halfLength < 0 || halfWidth < 0) return null;
    const latitude = (fromPoint[0] + toPoint[0]) / 2 * Math.PI / 180;
    const east = (toPoint[1] - fromPoint[1]) * Math.cos(latitude);
    const north = toPoint[0] - fromPoint[0];
    const magnitude = Math.hypot(east, north);
    if (magnitude < 1e-12) return null;
    const routeEast = east / magnitude, routeNorth = north / magnitude;
    const normalEast = -routeNorth, normalNorth = routeEast;
    const radians = bearing * Math.PI / 180;
    const axisEast = Math.sin(radians), axisNorth = Math.cos(radians);
    const alongAlignment = axisEast * routeEast + axisNorth * routeNorth;
    const normalAlignment = axisEast * normalEast + axisNorth * normalNorth;
    return halfLength * Math.abs(alongAlignment) + halfWidth * Math.abs(normalAlignment);
  }

  // Hold full clearance until each platform footprint has been passed, then
  // smoothly return to standard gauge spacing over the transition distance.
  function calculatePlatformClearanceTransitionProfile(cumulativeDistances, totalLength, startClearance, endClearance, transitionLength = 50, startHoldDistance = 0, endHoldDistance = 0) {
    if (!Array.isArray(cumulativeDistances)) return [];
    if (![totalLength, startClearance, endClearance, transitionLength, startHoldDistance, endHoldDistance].every(Number.isFinite) ||
        totalLength <= 0 || startClearance < 0 || endClearance < 0 || transitionLength <= 0 ||
        startHoldDistance < 0 || endHoldDistance < 0) {
      return cumulativeDistances.map(() => 0);
    }
    const available = Math.max(0, totalLength - startHoldDistance - endHoldDistance);
    const extent = Math.min(transitionLength, available / 2);
    const smoothstep = value => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
    return cumulativeDistances.map(distance => {
      if (!Number.isFinite(distance)) return 0;
      const fromStart = startClearance * (extent > 0
        ? 1 - smoothstep((distance - startHoldDistance) / extent)
        : (distance <= startHoldDistance ? 1 : 0));
      const fromEnd = endClearance * (extent > 0
        ? smoothstep((distance - (totalLength - endHoldDistance - extent)) / extent)
        : (distance >= totalLength - endHoldDistance ? 1 : 0));
      return Math.max(fromStart, fromEnd);
    });
  }

  // Build the lateral offset fade along a route. Explicit per-track transition
  // extents survive topology splits; legacy tracks retain the 50 m default.
  function calculateOffsetTransitionProfile(cumulativeDistances, totalLength, startOffset, endOffset, zones, defaultLength = 50, startHoldDistance = 0, endHoldDistance = 0) {
    if (!Array.isArray(cumulativeDistances)) return [];
    if (!Number.isFinite(totalLength) || totalLength <= 0) return cumulativeDistances.map(() => 0);
    if (![startHoldDistance, endHoldDistance].every(Number.isFinite) ||
        startHoldDistance < 0 || endHoldDistance < 0) return cumulativeDistances.map(() => 0);
    const hasExplicitZones = !!zones && typeof zones === 'object';
    const available = Math.max(0, totalLength - startHoldDistance - endHoldDistance);
    const extent = key => {
      const value = hasExplicitZones ? zones[key] : defaultLength;
      return Number.isFinite(value) && value > 0 ? Math.min(value, available / 2) : 0;
    };
    const startLength = extent('start'), endLength = extent('end');
    const smoothstep = value => {
      const x = Math.max(0, Math.min(1, value));
      return x * x * (3 - 2 * x);
    };
    return cumulativeDistances.map(distance => {
      const fromStart = startLength > 0
        ? startOffset * (1 - smoothstep((distance - startHoldDistance) / startLength))
        : (startHoldDistance > 0 && distance <= startHoldDistance ? startOffset : 0);
      const fromEnd = endLength > 0
        ? endOffset * smoothstep((distance - (totalLength - endHoldDistance - endLength)) / endLength)
        : (endHoldDistance > 0 && distance >= totalLength - endHoldDistance ? endOffset : 0);
      return fromStart + fromEnd;
    });
  }

  // Desktop stores ramp/transition extents as distances from each track endpoint.
  // When a track is split, clip those extents to the two new section lengths.
  function splitTransitionZones(zones, firstLength, secondLength) {
    if (!zones || typeof zones !== 'object' ||
        !Number.isFinite(firstLength) || !Number.isFinite(secondLength) ||
        firstLength <= 0 || secondLength <= 0) {
      const copy = zones && typeof zones === 'object' ? { ...zones } : undefined;
      return [copy, copy ? { ...copy } : undefined];
    }
    const positive = value => Number.isFinite(value) && value > 0.01 ? value : undefined;
    const make = (start, end) => {
      const result = {};
      const clippedStart = positive(start), clippedEnd = positive(end);
      if (clippedStart !== undefined) result.start = clippedStart;
      if (clippedEnd !== undefined) result.end = clippedEnd;
      return Object.keys(result).length ? result : undefined;
    };
    const start = Number.isFinite(zones.start) ? zones.start : 0;
    const end = Number.isFinite(zones.end) ? zones.end : 0;
    return [
      make(Math.min(start, firstLength), Math.max(0, end - secondLength)),
      make(Math.max(0, start - firstLength), Math.min(end, secondLength))
    ];
  }

  function cloneTrackSections(track, split, junctionIndex, waypointFractions) {
    if (!track || !split || !Array.isArray(split.first) || !Array.isArray(split.second) ||
        split.first.length < 2 || split.second.length < 2 ||
        !Number.isInteger(junctionIndex) || !Number.isFinite(split.fraction) ||
        split.fraction <= 0 || split.fraction >= 1) return null;
    const sourceWaypoints = Array.isArray(track.waypoints) ? track.waypoints : [];
    const fractions = Array.isArray(waypointFractions) ? waypointFractions : [];
    const firstWaypoints = [], secondWaypoints = [];
    sourceWaypoints.forEach((waypoint, index) => {
      const fraction = fractions[index];
      (Number.isFinite(fraction) && fraction <= split.fraction ? firstWaypoints : secondWaypoints)
        .push({ ...waypoint });
    });
    const startElevation = Number.isFinite(track.startElevation) ? track.startElevation : null;
    const endElevation = Number.isFinite(track.endElevation) ? track.endElevation : null;
    const splitElevation = startElevation !== null && endElevation !== null
      ? startElevation + (endElevation - startElevation) * split.fraction : null;
    const common = { ...track, waypoints: [] };
    const hasTransitionZones = track.offsetTransitionZones && typeof track.offsetTransitionZones === 'object';
    const canSplitTransitionZones = Number.isFinite(split.alongMeters) && Number.isFinite(split.totalLengthMeters) &&
      split.alongMeters > 0 && split.totalLengthMeters > split.alongMeters;
    const transitionSections = hasTransitionZones && canSplitTransitionZones
      ? splitTransitionZones(track.offsetTransitionZones, split.alongMeters, split.totalLengthMeters - split.alongMeters)
      : null;
    const copyLineIds = () => Array.isArray(track.lineIds) ? track.lineIds.slice() : [];
    const first = { ...common, ...(transitionSections ? { offsetTransitionZones: transitionSections[0] } : {}), lineIds: copyLineIds(), a: track.a, b: junctionIndex,
      centerline: split.first.map(p => ({ ...p })),
      waypoints: firstWaypoints,
      startElevation, endElevation: splitElevation };
    const second = { ...common, ...(transitionSections ? { offsetTransitionZones: transitionSections[1] } : {}), lineIds: copyLineIds(), a: junctionIndex, b: track.b,
      centerline: split.second.map(p => ({ ...p })),
      waypoints: secondWaypoints,
      startElevation: splitElevation, endElevation };
    return { first, second, splitElevation };
  }

  return Object.freeze({ projectPointToPolyline, splitPolylineAtProjection, cloneTrackSections, getConnectedTrackCandidates, findTrackGroupPath, interpolateElevationAtDistance, calculateOffsetTransitionProfile, splitTransitionZones, calculateStationTangentControls, resolveEndpointPlatformBearing, calculateEndpointAlignedNormal, calculateBlendedEndpointNormal, calculateStationEndpoint, calculatePlatformNormalClearance, calculateParallelTrackExtraClearance, calculateParallelJunctionMergeProfile, calculatePlatformAlongTrackExtent, calculatePlatformClearanceTransitionProfile });
});
