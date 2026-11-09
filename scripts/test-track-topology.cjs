const assert = require('node:assert/strict');
const topology = require('../app/src/main/assets/track-topology.js');

const route = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];

// Station platform bearings resolve to route-facing endpoint tangents.
const eastWestAlignment = topology.calculateStationTangentControls(
  { x: 0, y: 0 }, { x: 100, y: 0 }, 90, 90
);
assert.ok(Math.abs(eastWestAlignment.firstControl.x - 50) < 1e-9);
assert.ok(Math.abs(eastWestAlignment.firstControl.y) < 1e-9);
assert.ok(Math.abs(eastWestAlignment.secondControl.x - 50) < 1e-9);
assert.ok(Math.abs(eastWestAlignment.secondControl.y) < 1e-9);
assert.equal(eastWestAlignment.startBearing, 90);
assert.equal(eastWestAlignment.endBearing, 270);
const reversedAlignment = topology.calculateStationTangentControls(
  { x: 0, y: 0 }, { x: 100, y: 0 }, 270, 90
);
assert.equal(reversedAlignment.startBearing, 90);
assert.equal(reversedAlignment.endBearing, 270);
assert.ok(Math.abs(reversedAlignment.firstControl.x - 50) < 1e-9);
assert.ok(Math.abs(reversedAlignment.firstControl.y) < 1e-9);
assert.ok(Math.abs(reversedAlignment.secondControl.x - 50) < 1e-9);
assert.ok(Math.abs(reversedAlignment.secondControl.y) < 1e-9);
const diagonalAlignment = topology.calculateStationTangentControls(
  { x: 0, y: 0 }, { x: 100, y: -100 }, 45, 45
);
assert.ok(Math.abs(diagonalAlignment.firstControl.x - 50) < 1e-9);
assert.ok(Math.abs(diagonalAlignment.firstControl.y + 50) < 1e-9);
assert.ok(Math.abs(diagonalAlignment.secondControl.x - 50) < 1e-9);
assert.ok(Math.abs(diagonalAlignment.secondControl.y + 50) < 1e-9);
const oneSidedAlignment = topology.calculateStationTangentControls(
  { x: 0, y: 0 }, { x: 0, y: 100 }, 0, null
);
assert.ok(oneSidedAlignment.firstControl);
assert.equal(oneSidedAlignment.secondControl, null);
assert.equal(topology.calculateStationTangentControls(null, { x: 1, y: 1 }, 0, 0), null);
const projection = topology.projectPointToPolyline({ x: 8, y: 2 }, route);
assert.ok(projection);
assert.equal(projection.segmentIndex, 0);
assert.equal(projection.t, 0.8);
assert.equal(projection.x, 8);
assert.equal(projection.y, 0);
assert.ok(Math.abs(projection.distance - 2) < 1e-9);
assert.ok(Math.abs(projection.fraction - 8 / 20) < 1e-9);

