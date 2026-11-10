import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync('app/src/main/assets/index.html', 'utf8');
const topologySource = readFileSync('app/src/main/assets/track-topology.js', 'utf8');
new vm.Script(topologySource, { filename: 'track-topology.js' });
assert.ok(html.includes('<script src="track-topology.js"></script>'),
  'Track topology helpers must load before the app script');

const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);

assert.ok(scripts.length > 0, 'Expected inline JavaScript in the app HTML');
for (const [index, source] of scripts.entries()) {
  new vm.Script(source, { filename: 'index.html:inline-script-' + (index + 1) });
}

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicateIds)], [], 'HTML element IDs must be unique');

const panelActions = [...html.matchAll(/data-panel-action="([^"]+)"/g)]
  .map((match) => match[1]);
const actionBlockStart = html.indexOf('const actions={');
assert.notEqual(actionBlockStart, -1, 'Construction panel action map must exist');
const actionBlockEnd = html.indexOf("\n   if(action==='platform-width')", actionBlockStart);
assert.notEqual(actionBlockEnd, -1, 'Construction panel action dispatch must follow the action map');
const actionBlock = html.slice(actionBlockStart, actionBlockEnd);
assert.match(html, /function findButton\(target\)/, 'Construction controls must use delegated button lookup');
assert.match(html, /document\.addEventListener\('pointerdown'/, 'Construction controls must bind pointer input');
assert.match(html, /document\.addEventListener\('click'/, 'Construction controls must retain click fallback');
const mappedActions = [...actionBlock.matchAll(/'([^']+)'\s*:/g)]
  .map((match) => match[1]);
const specialActions = new Set(['platform-width', 'platform-type']);
const unmappedActions = [...new Set(panelActions)]
  .filter((action) => !mappedActions.includes(action) && !specialActions.has(action));
assert.deepEqual(unmappedActions, [], 'Every construction panel action must be wired');

/* The 3D test switch is a Service Lines control, never a Construction action. */
assert.ok(!html.includes("['toggle-3d','city','3D city view']"),
  'Legacy 3D city action must not be generated in Construction');
assert.ok(!html.includes("'toggle-3d':()=>window.toggle3DCityView()"),
  'Construction touch bridge must not expose the legacy 3D action');
assert.ok(html.includes("serviceDock.querySelector('#sb-service-lines')?.append(threeDButton)"),
  '3D test switch must be mounted inside the Service Lines panel');
assert.ok(html.includes('sb-pr92-service-lines-expanded-3d-slot'),
  'Service Lines must reserve a dedicated expanded-panel slot for the 3D test switch');
assert.ok(html.includes('grid-template-columns:minmax(0,1fr) 46px 46px!important'),
  'Expanded Service Lines layout must reserve separate Run and 3D button columns');
assert.ok(html.includes('#sb-action-dock .sb-dock-panel-service:not(.is-expanded) #sb-service-lines #sb-3d-toggle'),
  '3D test switch must be hidden while Service Lines is collapsed');


for (const required of [
  'bindConstructionPanelControls',
  'toggleToolsPanel',
  'handleMapPlacement',
  'handleStationClick',
  'toggleSimulation',
  'toggle3DCityView'
]) {
  const declarations = [
    'function ' + required + '(',
    'const ' + required + ' =',
    'const ' + required + '=',
    'window.' + required + ' =',
    'window.' + required + '='
  ];
  assert.ok(declarations.some(declaration => html.includes(declaration)),
    'Expected core interaction ' + required + ' to be present');
}

for (const required of [
  'function splitTrackAtCrosshair',
  'function getTrackElevationAtFraction',
  'interpolateElevationAtDistance',
  'function pruneOrphanJunctions',
  'function pauseSimulationBeforeTopologyChange',
  'function findTrackGroupPath',
  'getConnectedTrackCandidates',
  "nodeType==='junction'",
  'trackGroupId',
  'centerline:Array.isArray(t.centerline)',
  'const trainLineId=',
  'const inheritedLayer=',
  'offsetTransitionZones:t.offsetTransitionZones',
  'splitAlongMeters',
  'totalLengthMeters:totalRouteDistance',
  'function getTrackStationEndpointStations',
  'getTrackCenterlinePoints(t,endpointStations)',
  'window.sb3dTrackFeatures.push',
  'window.getSubway3DPlatforms=function',
  'id="sb-pr93-cross-view-build-drag-preview"',
  "if(!['waypoint','curve'].includes(mode))return;",
  'function commitPoint(state,event)',
  "sb3dMap.addSource('sb-build-preview'",
  "sb3dMap.on('click',['sb-station-dots','sb-platform-fills']",
  "trackIndex,style:t.style||'single'",
  "mode==='curve'||mode==='waypoint'",
  'stationConnector:true',
  "kind:'platform'",
  'calculateStationEndpoint',
  'calculateParallelJunctionMergeProfile'
]) {
  assert.ok(html.includes(required), 'Expected track topology guard: ' + required);
}


assert.ok(!html.includes('function commitTrack(state,event)'),
  'Track placement must remain tap-to-select/tap-to-place, not drag-to-draw');
assert.ok(!html.includes("kind:'track-preview'"),
  'Track preview must remain the existing tap-based station preview');
console.log('UI source checks passed: ' + scripts.length + ' inline scripts, ' + ids.length + ' IDs, ' + new Set(panelActions).size + ' panel actions.');
