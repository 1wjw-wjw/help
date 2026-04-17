<script setup>
/**
 * 大屏主入口：按 1920×1080 设计稿等比缩放；数据来自 public/data 下 CSV；
 * ECharts 实例与 DOM 通过 panels/charts 映射，统一在 drawAll 中刷新。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import axios from 'axios';
import * as echarts from 'echarts';
import chinaGeoJsonRaw from 'echarts-countries-js/new-china.geojson?raw';

/** 设计稿基准尺寸，用于窗口缩放 */
const W = 1920;
const H = 1080;
/** 时间轴与多数图表的年份序列 2012–2024 */
const YEARS = Array.from({ length: 13 }, (_, i) => 2012 + i);
/** Top10 条形/排行等固定候选省份，再按当年老龄化率排序取前 10 */
const FIXED_TOP10_PROVINCES = ['河北', '山东', '四川', '江苏', '重庆', '吉林', '上海', '辽宁', '湖南', '黑龙江'];

/** 桑基图节点配色与顺序（老龄化→投入→产出 三阶段） */
const SANKEY_NODE_COLORS = {
  老龄化高: '#ff5252',
  老龄化中: '#ffab40',
  老龄化低: '#69f0ae',
  投入高: '#e040fb',
  投入中: '#448aff',
  投入低: '#26c6da',
  产出高: '#ff7043',
  产出中: '#ffee58',
  产出低: '#b2ff59'
};
const SANKEY_NODE_ORDER = ['老龄化高', '老龄化中', '老龄化低', '投入高', '投入中', '投入低', '产出高', '产出中', '产出低'];
/** 两侧等宽图例：左 4（老龄化三档 + 投入低），右 3（产出三档）；其余节点仅在图中着色 */
const SANKEY_LEGEND_LEFT_KEYS = ['老龄化高', '老龄化中', '老龄化低', '投入低'];
const SANKEY_LEGEND_RIGHT_KEYS = ['产出高', '产出中', '产出低'];

const chinaGeoJson = JSON.parse(chinaGeoJsonRaw);
/** 视口相对设计稿的缩放系数 */
const scale = ref(1);
const root = ref(null);
/** ready：数据与首帧图表就绪；year：地图/联动年份；cards：顶部四卡动画当前值 */
const state = reactive({
  ready: false,
  year: 2024,
  play: true,
  cards: { aging: 0, expense: 0, life: 0, distance: 0 },
  raw: {
    aging: [],
    center: [],
    u3: [],
    resident: [],
    medical: [],
    warning: [],
    mismatch: [],
    bootstrap: [],
    thresholdScan: [],
    robustScan: [],
    thresholdDiag: []
  }
});

/** 各图表容器 DOM 引用：map 中心地图，l1–l3 左列，r1–r3 右列，sankey 底部 */
const panels = {
  map: ref(null),
  l1: ref(null),
  l2: ref(null),
  l3: ref(null),
  r1: ref(null),
  r2: ref(null),
  r3: ref(null),
  sankey: ref(null)
};
/** 与 panels 同名的 ECharts 实例（在 safeInit 中创建） */
const charts = {};
/** 年份自动轮播定时器 */
let playTimer = null;
let resizeTimer = null;
let onResize = null;
let cardsRefreshTimer = null;
let isRefreshingCards = false;
const CARD_ANIM_MS = 3000;
const CARD_REFRESH_MS = 15000;

const moduleText = {
  l1: {
    explain: '该图用于识别“高压力低保障”与“高压力高保障”等结构差异。每个点代表一个省份在某一年“压力—保障”的相对位置。横向越高表示老龄化压力越大，纵向越高表示资源保障越强。点越偏离对角均衡区，说明供需适配偏差越明显。',
    conclusion: '中国资源问题不只是“总量不足”，更是“结构性错配”。老龄化压力上升后，部分省份进入失配加速阶段。重点风险并非均匀分布，呈现明显省域梯度差异。评估重点应从“有多少资源”转向“资源是否匹配需求”。'
  },
  l2: {
    explain: '该图展示单门槛搜索与稳健性检验的结果变化，用于判断老龄化压力是否存在“阶段分界”。两条曲线分别对应单门槛搜索与稳健性检验结果，峰值附近对应最优门槛区间。两条曲线趋势高度接近，说明门槛识别结果具有稳定性与可靠性。',
    conclusion: '最优单门槛值约为 0.149814（65 岁及以上人口占比）。门槛检验结果高度显著（F=74.567739，bootstrap p<0.01）。95% 置信区间为 [0.077647, 0.164765]，结果稳健可靠。省份一旦跨门槛，错配由“缓慢累积”转向“加速增强”阶段。'
  },
  l3: {
    explain: '该图从压力、保障、错配三个维度展示 2012—2024 年全国结构变化趋势。不单纯看总量规模，而是重点呈现三者之间的相对结构与演化关系。若错配层持续扩大，说明资源调整速度显著落后于老龄化需求变化。',
    conclusion: '老龄化压力重心移动速度明显快于资源保障重心调整速度。“需求先动、供给滞后”是医疗资源错配持续累积的核心原因。全国错配水平整体呈上升趋势，且区域间上升速度存在显著差异。东北地区错配程度抬升最为明显。'
  },
  map: {
    explain: '该图以颜色深浅表示各省绝对错配程度，颜色越深代表错配问题越突出。用于直观展示全国错配的空间分布、集聚特征与区域差异。可结合时间轴观察错配格局演化路径，比较不同年份空间格局变化。',
    conclusion: '2024 年中国省域资源错配呈现显著空间分异与局部集聚特征。高压力—低保障与高压力—高保障类型并存，治理需分类施策。省域治理思路应从“统一加量”转向“分型施策、结构纠偏”。'
  },
  r1: {
    explain: '该图以双轴曲线展示老龄化压力与资源保障的长期动态变化趋势。一条曲线反映需求压力变化，另一条反映资源供给能力变化。两条曲线间距越大，表示供需不匹配与失衡风险越高。',
    conclusion: '老龄化压力持续上升是驱动医疗资源错配的核心背景。资源保障具备风险缓冲作用，但对需求变化存在明显响应滞后。单纯依靠资源总量扩张无法自动消解结构性错配问题。'
  },
  r2: {
    explain: '该图展示当年绝对错配程度最高的 TOP10 省份，用于锁定重点干预对象。排名越靠前，表示错配问题越突出，短期风险干预优先级越高。可与地图联动，实现“风险强度 + 空间位置”一体化展示。',
    conclusion: '2024 年辽宁省已进入极高风险区间。上海、江苏、天津处于高风险区间。重庆、吉林、黑龙江、四川、山东等省份已接近高风险边缘。风险治理必须采用“分层预警、梯度响应、定向倾斜”策略。'
  },
  r3: {
    explain: '该图以雷达形式对比典型省份在多维度指标上的结构特征差异。面积大小不代表绝对优劣，形状差异直接反映短板来源与结构问题。用于识别“相同风险等级下，短板结构为何不同”的内在原因。',
    conclusion: '省份之间短板来源差异显著，无法用统一方案解决所有问题。部分省份短板在基层承载能力，部分在城乡卫生人力配置差距。精准化、差异化治理效果显著优于平均化、一刀切投入。'
  },
  sankey: {
    explain: '该图展示从门槛分组到风险等级的流向关系，反映风险演化路径。流量线条越粗，表示沿该路径转化的省份样本数量越多。用于识别高风险群体主要来自哪类门槛分组，便于分组干预。',
    conclusion: '随着 65 岁及以上人口占比从低组升至高组，错配指数持续大幅上升。错配指数从 Q1 到 Q4 呈清晰递增（-0.1807 → 0.6116）。预警体系应采用“门槛判定 + 错配水平”双维度联合识别。'
  },
  rank: {
    explain: '该图滚动展示年度错配最突出的 Top10 省份及差距幅度。用于大屏动态展示与答辩快速定位重点关注对象。与静态榜单形成互补，兼顾瞬时格局与持续监测需求。',
    conclusion: '风险治理重心应前移至高风险与边缘高风险省份。低风险省份应提前布局前瞻储备，避免跨门槛后被动应对。高风险与极高风险省份必须实施定向资源倾斜与结构性调整。'
  }
};
const openMenuKey = ref('');
const hoverInfo = reactive({ key: '', type: '' });
const modulePanelEls = {};
const popupPosition = reactive({ left: 0, top: 0, width: 340, maxHeight: 300 });
let hoverTimer = null;

const toggleModuleMenu = (key) => {
  openMenuKey.value = openMenuKey.value === key ? '' : key;
  if (!openMenuKey.value) {
    hoverInfo.key = '';
    hoverInfo.type = '';
  }
};
const openHoverInfo = (key, type) => {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverInfo.key = key;
  hoverInfo.type = type;
  nextTick(() => {
    updatePopupPosition(key);
  });
};
const closeHoverInfoSoon = () => {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    hoverInfo.key = '';
    hoverInfo.type = '';
  }, 120);
};
const keepHoverInfo = () => {
  if (hoverTimer) clearTimeout(hoverTimer);
};
const closeMenuOnOutsideClick = (evt) => {
  const target = evt?.target;
  if (!(target instanceof Element)) return;
  if (target.closest('.panel-info-control')) return;
  openMenuKey.value = '';
  hoverInfo.key = '';
  hoverInfo.type = '';
};
const popupVisible = (key) => !!key && hoverInfo.key === key && openMenuKey.value === key;
const setModulePanelEl = (key, el) => {
  if (el) modulePanelEls[key] = el;
};
const updatePopupPosition = (key) => {
  const panelEl = modulePanelEls[key];
  if (!panelEl) return;
  const rect = panelEl.getBoundingClientRect();
  const width = 340;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let left = rect.right + 14;
  let top = rect.top + 40;

  if (key === 'map') {
    left = rect.right + 16;
    top = rect.top + 50;
  } else if (['r1', 'r2', 'r3'].includes(key)) {
    left = rect.left - width - 24;
    top = rect.top + 40;
  } else if (['sankey', 'rank'].includes(key)) {
    left = rect.right - width - 8;
    top = rect.top - 196;
  }

  const margin = 8;
  const maxHeight = Math.min(300, viewportH - margin * 2);
  left = Math.max(margin, Math.min(left, viewportW - width - margin));
  top = Math.max(margin, Math.min(top, viewportH - maxHeight - margin));

  popupPosition.left = Math.round(left);
  popupPosition.top = Math.round(top);
  popupPosition.width = width;
  popupPosition.maxHeight = Math.round(maxHeight);
};
const popupStyle = computed(() => ({
  position: 'fixed',
  left: `${popupPosition.left}px`,
  top: `${popupPosition.top}px`,
  width: `${popupPosition.width}px`,
  maxHeight: `${popupPosition.maxHeight}px`
}));
const syncPopupPosition = () => {
  if (!hoverInfo.key || openMenuKey.value !== hoverInfo.key) return;
  updatePopupPosition(hoverInfo.key);
};
const panelLayerStyle = (key) => ((openMenuKey.value === key || hoverInfo.key === key) ? { zIndex: 5200 } : { zIndex: 1 });
const leftOverlayActive = computed(() => ['l1', 'l2', 'l3'].includes(hoverInfo.key) && openMenuKey.value === hoverInfo.key);
const rightOverlayActive = computed(() => ['r1', 'r2', 'r3'].includes(hoverInfo.key) && openMenuKey.value === hoverInfo.key);
const popupTitle = computed(() => (hoverInfo.type === 'conclusion' ? '研究结论' : '图表说明'));
const popupToneClass = computed(() => (hoverInfo.type === 'conclusion' ? 'popup-conclusion' : 'popup-explain'));
const popupText = computed(() => {
  if (!hoverInfo.key || !moduleText[hoverInfo.key]) return '';
  return hoverInfo.type === 'conclusion' ? moduleText[hoverInfo.key].conclusion : moduleText[hoverInfo.key].explain;
});
watch(() => [hoverInfo.key, openMenuKey.value], () => {
  nextTick(() => {
    syncPopupPosition();
  });
}, { flush: 'post' });

