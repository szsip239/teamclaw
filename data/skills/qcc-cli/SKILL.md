---
name: "qcc-cli"
description: "企查查官方 CLI — 企业工商、风险、知识产权、经营信息一站式查询。输入企业名称即可调用 67 个 API 获取注册信息、股东、高管、失信、行政处罚、专利、招投标、融资、舆情等全维度企业数据。触发场景：查企业、背调、尽调、风险排查、企业画像、商机分析、企业信用评估、供应商审查。使用 agent-browser 补充高管履历和地方互动等互联网信息。"
metadata: {"openclaw":{"requires":{"bins":["agent-browser"]}}}
allowed-tools: Bash(agent-browser:*), Bash(qcc:*)
---

# 企查查企业背调 + 互联网信息补充

面向电信政企客户经理的企业全维度信息搜集与商机分析工具。以企查查 API（qcc-cli）为主力数据源，agent-browser 互联网搜索为补充。

## 环境检测（首次运行必须执行）

```bash
which qcc && qcc check
which agent-browser
```

- `qcc` 不存在：`npm install -g qcc-agent-cli`
- `qcc` 配置缺失：`qcc init --authorization 'Bearer <token>'`（联系管理员获取 token）
- `agent-browser` 不存在：提醒用户安装 `npm install -g agent-browser && agent-browser install --with-deps`

## CLI 用法

所有命令统一格式，支持位置参数简写：

```bash
qcc <类别> <命令> "企业名称或统一社会信用代码"
# 等同于
qcc <类别> <命令> --searchKey "企业名称或统一社会信用代码"
```

加 `--json` 获取原始 JSON。

## 数据采集流程

收到企业名称 `{company}` 后，按以下三阶段执行。每阶段评估已获取信息，信息充分则跳过后续同类查询。

### 第一阶段：企查查结构化数据（主力）

#### 1. 企业基础信息

```bash
qcc company get_company_registration_info "{company}"
qcc company get_shareholder_info --json "{company}"
qcc company get_actual_controller "{company}"
qcc company get_key_personnel "{company}"
qcc company get_contact_info "{company}"
qcc company get_company_profile "{company}"
qcc company get_external_investments --json "{company}"
qcc company get_branches "{company}"
qcc company get_annual_reports --json "{company}"
```

> `get_annual_reports --json` 返回最近 3 年年报数据。从每条记录的 `社保信息.城镇职工基本养老保险` 字段提取参保人数（格式为 "NNN人"），用于生成趋势图表。

#### 2. 资质与荣誉标签

```bash
qcc operation get_qualifications "{company}"
qcc operation get_honor_info "{company}"
qcc operation get_ranking_list_info "{company}"
```

> 从资质证书中提取：高新技术企业、专精特新、DCMM、CS 认证等。
> 从荣誉信息中提取：独角兽、瞪羚、5G 工厂、制造业单项冠军等。
> 榜单数据可能很多（数百条），只取最近 1 年内的关键榜单。

#### 3. 近期动态

```bash
qcc company get_change_records "{company}"
qcc operation get_financing_records --json "{company}"
qcc operation get_recruitment_info "{company}"
qcc operation get_bidding_info "{company}"
qcc operation get_news_sentiment --json "{company}"
```

#### 4. 数字化与跨境评估

```bash
qcc ipr get_internet_service_info "{company}"
qcc operation get_import_export_credit "{company}"
```

> `get_internet_service_info` 返回 ICP 网站、APP、小程序、算法备案数量 — 直接反映企业 IT 投入深度。
> `get_import_export_credit` 有记录 = 有跨境业务 → 服贸通/SD-WAN/国际专线商机。

#### 5. 风险快筛（签约前必查）

```bash
qcc risk get_dishonest_info "{company}"
qcc risk get_business_exception "{company}"
qcc risk get_tax_abnormal "{company}"
qcc risk get_administrative_penalty "{company}"
```

