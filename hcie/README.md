# HCIE-Datacom 学习笔记

静态页面，给 HCIE-Datacom 笔试（H12-891）和实验（H12-892）用。这里只放笔记，不放题库。HCIP 刷题仍在仓库根目录的 `index.html`。

本地查看：在仓库根目录执行 `python3 -m http.server`，浏览器打开 `/hcie/`。不要直接双击 `index.html`，否则浏览器不允许读取 JSON。

## 加一个新专题

1. 新建 `hcie/data/topics/<id>.json`。`id` 用小写英文和连字符，例如 `mpls-l3vpn`。
2. 在 `hcie/data/catalog.json` 里选一个 `deck`，把这个 `id` 加进它的 `topics` 数组。要新的一章，就再加一个 `deck` 对象（`id`、`title`、`source`、`blurb`、`topics`）。
3. 图放在 `hcie/images/`，JSON 里写 `images/文件名.jpg`（相对 `hcie/` 目录）。截图先压过再放，单张尽量小于 150KB。
4. 刷新页面。没有构建步骤，目录和搜索会一起更新。

不要在专题 JSON 里加题目、选项或判分字段。

## 专题文件里用到的字段

必填：`id`、`title`、`summary`。其余没有就省略或给空数组。

- `source`：这页来自哪套课件。
- `mindmap`：思维导图。每一项是 `{ "t": "节点", "d": "一行说明", "c": [子节点] }`。`d` 和 `c` 可以不写。
- `blocks`：正文，按顺序排。`type` 可以是：
  - `h` 标题。`"lv": 3` 是更小的一级，不写就是节标题。
  - `p` 段落，`ul` / `ol` 列表（`items`）。
  - `table`：`headers`、`rows`、可选 `caption`。
  - `code`：`title` 和 `code`。命令用华为 CLI 的样子，不要加提示符也可以。
  - `callout`：`kind` 取 `exam`（常考点）、`tip`、`warn`、`fix`（课件和设备行为不一致）。
  - `topo`：`nodes` 是 `{ "id", "x", "y", "label", "sub" }`，`links` 是 `{ "a", "b", "label", "dashed" }`。
  - `bands`：分层示意，`rows` 是 `{ "name", "items" }`。
- `exam`：字符串数组，页尾的常考点。
- `mixups`：`{ "see": "看到什么", "mean": "就是什么" }`。
- `memory`：短口诀。
- `labs`：实验。每项有 `title`、`goal`、可选 `topo`、`steps`（`where`、`text`、`code`）、`verify`（`title`、`see`、`code`）。没有命令的开局步骤，`code` 留空。
- `figures`：`{ "src": "images/xx.jpg", "caption": "" }`。

`已学` 记在浏览器的 `localStorage` 键 `hcie-datacom-learned` 里，不上传。
