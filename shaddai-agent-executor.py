"""
SHADDAI Agent Executor — Unified Bridge v1
===========================================
Connects local Python agents (06_AGENTS) to the Node.js backend's 46 real tools.
Provides: REST API, MCP server, autonomous mode, opencode CLI.

Architecture:
  Python Agents (8000-8008)  ──LLM reasoning──>  Ollama (11434)
         |
         | HTTP proxy
         v
  Agent Executor (8010)      ──tool exec────>  Backend API (3000/api/*)
         |
         | MCP protocol
         v
  MCP Clients (VS Code, Cursor, etc.)

Usage:
  python shaddai-agent-executor.py --serve          # Start REST API on :8010
  python shaddai-agent-executor.py --cli            # Interactive CLI
  python shaddai-agent-executor.py --agent shaddai  # One-shot agent mode
  python shaddai-agent-executor.py --mcp            # MCP server mode
"""

import json, sys, os, time, re, subprocess, threading, signal, uuid
from datetime import datetime
from pathlib import Path

# Try optional deps
HAS_FASTAPI = False
try:
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    HAS_FASTAPI = True
except ImportError:
    pass

import requests

# ─── CONFIG ───────────────────────────────────────────────────────
AGENTS_DIR = Path(r"C:\Users\Brittany\OneDrive\Desktop\New folder\Desktop\MASTERY FOLDER\06_AGENTS")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3000")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EXECUTOR_PORT = int(os.environ.get("EXECUTOR_PORT", "8010"))
DEFAULT_MODEL = os.environ.get("DEFAULT_MODEL", "llama3.2:1b")

AGENTS = {
    "shaddai": {"port": 8000, "name": "SHADDAI", "color": "#ff6b35", "role": "Supreme Orchestrator"},
    "zerox":   {"port": 8001, "name": "ZEROX",   "color": "#ffd700", "role": "Wealth & Revenue"},
    "oracle":  {"port": 8002, "name": "ORACLE",  "color": "#a78bfa", "role": "Research & Intelligence"},
    "nexus":   {"port": 8003, "name": "NEXUS",   "color": "#00c4ff", "role": "Technical Architect"},
    "turtle":  {"port": 8004, "name": "TURTLE",  "color": "#00e5a0", "role": "UI/UX & Creative"},
    "quill":   {"port": 8005, "name": "QUILL",   "color": "#fb923c", "role": "Writing & Communication"},
    "pikadon": {"port": 8008, "name": "PIKADON", "color": "#f43f5e", "role": "Security & Compliance"},
}

TOOL_PROXY_URL = f"{BACKEND_URL}/api"

# ─── BACKEND TOOL PROXY ───────────────────────────────────────────

BACKEND_TOOLS = {}  # populated lazily

def fetch_backend_tools():
    """Fetch available tools from the backend agent engine."""
    try:
        r = requests.get(f"{BACKEND_URL}/api/agent/tools", timeout=3)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                BACKEND_TOOLS.clear()
                for t in data:
                    BACKEND_TOOLS[t.get("name", t.get("id", "unknown"))] = t
            elif isinstance(data, dict) and "tools" in data:
                BACKEND_TOOLS.clear()
                for t in data["tools"]:
                    BACKEND_TOOLS[t.get("name", t.get("id", "unknown"))] = t
            return BACKEND_TOOLS
    except Exception:
        pass
    # Fallback
    BACKEND_TOOLS.update({
        "fetch_price": {"name": "fetch_price", "description": "Live crypto price"},
        "get_fear_greed": {"name": "get_fear_greed", "description": "Fear & Greed Index"},
        "get_trending": {"name": "get_trending", "description": "Trending coins"},
        "get_global_market": {"name": "get_global_market", "description": "Global market data"},
        "screenshot_url": {"name": "screenshot_url", "description": "Screenshot a URL"},
        "hash_text": {"name": "hash_text", "description": "Hash text"},
        "translate_text": {"name": "translate_text", "description": "Translate text"},
        "delegate_to_agent": {"name": "delegate_to_agent", "description": "Delegate to another agent"},
    })
    return BACKEND_TOOLS

