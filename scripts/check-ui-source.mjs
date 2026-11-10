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

for (const required of [
  'bindConstructionPanelControls',
  'toggleToolsPanel',
  'handleMapPlacement',
  'handleStationClick',
  'toggleSimulation',
  'openSubway3DPreview'
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

assert.ok(html.includes('id="sb-open-maplibre-preview"'), '3D preview must be available from the game menu');
assert.ok(html.includes('maplibre-3d-spike.html'), '3D preview must open the isolated renderer');
assert.ok(!html.includes('toggle3DCityView') && !html.includes('toggle-3d'), 'Legacy construction 3D toggle must be removed');

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
  'totalLengthMeters:totalRouteDistance'
]) {
  assert.ok(html.includes(required), 'Expected track topology guard: ' + required);
}

console.log('UI source checks passed: ' + scripts.length + ' inline scripts, ' + ids.length + ' IDs, ' + new Set(panelActions).size + ' panel actions.');