const split = topology.splitPolylineAtProjection(route, projection);
assert.deepEqual(split.first, [{ x: 0, y: 0 }, { x: 8, y: 0 }]);
assert.deepEqual(split.second, [{ x: 8, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
assert.equal(split.first[split.first.length - 1].x, split.second[0].x);
assert.equal(split.first[split.first.length - 1].y, split.second[0].y);

const track = {
  a: 2, b: 7, trackGroupId: 'tg-original', style: 'parallel', curve: true, elevation: 'below',
  startElevation: -20, endElevation: -10,
  lineIds: ['line-1', 'line-2'], offsetTransitionZones: { start: 30, end: 80 },
  waypoints: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }]
};
const withLatLng = {
  ...split, alongMeters: 50, totalLengthMeters: 100,
  first: split.first.map(p => ({ lat: p.y, lng: p.x })),
  second: split.second.map(p => ({ lat: p.y, lng: p.x }))
};
const sections = topology.cloneTrackSections(track, withLatLng, 9, [0.2, 0.8]);
assert.ok(sections);
assert.equal(sections.first.a, 2);
assert.equal(sections.first.b, 9);
assert.equal(sections.second.a, 9);
assert.equal(sections.second.b, 7);
assert.equal(sections.first.style, 'parallel');
assert.equal(sections.first.trackGroupId, 'tg-original');
assert.equal(sections.second.trackGroupId, 'tg-original');
assert.equal(sections.second.elevation, 'below');
assert.deepEqual(sections.first.offsetTransitionZones, { start: 30, end: 30 });
assert.deepEqual(sections.second.offsetTransitionZones, { end: 50 });
assert.deepEqual(sections.first.lineIds, ['line-1', 'line-2']);
assert.deepEqual(sections.second.lineIds, ['line-1', 'line-2']);
assert.equal(sections.splitElevation, -16);
assert.deepEqual(sections.first.waypoints, [{ lat: 1, lng: 2 }]);
assert.deepEqual(sections.second.waypoints, [{ lat: 3, lng: 4 }]);
sections.first.lineIds.push('mutated');
assert.deepEqual(sections.second.lineIds, ['line-1', 'line-2']);

const transitionZones = topology.splitTransitionZones({ start: 30, end: 80 }, 50, 50);
assert.deepEqual(transitionZones, [{ start: 30, end: 30 }, { end: 50 }]);
assert.deepEqual(topology.splitTransitionZones({ start: 10 }, 20, 30), [{ start: 10 }, undefined]);
assert.deepEqual(topology.splitTransitionZones(null, 20, 30), [undefined, undefined]);
const transitionProfile=topology.calculateOffsetTransitionProfile(
  [0, 15, 30, 50, 70, 85, 100],100,2,-2,{start:30,end:30}
);
assert.deepEqual(transitionProfile,[2,1,0,0,0,-1,-2]);
const legacyTransitionProfile=topology.calculateOffsetTransitionProfile([0,25,50,75,100],100,2,-2,null);
assert.deepEqual(legacyTransitionProfile,[2,1,0,-1,-2]);
const noTransitionProfile=topology.calculateOffsetTransitionProfile([0,50,100],100,2,-2,{start:0,end:0});
assert.deepEqual(noTransitionProfile,[0,0,0]);

const elevationAnchors = [
  { distance: 0, height: -20 },
  { distance: 50, height: 5 },
  { distance: 100, height: -10 }
];
assert.equal(topology.interpolateElevationAtDistance(elevationAnchors, 0), -20);
assert.equal(topology.interpolateElevationAtDistance(elevationAnchors, 25), -7.5);
assert.equal(topology.interpolateElevationAtDistance(elevationAnchors, 75), -2.5);
assert.equal(topology.interpolateElevationAtDistance(elevationAnchors, 100), -10);
assert.equal(topology.interpolateElevationAtDistance(elevationAnchors, 150), -10);

const graphTracks = [
  { a: 0, b: 1, lineIds: ['L1'] },
  { a: 1, b: 2, lineIds: ['L1'] },
  { a: 1, b: 3, lineIds: ['L2'] }
];
const sameLine = topology.getConnectedTrackCandidates(graphTracks, 0, 1, ['L1']);
assert.deepEqual(sameLine.map(item => item.trackIndex), [1]);
assert.equal(sameLine[0].fromNodeIndex, 1);
assert.equal(sameLine[0].toNodeIndex, 2);
const splitGroup = [
  { a: 0, b: 1, trackGroupId: 'G1' },
  { a: 1, b: 2, trackGroupId: 'G1' },
  { a: 1, b: 3, trackGroupId: 'G2' }
];
assert.deepEqual(topology.findTrackGroupPath(splitGroup, 0, 2), [0, 1]);
assert.equal(topology.findTrackGroupPath(splitGroup, 0, 3), null);
const ambiguousGroups = [
  { a: 0, b: 1, trackGroupId: 'G1' },
  { a: 1, b: 2, trackGroupId: 'G1' },
  { a: 0, b: 3, trackGroupId: 'G2' },
  { a: 3, b: 2, trackGroupId: 'G2' }
];
assert.equal(topology.findTrackGroupPath(ambiguousGroups, 0, 2), null);

const allLines = topology.getConnectedTrackCandidates(graphTracks, 0, 1, []);
assert.deepEqual(allLines.map(item => item.trackIndex), [1, 2]);
assert.deepEqual(topology.getConnectedTrackCandidates(graphTracks, 0, 9, []), []);

assert.equal(topology.projectPointToPolyline({ x: 1, y: 1 }, [{ x: 0, y: 0 }]), null);
assert.equal(topology.splitPolylineAtProjection(route, null), null);
assert.equal(topology.cloneTrackSections(track, { ...withLatLng, fraction: 0 }, 9, [0.2, 0.8]), null);
console.log('Track topology tests passed.');

// Island-platform clearance is the rectangle's support distance along the
// route normal, so both rails stay outside the footprint for every approach.
const platformClearance = topology.calculatePlatformNormalClearance;
const clearance = 3;
const halfLength = 60, halfWidth = 5;
const cardinalCases = [
  { from: [0, 0], to: [0, 1], bearing: 90, expected: halfWidth + clearance },
  { from: [0, 0], to: [1, 0], bearing: 0, expected: halfWidth + clearance },
  { from: [0, 0], to: [0, -1], bearing: 270, expected: halfWidth + clearance },
  { from: [0, 0], to: [-1, 0], bearing: 180, expected: halfWidth + clearance }
];
cardinalCases.forEach(({ from, to, bearing, expected }) => {
  assert.ok(Math.abs(platformClearance(from, to, bearing, halfLength, halfWidth, clearance) - expected) < 1e-9);
});
// Reversing route direction or platform bearing must not change the footprint.
const diagonalClearance = platformClearance([0, 0], [1, 1], 45, halfLength, halfWidth, clearance);
assert.ok(Math.abs(diagonalClearance - (halfWidth + clearance)) < 1e-9);
assert.ok(Math.abs(platformClearance([1, 1], [0, 0], 225, halfLength, halfWidth, clearance) - diagonalClearance) < 1e-9);
assert.ok(Math.abs(platformClearance([0, 0], [1, 1], 225, halfLength, halfWidth, clearance) - diagonalClearance) < 1e-9);
assert.equal(platformClearance([0, 0], [0, 0], 90, halfLength, halfWidth, clearance), null);
assert.equal(platformClearance([0, 0], [0, 1], 90, -1, halfWidth, clearance), null);

const clearanceProfile = topology.calculatePlatformClearanceTransitionProfile([0, 25, 50, 75, 100], 100, 20, 20, 50);
assert.deepEqual(clearanceProfile, [20, 10, 0, 10, 20]);
const shortClearanceProfile = topology.calculatePlatformClearanceTransitionProfile([0, 25, 50, 75, 100], 100, 20, 10, 80);
assert.deepEqual(shortClearanceProfile, [20, 10, 0, 5, 10]);
assert.deepEqual(topology.calculatePlatformClearanceTransitionProfile([0, 50, 100], 0, 20, 20), [0, 0, 0]);

const alongExtent = topology.calculatePlatformAlongTrackExtent;
assert.ok(Math.abs(alongExtent([0, 0], [0, 1], 90, 45, 4) - 45) < 1e-9);
assert.ok(Math.abs(alongExtent([0, 0], [1, 0], 90, 45, 4) - 4) < 1e-9);
assert.ok(Math.abs(alongExtent([1, 1], [0, 0], 270, 45, 4) - 45) < 1e-9);
assert.equal(alongExtent([0, 0], [0, 0], 90, 45, 4), null);
const heldClearanceProfile = topology.calculatePlatformClearanceTransitionProfile(
  [0, 25, 45, 70, 95, 120, 145], 145, 20, 0, 50, 45, 0
);
assert.deepEqual(heldClearanceProfile, [20, 20, 20, 17.5, 10, 2.5, 0]);
const heldAtBothEnds = topology.calculatePlatformClearanceTransitionProfile(
  [0, 20, 40, 60, 80, 100], 100, 12, 12, 50, 45, 45
);
assert.deepEqual(heldAtBothEnds, [12, 12, 24, 12, 12, 12]);
