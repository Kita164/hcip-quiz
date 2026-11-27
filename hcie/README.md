# HCIE-Datacom 学习笔记

静态页面，给 HCIE-Datacom 笔试（H12-891）和实验（H12-892）用。这里只放笔记，不放题库。HCIP 刷题仍在仓库根目录的 `index.html`。

本地查看：在仓库根目录执行 `python3 -m http.server`，浏览器打开 `/hcie/`。不要直接双击 `index.html`，否则浏览器不允许读取 JSON。

## 加一个新专题

1. 新建 `hcie/data/topics/<id>.json`。`id` 用小写英文和连字符，例如 `mpls-l3vpn`。
2. 在 `hcie/data/catalog.json` 里选一个 `deck`，把这个 `id` 加进它的 `topics` 数组。要新的一章，就再加一个 `deck` 对象（`id`、`title`、`source`、`blurb`、`topics`）。
3. 图放在 `hcie/images/`，JSON 里写 `images/文件名.jpg`（相对 `hcie/` 目录）。截图先压过再放，单张尽量小于 150KB。
4. 刷新页面。没有构建步骤，目录和搜索会一起更新。

不要在专题 JSON 里加题目、选项或判分字段。

## 列举怎么写

地址、接口、参数、缺省值和步骤不要挤在同一句里。一项一行。页面会把字符串里的换行渲染成列表。

- 按设备分组。同一台设备的每个接口单独一行，写成「R1：GE0/0/0 10.1.13.1/24（对 R3）」。下一行再写这块接口，不要用逗号接着写。
- 地址超过三四条时用表格，列是「设备、接口、地址、对端」。接口在原文里没写就留「—」，不要自己编接口号。
- Router-ID、Area、进程号这类全网或全组共用的参数单独成行，不跟接口地址写在一起。
- 缺省值、可选取值、步骤也是一项一行。例如三种策略、四个定时器、五步配置，都拆开。
- 口诀可以仍是一句。说明因果的句子不要为了换行把谓语拆碎。

实验步骤的 `text` 同样遵守。步骤上如果要放地址表，加 `table`，字段和正文里的 `table` 一样：`headers`、`rows`、可选 `caption`。

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