def execute_tool(tool_name, params=None):
    """Execute a backend tool via the API proxy."""
    params = params or {}
    try:
        r = requests.post(f"{BACKEND_URL}/api/tools/{tool_name}", json=params, timeout=30)
        if r.status_code == 200:
            return r.json()
        # Try alternative route
        r2 = requests.post(f"{BACKEND_URL}/api/shaddai/tool/{tool_name}", json=params, timeout=30)
        if r2.status_code == 200:
            return r2.json()
        return {"error": f"Tool {tool_name} returned {r.status_code}"}
    except Exception as e:
        return {"error": str(e)}

# ─── AGENT SERVERS ─────────────────────────────────────────────────

_agent_processes = {}

def is_agent_running(agent_id):
    """Check if a Python agent server is running."""
    cfg = AGENTS.get(agent_id)
    if not cfg:
        return False
    try:
        r = requests.get(f"http://localhost:{cfg['port']}/ping", timeout=1)
        return r.status_code == 200
    except Exception:
        return False

def start_agent(agent_id):
    """Start a single Python agent server."""
    if is_agent_running(agent_id):
        return {"status": "already_running", "agent": agent_id}
    cfg = AGENTS.get(agent_id)
    if not cfg:
        return {"error": f"Unknown agent: {agent_id}"}
    
    script_map = {
        "shaddai": "shaddai_server.py",
        "zerox": "zerox_server.py",
        "oracle": "oracle_server.py",
        "nexus": "agent_network.py",
        "turtle": "turtle_server.py",
        "quill": "quill_server.py",
        "pikadon": "pikadon_server.py",
    }
    script = script_map.get(agent_id)
    if not script:
        return {"error": f"No script for {agent_id}"}
    
    script_path = AGENTS_DIR / script
    if not script_path.exists():
        return {"error": f"Script not found: {script_path}"}
    
    try:
        p = subprocess.Popen(
            [sys.executable, str(script_path)],
            cwd=str(AGENTS_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
        )
        _agent_processes[agent_id] = p
        return {"status": "started", "agent": agent_id, "pid": p.pid}
    except Exception as e:
        return {"error": str(e)}

def stop_agent(agent_id):
    """Stop a Python agent server."""
    if agent_id in _agent_processes:
        try:
            _agent_processes[agent_id].terminate()
            _agent_processes[agent_id].wait(timeout=3)
        except Exception:
            _agent_processes[agent_id].kill()
        del _agent_processes[agent_id]
    # Also try HTTP kill
    try:
        cfg = AGENTS.get(agent_id)
        if cfg:
            requests.post(f"http://localhost:{cfg['port']}/shutdown", timeout=1)
    except Exception:
        pass
    return {"status": "stopped", "agent": agent_id}

def start_all_agents():
    """Start all 7 agent servers."""
    results = {}
    for agent_id in AGENTS:
        results[agent_id] = start_agent(agent_id)
        time.sleep(0.5)
    return results

def stop_all_agents():
    """Stop all agent servers."""
    results = {}
    for agent_id in list(AGENTS.keys()):
        results[agent_id] = stop_agent(agent_id)
    return results

# ─── LLM REASONING ─────────────────────────────────────────────────

def call_agent_llm(agent_id, prompt, system_prompt=None, model=None):
    """Call a Python agent's LLM via its server or fallback to Ollama."""
    cfg = AGENTS.get(agent_id)
    if not cfg:
        return {"error": f"Unknown agent: {agent_id}"}
    
    model = model or DEFAULT_MODEL
    sys_prompt = system_prompt or f"You are {cfg['name']}, {cfg['role']}. Be concise and direct."
    
    # Try the agent server first
    if is_agent_running(agent_id):
        try:
            r = requests.post(
                f"http://localhost:{cfg['port']}/chat",
                json={"message": prompt, "model": model},
                timeout=60
            )
            if r.status_code == 200:
                data = r.json()
                return {"response": data.get("response", ""), "source": f"{agent_id}_server"}
        except Exception:
            pass
    
    # Fallback: direct Ollama
    try:
        r = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": sys_prompt},
                    {"role": "user", "content": prompt}
                ],
                "stream": False,
                "options": {"temperature": 0.4}
            },
            timeout=120
        )
        if r.status_code == 200:
            content = r.json().get("message", {}).get("content", "")
            return {"response": content, "source": "ollama", "model": model}
    except Exception as e:
        pass
    
    return {"error": f"Agent {agent_id} unreachable and Ollama failed"}

