# 3D Block Builder - 方块搭建工具

一个基于 Three.js 的 3D 方块搭建应用，支持 PC 和触屏设备。

**在线访问**：
- 🌐 主站（稳定版）：https://zerorfy.github.io/
- 🧪 Beta 版：https://zerorfy.github.io/beta/

---

## 📱 功能特性

### 主站（稳定版）
- ✅ 放置/删除方块
- ✅ 4 种颜色选择
- ✅ 智能吸附系统
- ✅ PC 鼠标控制
- ✅ 触屏设备支持
- ✅ 单指旋转视角
- ✅ 双指缩放（全局）

### Beta 版（实验功能）
- ✅ 所有稳定版功能
- 🆕 双指缩放（全局，任意模式下都可用）
- 🆕 增强的触控体验

---

## 🎮 操作说明

### PC 端操作
- **左键点击**：放置方块
- **Shift + 左键**：删除方块
- **右键拖动**：旋转视角
- **中键拖动**：平移画面
- **滚轮**：缩放
- **1-4 键**：切换颜色
- **T 键（按住）**：透视模式

### 触屏设备操作
- **📦 放置模式**：
  - 单指拖动：移动光标预览位置
  - 单指抬起：放置方块
  - 双指捏合：缩放视角
  
- **🔄 旋转模式**：
  - 单指拖动：旋转视角
  - 双指捏合：缩放视角
  
- **🗑️ 删除模式**：
  - 单指点击：删除方块
  - 双指捏合：缩放视角

---

## 🚀 本地运行

### 方法 1：Python 服务器（推荐）
```bash
cd web
python server.py
```
然后访问显示的地址（通常是 `http://localhost:8000`）

### 方法 2：直接打开
直接用浏览器打开 `index.html`（部分功能可能受限）

---

## 📂 项目结构

```
zerorfy.github.io/
├── index.html          # 主站首页
├── app.js              # 主站逻辑
├── style.css           # 主站样式
├── server.py           # 本地测试服务器
├── README.md           # 本文档
└── beta/               # Beta 版本
    ├── index.html
    ├── app.js
    ├── style.css
    └── README.md
```

---

## 🔧 技术栈

- **Three.js r128** - 3D 渲染引擎
- **OrbitControls** - 相机控制（Beta 版）
- **原生 JavaScript** - 无框架依赖
- **GitHub Pages** - 静态网站托管

---

## 🌳 Git 工作流程

### 分支策略
```
main        # 生产环境（主站）
├── beta    # 测试环境（Beta 版）
├── dev     # 开发环境
└── feature/* # 功能分支
```

### 版本管理
- **主站**：稳定版本，经过充分测试
- **Beta**：实验性功能，可能不稳定
- **Dev**：日常开发，频繁更新

### 回滚机制
```bash
# 查看历史版本
git log --oneline

# 回滚到指定版本
git reset --hard <commit-id>

# 或使用 revert（推荐）
git revert <commit-id>
```

---

## 🔄 多设备同步

### 工作流程
```
家里电脑 ←→ GitHub ←→ 办公室电脑
```

### 每天开始工作
```bash
cd G:\GitHub\zerorfy.github.io
git pull origin main
```

### 每天结束工作
```bash
# 使用快速脚本
.\update_github.ps1

# 或手动操作
git add .
git commit -m "更新说明"
git push origin main
```

---

## 📦 自动化脚本

### 快速更新（`update_github.ps1`）
自动复制文件、提交并推送到 GitHub
```powershell
.\update_github.ps1
```

### 初始部署（`deploy_to_github.ps1`）
首次部署时使用，交互式引导
```powershell
.\deploy_to_github.ps1
```

---

## 🗂️ 新项目管理

### 推荐结构
```
G:\GitHub\
├── zerorfy.github.io\     # 网站项目（公开）
├── ai-cube-workspace\     # 工作区备份（私有）
├── python-tools\          # Python 工具集
└── experiments\           # 实验性项目
```

### 自动备份方案

#### 方案 A：完全自动化（推荐）
- 每小时自动本地提交
- 每天晚上自动推送到 GitHub
- 使用 Windows 任务计划

#### 方案 B：半自动化
- 手动运行脚本推送
- 自动本地备份

#### 方案 C：手动管理
- 完全手动 Git 操作
- 最大灵活性

---

## ⚠️ Git 最佳实践

### ✅ 应该提交的内容
- 源代码（`.html`, `.js`, `.css`）
- 配置文件
- 文档（`.md`）
- 资源文件（图片、字体）

### ❌ 不应提交的内容
- 密码、API 密钥
- 大文件（>100MB）
- 临时文件（`.tmp`, `.cache`）
- 依赖包（`node_modules/`, `venv/`）
- 编译产物（`.pyc`, `.o`）

### 提交信息规范
```
feat: 添加新功能
fix: 修复 Bug
docs: 更新文档
style: 代码格式调整
refactor: 重构代码
test: 添加测试
chore: 构建/工具更新
```

---

## 🐛 故障排除

### 问题：推送被拒绝
**原因**：远程仓库有本地没有的提交

**解决**：
```bash
git pull origin main --rebase
git push origin main
```

### 问题：网站没有更新
**原因**：GitHub Pages 构建需要时间

**解决**：
1. 等待 1-5 分钟
2. 强制刷新浏览器（Ctrl+Shift+R）
3. 检查仓库 Actions 页面

### 问题：合并冲突
**原因**：多设备同时修改同一文件

**解决**：
1. 使用 VS Code 的合并工具
2. 手动编辑冲突文件
3. 提交解决后的版本

---

## 📊 版本历史

### v1.0 (2026-01-30)
- ✅ 初始版本
- ✅ PC 和触屏支持
- ✅ 基础方块搭建功能

### Beta v2 (2026-01-30)
- 🆕 全局双指缩放
- 🆕 优化触控体验
- 🆕 改进相机控制

---

## 🔮 未来计划

- [ ] 保存/加载功能
- [ ] 导出 3D 模型
- [ ] 多人协作模式
- [ ] 更多方块类型
- [ ] 材质系统
- [ ] 光影效果

---

## 📄 许可证

MIT License - 自由使用和修改

---

## 👤 作者

**zeror**
- GitHub: [@zerorfy](https://github.com/zerorfy)
- 项目主页：https://zerorfy.github.io/

---

## 🙏 致谢

- [Three.js](https://threejs.org/) - 3D 图形库
- [GitHub Pages](https://pages.github.com/) - 免费托管
- Antigravity AI - 开发助手

---

## 📞 反馈与支持

如有问题或建议，请：
1. 提交 [GitHub Issue](https://github.com/zerorfy/zerorfy.github.io/issues)
2. 发送邮件至 zerorfy@users.noreply.github.com

---

**最后更新**：2026-01-30