const GLOBAL_DEV_PORT = 5172;
const PROVINCES_DEV_PORT = 5174;
const asset = (relativePath) => `${import.meta.env.BASE_URL}${relativePath}`;

const switchToGlobalScreen = () => {
  const override = import.meta.env.VITE_GLOBAL_SCREEN_URL;
  if (override) {
    window.location.assign(override);
    return;
  }
  if (import.meta.env.DEV) {
    const { protocol, hostname } = window.location;
    window.location.assign(`${protocol}//${hostname}:${GLOBAL_DEV_PORT}/`);
    return;
  }
  window.location.assign('/global-screen/');
};

const switchToProvincesScreen = () => {
  const override = import.meta.env.VITE_PROVINCES_SCREEN_URL;
  if (override) {
    window.location.assign(override);
    return;
  }
  if (import.meta.env.DEV) {
    const { protocol, hostname } = window.location;
    window.location.assign(`${protocol}//${hostname}:${PROVINCES_DEV_PORT}/`);
    return;
  }
  window.location.assign('/province-screen/');
};

/** 安全解析数值，非法时返回 0 */
const num = (v) => {
  const n = Number.parseFloat(String(v ?? '').trim());
  return Number.isFinite(n) ? n : 0;
};
/** 省份名称归一化，便于与 GeoJSON / CSV 匹配 */
const pName = (n) => String(n ?? '').trim().replace(/省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区/g, '');
/** 简单 CSV 解析（首行为表头，逗号分隔） */
const parseCSV = (csv) => {
  const lines = csv.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
};

/** 老龄化长表：省 × 年 → 老龄化率 */
const agingRows = computed(() => {
  const rows = [];
  state.raw.aging.forEach((r) => {
    const p = pName(r['地区']);
    YEARS.forEach((y) => rows.push({ province: p, year: y, value: num(r[`${y}年`]) }));
  });
  return rows;
});
/** 快速查询：「省-年」→ 老龄化率 */
const agingMap = computed(() => {
  const m = new Map();
  agingRows.value.forEach((r) => m.set(`${r.province}-${r.year}`, r.value));
  return m;
});
/** 通用：「省-年」→ 整行记录（卫生/居民/医疗等表） */
const keyMap = (rows, pk, yk) => {
  const m = new Map();
  rows.forEach((r) => m.set(`${pName(r[pk])}-${num(r[yk])}`, r));
  return m;
};
const u3Map = computed(() => keyMap(state.raw.u3, '卫生资源配置_省份', '卫生资源配置_年份'));
const residentMap = computed(() => keyMap(state.raw.resident, '居民健康水平_省份', '居民健康水平_年份'));
const medicalMap = computed(() => keyMap(state.raw.medical, '医疗卫生水平_省份', '医疗卫生水平_年份'));
/** 人口重心表：年份 → 行（双重心经纬、距离等） */
const centerMap = computed(() => {
  const m = new Map();
  state.raw.center.forEach((r) => m.set(num(r['年份']), r));
  return m;
});