> 失信/税务异常/经营异常 = **签约红线**，需在报告中醒目标注。

### 第二阶段：互联网信息补充（agent-browser）

企查查 API 不覆盖的非结构化信息，通过搜索引擎补充：

```bash
# 高管个人履历
agent-browser open "https://www.baidu.com/s?wd={company}+创始人+董事长+经历+毕业"
agent-browser snapshot -c

# 苏州本地关联
agent-browser open "https://www.baidu.com/s?wd={company}+苏州+工业园区"
agent-browser snapshot -c

# 战略合作签约
agent-browser open "https://www.baidu.com/s?wd={company}+战略合作+签约"
agent-browser snapshot -c

# 微信公众号文章
agent-browser open "https://wx.sogou.com/weixin?type=2&query={company}"
agent-browser snapshot -c

agent-browser close
```

> **仅搜索企查查无法覆盖的维度**：高管个人履历、苏州本地活动、地方政府互动、战略合作签约。
> 每次 `open` 后必须 `snapshot -c` 读取内容。完成后执行 `agent-browser close`。
> agent-browser 安全约束：仅使用 `open`、`snapshot`、`close`，禁止 `eval`、`fill`、`click`、`cookies` 等。

### 第三阶段：信息整合与商机分析

将两阶段数据整合后，按输出格式生成报告。

## 输出格式

严格按以下结构输出。**某小节没有搜索到信息则直接省略，不输出空内容或"暂无"。**

---

### 一、企业概况

#### 1.1 基础信息

- **基础信息**：{联系电话}、{地址}、{注册资本}（并列显示，用"、"隔开，不换行）
- **官网网址**：{官网链接}
- **企业业务**：{主营业务描述}
- **名录标签**：{高新技术企业、专精特新、独角兽等}（来源：`get_qualifications` + `get_honor_info`）
- **榜单标签**：{最近 1 年内的关键榜单，最多 5 条}（来源：`get_ranking_list_info`）
- **参保人数**：{最早年份数字}→{最新年份数字}人（从 `get_annual_reports --json` 提取各年度 `社保信息.城镇职工基本养老保险`，如 "2022:2392→2024:2801"）
- **股东及实际控制人**：{前 3 大股东}、实际控制人：{姓名}（并列显示，不换行）
- **核心人员**：{法人、董事、高管}（并列显示，不换行）
- **关联企业**：关联企业{数量}家，其中控制企业{数量}家（{最多 10 个名称}）、分支机构{数量}家（{最多 10 个名称}）、海外布局：{全球参控股企业名称}
- **数字化足迹**：ICP 备案网站{数量}个、APP{数量}个、小程序{数量}个、算法备案{数量}个（来源：`get_internet_service_info`）
- **跨境业务**：{海关信用等级、经营类别、跨境电商类型}（来源：`get_import_export_credit`，无记录则省略）

> **电话格式要求**：原样显示电话号码，不要格式化（如不要把 `4009282212` 格式化为 `400-928-2212`）

#### 股权结构

从 `get_shareholder_info --json` 提取股东名称和持股比例。前 5 大股东单独展示，其余合并为"其他"。

````
```echarts
{
  "title": { "text": "{company} 股权结构" },
  "tooltip": { "trigger": "item", "formatter": "{b}: {d}%" },
  "series": [{
    "type": "pie",
    "radius": ["35%", "65%"],
    "label": { "formatter": "{b}\n{d}%" },
    "data": [
      { "name": "刘建强", "value": 14.54 },
      { "name": "元禾控股", "value": 10.17 },
      { "name": "高鹏", "value": 4.66 },
      { "name": "暢城有限公司", "value": 3.52 },
      { "name": "其他", "value": 67.11 }
    ]
  }]
}
```
````

> 持股比例直接取 `持股比例` 字段（如 "14.54%"→14.54）。"其他"= 100 - 前 N 名之和。无股东数据则省略。

