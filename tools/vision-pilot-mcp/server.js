#!/usr/bin/env node
// Vision Pilot MCP: lets any MCP-capable coding agent run and test Vision Pilot (website or desktop app).
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import * as vp from './lib.js';

const server = new McpServer({name:'vision-pilot-mcp', version:'1.0.0'});
const text = v => ({content:[{type:'text', text:typeof v === 'string' ? v : JSON.stringify(v, null, 2)}]});
const wrap = fn => async args => { try { return text(await fn(args || {})); } catch (e) { return {...text({ok:false, error:String(e.message || e)}), isError:true}; } };

server.tool('start_website', 'Start the Vision Pilot website from the GitHub folder (or a given url, e.g. the live site) in Chrome and wait until it reports ready.',
  {url:z.string().optional().describe('Leave empty to serve the local GitHub folder'), width:z.number().optional(), height:z.number().optional(), headless:z.boolean().optional(),
   withExtension:z.boolean().optional().describe('Load the Vision Pilot Chrome extension (visible window; profileDir keeps sign-ins between runs)'), profileDir:z.string().optional()},
  wrap(vp.startWebsite));
server.tool('stop_website', 'Close the website browser and its local server.', {}, wrap(vp.stopWebsite));
server.tool('start_desktop', 'Start the Vision Pilot desktop app (Electron) and attach to its main window.', {width:z.number().optional(), height:z.number().optional()}, wrap(vp.startDesktop));
server.tool('stop_desktop', 'Quit the desktop app.', {}, wrap(vp.stopDesktop));
server.tool('get_state', 'Read the app state: open panels and their sizes, Image/Video mode, Normal/Advanced, selected focus subjects, 3D camera, extension link, and whether loading finished.', {}, wrap(vp.getState));
server.tool('click', 'Click a button, tab or chip by CSS selector or by its visible text.', {selector:z.string().optional(), text:z.string().optional()}, wrap(vp.click));
server.tool('select_chip', 'Click a chip (e.g. "Marker", "Person 1", "Product 1") by its text.', {text:z.string()}, wrap(vp.selectChip));
server.tool('type_text', 'Type text into an input or textarea.', {selector:z.string(), text:z.string(), clear:z.boolean().optional()}, wrap(vp.typeText));
server.tool('set_value', 'Set the value of an input, slider or select and fire its events.', {selector:z.string(), value:z.union([z.string(), z.number()])}, wrap(vp.setValue));
server.tool('upload_files', 'Put files into a file input (e.g. images into Add images, a 3D model into Upload 3D Model).', {selector:z.string().describe('CSS selector of the input[type=file]'), paths:z.array(z.string())}, wrap(vp.uploadFiles));
server.tool('evaluate', 'Run JavaScript in the app page and return the result (window.AC and window.VPTest are available).', {script:z.string()}, wrap(vp.evaluate));
server.tool('screenshot', 'Screenshot the whole app, or one panel / element when a selector is given (e.g. "#pFocus").',
  {selector:z.string().optional()},
  async ({selector}) => {
    try { const s = await vp.screenshot({selector}); return {content:[{type:'image', data:s.base64, mimeType:'image/png'}, {type:'text', text:'Saved to ' + s.file}]}; }
    catch (e) { return {...text({ok:false, error:String(e.message || e)}), isError:true}; }
  });
server.tool('check_layout', 'Check that every button, icon and text stays inside its panel. Optional sizes resize all panels first, e.g. [{"scale":0.6},{"scale":1.4}].',
  {sizes:z.array(z.object({scale:z.number()})).optional()}, wrap(vp.checkLayout));
server.tool('check_3d_zoom', 'In Video mode: zoom the 3D camera with one subject and with several subjects selected, and report whether the camera moves forward and stops before entering a subject.', {}, wrap(vp.check3dZoom));
server.tool('test_remove_background', 'Run Remove Background through the AI bridge and report whether the generated image came back, how long it took and any error.',
  {timeoutMs:z.number().optional()}, wrap(vp.testRemoveBackground));
server.tool('test_ai_model', 'Run one real job through the extension: ChatGPT, Claude or Gemini describes a sample image, and the answer must come back to the app. Start the website with withExtension first (ChatGPT also works signed out).',
  {model:z.enum(['gpt', 'claude', 'gemini']).optional(), image:z.string().optional().describe('Image path in the site, default add/add_image_1.png')}, wrap(vp.testAiModel));
server.tool('check_extension', 'Check that the Vision Pilot Chrome extension is connected to the running app.', {}, wrap(vp.checkExtension));
server.tool('check_github', 'Check GitHub for new commits compared with the local GitHub folder.', {since:z.string().optional()}, wrap(vp.checkGithub));
server.tool('console_logs', 'Read the app console (errors only if asked).', {onlyErrors:z.boolean().optional(), limit:z.number().optional()}, wrap(vp.consoleLogs));

process.on('SIGINT', async () => { await vp.shutdown(); process.exit(0); });
process.stdin.on('close', async () => { await vp.shutdown(); process.exit(0); });
await server.connect(new StdioServerTransport());