/** 关键预警省份 Top10（2024），缺失时回退到老龄化 Top10 */
const top10 = computed(() => {
  const mismatchByYear = state.raw.mismatch
    .filter((r) => num(r['年份']) === state.year)
    .map((r) => ({
      province: pName(r['省份']),
      value: num(r['绝对错配指数']),
      diff: num(r['方向性错配指数'])
    }))
    .filter((r) => r.province)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  if (mismatchByYear.length) return mismatchByYear;

  const warningRows = state.raw.warning
    .filter((r) => num(r['年份']) === 2024 || !('年份' in r))
    .map((r) => ({
      province: pName(r['省份']),
      value: num(r['绝对错配指数']),
      diff: num(r['方向性错配指数'])
    }))
    .filter((r) => r.province)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  if (warningRows.length) return warningRows;

  return FIXED_TOP10_PROVINCES
    .map((p) => {
      const now = agingMap.value.get(`${p}-${state.year}`) ?? 0;
      const old = agingMap.value.get(`${p}-2012`) ?? 0;
      return { province: p, value: now, diff: now - old };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
});
/** 底部滚动排行无缝循环：两份 Top10 拼接 */
const rankingLoop = computed(() => {
  const base = top10.value;
  return [...base, ...base];
});

const rankingLoopDisplay = computed(() => {
  const base = top10.value;
  if (!base.length) return [];
  const maxVal = Math.max(...base.map((r) => r.value), 0);
  const minVal = Math.min(...base.map((r) => r.value), maxVal);
  const span = Math.max(1e-6, maxVal - minVal);
  const withPct = base.map((r) => {
    const t = (r.value - minVal) / span;
    // Keep bars readable while preserving rank gap.
    const pct = 28 + t * 68;
    return { ...r, barPct: Math.min(96, Math.max(22, pct)) };
  });
  return [...withPct, ...withPct];
});

/** 顶部四卡固定展示 2024 年，数据均来自 CSV 聚合 */
const CARD_YEAR = 2024;

/** 第四卡：关键预警省份数量 */
const card4Metric = computed(() => {
  const highRisk = state.raw.warning.filter((r) => String(r['风险等级'] || '').includes('高风险'));
  const keyWarning = state.raw.warning.filter((r) => {
    const lv = String(r['风险等级'] || '');
    return lv.includes('高风险') || lv.includes('极高风险');
  });
  const count = keyWarning.length || highRisk.length || state.raw.warning.length;
  return { value: count, decimals: 0, labelRest: '关键预警省份数量（个）' };
});

/** 顶部四卡目标值（全国均值等，供 growCards 缓动） */
const cardTarget = computed(() => {
  const provinces = [...new Set(agingRows.value.map((r) => r.province))];
  const y = CARD_YEAR;
  const aging = provinces.reduce((s, p) => s + (agingMap.value.get(`${p}-${y}`) ?? 0), 0) / (provinces.length || 1);
  const u3Rows = state.raw.u3.filter((r) => num(r['卫生资源配置_年份']) === y);
  const expense = u3Rows.reduce((s, r) => s + num(r['财力投入_人均卫生费用/元']), 0) / (u3Rows.length || 1);
  const rsRows = state.raw.resident.filter((r) => num(r['居民健康水平_年份']) === y);
  const life = rsRows.reduce((s, r) => s + num(r['总体健康水平_人口平均预期寿命（岁）']), 0) / (rsRows.length || 1);
  return { aging, expense, life, distance: card4Metric.value.value };
});

const haversineKm = (lon1, lat1, lon2, lat2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const buildAgingWideRows = (rows) => {
  const byProv = new Map();
  rows.forEach((r) => {
    const province = pName(r['省份']);
    const year = num(r['年份']);
    if (!province || !year) return;
    if (!byProv.has(province)) byProv.set(province, { 地区: province });
    byProv.get(province)[`${year}年`] = num(r['65岁及以上人口占比']) * 100;
  });
  return [...byProv.values()];
};

const buildCenterRows = (rows) => {
  return YEARS.map((year) => {
    const yearRows = rows.filter((r) => num(r['年份']) === year);
    let medW = 0;
    let ageW = 0;
    let medLon = 0;
    let medLat = 0;
    let ageLon = 0;
    let ageLat = 0;
    yearRows.forEach((r) => {
      const province = pName(r['省份']);
      const coord = provinceCoord[province];
      if (!coord) return;
      const med = Math.max(0, num(r['卫生人员数/万人']) || num(r['医疗卫生机构床位数/张']));
      const age = Math.max(0, num(r['65岁及以上人口占比']));
      medW += med;
      ageW += age;
      medLon += coord[0] * med;
      medLat += coord[1] * med;
      ageLon += coord[0] * age;
      ageLat += coord[1] * age;
    });
    const medCenterLon = medW ? medLon / medW : 105;
    const medCenterLat = medW ? medLat / medW : 35;
    const ageCenterLon = ageW ? ageLon / ageW : 105;
    const ageCenterLat = ageW ? ageLat / ageW : 35;
    return {
      年份: year,
      重心经度_医疗: medCenterLon,
      重心纬度_医疗: medCenterLat,
      重心经度_老龄: ageCenterLon,
      重心纬度_老龄: ageCenterLat,
      重心距离_km: haversineKm(medCenterLon, medCenterLat, ageCenterLon, ageCenterLat),
      总权重_医疗: medW,
      总权重_老龄: ageW
    };
  });
};

/** 老龄化率分档（与地图 choropleth、左上散点图例一致）；最高档 max 放宽以覆盖 >21.9% 的省份 */
const AGING_RATE_VISUAL_PIECES = [
  { min: 18.5, max: 100, color: '#a855f7', label: '18.5%-21.9%' },
  { min: 15.1, max: 18.5, color: '#dc2626', label: '15.1%-18.5%' },
  { min: 11.7, max: 15.1, color: '#16a34a', label: '11.7%-15.1%' },
  { min: 8.4, max: 11.7, color: '#38bdf8', label: '8.4%-11.7%' },
  { min: 0, max: 8.4, color: '#ffffff', label: '5.0%-8.4%' }
];

/** 5 档老龄化率色阶：紫(最高)→红→绿→浅蓝→白(最低)；低于 5% 仍按最低档白色填色（与 CSV 一致） */
const mapLevelColor = (v) => {
  const x = Number.isFinite(v) ? v : 0;
  if (x >= 18.5) return '#a855f7';
  if (x >= 15.1) return '#dc2626';
  if (x >= 11.7) return '#16a34a';
  if (x >= 8.4) return '#38bdf8';
  return '#ffffff';
};

/** 各省省会近似经纬度，用于地图 effectScatter 装饰点 */
const provinceCoord = {
  北京: [116.4, 39.9], 天津: [117.2, 39.12], 河北: [114.48, 38.03], 山西: [112.55, 37.87], 内蒙古: [111.67, 40.82],
  辽宁: [123.43, 41.8], 吉林: [125.32, 43.9], 黑龙江: [126.64, 45.75], 上海: [121.47, 31.23], 江苏: [118.78, 32.04],
  浙江: [120.15, 30.28], 安徽: [117.27, 31.86], 福建: [119.3, 26.08], 江西: [115.89, 28.67], 山东: [117, 36.65],
  河南: [113.62, 34.75], 湖北: [114.31, 30.52], 湖南: [112.93, 28.23], 广东: [113.27, 23.13], 广西: [108.32, 22.82],
  海南: [110.35, 20.02], 重庆: [106.55, 29.57], 四川: [104.07, 30.67], 贵州: [106.71, 26.57], 云南: [102.71, 25.04],
  西藏: [91.13, 29.65], 陕西: [108.95, 34.27], 甘肃: [103.84, 36.06], 青海: [101.78, 36.62], 宁夏: [106.28, 38.47],
  新疆: [87.62, 43.82], 香港: [114.17, 22.28], 澳门: [113.55, 22.2], 台湾: [121.5, 25.03]
};

const fmt = (v, f = 2) => Number(v || 0).toFixed(f);
/** 顶部 KPI 数字缓动到 cardTarget */
const growCards = (durationMs = CARD_ANIM_MS, fromZero = false) => {
  const t0 = performance.now();
  const d = durationMs;
  const start = fromZero
    ? { aging: 0, expense: 0, life: 0, distance: 0 }
    : { ...state.cards };
  if (fromZero) {
    state.cards.aging = 0;
    state.cards.expense = 0;
    state.cards.life = 0;
    state.cards.distance = 0;
  }
  const target = cardTarget.value;
  const step = (ts) => {
    const p = Math.min(1, (ts - t0) / d);
    const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    state.cards.aging = start.aging + (target.aging - start.aging) * e;
    state.cards.expense = start.expense + (target.expense - start.expense) * e;
    state.cards.life = start.life + (target.life - start.life) * e;
    state.cards.distance = start.distance + (target.distance - start.distance) * e;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

/** 按窗口短边适配 1920×1080 舞台 */
const updateScale = () => {
  const sx = window.innerWidth / W;
  const sy = window.innerHeight / H;
  scale.value = Math.min(sx, sy);
};

/** 容器尺寸有效时懒创建 ECharts（SVG 渲染） */
const safeInit = (name) => {
  const el = panels[name].value;
  if (!el || el.clientWidth < 20 || el.clientHeight < 20) return;
  if (!charts[name]) charts[name] = echarts.init(el, null, { renderer: 'svg' });
};
/** 注册中国地图 GeoJSON 并初始化全部图表实例 */
const initCharts = () => {
  echarts.registerMap('china', chinaGeoJson);
  Object.keys(panels).forEach(safeInit);
};

/** 中心地图：分级设色 + 省会散点 + 双重心迁徙线（医疗/老龄） */
const mapOption = () => {
  const y = state.year;
  const provinces = [...new Set(agingRows.value.map((r) => r.province))];
  const mapData = provinces.map((p) => ({ name: p, value: agingMap.value.get(`${p}-${y}`) ?? 0, itemStyle: { areaColor: mapLevelColor(agingMap.value.get(`${p}-${y}`) ?? 0) } }));
  const centerFlow = YEARS.slice(1).map((yr) => ({
    coords: [
      [num(centerMap.value.get(yr - 1)?.['重心经度_医疗']), num(centerMap.value.get(yr - 1)?.['重心纬度_医疗'])],
      [num(centerMap.value.get(yr)?.['重心经度_医疗']), num(centerMap.value.get(yr)?.['重心纬度_医疗'])]
    ]
  }));
  const agingFlow = YEARS.slice(1).map((yr) => ({
    coords: [
      [num(centerMap.value.get(yr - 1)?.['重心经度_老龄']), num(centerMap.value.get(yr - 1)?.['重心纬度_老龄'])],
      [num(centerMap.value.get(yr)?.['重心经度_老龄']), num(centerMap.value.get(yr)?.['重心纬度_老龄'])]
    ]
  }));
  return {
    animationDuration: 7000,
    animationDurationUpdate: 7000,
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params) => {
        if (!params || params.seriesType !== 'map') return '';
        const p = pName(params.name);
        const u = u3Map.value.get(`${p}-${y}`) || {};
        return `${params.name}<br/>老龄化率: ${fmt(params.value)}%<br/>床位数: ${Math.round(num(u['物力资源_医疗卫生机构床位数/张']))}<br/>医师数: ${Math.round(num(u['人才资源_执业医师数/人']))}<br/>人均卫生费用: ${fmt(num(u['财力投入_人均卫生费用/元']), 0)}元`;
      }
    },
    visualMap: {
      type: 'piecewise',
      orient: 'horizontal',
      left: 10,
      top: 4,
      itemWidth: 30,
      itemHeight: 20,
      itemGap: 8,
      textStyle: { color: '#d8f2ff', fontSize: 14 },
      padding: [4, 6, 4, 6],
      pieces: AGING_RATE_VISUAL_PIECES,
      hoverLink: false
    },
    geo: {
      map: 'china',
      roam: false,
      layoutCenter: ['50%', '45%'],
      layoutSize: '108%',
      top: 54,
      bottom: 92,
      itemStyle: { borderColor: '#59d2ff', borderWidth: 1.2, areaColor: '#061a33', shadowColor: 'rgba(72,154,255,0.8)', shadowBlur: 16 },
      emphasis: { itemStyle: { areaColor: '#1e5e8f' }, label: { color: '#fff200', fontWeight: 'bold' } },
      label: { show: true, color: '#fff200', fontWeight: 'bold', fontSize: 11, textBorderColor: '#0a1628', textBorderWidth: 1.5 }
    },
    series: [
      {
        type: 'map',
        geoIndex: 0,
        data: mapData,
        label: { show: true, color: '#fff200', fontWeight: 'bold', fontSize: 11, textBorderColor: '#0a1628', textBorderWidth: 1.5 }
      },
      {
        type: 'effectScatter',
        coordinateSystem: 'geo',
        silent: true,
        rippleEffect: { scale: 2.4, brushType: 'stroke' },
        symbolSize: 5,
        itemStyle: { color: '#74dcff' },
        data: provinces.slice(0, 30).map((p) => ({ name: p, value: [...(provinceCoord[p] || [105, 35]), agingMap.value.get(`${p}-${y}`) ?? 0] }))
      },
      {
        type: 'lines',
        coordinateSystem: 'geo',
        silent: true,
        effect: { show: false },
        lineStyle: { color: '#46b7ff', width: 2, opacity: 0.9, curveness: 0.25 },
        data: centerFlow
      },
      {
        type: 'lines',
        coordinateSystem: 'geo',
        silent: true,
        effect: { show: false },
        lineStyle: { color: '#ff992f', width: 2, opacity: 0.9, curveness: 0.25 },
        data: agingFlow
      }
    ]
  };
};

/** 左/右列小图默认网格边距（部分图表会覆盖 left/right） */
const gridSmall = { left: 44, right: 18, top: 30, bottom: 32, containLabel: true };
/** 全量替换 option，避免与旧配置合并出错 */
const optMerge = { notMerge: true, lazyUpdate: true };
let drawAllRaf = 0;
/** 数据或年份变化时刷新所有图表（地图 + 左三 + 右三 + 桑基） */
const drawAll = () => {
  if (!charts.map) return;
  const y = state.year;
  const provinces = [...new Set(agingRows.value.map((r) => r.province))];
  const yearU3 = state.raw.u3.filter((r) => num(r['卫生资源配置_年份']) === y);
  charts.map.setOption(mapOption(), optMerge);

  // 左上：老龄化率 × 人均卫生费用散点（气泡大小与人口权重相关）
  charts.l1.setOption({
    animationDuration: 900,
    animationDurationUpdate: 900,
    animationEasingUpdate: 'cubicOut',
    grid: { ...gridSmall, left: 118 },
    visualMap: {
      type: 'piecewise',
      orient: 'vertical',
      left: 4,
      top: 'center',
      dimension: 0,
      seriesIndex: 0,
      textStyle: { color: '#d8f2ff', fontSize: 10 },
      itemWidth: 11,
      itemHeight: 11,
      itemSymbol: 'circle',
      itemGap: 6,
      pieces: AGING_RATE_VISUAL_PIECES
    },
    xAxis: { type: 'value', name: '老龄化率(%)', axisLabel: { color: '#bee9ff' } },
    yAxis: { type: 'value', name: '人均卫生费用(元)', axisLabel: { color: '#bee9ff' } },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: 'rgba(8, 18, 42, 0.94)',
      borderColor: 'rgba(46, 200, 207, 0.45)',
      borderWidth: 1,
      textStyle: { color: '#e8f4ff', fontSize: 12 },
      formatter: (p) => `${p.value[3]}<br/>压力指数:${fmt(p.value[0])}<br/>保障指标:${fmt(p.value[1], 0)}`
    },
    series: [{
      type: 'scatter',
      data: provinces.map((p) => {
        const a = agingMap.value.get(`${p}-${y}`) ?? 0;
        const u = u3Map.value.get(`${p}-${y}`) || {};
        const pop = num(centerMap.value.get(y)?.['总权重_老龄']) * a / 100;
        return [a, num(u['财力投入_人均卫生费用/元']), pop, p];
      }),
      symbolSize: (v) => Math.max(14, Math.sqrt(v[2]) * 3.2),
      itemStyle: { borderColor: 'rgba(89, 210, 255, 0.5)', borderWidth: 1 },
      emphasis: { scale: 1.35 }
    }]
  }, optMerge);

  // 左中：医疗 / 老龄双重心经纬轨迹；坐标轴范围按数据加 padding，避免轨迹缩成一点
  const thresholdRows = state.raw.thresholdScan
    .map((r) => ({ t: num(r['threshold']), r2: num(r['adj_r2']) }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.r2))
    .sort((a, b) => a.t - b.t);
  const robustRows = state.raw.robustScan
    .map((r) => ({ t: num(r['threshold']), r2: num(r['adj_r2']) }))
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.r2))
    .sort((a, b) => a.t - b.t);
  const thresholdStep = Math.max(1, Math.floor(thresholdRows.length / 10) || 1);
  const robustStep = Math.max(1, Math.floor(robustRows.length / 10) || 1);
  charts.l2.setOption({
    animationDuration: 1800,
    animationDurationUpdate: 1800,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    legend: { top: 4, textStyle: { color: '#d7f2ff' } },
    grid: gridSmall,
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: {
        type: 'line',
        lineStyle: { color: 'rgba(120, 220, 255, 0.65)', width: 1.2 }
      },
      backgroundColor: 'rgba(8, 18, 42, 0.94)',
      borderColor: 'rgba(46, 200, 207, 0.45)',
      borderWidth: 1,
      textStyle: { color: '#e8f4ff', fontSize: 12 },
      formatter: (params) => {
        const p0 = params?.[0];
        const p1 = params?.[1];
        const threshold = p0?.value?.[0] ?? p1?.value?.[0] ?? '-';
        const r2a = p0?.value?.[1];
        const r2b = p1?.value?.[1];
        const aText = Number.isFinite(r2a) ? Number(r2a).toFixed(4) : '-';
        const bText = Number.isFinite(r2b) ? Number(r2b).toFixed(4) : '-';
        return `门槛值: ${threshold}<br/>单门槛搜索: ${aText}<br/>稳健性搜索: ${bText}`;
      }
    },
    xAxis: {
      type: 'value',
      name: '门槛值',
      scale: true,
      axisLabel: { color: '#c5ecff' }
    },
    yAxis: {
      type: 'value',
      name: '拟合优度(adj R²)',
      scale: true,
      axisLabel: { color: '#c5ecff' }
    },
    series: [
      {
        name: '单门槛搜索',
        type: 'line',
        data: thresholdRows.map((r) => [r.t, r.r2]),
        smooth: 0.18,
        showSymbol: true,
        showAllSymbol: true,
        symbol: 'circle',
        sampling: 'none',
        lineStyle: { color: '#39b5ff', width: 2.4 },
        itemStyle: { color: '#39b5ff' },
        symbolSize: (_val, params) => (params.dataIndex % thresholdStep === 0 ? 7 : 0),
        emphasis: {
          focus: 'none',
          lineStyle: { width: 3 },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1, shadowBlur: 10, shadowColor: 'rgba(57,181,255,0.55)' }
        },
        blur: {
          lineStyle: { opacity: 1 },
          itemStyle: { opacity: 1 }
        }
      },
      {
        name: '稳健性搜索',
        type: 'line',
        data: robustRows.map((r) => [r.t, r.r2]),
        smooth: 0.18,
        showSymbol: true,
        showAllSymbol: true,
        symbol: 'circle',
        sampling: 'none',
        lineStyle: { color: '#ff9f33', width: 2.4 },
        itemStyle: { color: '#ff9f33' },
        symbolSize: (_val, params) => (params.dataIndex % robustStep === 0 ? 7 : 0),
        emphasis: {
          focus: 'none',
          lineStyle: { width: 3 },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1, shadowBlur: 10, shadowColor: 'rgba(255,159,51,0.55)' }
        },
        blur: {
          lineStyle: { opacity: 1 },
          itemStyle: { opacity: 1 }
        }
      }
    ]
  }, optMerge);

  // 左下：全国医疗资源结构堆叠柱（物力 / 人才 / 财力）
  const stack = YEARS.map((yr) => {
    const rows = state.raw.u3.filter((r) => num(r['卫生资源配置_年份']) === yr);
    return {
      year: yr,
      a: rows.reduce((s, r) => s + num(r['物力资源_医疗卫生机构床位数/张']), 0) / 10000,
      b: rows.reduce((s, r) => s + num(r['人才资源_执业医师数/人']) + num(r['人才资源_注册护士数/人']), 0) / 10000,
      c: rows.reduce((s, r) => s + num(r['财力投入_医疗卫生机构事业收入/亿元']), 0)
    };
  });
  const maxA = Math.max(...stack.map((v) => v.a), 0);
  const maxB = Math.max(...stack.map((v) => v.b), 0);
  const maxC = Math.max(...stack.map((v) => v.c), 0);
  const scaleSeries = (val, max) => (max > 0 ? (val / max) * 100 : 0);
  charts.l3.setOption({
    animationDurationUpdate: 3200, legend: { top: 4, textStyle: { color: '#d7f2ff' } }, grid: gridSmall,
    xAxis: { type: 'category', data: YEARS, axisLabel: { color: '#bfe8ff' } },
    yAxis: { type: 'value', axisLabel: { color: '#bfe8ff' }, name: '标准化指数' },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const idx = params?.[0]?.dataIndex ?? 0;
        const raw = stack[idx] || { a: 0, b: 0, c: 0, year: YEARS[idx] };
        return `${raw.year}<br/>物力资源: ${raw.a.toFixed(2)}<br/>人才资源: ${raw.b.toFixed(2)}<br/>财力投入: ${raw.c.toFixed(2)}`;
      }
    },
    series: [
      { name: '物力资源', type: 'bar', stack: 't', data: stack.map((v) => scaleSeries(v.a, maxA)), itemStyle: { color: '#6ad7ff' } },
      { name: '人才资源', type: 'bar', stack: 't', data: stack.map((v) => scaleSeries(v.b, maxB)), itemStyle: { color: '#8c79ff' } },
      { name: '财力投入', type: 'bar', stack: 't', data: stack.map((v) => scaleSeries(v.c, maxC)), itemStyle: { color: '#ff9f33' } }
    ]
  }, optMerge);

  // 右上：需求（死亡率代理）× 供给（卫生人员数）双 Y 轴折线
  const demand = YEARS.map((yr) => {
    const rows = state.raw.resident.filter((r) => num(r['居民健康水平_年份']) === yr);
    return rows.reduce((s, r) => s + num(r['总体健康水平_人口死亡率']), 0) / (rows.length || 1);
  });
  const supply = YEARS.map((yr) => {
    const rows = state.raw.u3.filter((r) => num(r['卫生资源配置_年份']) === yr);
    return rows.reduce((s, r) => s + num(r['人才资源_卫生人员数/万人']), 0) / (rows.length || 1);
  });
  charts.r1.setOption({
    animationDurationUpdate: 7000, legend: { top: 2, textStyle: { color: '#d7f2ff' } }, grid: { ...gridSmall, left: 36, right: 40 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      axisPointer: { type: 'line', lineStyle: { color: 'rgba(120, 220, 255, 0.65)', width: 1.2 } },
      backgroundColor: 'rgba(8, 18, 42, 0.94)',
      borderColor: 'rgba(46, 200, 207, 0.45)',
      borderWidth: 1,
      textStyle: { color: '#e8f4ff', fontSize: 12 }
    },
    xAxis: { type: 'category', data: YEARS, axisLabel: { color: '#bfe8ff', fontSize: 10 } },
    yAxis: [
      { type: 'value', alignTicks: false, axisLabel: { color: '#ffbc72', fontSize: 10 } },
      { type: 'value', alignTicks: false, axisLabel: { color: '#77ceff', fontSize: 10 } }
    ],
    series: [
      {
        type: 'line',
        name: '需求水平',
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 5,
        data: demand,
        lineStyle: { color: '#ff9f33', width: 2.5 },
        itemStyle: { color: '#ff9f33' },
        areaStyle: { color: 'rgba(255,159,51,0.15)' },
        emphasis: {
          focus: 'none',
          lineStyle: { width: 3 },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1, shadowBlur: 10, shadowColor: 'rgba(255,159,51,0.55)' }
        }
      },
      {
        type: 'line',
        name: '供给水平',
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 5,
        yAxisIndex: 1,
        data: supply,
        lineStyle: { color: '#46bcff', width: 2.5 },
        itemStyle: { color: '#46bcff' },
        areaStyle: { color: 'rgba(70,188,255,0.15)' },
        emphasis: {
          focus: 'none',
          lineStyle: { width: 3 },
          itemStyle: { borderColor: '#ffffff', borderWidth: 1, shadowBlur: 10, shadowColor: 'rgba(70,188,255,0.55)' }
        }
      }
    ]
  }, optMerge);

  // 右中：当前年老龄化率 Top10 横向条形图
  charts.r2.setOption({
    animationDuration: 900,
    animationDurationUpdate: 900,
    animationEasingUpdate: 'quarticOut',
    grid: { left: 52, right: 52, top: 24, bottom: 24, containLabel: true },
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: 'rgba(8, 18, 42, 0.94)',
      borderColor: 'rgba(46, 200, 207, 0.45)',
      borderWidth: 1,
      textStyle: { color: '#e8f4ff', fontSize: 12 },
      formatter: (p) => {
        const name = p?.name ?? '';
        const value = Number(p?.value ?? 0).toFixed(3);
        return `${name}<br/>绝对错配指数: ${value}`;
      }
    },
    xAxis: { type: 'value', axisLabel: { color: '#bfe8ff', fontSize: 10 } },
    yAxis: { type: 'category', data: top10.value.map((d) => d.province), axisLabel: { color: '#d8f4ff', fontSize: 11 } },
    series: [{
      type: 'bar',
      barWidth: 12,
      barCategoryGap: '42%',
      data: top10.value.map((d) => Number(d.value.toFixed(3))),
      label: {
        show: true,
        position: 'right',
        color: '#fff',
        fontSize: 10,
        formatter: ({ value }) => Number(value).toFixed(3)
      },
      itemStyle: { color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [{ offset: 0, color: '#2f8cff' }, { offset: 1, color: '#67deff' }]) },
      emphasis: {
        focus: 'none',
        itemStyle: {
          borderColor: '#ffffff',
          borderWidth: 1,
          shadowBlur: 12,
          shadowColor: 'rgba(80, 200, 255, 0.55)'
        }
      }
    }]
  }, optMerge);

  // 右下：Top5 省资源配置雷达；各轴 max 按五省最大值动态计算，避免折线超出网格
  const top5 = top10.value.slice(0, 5).map((d) => d.province);
  const radarRows = top5.map((p) => {
    const u = u3Map.value.get(`${p}-${y}`) || {};
    const m = medicalMap.value.get(`${p}-${y}`) || {};
    return [
      num(u['物力资源_医疗卫生机构床位数/张']) / 100,
      num(u['人才资源_执业医师数/人']) / 100,
      num(u['财力投入_人均卫生费用/元']),
      num(u['服务能力_诊疗人次数/万人次']),
      num(m['医疗设施_基层医疗卫生机构数/个']),
      num(m['医疗设施_三甲医院数/个'])
    ];
  });
  const radarPadMax = (dimIdx) => {
    const m = Math.max(...radarRows.map((row) => row[dimIdx]), 0);
    if (m <= 0) return 1;
    return Math.ceil(m * 1.22 * 1000) / 1000;
  };
  const radarIndicator = [
    { name: '床位数/万人', max: radarPadMax(0) },
    { name: '执业医师/万人', max: radarPadMax(1) },
    { name: '人均卫生费用', max: radarPadMax(2) },
    { name: '诊疗人次/万人', max: radarPadMax(3) },
    { name: '基层机构数', max: radarPadMax(4) },
    { name: '三甲医院数', max: radarPadMax(5) }
  ];
  charts.r3.setOption({
    animationDurationUpdate: 7000,
    tooltip: { trigger: 'item', confine: true },
    legend: {
      top: 4,
      left: 'center',
      orient: 'horizontal',
      itemWidth: 10,
      itemHeight: 8,
      itemGap: 8,
      textStyle: { color: '#d7f2ff', fontSize: 9 }
    },
    radar: {
      center: ['50%', '56%'],
      radius: '66%',
      axisNameGap: 10,
      splitNumber: 4,
      indicator: radarIndicator,
      axisName: { color: '#ddf6ff', fontSize: 9 },
      splitLine: { lineStyle: { color: '#2d628f' } },
      splitArea: { areaStyle: { color: ['rgba(18,52,94,0.25)'] } }
    },
    series: [{
      type: 'radar',
      data: top5.map((p, i) => ({
        name: p,
        value: radarRows[i].map((v) => (Number.isFinite(v) ? v : 0)),
        areaStyle: { color: `rgba(${76 + i * 30},${173 - i * 10},255,0.18)` }
      }))
    }]
  }, optMerge);

  // 底部：按「省→老龄化档/投入档/产出档」统计频次，生成桑基节点与边
  const flows = {};
  yearU3.forEach((r) => {
    const p = pName(r['卫生资源配置_省份']);
    const a = agingMap.value.get(`${p}-${y}`) ?? 0;
    const expense = num(r['财力投入_人均卫生费用/元']);
    const output = num(r['服务能力_诊疗人次数/万人次']);
    const aL = a >= 18.5 ? '老龄化高' : a >= 11.7 ? '老龄化中' : '老龄化低';
    const eL = expense >= 7000 ? '投入高' : expense >= 4000 ? '投入中' : '投入低';
    const oL = output >= 45000 ? '产出高' : output >= 20000 ? '产出中' : '产出低';
    flows[`${aL}|${eL}`] = (flows[`${aL}|${eL}`] || 0) + 1;
    flows[`${eL}|${oL}`] = (flows[`${eL}|${oL}`] || 0) + 1;
  });
  const linkList = Object.entries(flows)
    .map(([k, v]) => {
      const [s, t] = k.split('|');
      return { source: s, target: t, value: v };
    })
    .filter((l) => l.value > 0);
  const usedNames = new Set();
  linkList.forEach((l) => {
    usedNames.add(l.source);
    usedNames.add(l.target);
  });
  const sankeyNodes = SANKEY_NODE_ORDER.filter((n) => usedNames.has(n)).map((n) => ({
    name: n,
    itemStyle: {
      color: SANKEY_NODE_COLORS[n],
      borderColor: 'rgba(255,255,255,0.55)',
      borderWidth: 1,
      shadowBlur: 6,
      shadowColor: 'rgba(0,0,0,0.35)'
    }
  }));
  const sankeyEmpty = sankeyNodes.length === 0 || linkList.length === 0;
  charts.sankey.setOption({
    animationDurationUpdate: 7000,
    tooltip: sankeyEmpty ? { show: false } : { trigger: 'item', confine: true },
    series: [{
      type: 'sankey',
      left: '2%',
      right: '4%',
      top: '6%',
      bottom: '5%',
      nodeWidth: 12,
      nodeGap: 8,
      nodeAlign: 'justify',
      layoutIterations: 48,
      silent: sankeyEmpty,
      data: sankeyNodes,
      links: linkList,
      lineStyle: { color: 'gradient', curveness: 0.52, opacity: 0.55 },
      label: {
        color: '#f0fbff',
        fontSize: 10,
        fontWeight: 600,
        textBorderColor: '#061428',
        textBorderWidth: 1,
        distance: 5
      },
      emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.85 } }
    }]
  }, optMerge);
};

