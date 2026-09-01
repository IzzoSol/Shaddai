const express = require('express');
const router = express.Router();

router.get('/status', async (req, res) => {
  try {
    const r = await fetch('http://127.0.0.1:3001/api/mcp/status', { method: 'GET' });
    const status = await r.json();
    const toolsR = await fetch('http://127.0.0.1:3001/api/mcp/tools', { method: 'GET' });
    const tools = await toolsR.json();
    res.json({
      ok: true,
      mcpStatus: status,
      toolCount: tools.ok ? (tools.tools ? tools.tools.length : 0) : 0,
      agents: status.agents ? status.agents.map(a => ({ agent: a.agent, kb: a.kb, docs: a.docs })) : [],
      summary: `MCP online with ${tools.ok ? tools.tools.length : 0} registered tools across ${status.agents ? status.agents.length : 0} agents.`
    });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e && e.message || e) });
  }
});

module.exports = router;