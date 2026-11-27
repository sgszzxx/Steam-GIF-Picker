/* Static guardrails for the Steam target-detection strategy. Real DOM selectors still need Steam testing. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));

assert.match(source, /steamloopback\\\.host/);
assert.match(source, /steam-chat\\\.com/);
assert.doesNotMatch(source.match(/const IS_STEAM_HOST =([\s\S]*?);/)?.[1] || '', /steamcommunity/);
assert.match(source, /\.friendsui-container/);
assert.match(source, /new MutationObserver/);
assert.match(source, /function discoverActiveComposer/);
assert.match(source, /scheduleTargetDiscovery/);
assert.match(source, /等待打开聊天窗口/);
assert.ok(!manifest.content_scripts[0].matches.includes('<all_urls>'));
assert.ok(!manifest.host_permissions.includes('<all_urls>'));
assert.ok(manifest.content_scripts[0].matches.some(x => x.includes('steamloopback.host')));
assert.ok(manifest.content_scripts[0].matches.some(x => x.includes('steam-chat.com')));
console.log('PASS Steam-only host scope and auto-composer discovery guardrails');