# ─── TOOL PARSING ──────────────────────────────────────────────────

def parse_tool_calls(text):
    """Parse [TOOL:name:{...}] markers from agent output."""
    pattern = r'\[TOOL:([a-zA-Z_][a-zA-Z0-9_]*):(\{(?:[^{}]|(?:\{[^{}]*\}))*\})\]'
    matches = re.findall(pattern, text)
    results = []
    for tool_name, params_str in matches:
        try:
            params = json.loads(params_str)
        except json.JSONDecodeError:
            params = {}
        results.append({"tool": tool_name, "params": params})
    return results

# ─── AUTONOMOUS AGENT LOOP ────────────────────────────────────────

class AgentLoop:
    """Autonomous agent loop: plan -> execute tools -> synthesize."""
    
    def __init__(self, agent_id="shaddai", model=None):
        self.agent_id = agent_id
        self.model = model or DEFAULT_MODEL
        self.history = []
        self.max_iterations = 10
    
    def run(self, task):
        """Run the agent loop on a task."""
        system = f"""You are {AGENTS[self.agent_id]['name']}, {AGENTS[self.agent_id]['role']}.
You have access to real tools. To use a tool, output:
[TOOL:tool_name:{{"param": "value"}}]
The tool will execute and you'll see the result. Continue until the task is complete.
Available tools: fetch_price, get_fear_greed, screenshot_url, hash_text, translate_text, delegate_to_agent, and more.
Never say you can't execute something — try a tool first."""
        
        self.history = [{"role": "system", "content": system}]
        
        iteration = 0
        while iteration < self.max_iterations:
            iteration += 1
            
            # Build prompt
            messages = self.history + [{"role": "user", "content": task if iteration == 1 else "Continue working on the task. What's the next step?"}]
            
            # Get LLM response
            result = call_agent_llm(self.agent_id, messages[-1]["content"], system_prompt=system, model=self.model)
            if "error" in result:
                return {"error": result["error"], "iterations": iteration, "history": self.history}
            
            response = result["response"]
            self.history.append({"role": "assistant", "content": response})
            
            # Parse and execute tools
            tool_calls = parse_tool_calls(response)
            if not tool_calls:
                # No more tools needed — done
                return {"result": response, "iterations": iteration, "source": result.get("source")}
            
            tool_results = []
            for tc in tool_calls:
                tool_result = execute_tool(tc["tool"], tc["params"])
                tool_results.append(f"[TOOL RESULT: {tc['tool']}]\n{json.dumps(tool_result, indent=2)[:500]}")
            
            self.history.append({"role": "user", "content": "Tool results:\n" + "\n\n".join(tool_results)})
        
        return {"result": "Max iterations reached", "iterations": iteration, "history": self.history}

# ─── MCP SERVER ────────────────────────────────────────────────────

