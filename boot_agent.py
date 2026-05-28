"""
SHADDAI Agent Bootstrapper — launches a single agent server
Usage: python boot_agent.py <agent_name>
"""
import sys, os, subprocess

AGENTS_DIR = r"C:\Users\Brittany\OneDrive\Desktop\New folder\Desktop\MASTERY FOLDER\06_AGENTS"
PYTHON = r"C:\Users\Brittany\AppData\Local\Programs\Python\Python312\python.exe"

SCRIPTS = {
    "shaddai": "shaddai_server.py",
    "zerox": "zerox_server.py",
    "oracle": "oracle_server.py",
    "nexus": "agent_network.py",
    "turtle": "turtle_server.py",
    "quill": "quill_server.py",
    "pikadon": "pikadon_server.py",
}

def launch(agent):
    script = SCRIPTS.get(agent)
    if not script:
        print(f"Unknown agent: {agent}. Choose: {list(SCRIPTS.keys())}")
        return False

    path = os.path.join(AGENTS_DIR, script)
    if not os.path.exists(path):
        print(f"Script not found: {path}")
        return False

    if agent == "nexus":
        code = (
            "import sys; sys.argv = ['agent_network.py', 'server']; "
            f"sys.path.insert(0, {AGENTS_DIR!r}); "
            f"exec(compile(open({path!r}, 'rb').read(), {script!r}, 'exec'))"
        )
    else:
        code = (
            f"import sys; sys.path.insert(0, {AGENTS_DIR!r}); "
            f"exec(compile(open({path!r}, 'rb').read(), {script!r}, 'exec'))"
        )

    subprocess.Popen(
        [PYTHON, "-c", code],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.DETACHED_PROCESS
    )
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(f"Usage: python {sys.argv[0]} <agent>")
        print(f"Agents: {list(SCRIPTS.keys())}")
        sys.exit(1)

    agent = sys.argv[1]
    ok = launch(agent)
    print(f"{'Launched' if ok else 'FAILED'} {agent}")
