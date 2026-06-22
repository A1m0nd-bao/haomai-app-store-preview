# 好麦 App Store 预览维护

飞书图片维护表：

https://mcn5p3adfjf6.feishu.cn/sheets/UBXWspShohQ64AtFIJHc1zcKnne

表格字段：

- `产品ID`：产品标识，例如 `haomai`、`topia`
- `产品名称`：产品展示名，例如 `好麦 AI`、`Topia`
- `风格ID`：页面里使用的风格标识，例如 `bubble-glass`
- `风格名称`：页面标签展示名称
- `排序`：同一风格里的图片排序
- `图片`：上传 App Store 截图附件
- `标题`：截图标题
- `启用`：填 `是` 或留空会展示，填 `否` 会隐藏
- `备注`：维护备注，不展示

同一张截图通过 `产品ID + 风格ID + 排序` 定位。只上传某个产品的某一张图时，其它默认截图会保留。

常用命令：

```bash
npm run start
npm run sync:images
npm run sync:images:watch
```

发布同步：

```bash
npm run sync:images:publish
npm run sync:images:watch:publish
```

本地配置文件是 `lark-image-sync.config.json`，不会提交到 Git。
