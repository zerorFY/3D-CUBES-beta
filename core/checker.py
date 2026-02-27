import os
import time
from typing import Dict, Any, List
from playwright.sync_api import sync_playwright, Page, BrowserContext
import logging

log = logging.getLogger("rich")

class PageChecker:
    def __init__(self, headless: bool = True, screenshots_dir: str = "logs/screenshots", viewport: Dict[str, int] = None):
        self.headless = headless
        self.screenshots_dir = screenshots_dir
        self.viewport = viewport
        os.makedirs(self.screenshots_dir, exist_ok=True)

    def check(self, target_url: str) -> Dict[str, Any]:
        """
        Navigates to the target URL, captures a screenshot, and collects console logs.

        Args:
            target_url: The URL or local file path to check.

        Returns:
            A dictionary containing:
            - success: True if no JS errors, False otherwise.
            - errors: List of error messages from the console.
            - warnings: List of warning messages from the console.
            - screenshot: Path to the captured screenshot.
        """
        result = {
            "success": True,
            "errors": [],
            "warnings": [],
            "screenshot": None,
            "url": target_url
        }

        # Handle local file paths by prefixing with file:// if not a standard URL
        if not target_url.startswith("http") and not target_url.startswith("file://"):
            target_url = f"file:///{os.path.abspath(target_url).replace(os.sep, '/')}"
            result["url"] = target_url

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=self.headless)
                
                context_args = {}
                if self.viewport:
                    context_args["viewport"] = self.viewport
                
                context = browser.new_context(**context_args)
                page = context.new_page()

                # Set up console log listeners
                def handle_console(msg):
                    if msg.type == "error":
                        result["errors"].append(f"[{msg.type}] {msg.text}")
                        result["success"] = False
                    elif msg.type == "warning":
                        result["warnings"].append(f"[{msg.type}] {msg.text}")
                    # You could optionally log 'info' or other types here

                page.on("console", handle_console)
                page.on("pageerror", lambda err: result["errors"].append(f"[pageerror] {err}"))

                log.info(f"Navigating to {target_url}...")
                
                # Use domcontentloaded or networkidle depending on needs
                page.goto(target_url, wait_until="networkidle", timeout=10000)
                
                # Give it a tiny bit extra time just in case there are delayed scripts
                page.wait_for_timeout(500)

                # Capture screenshot
                timestamp = int(time.time())
                # sanitize filename
                safe_name = target_url.split('/')[-1] if not target_url.endswith('/') else target_url.split('/')[-2]
                safe_name = "".join([c for c in safe_name if c.isalpha() or c.isdigit() or c in (' ', '.', '_', '-')]).rstrip()
                if not safe_name:
                    safe_name = "page"
                
                screenshot_filename = f"{safe_name}_{timestamp}.png"
                screenshot_path = os.path.join(self.screenshots_dir, screenshot_filename)
                
                page.screenshot(path=screenshot_path, full_page=True)
                result["screenshot"] = screenshot_path
                log.info(f"Screenshot saved to {screenshot_path}")

                browser.close()

        except Exception as e:
            result["success"] = False
            result["errors"].append(f"[Exception] {str(e)}")
            log.error(f"Failed to check {target_url}: {e}")
        
        # Determine overall success based on whether exceptions or console errors were found
        if result["errors"]:
            result["success"] = False

        return result