#### 对外投资版图

从 `get_external_investments --json` 提取被投企业名称、持股比例、认缴出资额。用矩形树图展示投资分布。

````
```echarts
{
  "title": { "text": "{company} 对外投资版图" },
  "tooltip": { "formatter": "{b}<br/>持股: {c}%" },
  "series": [{
    "type": "treemap",
    "data": [
      { "name": "康智思远(浙江)", "value": 100 },
      { "name": "康众医能(浙江)", "value": 51 },
      { "name": "杭州沧澜医疗", "value": 49.9 },
      { "name": "苏州康捷智造", "value": 100 },
      { "name": "温州承泰电子", "value": 40 }
    ],
    "label": { "formatter": "{b}\n{c}%" },
    "breadcrumb": { "show": false }
  }]
}
```
````

> value 用持股比例数字。无对外投资则省略此图。投资企业名称可适当缩短。

#### 1.2 近期动态

- **重要变更**：{最近一次地址/高管变动，说明变动前后对比}
- **融资动向**：{最新融资信息及趋势}（并列显示，不换行）
- **招聘动向**：{最新招聘发布时间、发布频次、主要岗位}（不换行）
- **招投标**：{仅显示「中标单位」角色的记录，注明涉及方、时间、金额}（并列显示，不换行）
- **主要客户**：{从招投标推断，优先关注政府、学校、医院、通信运营商}（并列显示，不换行）
- **近期新闻**：{2023 年起的新闻最多 5 条，越近越靠前}（并列显示，不换行）

> **招投标警告**：严禁显示"提及单位"或"投标单位"角色的记录，仅显示该企业作为中标单位的记录。

#### 1.3 其他互联网信息（来源：agent-browser）

- 企业简介、核心业务、产品优势和市场地位
- 高管（创始人、董事长、总经理、副总经理）的以往工作经历、毕业院校、社会职务、籍贯、发表过的主要观点
- 企业及高管参加苏州的活动，或参加高校活动的情况
- 企业与苏州地方政府、领导的互动情况
- 企业项目、战略合作签约，特别关注在苏州的合作签约

#### 1.4 风险提示

- **失信被执行人**：{有/无}（有则列出涉案金额、执行法院）
- **经营异常**：{有/无}（有则列出原因）
- **税务异常**：{有/无}
- **行政处罚**：{有则列出最近 3 条，含处罚机关和金额}

> 存在失信/税务异常/经营异常时，在此节开头用 ⚠️ 醒目标注。

---

### 二、融资历程追踪

从 `get_financing_records --json` 提取融资记录，按时间顺序整理。

**融资历程表**（文字）：

| 日期 | 轮次 | 金额 | 投资方 |
|------|------|------|--------|
| {YYYY-MM-DD} | {轮次} | {金额} | {投资方} |

**累计融资**: {总额}，**最新轮次**: {轮次}

**融资历程图表**（ECharts，金额为柱状图，按时间排列）：

````
```echarts
{
  "title": { "text": "{company} 融资历程" },
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["2009-09", "2010-09", "2013-06", "2017-10", "2021-01 IPO"], "axisLabel": { "rotate": 30 } },
  "yAxis": { "type": "value", "name": "万元" },
  "series": [{
    "name": "融资金额",
    "type": "bar",
    "data": [200, 1567.61, 3750.9, 8445.53, 44700],
    "label": { "show": true, "position": "top", "fontSize": 10 },
    "itemStyle": { "borderRadius": [4, 4, 0, 0] }
  }]
}
```
````

注意事项：
- 金额统一为万元（"4.47亿" → 44700，"200万美元" → 按当时汇率折算或标注原币种）
- x 轴标签为 "YYYY-MM 轮次"（如 "2017-10 战略轮"），适当旋转避免重叠
- 金额"未披露"的轮次不纳入图表，但在文字表格中列出
- 无融资记录则省略此章节

