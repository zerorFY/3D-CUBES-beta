Webapp Testing (Triple-Screen Enhanced)

**Invocation**: `@[webapp-testing]` or `/webapp-testing`

**Description**:
Uses Playwright for automated testing of local web applications. 
SPECIALIZED FOR: PC, iPhone, and iPad compatibility.

**Core Capabilities**:
- **Multi-Device Emulation**: Automatically test across Desktop, iPhone 14, and iPad Pro.
- **Interaction Switching**: Use `page.click()` for PC and `page.tap()` for touch devices.
- **Responsive Audit**: Verify if elements (like menus) correctly transform across breakpoints.

**Custom Workflow**:
1. Identify if the project has Playwright; if not, suggest `npm install`.
2. For every test request, execute a 3-device matrix (PC/Mobile/Tablet).
3. Report visual bugs (e.g., overlapping text on iPhone) via screenshots.