/** 同一帧内合并多次刷新请求，避免频繁 setOption */
const scheduleDrawAll = () => {
  if (drawAllRaf) return;
  drawAllRaf = requestAnimationFrame(() => {
    drawAllRaf = 0;
    drawAll();
  });
};

/** 窗口缩放时更新舞台比例并重绘 ECharts */
const attachResize = () => {
  onResize = () => {
    updateScale();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      Object.keys(panels).forEach(safeInit);
      Object.values(charts).forEach((c) => c && c.resize());
      scheduleDrawAll();
    }, 80);
  };
  window.addEventListener('resize', onResize);
};

/** 时间轴年份自动轮播（与 state.play 联动） */
const startPlay = () => {
  clearInterval(playTimer);
  playTimer = setInterval(() => {
    if (!state.play) return;
    const idx = YEARS.indexOf(state.year);
    state.year = YEARS[(idx + 1) % YEARS.length];
  }, 2600);
};

/** 并行加载各 CSV 到 state.raw */
const loadData = async () => {
  const [main, risk, mismatch, bootstrap, robust, threshold, diag] = await Promise.all([
    axios.get(asset('data/v2/6_aging_resource_data.csv')),
    axios.get(asset('data/v2/4_risk_warning_classification_table_2024.csv')),
    axios.get(asset('data/v2/5_aging_resource_mismatch_analysis_table.csv')),
    axios.get(asset('data/v2/1_single_threshold_bootstrap_test_results.csv')),
    axios.get(asset('data/v2/7_robustness_single_threshold_search_table_absolute_mismatch.csv')),
    axios.get(asset('data/v2/12_threshold_search_results_table_single_threshold.csv')),
    axios.get(asset('data/v2/11_threshold_group_diagnosis_table.csv'))
  ]);
  const mainRows = parseCSV(main.data);
  state.raw.aging = buildAgingWideRows(mainRows);
  state.raw.center = buildCenterRows(mainRows);
  state.raw.u3 = mainRows.map((r) => ({
    '卫生资源配置_省份': pName(r['省份']),
    '卫生资源配置_年份': num(r['年份']),
    '财力投入_人均卫生费用/元': num(r['人均卫生费用/元']),
    '人才资源_卫生人员数/万人': num(r['卫生人员数/万人']),
    '人才资源_执业医师数/人': num(r['执业医师数/人']),
    '人才资源_注册护士数/人': num(r['注册护士数/人']),
    '物力资源_医疗卫生机构床位数/张': num(r['医疗卫生机构床位数/张']),
    '财力投入_医疗卫生机构事业收入/亿元': num(r['医疗卫生机构事业收入/亿元']),
    '服务能力_诊疗人次数/万人次': num(r['诊疗人次数/万人次'])
  }));
  state.raw.resident = mainRows.map((r) => ({
    '居民健康水平_省份': pName(r['省份']),
    '居民健康水平_年份': num(r['年份']),
    '总体健康水平_人口死亡率': num(r['人口死亡率‰']),
    '总体健康水平_人口平均预期寿命（岁）': num(r['人口平均预期寿命（岁）'])
  }));
  state.raw.medical = mainRows.map((r) => ({
    '医疗卫生水平_省份': pName(r['省份']),
    '医疗卫生水平_年份': num(r['年份']),
    '医疗设施_基层医疗卫生机构数/个': num(r['基层医疗卫生机构数/个']),
    '医疗设施_三甲医院数/个': num(r['专业公共卫生机构/个'])
  }));
  state.raw.warning = parseCSV(risk.data);
  state.raw.mismatch = parseCSV(mismatch.data);
  state.raw.bootstrap = parseCSV(bootstrap.data);
  state.raw.robustScan = parseCSV(robust.data);
  state.raw.thresholdScan = parseCSV(threshold.data);
  state.raw.thresholdDiag = parseCSV(diag.data);
};

