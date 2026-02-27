import argparse
import sys
import os
from typing import Dict, Any

# Ensure we can import from core when running as a stand-alone script
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.text import Text
from core.checker import PageChecker

console = Console()

def run_check(target: str, headless: bool = True, viewport: dict = None):
    console.print(f"[bold blue]Starting check for:[/bold blue] {target}")
    if viewport:
        console.print(f"[bold blue]Viewport:[/bold blue] {viewport['width']}x{viewport['height']}")
    
    checker = PageChecker(headless=headless, viewport=viewport)
    
    with console.status("[bold green]Running Playwright checker...[/bold green]"):
        results = checker.check(target)

    # Display results
    if results["success"]:
        panel_color = "green"
        title = "Check Passed"
    else:
        panel_color = "red"
        title = "Check Failed"

    # Create a table for the report
    table = Table(show_header=False, box=None)
    table.add_column("Property", style="bold", width=15)
    table.add_column("Value")

    table.add_row("Target:", results["url"])
    table.add_row("Screenshot:", results["screenshot"] if results["screenshot"] else "None")
    
    # Handle Warnings
    if results["warnings"]:
        table.add_row("Warnings:", str(len(results["warnings"])))
        for warn in results["warnings"]:
             table.add_row("", f"[yellow]{warn}[/yellow]")
    else:
        table.add_row("Warnings:", "0")

    # Handle Errors
    if results["errors"]:
        table.add_row("Errors:", str(len(results["errors"])))
        for err in results["errors"]:
             table.add_row("", f"[red]{err}[/red]")
    else:
        table.add_row("Errors:", "0")

    panel = Panel(
        table,
        title=title,
        border_style=panel_color,
        expand=False
    )
    
    console.print(panel)
    
    return results["success"]

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Check a webpage or local HTML file for JS errors and take a screenshot.")
    parser.add_argument("target", help="URL or path to local file to check (e.g., https://example.com or index.html)")
    parser.add_argument("--headed", action="store_true", help="Run browser in headed mode (visible)")
    parser.add_argument("--viewport", type=str, help="Viewport size WxH (e.g., 1024x768 or 810x1080 for Pad)")
    
    args = parser.parse_args()
    
    viewport_dict = None
    if args.viewport:
        try:
            w, h = map(int, args.viewport.lower().split('x'))
            viewport_dict = {"width": w, "height": h}
        except ValueError:
            console.print("[red]Invalid viewport format. Use WxH (e.g., 810x1080)[/red]")
            sys.exit(1)
    
    success = run_check(args.target, headless=not args.headed, viewport=viewport_dict)
    
    # Exit with appropriate status code for CI/CD or batch script integration
    if not success:
        sys.exit(1)
    sys.exit(0)
