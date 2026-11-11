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
assert.match(html, /serviceDock\.className='sb-dock-panel sb-dock-panel-service'/,
  'Service Lines must retain its dedicated dock-panel identity');
assert.match(html, /grid-template-columns:minmax\(0,1fr\) 46px 46px!important/,
  'Expanded Service Lines layout must reserve separate Run and 3D button columns');
const collapsed3DRule = html.match(/#sb-action-dock\s+#sb-service-dock:not\(\.is-expanded\)\s+#sb-service-lines>\s*#sb-3d-toggle\s*\{([^}]*)\}/);
assert.ok(collapsed3DRule, 'Collapsed Service Lines must have a dedicated 3D switch rule');
assert.match(collapsed3DRule[1], /display:\s*none\s*!important/,
  '3D test switch must not display while Service Lines is collapsed');
assert.match(collapsed3DRule[1], /visibility:\s*hidden\s*!important/,
  '3D test switch must be hidden from visibility while Service Lines is collapsed');
assert.match(collapsed3DRule[1], /pointer-events:\s*none\s*!important/,
  'Collapsed 3D test switch must not receive pointer input');


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


assert.ok(html.includes("kind:'track-tap-preview'"),
  'Track tool must render a live preview after selecting its start station');
assert.ok(html.includes("map.on('mousemove',function(event){if(mode==='track'"),
  '2D track preview must follow the map pointer');
assert.ok(html.includes("sb3dMap.on('mousemove',event=>"),
  '3D track preview must follow the map pointer');
assert.ok(html.includes("map.on('move zoom',function(){if(mode==='track'"),
  'Track preview must stay aligned with the mobile crosshair while panning');
assert.ok(html.includes("Tap a start station, preview the route, then tap a destination station"),
  'Track placement instructions must describe tap-to-preview/tap-to-place');
assert.ok(html.includes('The drawer intentionally remains open until its build-dock toggle is pressed again.'),
  'Construction drawer must stay open until its toggle is pressed again');
assert.doesNotMatch(html, /if\\(typeof setMode==='function'\\)setMode\\(nextMode\\);\\s*closeConstructionContextMenu\\(\\);/,
  'Selecting a construction tool must not close the construction drawer');
assert.ok(!html.includes("if(menu&&!menu.contains(event.target)&&!toggle?.contains(event.target))closeConstructionContextMenu();"),
  'Outside taps must not close the construction drawer');
assert.ok(html.includes("if(existing){closeConstructionContextMenu();return;}"),
  'The build button must remain the construction drawer close control');
assert.ok(!html.includes('function commitTrack(state,event)'),
  'Track placement must remain tap-to-select/tap-to-place, not drag-to-draw');
assert.ok(!html.includes("kind:'track-preview'"),
  'Track preview must remain the existing tap-based station preview');
console.log('UI source checks passed: ' + scripts.length + ' inline scripts, ' + ids.length + ' IDs, ' + new Set(panelActions).size + ' panel actions.');