def run_mcp_server():
    """Run the MCP stdio server for opencode integration."""
    import sys
    
    def send_mcp(msg):
        sys.stdout.write(json.dumps(msg) + "\n")
        sys.stdout.flush()
    
    # Initialize
    send_mcp({"jsonrpc": "2.0", "method": "initialize", "params": {
        "protocolVersion": "0.1.0",
        "capabilities": {
            "tools": {
                "listChanged": True
            }
        },
        "clientInfo": {"name": "shaddai-agent-executor", "version": "1.0.0"}
    }})
    
    # Notify ready
    send_mcp({"jsonrpc": "2.0", "method": "notifications/initialized"})
    
    # Tool definitions
    MCP_TOOLS = [
        {
            "name": "call_agent",
            "description": "Call any SHADDAI agent with a prompt",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "agent": {"type": "string", "description": "Agent name: shaddai, zerox, oracle, nexus, turtle, quill, pikadon"},
                    "prompt": {"type": "string", "description": "What to ask the agent"},
                    "model": {"type": "string", "description": "Ollama model (default: llama3.2:3b)"}
                },
                "required": ["agent", "prompt"]
            }
        },
        {
            "name": "execute_tool",
            "description": "Execute a backend tool by name",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tool": {"type": "string", "description": "Tool name"},
                    "params": {"type": "object", "description": "Tool parameters"}
                },
                "required": ["tool"]
            }
        },
        {
            "name": "agentic_task",
            "description": "Run an autonomous agent loop on a task",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "agent": {"type": "string", "description": "Lead agent"},
                    "task": {"type": "string", "description": "What to accomplish"},
                    "model": {"type": "string", "description": "Ollama model"}
                },
                "required": ["agent", "task"]
            }
        },
        {
            "name": "agent_status",
            "description": "Check which agents are running",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        },
        {
            "name": "start_agents",
            "description": "Start all or specific agent servers",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "agent": {"type": "string", "description": "Specific agent to start, or 'all'"}
                }
            }
        },
        {
            "name": "list_backend_tools",
            "description": "List all available backend tools",
            "inputSchema": {
                "type": "object",
                "properties": {}
            }
        },
    ]
    
    # Notify tools
    send_mcp({"jsonrpc": "2.0", "method": "notifications/tools/listChanged", "params": {"tools": MCP_TOOLS}})
    
    buffer = ""
    while True:
        try:
            chunk = sys.stdin.read(1)
            if not chunk:
                break
            buffer += chunk
            if buffer.endswith("\n"):
                try:
                    msg = json.loads(buffer.strip())
                    self_msg_id = msg.get("id")
                    method = msg.get("method")
                    params = msg.get("params", {})
                    
                    if method == "tools/list":
                        send_mcp({"jsonrpc": "2.0", "id": self_msg_id, "result": {"tools": MCP_TOOLS}})
                    
                    elif method == "tools/call":
                        tool_name = params.get("name")
                        tool_args = params.get("arguments", {})
                        
                        if tool_name == "call_agent":
                            result = call_agent_llm(tool_args["agent"], tool_args["prompt"], model=tool_args.get("model"))
                            send_mcp({"jsonrpc": "2.0", "id": self_msg_id, "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}})
                        
                        elif tool_name == "execute_tool":
                            result = execute_tool(tool_args["tool"], tool_args.get("params", {}))
                            send_mcp({"jsonrpc": "2.0", "id": self_msg_id, "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}})
                        
                        elif tool_name == "agentic_task":
                            loop = AgentLoop(agent_id=tool_args.get("agent", "shaddai"), model=tool_args.get("model"))
                            result = loop.run(tool_args["task"])
                            send_mcp({"jsonrpc": "2.0", "id": self_msg_id, "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}})
                        
                        elif tool_name == "agent_status":
                            statuses = {a: "running" if is_agent_running(a) else "stopped" for a in AGENTS}
                            send_mcp({"jsonrpc": "2.0", "id": self_msg_id, "result": {"content": [{"type": "text", "text": json.dumps(statuses, indent=2)}]}})
                        
                        elif tool_name == "start_agents":
                            agent = tool_args.get("agent", "all")
                            if agent == "all":
                                result = start_all_agents()
                            else:
                                result = start_agent(agent)
                            send_mcp({"jsonrpc": "2.0", "id": self_msg_id, "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}})
                        
                        elif tool_name == "list_backend_tools":
                            tools = fetch_backend_tools()
                            send_mcp({"jsonrpc": "2.0", "id": self_msg_id, "result": {"content": [{"type": "text", "text": json.dumps(list(tools.keys()), indent=2)}]}})
                        
                        else:
                            send_mcp({"jsonrpc": "2.0", "id": self_msg_id, "error": {"code": -32601, "message": f"Unknown tool: {tool_name}"}})
                    
                    elif method == "shutdown":
                        break
                    
                    buffer = ""
                except json.JSONDecodeError:
                    pass  # wait for more input
        except KeyboardInterrupt:
            break
        except Exception:
            break

# ─── CLI MODE ──────────────────────────────────────────────────────

def run_cli():
    """Interactive CLI for agent commands."""
    print("\n╔══════════════════════════════════╗")
    print("║  SHADDAI Agent Executor CLI v1   ║")
    print("╚══════════════════════════════════╝")
    print("Commands:")
    for aid, cfg in AGENTS.items():
        icon = "●" if is_agent_running(aid) else "○"
        print(f"  {aid:10}  {icon}  {cfg['name']:8}  port {cfg['port']}")
    print("  tools                  List backend tools")
    print("  start <agent|all>      Start agent(s)")
    print("  stop <agent|all>       Stop agent(s)")
    print("  run <agent> <task>     Autonomous agentic task")
    print("  mcp                    Start MCP stdio server")
    print("  help                   This help")
    print("  exit/quit              Exit")
    
    while True:
        try:
            line = input("\n> ").strip()
            if not line:
                continue
            if line in ("exit", "quit"):
                break
            
            parts = line.split(maxsplit=1)
            cmd = parts[0]
            args = parts[1] if len(parts) > 1 else ""
            
            if cmd == "tools":
                tools = fetch_backend_tools()
                print(f"\nBackend tools ({len(tools)}):")
                for name in sorted(tools.keys()):
                    print(f"  - {name}")
            
            elif cmd == "start":
                if args == "all" or not args:
                    r = start_all_agents()
                else:
                    r = start_agent(args)
                print(json.dumps(r, indent=2))
            
            elif cmd == "stop":
                if args == "all" or not args:
                    r = stop_all_agents()
                else:
                    r = stop_agent(args)
                print(json.dumps(r, indent=2))
            
            elif cmd == "run":
                parts_a = args.split(maxsplit=1)
                if len(parts_a) < 2:
                    print("Usage: run <agent> <task>")
                    continue
                agent = parts_a[0]
                task = parts_a[1]
                if agent not in AGENTS:
                    print(f"Unknown agent. Valid: {', '.join(AGENTS.keys())}")
                    continue
                print(f"\n[{agent}] Running autonomous task...")
                print("-" * 40)
                loop = AgentLoop(agent_id=agent)
                result = loop.run(task)
                print(f"\nResult:\n{result.get('result', 'No result')}")
                print(f"\nIterations: {result.get('iterations', 0)}")
            
            elif cmd == "mcp":
                print("\nStarting MCP stdio server...")
                print("(Connect via: npx opencode mcp add shaddai -- python shaddai-agent-executor.py --mcp)\n")
                run_mcp_server()
            
            elif cmd == "agent":
                parts_a = args.split(maxsplit=1)
                if len(parts_a) < 2:
                    print("Usage: agent <name> <prompt>")
                    continue
                agent = parts_a[0]
                prompt = parts_a[1]
                result = call_agent_llm(agent, prompt)
                print(f"\n[{agent.upper()}]")
                print(result.get("response", result.get("error", "No response")))
            
            elif cmd == "help":
                print("Commands: tools, start, stop, run, mcp, agent, help, exit")
            
            else:
                # Try as direct agent call
                if cmd in AGENTS:
                    result = call_agent_llm(cmd, args)
                    print(f"\n[{cmd.upper()}]")
                    print(result.get("response", result.get("error", "No response")))
                else:
                    print(f"Unknown: {cmd}. Try: tools, start, run, agent, mcp, help")
        
        except KeyboardInterrupt:
            print("\nBye.")
            break
        except Exception as e:
            print(f"Error: {e}")
    
    stop_all_agents()

# ─── FASTAPI SERVER ────────────────────────────────────────────────

def run_fastapi():
    """Run the REST API server."""
    if not HAS_FASTAPI:
        print("[ERROR] fastapi not installed. Run: pip install fastapi uvicorn[standard]")
        print("Falling back to CLI mode.")
        run_cli()
        return
    
    app = FastAPI(title="SHADDAI Agent Executor", version="1.0.0")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
    
    @app.get("/")
    def root():
        statuses = {a: "running" if is_agent_running(a) else "stopped" for a in AGENTS}
        return {
            "service": "SHADDAI Agent Executor",
            "version": "1.0.0",
            "agents": statuses,
            "backend": BACKEND_URL,
            "ollama": OLLAMA_URL
        }
    
    @app.get("/agents")
    def list_agents():
        statuses = {}
        for aid, cfg in AGENTS.items():
            statuses[aid] = {
                "name": cfg["name"],
                "port": cfg["port"],
                "role": cfg["role"],
                "running": is_agent_running(aid)
            }
        return statuses
    
    @app.post("/agents/{agent_id}/chat")
    def agent_chat(agent_id: str, body: dict):
        if agent_id not in AGENTS:
            raise HTTPException(404, f"Unknown agent: {agent_id}")
        prompt = body.get("message", body.get("prompt", ""))
        model = body.get("model")
        system = body.get("system")
        result = call_agent_llm(agent_id, prompt, system_prompt=system, model=model)
        if "error" in result:
            raise HTTPException(502, result["error"])
        return result
    
    @app.post("/agents/{agent_id}/run")
    def agent_run(agent_id: str, body: dict):
        if agent_id not in AGENTS:
            raise HTTPException(404, f"Unknown agent: {agent_id}")
        task = body.get("task", "")
        model = body.get("model")
        loop = AgentLoop(agent_id=agent_id, model=model)
        result = loop.run(task)
        return result
    
    @app.post("/agents/start")
    def start_agents(body: dict = {}):
        agent = body.get("agent", "all")
        if agent == "all":
            return start_all_agents()
        return start_agent(agent)
    
    @app.post("/agents/stop")
    def stop_agents(body: dict = {}):
        agent = body.get("agent", "all")
        if agent == "all":
            return stop_all_agents()
        return stop_agent(agent)
    
    @app.get("/tools")
    def list_tools():
        tools = fetch_backend_tools()
        return {"tools": list(tools.keys()), "count": len(tools)}
    
    @app.post("/tools/{tool_name}")
    def run_tool(tool_name: str, body: dict = {}):
        result = execute_tool(tool_name, body)
        return result
    
    @app.post("/autonomous")
    def autonomous(body: dict):
        agent = body.get("agent", "shaddai")
        task = body.get("task", "")
        model = body.get("model")
        if not task:
            raise HTTPException(400, "task is required")
        loop = AgentLoop(agent_id=agent, model=model)
        result = loop.run(task)
        return result
    
    import uvicorn
    print(f"\n  SHADDAI Agent Executor API running on :{EXECUTOR_PORT}")
    print(f"  Endpoints:")
    print(f"    GET  /                    Status")
    print(f"    GET  /agents              List agents")
    print(f"    POST /agents/{'{id}'}/chat  Chat with agent")
    print(f"    POST /agents/{'{id}'}/run   Autonomous agent task")
    print(f"    POST /agents/start        Start agents")
    print(f"    POST /agents/stop         Stop agents")
    print(f"    GET  /tools               List backend tools")
    print(f"    POST /tools/{'{name}'}      Execute tool")
    print(f"    POST /autonomous          Run autonomous agent\n")
    uvicorn.run(app, host="0.0.0.0", port=EXECUTOR_PORT, log_level="info")

# ─── MAIN ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="SHADDAI Agent Executor")
    parser.add_argument("--serve", action="store_true", help="Start REST API server")
    parser.add_argument("--cli", action="store_true", help="Start interactive CLI")
    parser.add_argument("--mcp", action="store_true", help="Start MCP stdio server")
    parser.add_argument("--agent", type=str, help="Call an agent with a prompt")
    parser.add_argument("--prompt", type=str, help="Prompt for --agent mode")
    parser.add_argument("--task", type=str, help="Autonomous task for --agent mode")
    
    args = parser.parse_args()
    
    if args.mcp:
        run_mcp_server()
    elif args.serve:
        run_fastapi()
    elif args.cli:
        run_cli()
    elif args.agent and args.task:
        loop = AgentLoop(agent_id=args.agent)
        result = loop.run(args.task)
        print(json.dumps(result, indent=2))
    elif args.agent and args.prompt:
        result = call_agent_llm(args.agent, args.prompt)
        print(result.get("response", result.get("error", "No response")))
    else:
        parser.print_help()
        print("\nQuick start:")
        print("  python shaddai-agent-executor.py --serve     # REST API on :8010")
        print("  python shaddai-agent-executor.py --cli       # Interactive CLI")
        print("  python shaddai-agent-executor.py --mcp       # MCP for opencode")
        print("  python shaddai-agent-executor.py --agent shaddai --prompt 'Hello'")
        print("  python shaddai-agent-executor.py --agent shaddai --task 'Analyze BTC'")