watch(() => state.year, () => {
  scheduleDrawAll();
});

// 数据就绪后初始化图表、首帧绘制、轮播与 resize 监听
onMounted(async () => {
  document.addEventListener('click', closeMenuOnOutsideClick);
  window.addEventListener('resize', syncPopupPosition);
  window.addEventListener('scroll', syncPopupPosition, true);
  updateScale();
  await loadData();
  await nextTick();
  requestAnimationFrame(() => {
    initCharts();
    scheduleDrawAll();
    growCards();
    startPlay();
    attachResize();
    state.ready = true;
  });

  // Keep top KPI cards refreshed every 7 seconds.
  cardsRefreshTimer = setInterval(async () => {
    if (isRefreshingCards) return;
    isRefreshingCards = true;
    try {
      await loadData();
      growCards(CARD_ANIM_MS, true);
    } finally {
      isRefreshingCards = false;
    }
  }, CARD_REFRESH_MS);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenuOnOutsideClick);
  window.removeEventListener('resize', syncPopupPosition);
  window.removeEventListener('scroll', syncPopupPosition, true);
  if (hoverTimer) clearTimeout(hoverTimer);
  // 取消动画帧、轮播、resize，销毁全部 ECharts 实例
  if (drawAllRaf) cancelAnimationFrame(drawAllRaf);
  drawAllRaf = 0;
  clearInterval(playTimer);
  clearInterval(cardsRefreshTimer);
  if (onResize) window.removeEventListener('resize', onResize);
  Object.values(charts).forEach((c) => c && c.dispose());
});
</script>

