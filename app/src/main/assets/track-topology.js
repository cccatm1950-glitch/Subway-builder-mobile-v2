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
    const copyLineIds = () => Array.isArray(track.lineIds) ? track.lineIds.slice() : [];
    const first = { ...common, lineIds: copyLineIds(), a: track.a, b: junctionIndex,
      centerline: split.first.map(p => ({ ...p })),
      waypoints: firstWaypoints,
      startElevation, endElevation: splitElevation };
    const second = { ...common, lineIds: copyLineIds(), a: junctionIndex, b: track.b,
      centerline: split.second.map(p => ({ ...p })),
      waypoints: secondWaypoints,
      startElevation: splitElevation, endElevation };
    return { first, second, splitElevation };
  }

  return Object.freeze({ projectPointToPolyline, splitPolylineAtProjection, cloneTrackSections, getConnectedTrackCandidates, findTrackGroupPath, interpolateElevationAtDistance });
});
