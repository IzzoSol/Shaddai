"""
SHADDAI Agent Launcher — spawns 7 agents + executor bridge
"""
"""
SHADDAI Agent Launcher — spawns 7 agents + executor bridge
Uses DETACHED_PROCESS so agents survive shell exit.
"""
import sys, os, subprocess, time, requests, atexit, signal

AGENTS_DIR = r"C:\Users\Brittany\OneDrive\Desktop\New folder\Desktop\MASTERY FOLDER\06_AGENTS"
PYTHON = r"C:\Users\Brittany\AppData\Local\Programs\Python\Python312\python.exe"
DETACH = subprocess.DETACHED_PROCESS  # 0x00000008
AGENTS = [
    ("shaddai", 8000, "shaddai_server.py"),
    ("zerox",   8001, "zerox_server.py"),
    ("oracle",  8002, "oracle_server.py"),
    ("nexus",   8003, "agent_network.py"),
    ("turtle",  8004, "turtle_server.py"),
    ("quill",   8005, "quill_server.py"),
    ("pikadon", 8008, "pikadon_server.py"),
]

def log(msg):
    print(f"  [{msg}]")

def poll_port(port, timeout=20):
    for i in range(timeout):
        try:
            r = requests.get(f"http://localhost:{port}", timeout=1)
            return True
        except:
            pass
        try:
            r = requests.get(f"http://localhost:{port}/ping", timeout=1)
            return True
        except:
            pass
        time.sleep(1)
    return False

def launch_detached(name, port, script):
    path = os.path.join(AGENTS_DIR, script)
    if not os.path.exists(path):
        log(f"{name} — script missing!")
        return False

    if name == "nexus":
        bootstrap = (
            f"import sys; sys.argv = ['{script}', 'server']; "
            f"sys.path.insert(0, r'{AGENTS_DIR}'); "
            f"exec(compile(open(r'{path}', 'rb').read(), r'{script}', 'exec'))"
        )
    else:
        bootstrap = (
            f"import sys; sys.path.insert(0, r'{AGENTS_DIR}'); "
            f"exec(compile(open(r'{path}', 'rb').read(), r'{script}', 'exec'))"
        )

    subprocess.Popen(
        [PYTHON, "-c", bootstrap],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=DETACH
    )
    return True

def main():
    print()
    print("  =============================================")
    print("   SHADDAI Agent Ecosystem — Launcher")
    print("  =============================================")
    print()

    # Ensure httpx
    try:
        import httpx
    except ImportError:
        log("Installing httpx for pikadon...")
        subprocess.run([PYTHON, "-m", "pip", "install", "httpx", "-q"], capture_output=True)

    # Check Ollama
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        models = r.json().get("models", [])
        log(f"Ollama OK ({len(models)} models)")
    except:
        log("Ollama unavailable — agents will use fallback")

    # Launch agents (detached — survive shell exit)
    for name, port, script in AGENTS:
        ok = launch_detached(name, port, script)
        log(f"{'Launched' if ok else 'FAILED'} {name}:{port}")
        time.sleep(2)

    # Poll for agents
    print()
    log("Waiting for agents to come online...")
    for name, port, _ in AGENTS:
        online = poll_port(port, timeout=20)
        log(f"{name}:{port} {'ONLINE' if online else 'OFFLINE'}")

    # Launch executor bridge
    executor = os.path.join(os.path.dirname(__file__), "shaddai-agent-executor.py")
    if os.path.exists(executor):
        print()
        log("Starting executor bridge on :8010...")
        subprocess.Popen(
            [PYTHON, executor, "--serve"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=DETACH
        )
        time.sleep(4)
        online = poll_port(8010, timeout=10)
        log(f"executor:8010 {'ONLINE' if online else 'OFFLINE'}")

    # Status summary
    print()
    print("  ALL AGENTS LAUNCHED — details above")
    print()
    print("  Agent Portal:  http://localhost:8010/agents")
    print("  Tools:         http://localhost:8010/tools")
    print("  Backend:       http://localhost:3000")
    print()
    print("  To stop: taskkill /F /IM python.exe")
    print()

if __name__ == "__main__":
    main()
