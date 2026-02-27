import os
import sys
import json
import logging
import argparse
from rich.logging import RichHandler

# Setup logging
logging.basicConfig(
    level="INFO",
    format="%(message)s",
    datefmt="[%X]",
    handlers=[RichHandler(rich_tracebacks=True)]
)

log = logging.getLogger("rich")

def load_config():
    config_path = "config.example.json"
    if os.path.exists("config.json"):
        config_path = "config.json"
    
    with open(config_path, "r") as f:
        return json.load(f)

def run_task(task_name: str, args: list):
    """Dynamically load and run a task from the tasks/ directory."""
    task_module_name = f"tasks.{task_name}"
    
    try:
        # Import the task module
        import importlib
        task_module = importlib.import_module(task_module_name)
    except ImportError:
        log.error(f"Task '{task_name}' not found. Ensure 'tasks/{task_name}.py' exists.")
        sys.exit(1)

    # Assuming each task has a 'run' or 'main' or we invoke it via script execution.
    # For now simply invoking the script as a module is handled by putting it in sys.argv
    log.info(f"Running task: {task_name}")
    
    # We could define a standard function signature in tasks, e.g., task_module.run(args)
    # But since check_page.py uses argparse and __main__, we can just simulate running the script
    # This is a basic implementation. It's often better to have a defined interface for tasks.
    # For check_page specifically, it might be better to import run_check and call it.
    if hasattr(task_module, 'run_check'):
        target = args[0] if args else "index.html"
        task_module.run_check(target)
    else:
        log.warning(f"Task '{task_name}' does not have a standard 'run' function. It may need to be executed directly.")

def main():
    parser = argparse.ArgumentParser(description="Automated Task Architecture Main Entry")
    parser.add_argument("--task", type=str, help="Name of the task to run (e.g., check_page)")
    parser.add_argument("task_args", nargs=argparse.REMAINDER, help="Arguments for the task")
    
    args = parser.parse_args()

    # Ensure directories exist
    os.makedirs("core", exist_ok=True)
    os.makedirs("tasks", exist_ok=True)
    os.makedirs("logs", exist_ok=True)

    config = load_config()
    
    if args.task:
        run_task(args.task, args.task_args)
    else:
        log.info("Starting Automated Task Architecture...")
        log.info(f"Loaded configuration: {config}")
        log.info("Project structure initialized successfully.")
        log.info("Use '--task <task_name>' to run a specific task.")

if __name__ == "__main__":
    main()