<template>
  <div ref="root" class="viewport">
    <!-- 固定 1920×1080 舞台，通过 scale 适配视口 -->
    <div class="stage" :style="{ transform: `translate(-50%, -50%) scale(${scale})` }">
      <div class="screen" :class="{ ready: state.ready }">
        <div class="screen-switch-wrap screen-switch-wrap--left">
          <button type="button" class="screen-switch-btn" @click="switchToGlobalScreen">
            <span class="screen-switch-btn__text">切换全球</span>
          </button>
        </div>
        <div class="screen-switch-wrap screen-switch-wrap--right">
          <button type="button" class="screen-switch-btn" @click="switchToProvincesScreen">
            <span class="screen-switch-btn__text">切换各省</span>
          </button>
        </div>
        <!-- 背景流动星点：仅装饰，不参与交互与布局 -->
        <div class="star-flow" aria-hidden="true"></div>
        <div class="stars"></div>

        <!-- 顶栏：左右各两枚 KPI 圆环 + 居中主标题 -->
        <header class="top">
          <div class="top-metrics top-metrics-left">
            <div class="metric-ring">
              <div class="ring-particles" aria-hidden="true"></div>
              <div class="ring-orbit" aria-hidden="true"></div>
              <div class="ring-core">
                <div class="lab">
                  <span class="lab-year">{{ CARD_YEAR }}年</span>
                  <span class="lab-desc">全国老龄化压力指数</span>
                </div>
                <div class="num">{{ fmt(state.cards.aging) }}</div>
              </div>
            </div>
            <div class="metric-ring">
              <div class="ring-particles" aria-hidden="true"></div>
              <div class="ring-orbit" aria-hidden="true"></div>
              <div class="ring-core">
                <div class="lab">
                  <span class="lab-year">{{ CARD_YEAR }}年</span>
                  <span class="lab-desc">全国资源保障指数</span>
                </div>
                <div class="num">{{ fmt(state.cards.expense, 0) }}</div>
              </div>
            </div>
          </div>
          <div class="top-title">
            <div class="title-pedestal">
              <div class="pedestal-bg" aria-hidden="true">
                <svg class="pedestal-svg" viewBox="0 0 900 36" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="pedStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" style="stop-color:#00d4ff;stop-opacity:0.35" />
                      <stop offset="50%" style="stop-color:#5ce1ff;stop-opacity:1" />
                      <stop offset="100%" style="stop-color:#00d4ff;stop-opacity:0.35" />
                    </linearGradient>
                    <filter id="pedGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2" result="b" />
                      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  <path d="M 0 18 L 80 10 L 180 10 L 220 18 L 180 26 L 80 26 Z" fill="none" stroke="url(#pedStroke)" stroke-width="1.2" filter="url(#pedGlow)" />
                  <path d="M 230 18 L 450 6 L 670 18 L 450 30 Z" fill="rgba(0,100,180,0.12)" stroke="url(#pedStroke)" stroke-width="1.4" filter="url(#pedGlow)" />
                  <path d="M 680 18 L 720 10 L 820 10 L 900 18 L 820 26 L 720 26 Z" fill="none" stroke="url(#pedStroke)" stroke-width="1.2" filter="url(#pedGlow)" />
                  <line x1="40" y1="18" x2="860" y2="18" stroke="url(#pedStroke)" stroke-width="0.6" stroke-opacity="0.45" />
                </svg>
              </div>
              <h1>中国老龄化医疗资源错配与风险预警大屏</h1>
            </div>
          </div>
          <div class="top-metrics top-metrics-right">
            <div class="metric-ring">
              <div class="ring-particles" aria-hidden="true"></div>
              <div class="ring-orbit" aria-hidden="true"></div>
              <div class="ring-core">
                <div class="lab">
                  <span class="lab-year">{{ CARD_YEAR }}年</span>
                  <span class="lab-desc">门槛检验显著性指标</span>
                </div>
                <div class="num">{{ fmt(state.cards.life) }}</div>
              </div>
            </div>
            <div class="metric-ring">
              <div class="ring-particles" aria-hidden="true"></div>
              <div class="ring-orbit" aria-hidden="true"></div>
              <div class="ring-core">
                <div class="lab">
                  <span class="lab-year">{{ CARD_YEAR }}年</span>
                  <span class="lab-desc">{{ card4Metric.labelRest }}</span>
                </div>
                <div class="num">{{ fmt(state.cards.distance, card4Metric.decimals) }}</div>
              </div>
            </div>
          </div>
        </header>

        <!-- 主体：左三图 | 中地图 | 右三图 -->
        <section class="body">
          <aside class="left" :style="{ zIndex: leftOverlayActive ? 6200 : 1 }">
            <div class="panel" :style="panelLayerStyle('l1')" :ref="(el) => setModulePanelEl('l1', el)">
              <div class="panel-title">
                压力指数 vs 保障指数 · 错配气泡散点图
                <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('l1')">信息</button>
                  <div v-show="openMenuKey === 'l1'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                    <button @mouseenter="openHoverInfo('l1', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('l1', 'conclusion')">研究结论</button>
                  </div>
                </div>
              </div>
              <div :ref="panels.l1" class="chart"></div>
            </div>
            <div class="panel" :style="panelLayerStyle('l2')" :ref="(el) => setModulePanelEl('l2', el)">
              <div class="panel-title">
                门槛搜索与稳健性轨迹  ·  折线图
                <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('l2')">信息</button>
                  <div v-show="openMenuKey === 'l2'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                    <button @mouseenter="openHoverInfo('l2', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('l2', 'conclusion')">研究结论</button>
                  </div>
                </div>
              </div>
              <div :ref="panels.l2" class="chart"></div>
            </div>
            <div class="panel" :style="panelLayerStyle('l3')" :ref="(el) => setModulePanelEl('l3', el)">
              <div class="panel-title">
                压力-保障-错配结构变化  ·  堆叠柱状图
                <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('l3')">信息</button>
                  <div v-show="openMenuKey === 'l3'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                    <button @mouseenter="openHoverInfo('l3', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('l3', 'conclusion')">研究结论</button>
                  </div>
                </div>
              </div>
              <div :ref="panels.l3" class="chart"></div>
            </div>
          </aside>
          <main class="center">
            <!-- 地图：ECharts 容器 + 底部光圈/光束装饰 + 年份轴 -->
            <div class="map-panel panel" :style="panelLayerStyle('map')" :ref="(el) => setModulePanelEl('map', el)">
              <div class="panel-title">
                省域绝对错配热力分布  ·  分级设色地图
                <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('map')">信息</button>
                  <div v-show="openMenuKey === 'map'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                    <button @mouseenter="openHoverInfo('map', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('map', 'conclusion')">研究结论</button>
                  </div>
                </div>
              </div>
              <div class="map-body">
                <div :ref="panels.map" class="map-chart"></div>
                <div class="halo-wrap" aria-hidden="true">
                  <div class="halo-beams"></div>
                  <div class="halo"></div>
                </div>
                <div class="timeline">
                <button @click="state.play = !state.play">{{ state.play ? '暂停' : '播放' }}</button>
                <span v-for="y in YEARS" :key="y" :class="{ active: y === state.year }" @click="state.year = y">{{ y }}</span>
                </div>
              </div>
            </div>
          </main>
          <aside class="right" :style="{ zIndex: rightOverlayActive ? 6200 : 1 }">
            <div class="panel rsmall" :style="panelLayerStyle('r1')" :ref="(el) => setModulePanelEl('r1', el)">
              <div class="panel-title">
                压力与保障双轴趋势  ·  曲线图
                <div class="panel-info-control panel-info-control--right-shift" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('r1')">信息</button>
                  <div v-show="openMenuKey === 'r1'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                    <button @mouseenter="openHoverInfo('r1', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('r1', 'conclusion')">研究结论</button>
                  </div>
                </div>
              </div>
              <div :ref="panels.r1" class="chart small"></div>
            </div>
            <div class="panel rsmall" :style="panelLayerStyle('r2')" :ref="(el) => setModulePanelEl('r2', el)">
              <div class="panel-title">
                关键预警省份TOP10  ·  条形图
                <div class="panel-info-control panel-info-control--right-shift" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('r2')">信息</button>
                  <div v-show="openMenuKey === 'r2'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                    <button @mouseenter="openHoverInfo('r2', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('r2', 'conclusion')">研究结论</button>
                  </div>
                </div>
              </div>
              <div :ref="panels.r2" class="chart small"></div>
            </div>
            <div class="panel rsmall" :style="panelLayerStyle('r3')" :ref="(el) => setModulePanelEl('r3', el)">
              <div class="panel-title">
                典型省份错配画像  ·  雷达图
                <div class="panel-info-control panel-info-control--right-shift" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('r3')">信息</button>
                  <div v-show="openMenuKey === 'r3'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                    <button @mouseenter="openHoverInfo('r3', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('r3', 'conclusion')">研究结论</button>
                  </div>
                </div>
              </div>
              <div :ref="panels.r3" class="chart small"></div>
            </div>
          </aside>
        </section>

        <!-- 底栏：桑基图 + 滚动排行 -->
        <section class="bottom">
          <div class="panel sankey-panel" :style="panelLayerStyle('sankey')" :ref="(el) => setModulePanelEl('sankey', el)">
            <div class="panel-title">
              门槛分组 → 风险等级诊断流向  ·  桑基图
              <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('sankey')">信息</button>
                <div v-show="openMenuKey === 'sankey'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                  <button @mouseenter="openHoverInfo('sankey', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('sankey', 'conclusion')">研究结论</button>
                </div>
              </div>
            </div>
            <div class="sankey-wrap">
              <aside class="sankey-legend sankey-legend-left" aria-label="图例左侧">
                <div v-for="name in SANKEY_LEGEND_LEFT_KEYS" :key="name" class="leg-row">
                  <i class="leg-swatch" :style="{ background: SANKEY_NODE_COLORS[name] }"></i>
                  <span class="leg-name">{{ name }}</span>
                </div>
              </aside>
              <div :ref="panels.sankey" class="sankey"></div>
              <aside class="sankey-legend sankey-legend-right" aria-label="图例右侧">
                <div v-for="name in SANKEY_LEGEND_RIGHT_KEYS" :key="name" class="leg-row">
                  <i class="leg-swatch" :style="{ background: SANKEY_NODE_COLORS[name] }"></i>
                  <span class="leg-name">{{ name }}</span>
                </div>
              </aside>
            </div>
          </div>
          <div class="panel rank-panel" :style="panelLayerStyle('rank')" :ref="(el) => setModulePanelEl('rank', el)">
            <div class="panel-title">
              2024省域绝对错配Top10滚动排行
              <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('rank')">信息</button>
                <div v-show="openMenuKey === 'rank'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                  <button @mouseenter="openHoverInfo('rank', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('rank', 'conclusion')">研究结论</button>
                </div>
              </div>
            </div>
            <div class="rank-list">
              <div class="rank-track">
                <div class="row" v-for="(r, i) in rankingLoopDisplay" :key="`${r.province}-${i}`">
                  <span :class="['idx', { top3: i % 10 < 3 }]">{{ (i % 10) + 1 }}</span>
                  <span class="pn">{{ r.province }}</span>
                  <span class="pv">{{ fmt(r.value, 3) }}</span>
                  <span class="df">{{ r.diff >= 0 ? '+' : '' }}{{ fmt(r.diff, 3) }}</span>
                  <div class="bar"><i :style="{ width: `${r.barPct}%` }"></i></div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <Teleport to="body">
          <div
            v-show="popupVisible(hoverInfo.key)"
            :class="['panel-info-popup', popupToneClass]"
            :style="popupStyle"
            @mouseenter="keepHoverInfo"
            @mouseleave="closeHoverInfoSoon"
          >
            <h4>{{ popupTitle }}</h4>
            <p>{{ popupText }}</p>
          </div>
        </Teleport>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 全局舞台与顶栏 ========== */
.viewport { width: 100vw; height: 100vh; overflow: hidden; background: #010711; }
.stage { position: absolute; left: 50%; top: 50%; width: 1920px; height: 1080px; transform-origin: center center; }
.screen { position: relative; width: 100%; height: 100%; overflow: hidden; color: #d5f2ff; background: radial-gradient(circle at 50% 8%, #15457f 0%, #061836 36%, #020810 100%); opacity: 0; animation: enter 4.2s ease forwards; }
.screen-switch-wrap {
  position: absolute;
  top: 18px;
  z-index: 36;
}
.screen-switch-wrap--left {
  left: 22px;
}
.screen-switch-wrap--right {
  right: 22px;
}
.screen-switch-btn {
  position: relative;
  width: 188px;
  height: 52px;
  border: none;
  cursor: pointer;
  color: #ffffff;
  font-weight: 800;
  font-size: 24px;
  letter-spacing: 1px;
  line-height: 1;
  background:
    radial-gradient(120% 80% at 50% 20%, rgba(196, 255, 245, 0.38), transparent 55%),
    linear-gradient(180deg, rgba(170, 250, 255, 0.34), rgba(120, 255, 230, 0.14)),
    linear-gradient(180deg, rgba(28, 92, 150, 0.72), rgba(12, 52, 108, 0.82));
  clip-path: polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%);
  box-shadow:
    0 0 16px rgba(150, 245, 255, 0.88),
    0 0 28px rgba(90, 230, 210, 0.55),
    inset 0 0 20px rgba(170, 255, 250, 0.38);
  transition: transform 0.15s ease, box-shadow 0.22s ease, filter 0.22s ease;
}
.screen-switch-btn::before,
.screen-switch-btn::after {
  content: '';
  position: absolute;
  inset: -5px;
  pointer-events: none;
  clip-path: polygon(8% 0, 92% 0, 100% 50%, 92% 100%, 8% 100%, 0 50%);
}
.screen-switch-btn::before {
  border: 2px solid rgba(170, 248, 255, 1);
  box-shadow:
    0 0 14px rgba(120, 240, 255, 0.95),
    0 0 28px rgba(80, 235, 220, 0.65);
}
.screen-switch-btn::after {
  inset: -11px;
  border: 2px solid rgba(130, 240, 230, 0.75);
  box-shadow: 0 0 22px rgba(100, 230, 255, 0.62);
}
.screen-switch-btn__text {
  position: relative;
  z-index: 1;
  display: inline-block;
  text-shadow: 0 0 5px rgba(255, 255, 255, 0.55), 0 0 10px rgba(120, 220, 255, 0.35);
}
.screen-switch-btn:hover {
  transform: translateY(-1px) scale(1.02);
  filter: brightness(1.12);
  box-shadow:
    0 0 22px rgba(170, 250, 255, 0.95),
    0 0 36px rgba(110, 240, 220, 0.72),
    inset 0 0 26px rgba(190, 255, 250, 0.48);
}
.screen-switch-btn:active { transform: scale(0.985); }
/* 均匀点阵 + 慢速平移 background-position（仅装饰层；用四边定位 + -webkit 动画以兼容旧内核） */
.star-flow {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  opacity: 0.5;
  background-repeat: repeat;
  background-image:
    radial-gradient(rgba(255, 255, 255, 0.85) 1px, transparent 1.5px),
    radial-gradient(rgba(255, 255, 255, 0.5) 1px, transparent 1.5px),
    radial-gradient(rgba(220, 240, 255, 0.42) 1px, transparent 1.5px);
  background-size: 56px 56px, 92px 92px, 128px 128px;
  background-position: 0 0, 38px 52px, 72px 18px;
  -webkit-animation: starFlowDrift 58s linear infinite;
  animation: starFlowDrift 35s linear infinite;
}
.stars {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  opacity: 0.8;
  background-image:
    radial-gradient(2px 2px at 18% 24%, rgba(255, 255, 255, 0.85), transparent),
    radial-gradient(2px 2px at 82% 18%, rgba(122, 195, 255, 0.85), transparent),
    radial-gradient(1px 1px at 35% 70%, rgba(255, 255, 255, 0.8), transparent),
    radial-gradient(1px 1px at 68% 78%, rgba(170, 216, 255, 0.9), transparent);
  -webkit-animation: twinkle 8s ease-in-out infinite alternate;
  animation: twinkle 8s ease-in-out infinite alternate;
}
.top {
  height: 10%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(380px, 2fr) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 8px 18px;
  position: relative;
  z-index: 2;
}
.top-metrics {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.top-metrics-left { justify-content: flex-end; }
.top-metrics-right { justify-content: flex-start; }
.top-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.title-pedestal {
  position: relative;
  width: 100%;
  min-height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px 14px;
}
.pedestal-bg {
  position: absolute;
  left: 50%;
  top: 54%;
  transform: translate(-50%, -50%);
  width: calc(100% + 8px);
  max-width: 900px;
  height: 48px;
  z-index: 0;
  pointer-events: none;
}
.pedestal-bg .pedestal-svg {
  width: 100%;
  height: 100%;
  display: block;
  opacity: 0.96;
}
.title-pedestal h1 {
  position: relative;
  z-index: 1;
  margin: 0;
  max-width: 100%;
  padding: 0 8px;
  font-size: clamp(30px, 2.75vw, 44px);
  line-height: 1.2;
  text-align: center;
  color: #f5fdff;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-shadow:
    0 0 12px rgba(80, 200, 255, 0.95),
    0 0 30px rgba(0, 160, 255, 0.6),
    0 0 52px rgba(0, 120, 220, 0.4);
}
/* 顶部 KPI：外环脉冲 + 内圈数字 */
.metric-ring {
  position: relative;
  width: 90px;
  height: 90px;
  flex-shrink: 0;
}
.ring-orbit {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid rgba(0, 210, 255, 0.42);
  box-shadow:
    0 0 14px rgba(0, 210, 255, 0.55),
    0 0 28px rgba(0, 140, 255, 0.25),
    inset 0 0 18px rgba(0, 90, 180, 0.35);
  animation: ringPulse 2.6s ease-in-out infinite;
  pointer-events: none;
}
.ring-particles {
  position: absolute;
  inset: -6px;
  border-radius: 50%;
  background:
    radial-gradient(circle at 28% 32%, rgba(0, 255, 255, 0.12), transparent 42%),
    radial-gradient(circle at 72% 68%, rgba(120, 220, 255, 0.08), transparent 48%);
  animation: ringSpin 28s linear infinite;
  pointer-events: none;
  opacity: 0.65;
}
.ring-core {
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  background: radial-gradient(circle at 50% 36%, rgba(36, 118, 198, 0.92), rgba(3, 14, 40, 0.98));
  border: 1px solid rgba(100, 210, 255, 0.45);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3px 5px;
  text-align: center;
  box-shadow: inset 0 0 14px rgba(60, 170, 255, 0.22);
}
.metric-ring .lab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  margin-bottom: 1px;
  padding: 0 3px;
  max-width: 100%;
  box-sizing: border-box;
  color: #c5e9ff;
}
.metric-ring .lab-year {
  font-size: 9px;
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.metric-ring .lab-desc {
  font-size: 9px;
  line-height: 1.18;
  font-weight: 600;
  text-align: center;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: normal;
}
.metric-ring .num {
  font-size: 17px;
  font-weight: 900;
  color: #fff;
  line-height: 1.1;
  text-shadow: 0 0 8px rgba(120, 220, 255, 0.5);
  animation: numGlow 2.6s ease-in-out infinite;
}
@keyframes ringPulse {
  0%, 100% {
    box-shadow: 0 0 12px rgba(0, 210, 255, 0.45), 0 0 22px rgba(0, 140, 255, 0.2), inset 0 0 16px rgba(0, 90, 180, 0.32);
  }
  50% {
    box-shadow: 0 0 22px rgba(0, 245, 255, 0.75), 0 0 36px rgba(0, 160, 255, 0.38), inset 0 0 22px rgba(0, 120, 200, 0.48);
  }
}
@keyframes ringSpin {
  to { transform: rotate(360deg); }
}
@keyframes numGlow {
  0%, 100% { text-shadow: 0 0 6px rgba(120, 220, 255, 0.45); }
  50% { text-shadow: 0 0 12px rgba(180, 240, 255, 0.75); }
}

/* ========== 左/中/右三列与通用 panel ========== */
.body { height: 75%; display: grid; grid-template-columns: 26% 48% 26%; gap: 12px; padding: 0 16px 10px; position: relative; z-index: 2; }
.left, .right { position: relative; display: grid; grid-template-rows: repeat(3, 1fr); gap: 12px; }
.left { transform: perspective(1500px) rotateY(8deg); transform-origin: right center; }
.right { transform: perspective(1500px) rotateY(-8deg); transform-origin: left center; }
.center { min-width: 0; }
/* 略透明，使底层星场能透出；不改变布局与边框 */
.panel { position: relative; display: flex; flex-direction: column; background: linear-gradient(180deg, rgba(10,39,82,.52), rgba(3,18,44,.58)); border: 1px solid rgba(84,196,255,.5); box-shadow: 0 0 12px rgba(64,172,255,.45), inset 0 0 22px rgba(81,142,255,.18); border-radius: 8px; overflow: visible; min-height: 0; }
.panel-title { position: relative; flex-shrink: 0; min-height: 30px; line-height: 1.28; padding: 6px 70px 6px 10px; font-size: 12px; font-weight: 700; color: #def5ff; background: linear-gradient(90deg, rgba(33,131,198,.38), transparent); word-break: break-word; }
.panel-info-control {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2147483000;
}
.panel-info-control--right-shift {
  right: 28px;
}
.panel-info-btn {
  width: 48px;
  height: 22px;
  border: 1px solid rgba(168, 232, 255, 0.92);
  border-radius: 5px;
  background: linear-gradient(180deg, rgba(103, 191, 250, 0.96), rgba(46, 128, 216, 0.92));
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(138, 220, 255, 0.72), inset 0 0 10px rgba(190, 242, 255, 0.35);
  animation: infoGlowBreath 2.2s ease-in-out infinite;
}
.panel-info-btn:hover {
  filter: brightness(1.08);
}
.panel-info-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 108px;
  border: 1px solid rgba(255, 255, 255, 0.36);
  border-radius: 6px;
  background: rgba(8, 8, 10, 0.95);
  overflow: hidden;
  z-index: 2147483200;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.48);
}
.panel-info-menu button {
  width: 100%;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  padding: 7px 10px;
  cursor: pointer;
}
.panel-info-menu button + button {
  border-top: 1px solid rgba(255, 255, 255, 0.22);
}
.panel-info-menu button:hover {
  background: rgba(255, 255, 255, 0.12);
}
.panel-info-popup {
  position: absolute;
  width: 320px;
  min-height: 168px;
  max-height: 300px;
  padding: 14px 18px;
  border: 1px solid rgba(15, 34, 52, 0.28);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  color: #1a2a37;
  z-index: 2147483400;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.2);
  text-align: center;
  overflow: auto;
}
.panel-info-popup h4 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.panel-info-popup p {
  margin: 0;
  font-size: 13px;
  line-height: 1.72;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.popup-explain h4 {
  color: #187e3a;
}
.popup-explain p {
  color: #1f9a47;
}
.popup-conclusion h4 {
  color: #c86b00;
}
.popup-conclusion p {
  color: #e07a00;
}
.popup-right {
  top: 36px;
  left: calc(100% + 10px);
  transform: perspective(1500px) rotateY(-8deg);
  transform-origin: left center;
}
.popup-left {
  top: 36px;
  right: calc(100% + 360px);
  transform: perspective(1500px) rotateY(8deg);
  transform-origin: right center;
}
.popup-center {
  top: 36px;
  left: calc(100% + 12px);
  transform: none;
}
.popup-top {
  bottom: calc(100% + 10px);
  right: 10px;
  transform: none;
}
@keyframes infoGlowBreath {
  0%, 100% {
    box-shadow: 0 0 8px rgba(138, 220, 255, 0.52), inset 0 0 8px rgba(190, 242, 255, 0.28);
  }
  50% {
    box-shadow: 0 0 14px rgba(168, 232, 255, 0.95), inset 0 0 14px rgba(208, 250, 255, 0.46);
  }
}
.chart { flex: 1; min-height: 0; }
.rsmall .small { flex: 1; min-height: 0; }

/* ========== 中心地图模块（图表 + 底部光效 + 时间轴） ========== */
.map-panel { height: 100%; position: relative; display: flex; flex-direction: column; min-height: 0; }
.map-body { position: relative; flex: 1; min-height: 0; }
.map-chart { width: 100%; height: 100%; }
/* 地图底部：圆锥重复渐变光束 + 椭圆光圈（HTML 叠在 ECharts 之上） */
.halo-wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 300px;
  overflow: visible;
  pointer-events: none;
  z-index: 1;
}
.halo-beams {
  position: absolute;
  left: 50%;
  bottom: 74px;
  width: min(560px, 96%);
  height: 210px;
  transform: translateX(-50%);
  background: repeating-conic-gradient(
    from 200deg at 50% 100%,
    transparent 0deg 4deg,
    rgba(130, 240, 255, 0.62) 4deg 10deg,
    transparent 10deg 19deg
  );
  /* 自下而上长距离渐隐，避免顶部出现齐平“截面” */
  -webkit-mask-image: linear-gradient(
    to top,
    #000 0%,
    #000 3%,
    rgba(0, 0, 0, 0.98) 8%,
    rgba(0, 0, 0, 0.92) 16%,
    rgba(0, 0, 0, 0.82) 26%,
    rgba(0, 0, 0, 0.68) 38%,
    rgba(0, 0, 0, 0.52) 50%,
    rgba(0, 0, 0, 0.36) 62%,
    rgba(0, 0, 0, 0.22) 74%,
    rgba(0, 0, 0, 0.11) 85%,
    rgba(0, 0, 0, 0.04) 93%,
    transparent 100%
  );
  mask-image: linear-gradient(
    to top,
    #000 0%,
    #000 3%,
    rgba(0, 0, 0, 0.98) 8%,
    rgba(0, 0, 0, 0.92) 16%,
    rgba(0, 0, 0, 0.82) 26%,
    rgba(0, 0, 0, 0.68) 38%,
    rgba(0, 0, 0, 0.52) 50%,
    rgba(0, 0, 0, 0.36) 62%,
    rgba(0, 0, 0, 0.22) 74%,
    rgba(0, 0, 0, 0.11) 85%,
    rgba(0, 0, 0, 0.04) 93%,
    transparent 100%
  );
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  filter: blur(1px) brightness(1.12);
  animation: haloBeams 3.2s ease-in-out infinite;
}
.halo {
  position: absolute;
  left: 50%;
  bottom: 70px;
  width: 380px;
  height: 92px;
  border-radius: 50%;
  transform: translateX(-50%);
  border: 2px solid rgba(77, 198, 255, 0.8);
  box-shadow: 0 0 24px rgba(77, 198, 255, 0.85);
  animation: halo 4s linear infinite;
  pointer-events: none;
}
.timeline { position: absolute; left: 16px; right: 16px; bottom: 14px; z-index: 2; display: flex; align-items: center; gap: 4px; font-size: 11px; }
.timeline button { border: 1px solid #76d8ff; background: #0e3f75; color: #e6f8ff; border-radius: 4px; width: 54px; height: 22px; cursor: pointer; }
.timeline span { color: #a4dcff; padding: 1px 4px; border-radius: 4px; cursor: pointer; }
.timeline span.active { background: #1b87d8; color: #fff; box-shadow: 0 0 10px #2ea6ff; }

/* ========== 底部桑基与滚动排行 ========== */
.bottom { height: 15%; display: grid; grid-template-columns: 70% 30%; gap: 12px; padding: 0 20px 12px; position: relative; z-index: 2; }
.sankey-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sankey-wrap {
  display: flex;
  align-items: stretch;
  gap: 8px;
  flex: 1;
  min-height: 0;
}
.sankey-legend {
  flex: 0 0 108px;
  width: 108px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 4px 6px;
  font-size: 10px;
  color: #c8ecff;
  border-right: 1px solid rgba(80, 180, 255, 0.25);
  background: linear-gradient(90deg, rgba(8, 32, 72, 0.32), transparent);
  overflow: hidden;
}
.sankey-legend-right {
  border-right: none;
  border-left: 1px solid rgba(80, 180, 255, 0.25);
  background: linear-gradient(270deg, rgba(8, 32, 72, 0.32), transparent);
}
.leg-row {
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.2;
}
.leg-swatch {
  flex-shrink: 0;
  width: 11px;
  height: 11px;
  border-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.35);
}
.leg-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sankey-panel .sankey { flex: 1; min-width: 0; height: 100%; }
.rank-panel { display: flex; flex-direction: column; }
.rank-list { flex: 1; overflow: hidden; }
.rank-track { animation: roll 12s linear infinite; }
.rank-list:hover .rank-track { animation-play-state: paused; }
.row { display: grid; grid-template-columns: 26px 66px 54px 46px 1fr; gap: 5px; align-items: center; padding: 3px 8px; font-size: 11px; }
.idx { color: #88d3ff; font-weight: 700; }
.idx.top3 { color: #ffcf62; }
.pn, .pv, .df { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar { height: 6px; border-radius: 4px; background: rgba(79,171,255,.2); overflow: hidden; }
.bar i { display: block; height: 100%; background: linear-gradient(90deg, #4ea5ff, #79f1ff); }

/* ========== 全局动画关键帧 ========== */
@-webkit-keyframes starFlowDrift {
  0% { background-position: 0 0, 38px 52px, 72px 18px; }
  100% { background-position: 520px 260px, 558px 312px, 592px 278px; }
}
@keyframes starFlowDrift {
  0% { background-position: 0 0, 38px 52px, 72px 18px; }
  100% { background-position: 520px 260px, 558px 312px, 592px 278px; }
}
@keyframes twinkle {
  from { opacity: 0.55; }
  to { opacity: 0.95; }
}
@keyframes halo { 0% { transform: translateX(-50%) scale(0.78); opacity: .8; } 100% { transform: translateX(-50%) scale(1.15); opacity: .15; } }
@keyframes haloBeams {
  0%, 100% { opacity: 0.52; filter: blur(1.05px) brightness(1.08); }
  50% { opacity: 1; filter: blur(0.85px) brightness(1.28); }
}
@keyframes roll { 0% { transform: translateY(0); } 100% { transform: translateY(-50%); } }
@keyframes enter { from { opacity: 0; transform: rotateX(6deg) scale(1.03); } to { opacity: 1; transform: rotateX(0deg) scale(1); } }
</style>
