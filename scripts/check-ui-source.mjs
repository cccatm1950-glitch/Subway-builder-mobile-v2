import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync('app/src/main/assets/index.html', 'utf8');
const scripts = [...html.matchAll(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/gi)]
  .map((match) => match[1].trim())
  .filter(Boolean);

assert.ok(scripts.length > 0, 'Expected inline JavaScript in the app HTML');
for (const [index, source] of scripts.entries()) {
  new vm.Script(source, { filename: `index.html:inline-script-${index + 1}` });
}

const ids = [...html.matchAll(/\\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicateIds)], [], 'HTML element IDs must be unique');

const panelActions = [...html.matchAll(/data-panel-action="([^"]+)"/g)]
  .map((match) => match[1]);
const actionBlockStart = html.indexOf('const actions={');
assert.notEqual(actionBlockStart, -1, 'Construction panel action map must exist');
const actionBlockEnd = html.indexOf('\\n  };', actionBlockStart);
assert.notEqual(actionBlockEnd, -1, 'Construction panel action map must close');
const actionBlock = html.slice(actionBlockStart, actionBlockEnd);
const mappedActions = [...actionBlock.matchAll(/'([^']+)'\\s*:/g)]
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
  'toggle3DCityView'
]) {
  assert.match(html, new RegExp(`function ${required}\\b|(?:function|const) ${required}\\b|window\\.${required}\\s*=`),
    `Expected core interaction ${required} to be present`);
}

console.log(`UI source checks passed: ${scripts.length} inline scripts, ${ids.length} IDs, ${new Set(panelActions).size} panel actions.`);
