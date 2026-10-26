#!/usr/bin/env python3
"""Build notes-data.js from the togogo HCIP question bank.

Notes restate only what the bank asserts:
- a true/false stem the key marks 正确
- a stem or option the key marks 错误 (recorded as 不成立)
- for a 判断题 the key marks 错误: the false wording (hi) plus one short sentence (fix)
- the selected options or filled blanks

False 判断题 corrections live in scripts/tf_fixes.json and must be a substring
of the stored stem plus one sentence grounded in the bank. Regenerate with:

  python3 scripts/build_study_data.py [path/to/togogo-qa.txt]
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import urllib.request
from collections import OrderedDict, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = ROOT / "index.html"
OUT_PATH = ROOT / "notes-data.js"
FIXES_PATH = ROOT / "scripts" / "tf_fixes.json"
IMG_DIR = ROOT / "images"

OPT_RE = re.compile(r"^([A-H])[\.．、]\s*(.*)$")
URL_RE = re.compile(r"https?://\S+")
BLANK_RE = re.compile(r"（\s*）|\(\s*\)|（\s*\)|\(\s*）")
INSTR_RE = re.compile(
    r"[（(][^）)]{0,80}(填写|全称|缩写|阿拉伯|首字母|大写|小写|例如|token|Token|英文)[^）)]*[）)]?\s*$",
    re.I,
)

TOPIC_ORDER = [
    "routing",
    "ospf",
    "isis",
    "bgp",
    "acl",
    "ipv6",
    "switching",
    "stp",
    "vrrp",
    "bfd",
    "multicast",
    "mpls",
    "vpn",
    "wlan",
    "dhcp",
    "security",
    "ha",
    "ops",
    "other",
]

TOPIC_TITLE = {
    "routing": "路由基础",
    "ospf": "OSPF",
    "isis": "IS-IS",
    "bgp": "BGP",
    "acl": "ACL 与路由策略",
    "ipv6": "IPv6",
    "switching": "交换与 VLAN",
    "stp": "STP / RSTP / MSTP",
    "vrrp": "VRRP",
    "bfd": "BFD",
    "multicast": "组播 / IGMP / PIM",
    "mpls": "MPLS",
    "vpn": "VPN / GRE / IPSec",
    "wlan": "WLAN",
    "dhcp": "DHCP",
    "security": "安全",
    "ha": "可靠性与管理",
    "ops": "排错、割接与维护",
    "other": "其他考点",
}

# (topic, weight, keywords). Short ASCII keywords use token boundaries.
TOPIC_KEYWORDS = [
    ("wlan", 3, ["wlan", "ssid", "capwap", "无线终端", "无线", "漫游组", "漫游"]),
    ("wlan", 2, ["airengine"]),
    ("vrrp", 4, ["vrrp"]),
    ("bfd", 4, ["bfd"]),
    ("multicast", 3, ["组播", "igmp", "pim", "igmpsnooping", "msdp", "rpf"]),
    ("multicast", 2, ["ssm", "asm"]),
    ("mpls", 3, ["mpls", "ldp"]),
    ("vpn", 4, ["ipsec", "ike", "l2tp", "dsvpn", "dvpn"]),
    ("vpn", 3, ["vpn", "gre"]),
    ("stp", 3, ["rstp", "mstp", "msti", "cist", "bpdu", "生成树", "根桥", "根端口"]),
    ("stp", 2, ["stp"]),
    ("ospf", 4, ["ospf", "ospfv2", "ospfv3", "nssa", "dr-priority", "bdr"]),
    ("ospf", 2, ["lsa", "asbr", "abr", "router-lsa"]),
    ("isis", 4, ["is-is", "isis", "csnp", "psnp"]),
    ("isis", 2, ["system id", "systemid", "nsap"]),
    ("bgp", 4, ["bgp", "ibgp", "ebgp"]),
    ("bgp", 2, ["as_path", "as-path", "local_pref", "local-preference", "route-reflector", "路由反射", "cluster"]),
    ("ipv6", 3, ["ipv6", "icmpv6", "dhcpv6", "slaac"]),
    ("acl", 3, ["filter-policy", "route-policy", "ip-prefix", "前缀列表", "策略路由", "路由策略", "traffic-filter", "访问控制列表", "pbr", "mqc"]),
    ("acl", 2, ["acl"]),
    ("security", 3, ["防火墙", "安全策略", "安全区域", "端口安全", "dhcp snooping", "dhcpsnooping", "风暴控制", "cpu防攻击", "802.1x", "ipsg", "macsec"]),
    ("security", 2, ["urpf", "aaa", "公钥", "私钥", "加密", "长连接", "保障设备安全"]),
    ("dhcp", 3, ["dhcp"]),
    ("switching", 3, ["vlan", "eth-trunk", "链路聚合", "vlanpool", "vlan pool", "mux vlan", "端口隔离"]),
    ("switching", 2, ["trunk", "堆叠", "mac地址", "access", "环路", "arp", "广播风暴", "流量抑制"]),
    ("routing", 3, ["静态路由", "直连路由", "浮动路由", "等价路由", "最长匹配", "缺省路由", "路由注入", "路由引入", "重发布", "重分布"]),
    ("routing", 2, ["fib", "路由表", "路由优先级", "下一跳", "内部优先级", "外部优先级", "动态路由协议"]),
    ("routing", 1, ["路由协议"]),
    ("ha", 2, ["snmp", "netconf", "ntp", "端口镜像", "流量镜像"]),
    ("ha", 2, ["广域网", "园区网", "ssh", "telnet", "数据平面", "控制平面", "管理平面", "转发平面"]),
    ("wlan", 2, ["ac", "ap"]),
    ("vpn", 3, ["vpnv4", "vpn-instance", "vpn实例", "shamlink", "sham-link", "hub&spoke", "hub-spoke"]),
    ("ops", 4, ["割接", "bootrom", "补丁", "防静电", "实验局", "telemetry", "imaster"]),
    ("ops", 2, ["升级", "日常维护", "网络维护", "运行环境", "机房", "指示灯", "时区", "ftp", "信息中心", "console", "串口", "光功率", "版本文件", "严重等级", "槽位", "ping", "display", "dir"]),
]

SUBTOPICS = {
    "ospf": [
        ("v3", "OSPFv3", ["ospfv3", "ospf v3", "intra-area-prefix", "link-lsa"]),
        ("area", "区域与 LSA", ["nssa", "stub", "totally", "lsa", "lsdb", "abr", "asbr", "区域"]),
        ("nbr", "邻居与报文", ["邻居", "邻接", "dd", "hello", "exstart", "exchange", "loading"]),
        ("net", "网络类型与 DR/BDR", ["broadcast", "p2p", "p2mp", "nbma", "bdr", "dr"]),
        ("route", "路由引入、开销与过滤", ["import", "filter-policy", "汇总", "summary", "外部", "开销", "cost", "缺省路由"]),
    ],
    "isis": [
        ("adj", "邻接、区域与 NET", ["邻接", "邻居", "level", "area", "net", "system"]),
        ("lsp", "LSP / SNP 与同步", ["lsp", "csnp", "psnp", "lsdb", "snp"]),
        ("cost", "开销与路由", ["开销", "cost", "路由", "overload", "度量"]),
    ],
    "bgp": [
        ("peer", "对等体与报文", ["对等体", "peer", "open", "keepalive", "邻居", "tcp"]),
        ("attr", "属性与选路", ["属性", "med", "local_pref", "local-preference", "as_path", "as-path", "community", "next_hop", "next-hop", "prefval", "选路", "优选"]),
        ("adv", "发布、聚合与路由策略", ["聚合", "network", "import", "发布", "通告", "反射", "rr", "联盟", "orf"]),
    ],
    "multicast": [
        ("igmp", "IGMP", ["igmp"]),
        ("pim", "PIM", ["pim", "rp", "spt", "rpf", "ssm", "asm"]),
        ("other", "组播基础", ["组播"]),
    ],
    "mpls": [
        ("ldp", "LDP 与标签", ["ldp", "标签", "lsp", "php"]),
        ("vpn", "MPLS VPN 相关", ["vpn", "rd", "rt"]),
    ],
    "vpn": [
        ("mpls", "BGP/MPLS IP VPN", ["mpls", "vpnv4", "rd", "rt", "ce", "pe"]),
        ("gre", "GRE 与其他隧道", ["gre", "ipsec", "ike", "l2tp", "隧道"]),
    ],
    "stp": [
        ("stp", "STP", ["stp"]),
        ("rstp", "RSTP / MSTP", ["rstp", "mstp"]),
    ],
    "vrrp": [
        ("state", "状态与选举", ["master", "backup", "优先级", "抢占", "vrid"]),
        ("link", "联动与监视", ["bfd", "监视", "联动", "上行"]),
    ],
    "wlan": [
        ("roam", "漫游与组网", ["漫游", "ac", "ap", "三层"]),
        ("svc", "业务与安全", ["vlan", "认证", "ssid"]),
    ],
    "acl": [
        ("acl", "ACL", ["acl"]),
        ("policy", "前缀列表与路由策略", ["prefix", "前缀", "route-policy", "filter-policy", "策略"]),
    ],
    "security": [
        ("fw", "防火墙", ["防火墙", "安全区域", "安全策略", "会话"]),
        ("access", "接入与本机安全", ["dhcp", "端口安全", "mac", "风暴", "cpu", "802.1x", "aaa"]),
    ],
    "switching": [
        ("vlan", "VLAN 与接口", ["vlan", "trunk", "access", "隔离"]),
        ("agg", "聚合、堆叠与 MAC", ["eth-trunk", "聚合", "堆叠", "mac"]),
    ],
    "ipv6": [
        ("addr", "地址与报文", ["地址", "报头", "压缩"]),
        ("proto", "邻居发现与协议", ["nd", "icmp", "ospf", "isis", "dhcp"]),
    ],
    "dhcp": [
        ("dhcp", "DHCP", ["dhcp"]),
    ],
    "bfd": [
        ("bfd", "会话与检测", ["bfd"]),
    ],
    "routing": [
        ("table", "路由表与选路", ["路由表", "fib", "优先级", "下一跳", "最长"]),
        ("kind", "路由来源", ["静态", "直连", "动态", "缺省"]),
    ],
    "ha": [
        ("mgmt", "管理协议", ["snmp", "netconf", "ssh", "telnet", "ntp"]),
        ("net", "网络与可靠性概念", ["广域网", "园区", "镜像"]),
    ],
    "ops": [
        ("change", "割接与升级", ["割接", "升级", "补丁", "bootrom"]),
        ("trouble", "排错与日常维护", ["故障", "维护", "指示灯", "ftp", "时区", "telemetry"]),
    ],
    "other": [
        ("misc", "综合", []),
    ],
}


def norm(s: str) -> str:
    """Lowercase and split protocol names that OCR glued onto the next word.

    Longer tokens are protected first so "rstp" is not torn into "r" + "stp",
    and "lsdb" is not torn into "lsa".
    """
    s = s.lower().replace("–", "-").replace("—", "-").replace("−", "-")
    s = s.replace("（", "(").replace("）", ")")
    for src, dst in (
        ("dhcpsnooping", "dhcp snooping"),
        ("igmpsnooping", "igmp snooping"),
        ("prefx", "prefix"),
        ("mstbpdu", "mstp bpdu"),
        ("muxvlan", "mux vlan"),
        ("macsec", " macsec "),
        ("ipsg", " ipsg "),
        ("imaster", " imaster "),
        ("clusterid", "cluster id"),
        ("clusterlist", "cluster list"),
        ("shamlink", " shamlink "),
        ("display", " display "),
        ("hub&spoke", " hub-spoke "),
        ("bgp/mpls", " bgp mpls "),
    ):
        s = s.replace(src, dst)
    s = re.sub(r"pim-(sm|dm|ssm)", r" pim \1 ", s)
    s = re.sub(r"is-is", " is-is ", s)
    protect = [
        ("ospfv3", "\ue000"),
        ("ospfv2", "\ue001"),
        ("rstp", "\ue002"),
        ("mstp", "\ue003"),
        ("lsdb", "\ue004"),
        ("igmpv1", "\ue005"),
        ("igmpv2", "\ue006"),
        ("igmpv3", "\ue007"),
        ("vrrpv2", "\ue008"),
        ("vrrpv3", "\ue009"),
    ]
    for word, mark in protect:
        s = s.replace(word, mark)
    for token in (
        "ospf", "isis", "bgp", "vrrp", "mpls", "ldp", "igmp", "pim",
        "vlan", "wlan", "bfd", "stp", "lsa", "lsp",
    ):
        s = s.replace(token, f" {token} ")
    restore = {
        "\ue000": " ospf ospfv3 ",
        "\ue001": " ospf ospfv2 ",
        "\ue002": " rstp ",
        "\ue003": " mstp ",
        "\ue004": " lsdb ",
        "\ue005": " igmp igmpv1 ",
        "\ue006": " igmp igmpv2 ",
        "\ue007": " igmp igmpv3 ",
        "\ue008": " vrrp vrrpv2 ",
        "\ue009": " vrrp vrrpv3 ",
    }
    for mark, word in restore.items():
        s = s.replace(mark, word)
    s = re.sub(r"(\d)(lsa|lsp|lsdb|vlan)", r"\1 \2", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def keyword_hit(text: str, kw: str) -> int:
    k = kw.lower()
    if re.fullmatch(r"[a-z0-9_./+\- ]{1,16}", k) and not re.search(r"[\u4e00-\u9fff]", k):
        pat = r"(?<![a-z0-9])" + re.escape(k).replace(r"\ ", r"\s+") + r"(?![a-z0-9])"
        return len(re.findall(pat, text))
    return text.count(k)


def accumulate(text: str, mult: int, scores: dict[str, int]) -> None:
    """Score keyword presence. Repeats do not dominate, so option lists cannot bury the stem."""
    for topic, weight, kws in TOPIC_KEYWORDS:
        if any(keyword_hit(text, kw) for kw in kws):
            scores[topic] += weight * mult
    if keyword_hit(text, "is-is") or keyword_hit(text, "isis"):
        scores["isis"] += 3 * mult
    if keyword_hit(text, "mpls") or keyword_hit(text, "ldp"):
        scores["mpls"] += 2 * mult
    if keyword_hit(text, "lsp"):
        if keyword_hit(text, "is-is") or keyword_hit(text, "isis"):
            scores["isis"] += 3 * mult
        elif keyword_hit(text, "mpls") or keyword_hit(text, "ldp") or "标签" in text or "静态" in text:
            scores["mpls"] += 3 * mult
    if "交换机" in text and keyword_hit(text, "cost") and "优先级" in text and "ospf" not in text:
        scores["stp"] += 4 * mult
    if "snooping" in text and keyword_hit(text, "dhcp"):
        scores["security"] += 6 * mult
        scores["dhcp"] = max(0, scores.get("dhcp", 0) - 3 * mult)
    if ("option43" in text or "option 43" in text) and (
        keyword_hit(text, "ac") or keyword_hit(text, "ap") or keyword_hit(text, "wlan")
    ):
        scores["wlan"] += 4 * mult


def primary_topic(stem: str, options_text: str) -> tuple[str, list[str]]:
    stem_scores: dict[str, int] = defaultdict(int)
    scores: dict[str, int] = defaultdict(int)
    accumulate(norm(stem), 3, stem_scores)
    accumulate(norm(stem), 3, scores)
    accumulate(norm(options_text), 1, scores)
    if not scores:
        return "other", ["other"]
    best = max(scores.values())
    # Stable tie-break: earlier TOPIC_ORDER wins when scores equal.
    cands = [t for t in TOPIC_ORDER if scores.get(t, 0) == best and t != "other"]
    if not cands:
        cands = [t for t in TOPIC_ORDER if scores.get(t, 0) == best]
    primary = cands[0]
    tags = [primary]
    for t in TOPIC_ORDER:
        if t == primary:
            continue
        if stem_scores.get(t, 0) >= 6 or scores.get(t, 0) >= best:
            tags.append(t)
        if len(tags) >= 4:
            break
    return primary, tags


def subtopic_of(topic: str, text: str) -> tuple[str, str]:
    rules = SUBTOPICS.get(topic) or [("misc", "综合", [])]
    best_id, best_title, best_score = rules[-1][0], rules[-1][1], 0
    found = False
    for sid, title, kws in rules:
        sc = 0
        for kw in kws:
            sc += keyword_hit(text, kw)
        if sc > best_score:
            best_id, best_title, best_score = sid, title, sc
            found = True
    if not found:
        return rules[-1][0], rules[-1][1]
    return best_id, best_title


def judgment_mode(stem: str) -> str | None:
    s = re.sub(r"\s+", "", stem)
    marks: list[tuple[int, str]] = []
    for m in re.finditer(r"错误的是|不正确的是|错误的有|不正确的有|不合理的是|是错误的|是不正确的", s):
        marks.append((m.start(), "wrong"))
    for m in re.finditer(r"正确的是|正确的有|正确的包括", s):
        marks.append((m.start(), "right"))
    if marks:
        marks.sort()
        return marks[-1][1]
    if re.search(r"(描述|说法|叙述).{0,8}(不正确|错误)", s):
        return "wrong"
    if re.search(r"(描述|说法|叙述).{0,8}正确", s):
        return "right"
    return None


def is_tf(options: list[dict]) -> bool:
    if len(options) != 2:
        return False
    texts = {re.sub(r"\s+", "", o["t"]) for o in options}
    return texts <= {"正确", "错误", "对", "错"}


def clean_space(s: str) -> str:
    s = s.replace("\u3000", " ").strip()
    s = re.sub(r"[ \t]{2,}", " ", s)
    return s


def readable(s: str) -> str:
    """Insert spaces OCR removed between a protocol name and the next word.

    Longer names such as IGMPv2 are kept intact. This does not change the claim.
    """
    t = clean_space(s)
    holds = []

    def hold(m):
        holds.append(m.group(0))
        return f"\ue010{len(holds)-1}\ue011"

    t = re.sub(r"(?i)(?<![A-Za-z])(?:OSPFv[23]|IGMPv[123]|VRRPv[23]|IS-IS)", hold, t)
    t = re.sub(
        r"(?i)(?<![A-Za-z])(OSPF|ISIS|VRRP|IGMP|BGP|MPLS|LDP|PIM|BFD|WLAN|RSTP|MSTP|STP|VLAN|DHCP)(?=[A-Za-z])",
        r"\1 ",
        t,
    )
    t = re.sub(r"\ue010(\d+)\ue011", lambda m: holds[int(m.group(1))], t)
    t = re.sub(r"(?i)(?<=[A-Za-z])(?=IPv[46])", " ", t)
    t = re.sub(r"(?i)(?<=\d)(LSA|LSP|LSDB|VLAN)", r" \1", t)
    return t


def strip_instructions(stem: str) -> str:
    s = stem.strip()
    for _ in range(3):
        n = INSTR_RE.sub("", s).strip()
        if n == s:
            break
        s = n
    return s


def fill_blanks(stem: str, answer: str) -> str:
    parts = [p.strip() for p in re.split(r"[|｜]", answer) if p.strip()]
    base = strip_instructions(stem)
    blanks = list(BLANK_RE.finditer(base))
    if not blanks:
        return clean_space(base.rstrip("。")) + "：" + "、".join(parts)
    out = []
    last = 0
    for i, m in enumerate(blanks):
        out.append(base[last : m.start()])
        out.append(parts[i] if i < len(parts) else m.group(0))
        last = m.end()
    out.append(base[last:])
    text = clean_space("".join(out))
    if len(parts) > len(blanks):
        text += "（其余答案：" + "、".join(parts[len(blanks) :]) + "）"
    return text


def load_image_map(html: str) -> dict[str, str]:
    pairs = re.findall(
        r'<img\s+src="(images/[^"]+)"[^>]*data-orig="([^"]+)"',
        html,
    )
    mapping: dict[str, str] = {}
    for src, orig in pairs:
        mapping.setdefault(orig, src)
    # also orig before src, just in case
    pairs2 = re.findall(
        r'data-orig="([^"]+)"[^>]*src="(images/[^"]+)"',
        html,
    )
    for orig, src in pairs2:
        mapping.setdefault(orig, src)
    return mapping


def local_or_remote(url: str, mapping: dict[str, str], cache: dict[str, str]) -> str:
    if url in mapping:
        return mapping[url]
    if url in cache:
        return cache[url]
    ext = os.path.splitext(url.split("?")[0])[1].lower()
    if ext not in {".png", ".jpg", ".jpeg", ".gif", ".webp"}:
        ext = ".png"
    name = hashlib.sha256(url.encode()).hexdigest()[:16] + ext
    rel = f"images/{name}"
    dest = IMG_DIR / name
    if dest.exists() and dest.stat().st_size > 0:
        cache[url] = rel
        mapping[url] = rel
        return rel
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "hcip-quiz-notes/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = resp.read()
        if len(data) < 32:
            raise OSError("too small")
        dest.write_bytes(data)
        cache[url] = rel
        mapping[url] = rel
        print(f"downloaded {rel} ({len(data)} bytes)", file=sys.stderr)
        return rel
    except Exception as exc:  # noqa: BLE001
        print(f"image miss {url}: {exc}", file=sys.stderr)
        cache[url] = url
        return url


def parse_bank(text: str) -> list[dict]:
    bank = None
    n_in_bank = 0
    cur = None
    questions = []

    def flush():
        nonlocal cur
        if not cur:
            return
        ans_raw = "\n".join([x for x in cur["answer_lines"] if x and x != "??"]).strip()
        urls = URL_RE.findall(ans_raw)
        for u in urls:
            ans_raw = ans_raw.replace(u, "").strip()
        ans_raw = re.sub(r"\s{2,}", " ", ans_raw).strip()
        questions.append(
            {
                "bank": cur["bank"],
                "n": cur["n"],
                "type": cur["type"],
                "stem": clean_space(cur["stem"]),
                "options": cur["options"],
                "answer_raw": ans_raw,
                "images_raw": cur["images_raw"],
                "answer_images_raw": cur["answer_images_raw"] + urls,
            }
        )
        cur = None

    for line in text.splitlines():
        if line.startswith("====="):
            flush()
            if "题库1" in line:
                bank = "H12-821"
                n_in_bank = 0
            elif "题库2" in line:
                bank = "H12-831"
                n_in_bank = 0
            continue
        if line.startswith("Q: "):
            flush()
            m = re.match(r"Q:\s*【([^】]+)】(.*)", line)
            if not m or not bank:
                raise SystemExit(f"bad question line: {line[:80]}")
            n_in_bank += 1
            cur = {
                "bank": bank,
                "n": n_in_bank,
                "type": m.group(1).strip(),
                "stem": m.group(2).strip(),
                "options": [],
                "answer_lines": [],
                "images_raw": [],
                "answer_images_raw": [],
            }
            continue
        if cur is None:
            continue
        if not line.strip():
            continue
        if line.startswith("A: "):
            cur["answer_lines"].append(line[3:].strip())
            continue
        if line.startswith("纠错"):
            cur["answer_images_raw"].extend(URL_RE.findall(line))
            continue
        if line.startswith("[图]"):
            rest = line[3:].strip()
            found = URL_RE.findall(rest)
            if found:
                cur["images_raw"].extend(found)
            continue
        m = OPT_RE.match(line)
        if m and not cur["answer_lines"]:
            cur["options"].append({"k": m.group(1), "t": clean_space(m.group(2))})
            continue
        if cur["answer_lines"]:
            if line.strip() in {"??", "正确答案"}:
                if line.strip() == "正确答案" and not cur["answer_lines"]:
                    cur["answer_lines"].append(line.strip())
                continue
            extra_urls = URL_RE.findall(line)
            if extra_urls:
                cur["answer_images_raw"].extend(extra_urls)
            continue
        # stem continuation (not expected)
        cur["stem"] = (cur["stem"] + line.strip()).strip()
    flush()
    return questions


def parse_keys(answer_raw: str) -> list[str]:
    keys = []
    for part in re.split(r"[；;]", answer_raw):
        m = re.match(r"\s*([A-H])[\.．、]", part.strip())
        if m:
            keys.append(m.group(1))
    return keys


def load_tf_fixes() -> dict[str, dict]:
    if not FIXES_PATH.exists():
        return {}
    data = json.loads(FIXES_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit("tf_fixes.json must be an object")
    return data


def make_note_lines(q: dict, fixes: dict[str, dict]) -> dict:
    stem = q["stem"]
    options = q["options"]
    raw = q["answer_raw"]
    keys = parse_keys(raw)
    by_key = {o["k"]: o["t"] for o in options}
    mode = judgment_mode(stem) if options and not is_tf(options) else None

    if options and is_tf(options) and keys:
        chosen = by_key.get(keys[0], "")
        truth = chosen.startswith("正") or chosen in {"对", "正确"}
        false = chosen.startswith("错") or chosen in {"错", "错误"}
        if truth or false:
            line = {"p": "yes" if truth else "no", "t": stem}
            if false:
                fix = fixes.get(q["id"])
                if fix and fix.get("hi") and fix.get("fix"):
                    line["hi"] = fix["hi"]
                    line["fix"] = fix["fix"]
            return {"lead": "", "lines": [line]}

    if q["type"] == "填空题" or (not options and raw and raw not in {"正确答案", "见解析", "（原站未给出有效答案）"} and not raw.startswith("见解析")):
        if raw and "见解析" not in raw and "未给出" not in raw and raw != "正确答案":
            return {
                "lead": "",
                "lines": [{"p": "yes", "t": fill_blanks(stem, raw)}],
            }

    if keys and options:
        selected = [k for k in keys if k in by_key]
        missing = [o["k"] for o in options if o["k"] not in selected]
        if mode == "right":
            lines = [{"p": "yes", "t": by_key[k]} for k in selected]
            lines += [{"p": "no", "t": by_key[k]} for k in missing]
            return {"lead": stem, "lines": lines}
        if mode == "wrong":
            lines = [{"p": "no", "t": by_key[k]} for k in selected]
            lines += [{"p": "yes", "t": by_key[k]} for k in missing]
            return {"lead": stem, "lines": lines}
        lines = [{"p": "answer", "t": f"{k}. {by_key[k]}"} for k in selected]
        return {"lead": stem, "lines": lines}

    # No extractable written conclusion.
    if raw in {"", "正确答案"} or raw.startswith("见解析") or "未给出" in raw:
        hint = "文字题库没有给出可单独摘录的结论"
        if q["answer_images_raw"] or raw.startswith("见解析") or raw == "正确答案":
            hint = "结论在配图中，文字题库没有另给可摘录句子"
        elif "未给出" in raw:
            hint = "原题库未给出有效文字答案"
        return {"lead": stem, "lines": [{"p": "gap", "t": hint}]}

    return {"lead": stem, "lines": [{"p": "answer", "t": raw}]}


def build(questions: list[dict], fixes: dict[str, dict] | None = None) -> dict:
    fixes = fixes if fixes is not None else load_tf_fixes()
    items_by_section: dict[tuple[str, str], list] = OrderedDict()
    topic_counts: dict[str, int] = defaultdict(int)

    for q in questions:
        opt_text = " ".join(o["t"] for o in q["options"])
        blob = norm(q["stem"] + " " + opt_text)
        topic, tags = primary_topic(q["stem"], opt_text)
        sid, stitle = subtopic_of(topic, blob)
        q["topic"] = topic
        q["tags"] = tags
        q["subtopic"] = sid
        q["subtopicTitle"] = stitle
        topic_counts[topic] += 1
        note = make_note_lines(q, fixes)
        images = list(q["images"])
        if any(line["p"] == "gap" for line in note["lines"]):
            for img in q["answerImages"]:
                if img not in images:
                    images.append(img)
        key = json.dumps(
            {
                "lead": note["lead"],
                "lines": note["lines"],
                "images": images,
            },
            ensure_ascii=False,
        )
        sec_key = (topic, sid)
        bucket = items_by_section.setdefault(sec_key, [])
        # merge identical assertions
        found = None
        for it in bucket:
            if it["_key"] == key:
                found = it
                break
        if found:
            found["qids"].append(q["id"])
        else:
            bucket.append(
                {
                    "_key": key,
                    "qids": [q["id"]],
                    "lead": note["lead"],
                    "lines": note["lines"],
                    "images": images,
                    "subTitle": stitle,
                    "subId": sid,
                }
            )

    notes = []
    for topic in TOPIC_ORDER:
        if topic_counts.get(topic, 0) == 0:
            continue
        # preserve SUBTOPICS order
        order = [s[0] for s in SUBTOPICS.get(topic, [("misc", "综合", [])])]
        sections = []
        for sid in order:
            bucket = items_by_section.get((topic, sid))
            if not bucket:
                continue
            clean = []
            for it in bucket:
                clean.append(
                    {
                        "qids": it["qids"],
                        "lead": it["lead"],
                        "lines": it["lines"],
                        "images": it["images"],
                    }
                )
            title = next(s[1] for s in SUBTOPICS.get(topic, []) if s[0] == sid)
            sections.append({"id": f"{topic}-{sid}", "title": title, "items": clean})
        # any unexpected sub ids
        for (tp, sid), bucket in items_by_section.items():
            if tp != topic:
                continue
            if any(sec["id"] == f"{topic}-{sid}" for sec in sections):
                continue
            sections.append(
                {
                    "id": f"{topic}-{sid}",
                    "title": bucket[0]["subTitle"],
                    "items": [
                        {
                            "qids": it["qids"],
                            "lead": it["lead"],
                            "lines": it["lines"],
                            "images": it["images"],
                        }
                        for it in bucket
                    ],
                }
            )
        notes.append(
            {
                "id": topic,
                "title": TOPIC_TITLE[topic],
                "count": topic_counts[topic],
                "sections": sections,
            }
        )

    public_questions = []
    for q in questions:
        public_questions.append(
            {
                "id": q["id"],
                "bank": q["bank"],
                "n": q["n"],
                "type": q["type"],
                "stem": q["stem"],
                "options": q["options"],
                "answerKeys": q["answerKeys"],
                "answerText": q["answerText"],
                "images": q["images"],
                "answerImages": q["answerImages"],
                "topic": q["topic"],
                "tags": q["tags"],
            }
        )

    topics = [
        {"id": t, "title": TOPIC_TITLE[t], "count": topic_counts[t]}
        for t in TOPIC_ORDER
        if topic_counts.get(t, 0)
    ]
    return {"questions": public_questions, "topics": topics, "notes": notes}


def attach_answers_and_ids(questions: list[dict], mapping: dict[str, str]) -> None:
    cache: dict[str, str] = {}
    for q in questions:
        code = "821" if q["bank"] == "H12-821" else "831"
        q["id"] = f"{code}-{q['n']}"
        q["stem"] = readable(q["stem"])
        for opt in q["options"]:
            opt["t"] = readable(opt["t"])
        q["images"] = [local_or_remote(u, mapping, cache) for u in q["images_raw"]]
        q["answerImages"] = [local_or_remote(u, mapping, cache) for u in dict.fromkeys(q["answer_images_raw"])]
        keys = parse_keys(q["answer_raw"])
        q["answerKeys"] = keys
        if keys and q["options"]:
            by_key = {o["k"]: o["t"] for o in q["options"]}
            parts = [f"{k}. {by_key.get(k, '')}".strip() for k in keys]
            q["answerText"] = "；".join(parts)
        elif q["answer_raw"]:
            q["answerText"] = q["answer_raw"]
        elif q["answerImages"]:
            q["answerText"] = "见配图"
        else:
            q["answerText"] = "（无文字答案）"


def validate(data: dict, fixes: dict[str, dict] | None = None) -> None:
    fixes = fixes if fixes is not None else load_tf_fixes()
    qs = data["questions"]
    assert len(qs) == 865, len(qs)
    assert sum(1 for q in qs if q["bank"] == "H12-821") == 486
    assert sum(1 for q in qs if q["bank"] == "H12-831") == 379
    ids = [q["id"] for q in qs]
    assert len(ids) == len(set(ids))
    covered = set()
    for topic in data["notes"]:
        for sec in topic["sections"]:
            assert sec["items"], sec["id"]
            for it in sec["items"]:
                assert it["lines"]
                for qid in it["qids"]:
                    covered.add(qid)
                for img in it["images"]:
                    if img.startswith("images/"):
                        path = ROOT / img
                        assert path.exists(), img
    missing = set(ids) - covered
    assert not missing, missing
    # image files referenced by questions
    for q in qs:
        for img in q["images"] + q["answerImages"]:
            if img.startswith("images/"):
                assert (ROOT / img).exists(), img
    by_id = {q["id"]: q for q in qs}
    false_ids = []
    for q in qs:
        opts = q["options"]
        if not (opts and is_tf(opts) and q["answerKeys"]):
            continue
        chosen = next((o["t"] for o in opts if o["k"] == q["answerKeys"][0]), "")
        if chosen.startswith("错") or chosen in {"错", "错误"}:
            false_ids.append(q["id"])
    missing_fix = [qid for qid in false_ids if qid not in fixes]
    extra_fix = sorted(set(fixes) - set(false_ids))
    assert not missing_fix, missing_fix
    assert not extra_fix, extra_fix
    noted = {}
    for topic in data["notes"]:
        for sec in topic["sections"]:
            for it in sec["items"]:
                for line in it["lines"]:
                    if line.get("hi") or line.get("fix"):
                        for qid in it["qids"]:
                            noted[qid] = line
    for qid in false_ids:
        line = noted.get(qid)
        stem = by_id[qid]["stem"]
        assert line and line["p"] == "no", qid
        hi = line["hi"]
        fix = line["fix"]
        assert hi and hi in stem, (qid, hi)
        assert stem.count(hi) >= 1
        assert fix and "\n" not in fix and len(fix) <= 90, (qid, fix)
        assert fix.endswith("。"), qid
    # spot-check a few known facts from the bank
    assert noted["821-10"]["hi"] == "二层VPN封装技术"
    assert "三层" in noted["821-10"]["fix"]
    assert by_id["821-1"]["answerKeys"] == ["B"]
    assert by_id["821-2"]["answerKeys"] == ["A"]
    # fill-in: default OSPF reference bandwidth 100
    fills = [q for q in qs if q["type"] == "填空题" and "缺省参考值" in q["stem"]]
    assert fills and fills[0]["answerText"] == "100"
    print(
        "ok",
        len(qs),
        "topics",
        [(t["id"], t["count"]) for t in data["topics"]],
        file=sys.stderr,
    )


def image_map_html() -> str:
    """Local image filenames live on the old quiz page (data-orig), not on
    the study page. Walk recent history so a rebuild does not re-download."""
    import subprocess
    try:
        revs = subprocess.check_output(
            ["git", "rev-list", "--max-count=30", "HEAD"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).split()
    except (subprocess.CalledProcessError, FileNotFoundError):
        revs = []
    for rev in revs:
        try:
            html = subprocess.check_output(
                ["git", "show", f"{rev}:index.html"],
                cwd=ROOT,
                text=True,
                stderr=subprocess.DEVNULL,
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
        if "data-orig" in html:
            return html
    if HTML_PATH.exists():
        return HTML_PATH.read_text(encoding="utf-8")
    return ""


def main() -> None:
    candidates = []
    if len(sys.argv) > 1:
        candidates.append(Path(sys.argv[1]))
    if os.environ.get("HCIP_QA"):
        candidates.append(Path(os.environ["HCIP_QA"]))
    candidates.append(Path("/home/ubuntu/.cursor/projects/workspace/uploads/togogo-qa_7d3d.txt"))
    src = next((p for p in candidates if p and p.exists()), None)
    if not src:
        raise SystemExit("question bank txt not found")
    html = image_map_html()
    mapping = load_image_map(html) if html else {}
    questions = parse_bank(src.read_text(encoding="utf-8"))
    attach_answers_and_ids(questions, mapping)
    fixes = load_tf_fixes()
    data = build(questions, fixes)
    validate(data, fixes)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT_PATH.write_text(
        "/* Generated by scripts/build_study_data.py from the togogo question bank.\n"
        "   Notes restate keyed answers only. Do not hand-edit. */\n"
        "window.STUDY_DATA=" + payload + ";\n",
        encoding="utf-8",
    )
    print(f"wrote {OUT_PATH} ({OUT_PATH.stat().st_size} bytes) from {src}", file=sys.stderr)


if __name__ == "__main__":
    main()