**融资信号评估**：
- 最近一轮距今：{N}个月
- 融资节奏：{密集/正常/停滞}
- 关键投资方：{知名机构列表}

---

### 三、经营健康度扫描

综合招聘动态 + 招投标 + 新闻舆情，判断企业当前经营活跃度。

**招聘活跃度**：近 6 个月发布 {N} 个岗位，主要方向：{技术研发/销售/制造}，重点城市：{城市}
**招投标活跃度**：近 2 年中标 {N} 次，主要客户：{客户}
**舆情概况**：共 {N} 条新闻，积极 {N} / 中立 {N} / 消极 {N}

**经营健康度评级**：
- 活跃度：{高/中/低}（综合招聘+招投标+新闻频率）
- 增长势能：{扩张/稳定/收缩}（依据：招聘增减、中标趋势、融资动态）
- 舆论风向：{正面/中性/负面}（依据：情感分布占比）

---

### 四、商机雷达

根据上文搜集的企业信息，按以下规则自动判断并输出适用的商机建议。**不满足触发条件的项目直接省略。**

| 商机 | 触发条件 | 标记 |
|------|----------|------|
| **V网团购** | 参保人数 > 10 人（无数据时提醒用户自行关注） | ✅ |
| **FTTR-B 套餐** | 参保人数 < 10 人 或 未找到参保人数 | ✅ |
| **组网专线** | 分支机构 ≥ 3 家 | ✅ |
| **服贸通 / SD-WAN / 国际专线** | 存在海外关联企业 或 `get_import_export_credit` 有记录 | ✅ |
| **天翼云 + 算力 + 专线入云 + 算力补贴** | AI/软件/研发型企业（依据：专利、软著、算法备案、经营范围） | ✅ |
| **CDN / 云安全 / WAF** | `get_internet_service_info` 备案网站+APP+小程序 ≥ 5 个 | ✅ |
| **5G 工业互联网 / 智慧储能** | 拥有制造基地（依据：经营范围含制造、荣誉含 5G 工厂） | ✅ |
| **生态合作提醒** | 招投标或新闻涉及政府或运营商 | ✅ |
| **其他建议** | 以上维度之外，根据企业特征推荐一条电信相关商机并给出理由 | ✅ |

---

## 命令全索引

### company — 企业信息（14 个接口）

| 命令 | 用途 |
|------|------|
| `get_company_registration_info` | **核心**：工商注册信息（法人、注册资本、成立日期、经营范围、参保人数） |
| `get_shareholder_info` | 股东构成、持股比例、认缴出资额 |
| `get_actual_controller` | 实际控制人 |
| `get_beneficial_owners` | 受益所有人（反洗钱/穿透监管） |
| `get_key_personnel` | 高管及主要人员 |
| `get_external_investments` | 对外投资企业、持股比例 |
| `get_branches` | 分支机构 |
| `get_change_records` | 工商变更记录 |
| `get_annual_reports` | 年度报告 |
| `get_listing_info` | 上市信息（股票代码、市值） |
| `get_company_profile` | 企业简介 |
| `get_contact_info` | 联系电话、邮箱、官网 |
| `get_tax_invoice_info` | 税号开票信息 |
| `verify_company_accuracy` | 名称+法人+信用代码三要素核验 |

### risk — 风险信息（34 个接口）

