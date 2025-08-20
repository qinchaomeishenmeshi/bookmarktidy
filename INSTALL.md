# Chrome书签管理器扩展安装指南

## 📦 安装步骤

### 1. 准备扩展文件
确保项目目录包含以下文件：
- `manifest.json` - 扩展配置文件
- `background.js` - 后台脚本
- `manager.html` - 书签管理页面
- `manager.js` - 管理页面脚本
- `manager.css` - 管理页面样式
- `popup.html` - 弹出页面
- `popup.js` - 弹出页面脚本
- `popup.css` - 弹出页面样式
- `debug.html` - 调试页面（可选）

### 2. 在Chrome中加载扩展

1. **打开Chrome扩展管理页面**
   - 在地址栏输入：`chrome://extensions/`
   - 或者：菜单 → 更多工具 → 扩展程序

2. **启用开发者模式**
   - 在页面右上角找到"开发者模式"开关
   - 点击开关启用开发者模式

3. **加载未打包的扩展程序**
   - 点击"加载已解压的扩展程序"按钮
   - 选择项目文件夹（包含manifest.json的文件夹）
   - 点击"选择文件夹"

4. **验证安装**
   - 扩展应该出现在扩展列表中
   - 扩展图标应该出现在Chrome工具栏中

## 🔧 使用方法

### 主要功能
1. **弹出窗口**：点击工具栏中的扩展图标
2. **管理页面**：右键扩展图标 → 选项，或访问 `chrome-extension://[扩展ID]/manager.html`
3. **调试页面**：访问 `chrome-extension://[扩展ID]/debug.html`

### 功能特性
- ✅ 查看所有书签
- ✅ 按文件夹浏览书签
- ✅ 搜索书签
- ✅ 多种排序方式（标题、URL、添加时间、使用频率）
- ✅ 添加、编辑、删除书签
- ✅ 创建文件夹
- ✅ 访问统计和频率排序

## 🐛 故障排除

### 常见问题

1. **扩展无法加载**
   - 检查manifest.json语法是否正确
   - 确保所有必需文件都存在
   - 查看Chrome扩展页面的错误信息

2. **书签数据无法获取**
   - 打开调试页面：`chrome-extension://[扩展ID]/debug.html`
   - 点击"测试获取书签"按钮查看详细错误信息
   - 检查Chrome开发者工具的控制台输出

3. **权限问题**
   - 确保manifest.json中包含必要权限：
     ```json
     "permissions": [
       "bookmarks",
       "storage",
       "history"
     ]
     ```

4. **访问统计功能不工作**
   - 确保已授予"history"权限
   - 检查Chrome的历史记录设置

### 调试步骤

1. **查看控制台日志**
   - 打开Chrome开发者工具（F12）
   - 切换到Console标签
   - 查找以"[Background]"或"[Manager]"开头的日志

2. **使用调试页面**
   - 访问：`chrome-extension://[扩展ID]/debug.html`
   - 依次测试各项功能
   - 查看详细的错误信息和数据结构

3. **检查后台脚本**
   - 在扩展管理页面点击"检查视图 service worker"
   - 查看后台脚本的控制台输出

## 📝 开发说明

### 文件结构
```
bookmarktidy/
├── manifest.json          # 扩展配置
├── background.js          # 后台服务工作者
├── manager.html           # 主管理界面
├── manager.js             # 管理界面逻辑
├── manager.css            # 管理界面样式
├── popup.html             # 弹出窗口界面
├── popup.js               # 弹出窗口逻辑
├── popup.css              # 弹出窗口样式
├── debug.html             # 调试页面
└── INSTALL.md             # 安装说明
```

### 开发环境
- 本地开发：使用`python3 -m http.server 8080`启动本地服务器
- 扩展测试：在Chrome中加载未打包的扩展程序
- 调试工具：使用debug.html页面进行功能测试

## 🔄 更新扩展

当修改代码后：
1. 在Chrome扩展管理页面找到该扩展
2. 点击刷新按钮（🔄）重新加载扩展
3. 或者删除扩展后重新加载

## 📞 技术支持

如果遇到问题：
1. 首先查看调试页面的输出
2. 检查Chrome开发者工具的控制台
3. 确认所有权限已正确配置
4. 验证Chrome版本兼容性（需要支持Manifest V3）