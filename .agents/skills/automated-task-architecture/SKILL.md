---
name: Automated Task Architecture
description: Initialize a web development project with a Playwright-based self-checking framework and standardized directory structure.
---

# 自动化任务架构 (Automated Task Architecture)

在使用此 Skill 时，你需要为用户初始化项目环境，并设定“写完必须自检”的行为准则。

## 1. 目录结构初始化
在项目根目录生成以下目录和基础文件：
- `main.py`（程序入口）
- `core/`（核心逻辑目录，存放检查器等核心类）
- `tasks/`（任务脚本目录，存放具体的执行脚本）
- `logs/screenshots/`（日志文件和自动化截图保存目录）

## 2. 依赖与配置文件
生成以下配置文件：
- `requirements.txt`：推荐包含 `playwright`, `requests`, `rich` 等基础库。
- `config.example.json`：配置模板文件。

## 3. 批处理脚本
生成以下运行脚本（Windows环境）：
- `setup.bat`：用于一键安装 Python 依赖（`pip install -r requirements.txt`）以及 Playwright 环境（`playwright install`）。
- `run.bat`：用于一键运行入口程序（`python main.py`）。

## 4. 行为准则：写完必须自检
此技能强制要求 AI 执行以下工作流：
- **核心准则：** 每次修改或新建网页（HTML/JS/CSS）后，必须自动通过编写的 Playwright 脚本（如 `check_page.py`）打开该网页进行自测试。
- **捕获控制台日志**：监听浏览器控制台事件，检查是否有任何 JavaScript 报错 (Error) 或警告 (Warning)。
- **页面截图**：等待页面加载完毕后，使用 Playwright 对当前视图进行截图，并妥善保存到 `logs/screenshots/` 目录中。
- **修复闭环**：在终端打印检查报告（包含警告、报错内容）。如果测试捕获到了报错，AI **必须主动修改代码修复它**，并再次执行检查，直到零报错为止。

## 执行步骤指引
1. 创建或更新项目结构和上述文件。
2. 实现基于 Playwright 的检查工具（通常包含在 `core/checker.py` 与 `tasks/check_page.py` 中）。
3. 提示用户执行 `setup.bat` 完成环境配置。
4. 随后所有的改动都必须配合 `check_page.py` （支持 `--viewport` 配置多端尺寸）进行本地回归测试。