| 命令 | 用途 |
|------|------|
| `get_dishonest_info` | **重点**：失信被执行人 |
| `get_judgment_debtor_info` | 被执行人信息 |
| `get_high_consumption_restriction` | 限制高消费 |
| `get_case_filing_info` | 法院立案 |
| `get_judicial_documents` | 裁判文书 |
| `get_court_notice` | 法院公告 |
| `get_hearing_notice` | 开庭公告 |
| `get_administrative_penalty` | 行政处罚 |
| `get_environmental_penalty` | 环保处罚 |
| `get_equity_freeze` | 股权冻结 |
| `get_equity_pledge_info` | 股权出质 |
| `get_business_exception` | 经营异常 |
| `get_serious_violation` | 严重违法失信 |
| `get_tax_violation` | 税收违法 |
| `get_tax_arrears_notice` | 欠税公告 |
| `get_tax_abnormal` | 税务非正常户 |
| `get_bankruptcy_reorganization` | 破产重整 |
| `get_liquidation_info` | 清算信息 |
| `get_cancellation_record_info` | 注销备案 |
| `get_simple_cancellation_info` | 简易注销 |
| `get_judicial_auction` | 司法拍卖 |
| `get_chattel_mortgage_info` | 动产抵押 |
| `get_land_mortgage_info` | 土地抵押 |
| `get_guarantee_info` | 担保信息 |
| `get_default_info` | 债券/票据违约 |
| `get_stock_pledge_info` | 股权质押（上市公司） |
| `get_disciplinary_list` | 惩戒名单 |
| `get_exit_restriction` | 限制出境 |
| `get_terminated_cases` | 终本案件 |
| `get_pre_litigation_mediation` | 诉前调解 |
| `get_public_exhortation` | 公示催告 |
| `get_service_announcement` | 劳动仲裁公告 |
| `get_service_notice` | 送达公告 |
| `get_valuation_inquiry` | 资产询价评估 |

### ipr — 知识产权（6 个接口）

| 命令 | 用途 |
|------|------|
| `get_patent_info` | 专利信息 |
| `get_trademark_info` | 商标注册 |
| `get_software_copyright_info` | 软件著作权 |
| `get_copyright_work_info` | 作品著作权 |
| `get_standard_info` | 参与制定的标准 |
| `get_internet_service_info` | **重点**：ICP/APP/小程序/算法备案 — 反映 IT 投入深度 |

### operation — 经营信息（13 个接口）

| 命令 | 用途 |
|------|------|
| `get_bidding_info` | **重点**：招投标记录 |
| `get_news_sentiment` | 新闻舆情（含情感倾向） |
| `get_financing_records` | 融资记录 |
| `get_qualifications` | **重点**：资质证书（高新、专精特新、DCMM 等） |
| `get_honor_info` | **重点**：荣誉信息（独角兽、瞪羚、5G 工厂等） |
| `get_ranking_list_info` | **重点**：榜单信息（500 强、行业 TOP） |
| `get_recruitment_info` | 招聘信息 |
| `get_credit_evaluation` | 信用评级（纳税/海关） |
| `get_administrative_license` | 行政许可 |
| `get_spot_check_info` | 抽查检查 |
| `get_telecom_license` | 电信业务许可 |
| `get_import_export_credit` | **重点**：进出口信用 — 有记录则有跨境需求 |
| `get_company_announcement` | 上市公司公告 |

## 信息质量规则

1. **优先级**：优先选择与用户关注点直接相关且信息价值最高的内容
2. **信息整合**：多个来源涉及同一主题时整合为一段
3. **禁止编造**：只能根据 API 和搜索结果整理总结，禁止引入外部知识或无依据推测
4. **防止混淆**：严禁混入名称相近但不是目标企业的信息
5. **时效性**：2026 年信息优先展示，只关注 2023 年及之后的动态
6. **过滤噪音**：不提供劳动纠纷等诉讼信息，不提供高频重复性工商变更
7. **API 配额**：按需查询，不必全部调用 67 个接口

## 注意事项

1. **企业名称须精确**：使用全称（如"中国电信股份有限公司"而非"中国电信"），不确定时先用 `get_company_registration_info` 搜索确认
2. **数据时效**：大部分接口 T+0 实时更新，少数（裁判文书、专利）有 1-7 天延迟
3. **榜单数据量大**：`get_ranking_list_info` 可能返回数百条，只取最近 1 年内的关键榜单
