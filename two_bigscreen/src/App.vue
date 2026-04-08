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
  raw: { aging: [], center: [], u3: [], resident: [], medical: [] }
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

const GLOBAL_DEV_PORT = 5172;
const PROVINCES_DEV_PORT = 5174;

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
  window.location.assign('/bigbig_screen/');
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
  window.location.assign('/screen/');
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

/** 固定十省按当前 state.year 老龄化率排序后的 Top10 */
const top10 = computed(() => {
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
const rankingLoop = computed(() => [...top10.value, ...top10.value]);

/** 顶部四卡固定展示 2024 年，数据均来自 CSV 聚合 */
const CARD_YEAR = 2024;

/** 第四卡：population_center_shift.csv — 优先重心距离；为 0 时用同表总权重；仍为 0 时用双重心纬度差 */
const card4Metric = computed(() => {
  const row = centerMap.value.get(CARD_YEAR);
  const dist = num(row?.['重心距离_km']);
  if (dist > 0) return { value: dist, decimals: 2, labelRest: '医疗重心与老龄重心距离（km）' };
  const w = num(row?.['总权重_医疗']);
  if (w > 0) return { value: w, decimals: 4, labelRest: '医疗资源重心权重合计' };
  const latDiff = Math.abs(num(row?.['重心纬度_医疗']) - num(row?.['重心纬度_老龄']));
  return { value: latDiff, decimals: 4, labelRest: '双重心纬度差（°）' };
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
const growCards = () => {
  const t0 = performance.now();
  const d = 7000;
  const start = { ...state.cards };
  const target = cardTarget.value;
  const step = (ts) => {
    const p = Math.min(1, (ts - t0) / d);
    const e = 1 - (1 - p) ** 3;
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
    animationDurationUpdate: 7000,
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
    tooltip: { formatter: (p) => `${p.value[3]}<br/>老龄化率:${fmt(p.value[0])}%<br/>人均卫生费用:${fmt(p.value[1], 0)}元` },
    series: [{
      type: 'scatter',
      data: provinces.map((p) => {
        const a = agingMap.value.get(`${p}-${y}`) ?? 0;
        const u = u3Map.value.get(`${p}-${y}`) || {};
        const pop = num(centerMap.value.get(y)?.['总权重_老龄']) * a / 100;
        return [a, num(u['财力投入_人均卫生费用/元']), pop, p];
      }),
      symbolSize: (v) => Math.max(8, Math.sqrt(v[2]) * 2),
      itemStyle: { borderColor: 'rgba(89, 210, 255, 0.5)', borderWidth: 1 },
      emphasis: { scale: 1.2 }
    }]
  }, optMerge);

  // 左中：医疗 / 老龄双重心经纬轨迹；坐标轴范围按数据加 padding，避免轨迹缩成一点
  const trajMed = YEARS.map((yr) => {
    const r = centerMap.value.get(yr);
    return [num(r?.['重心经度_医疗']), num(r?.['重心纬度_医疗'])];
  });
  const trajOld = YEARS.map((yr) => {
    const r = centerMap.value.get(yr);
    return [num(r?.['重心经度_老龄']), num(r?.['重心纬度_老龄'])];
  });
  const allPts = [...trajMed, ...trajOld].filter((p) => p[0] > 1 && p[1] > 1);
  let minLng = 105;
  let maxLng = 120;
  let minLat = 18;
  let maxLat = 45;
  if (allPts.length) {
    const lngs = allPts.map((p) => p[0]);
    const lats = allPts.map((p) => p[1]);
    minLng = Math.min(...lngs);
    maxLng = Math.max(...lngs);
    minLat = Math.min(...lats);
    maxLat = Math.max(...lats);
    const padLng = Math.max((maxLng - minLng) * 0.15, 0.25);
    const padLat = Math.max((maxLat - minLat) * 0.15, 0.12);
    minLng -= padLng;
    maxLng += padLng;
    minLat -= padLat;
    maxLat += padLat;
  }
  charts.l2.setOption({
    animationDurationUpdate: 7000,
    legend: { top: 4, textStyle: { color: '#d7f2ff' } },
    grid: gridSmall,
    dataset: [{ source: trajMed }, { source: trajOld }],
    xAxis: {
      type: 'value',
      name: '经度(°)',
      min: minLng,
      max: maxLng,
      scale: true,
      axisLabel: { color: '#c5ecff' }
    },
    yAxis: {
      type: 'value',
      name: '纬度(°)',
      min: minLat,
      max: maxLat,
      scale: true,
      axisLabel: { color: '#c5ecff' }
    },
    series: [
      {
        name: '医疗资源重心',
        type: 'line',
        datasetIndex: 0,
        encode: { x: 0, y: 1 },
        showSymbol: true,
        symbol: 'circle',
        lineStyle: { color: '#39b5ff', width: 2.5 },
        itemStyle: { color: '#39b5ff' },
        symbolSize: 7
      },
      {
        name: '老龄化重心',
        type: 'line',
        datasetIndex: 1,
        encode: { x: 0, y: 1 },
        showSymbol: true,
        symbol: 'circle',
        lineStyle: { color: '#ff9f33', width: 2.5 },
        itemStyle: { color: '#ff9f33' },
        symbolSize: 7
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
  charts.l3.setOption({
    animationDurationUpdate: 7000, legend: { top: 4, textStyle: { color: '#d7f2ff' } }, grid: gridSmall,
    xAxis: { type: 'category', data: YEARS, axisLabel: { color: '#bfe8ff' } },
    yAxis: { type: 'value', axisLabel: { color: '#bfe8ff' } },
    series: [
      { name: '物力资源', type: 'bar', stack: 't', data: stack.map((v) => v.a), itemStyle: { color: '#6ad7ff' } },
      { name: '人才资源', type: 'bar', stack: 't', data: stack.map((v) => v.b), itemStyle: { color: '#8c79ff' } },
      { name: '财力投入', type: 'bar', stack: 't', data: stack.map((v) => v.c), itemStyle: { color: '#ff9f33' } }
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
    xAxis: { type: 'category', data: YEARS, axisLabel: { color: '#bfe8ff', fontSize: 10 } },
    yAxis: [
      { type: 'value', alignTicks: false, axisLabel: { color: '#ffbc72', fontSize: 10 } },
      { type: 'value', alignTicks: false, axisLabel: { color: '#77ceff', fontSize: 10 } }
    ],
    series: [
      { type: 'line', name: '需求水平', smooth: true, data: demand, lineStyle: { color: '#ff9f33', width: 2.5 }, areaStyle: { color: 'rgba(255,159,51,0.15)' } },
      { type: 'line', name: '供给水平', smooth: true, yAxisIndex: 1, data: supply, lineStyle: { color: '#46bcff', width: 2.5 }, areaStyle: { color: 'rgba(70,188,255,0.15)' } }
    ]
  }, optMerge);

  // 右中：当前年老龄化率 Top10 横向条形图
  charts.r2.setOption({
    animationDurationUpdate: 7000, grid: { left: 52, right: 46, top: 24, bottom: 24, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: '#bfe8ff', fontSize: 10 } },
    yAxis: { type: 'category', data: top10.value.map((d) => d.province), axisLabel: { color: '#d8f4ff', fontSize: 11 } },
    series: [{
      type: 'bar', data: top10.value.map((d) => d.value), label: { show: true, position: 'right', color: '#fff', fontSize: 10 },
      itemStyle: { color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [{ offset: 0, color: '#2f8cff' }, { offset: 1, color: '#67deff' }]) }
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
  const [a, c, u, r, m] = await Promise.all([
    axios.get('/data/province_aging_rate.csv'),
    axios.get('/data/population_center_shift.csv'),
    axios.get('/data/u3_health_resource_allocation.csv'),
    axios.get('/data/resident_health_indicators.csv'),
    axios.get('/data/medical_health_indicators.csv')
  ]);
  state.raw.aging = parseCSV(a.data);
  state.raw.center = parseCSV(c.data);
  state.raw.u3 = parseCSV(u.data);
  state.raw.resident = parseCSV(r.data);
  state.raw.medical = parseCSV(m.data);
};

watch(() => state.year, () => {
  scheduleDrawAll();
});

// 数据就绪后初始化图表、首帧绘制、轮播与 resize 监听
onMounted(async () => {
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
});

onBeforeUnmount(() => {
  // 取消动画帧、轮播、resize，销毁全部 ECharts 实例
  if (drawAllRaf) cancelAnimationFrame(drawAllRaf);
  drawAllRaf = 0;
  clearInterval(playTimer);
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
                  <span class="lab-desc">全国老龄化率（%）</span>
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
                  <span class="lab-desc">全国人均卫生费用（元）</span>
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
              <h1>中国老龄化背景下医疗资源错配可视化大屏</h1>
            </div>
          </div>
          <div class="top-metrics top-metrics-right">
            <div class="metric-ring">
              <div class="ring-particles" aria-hidden="true"></div>
              <div class="ring-orbit" aria-hidden="true"></div>
              <div class="ring-core">
                <div class="lab">
                  <span class="lab-year">{{ CARD_YEAR }}年</span>
                  <span class="lab-desc">全国平均预期寿命（岁）</span>
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
          <aside class="left">
            <div class="panel"><div class="panel-title">老龄化率 vs 医疗资源投入  ·  散点(气泡)图</div><div :ref="panels.l1" class="chart"></div></div>
            <div class="panel"><div class="panel-title">双重心空间轨迹对比  ·  折线图</div><div :ref="panels.l2" class="chart"></div></div>
            <div class="panel"><div class="panel-title">2012-2024医疗资源结构变化  ·  堆叠柱状图</div><div :ref="panels.l3" class="chart"></div></div>
          </aside>
          <main class="center">
            <!-- 地图：ECharts 容器 + 底部光圈/光束装饰 + 年份轴 -->
            <div class="map-panel panel">
              <div class="panel-title">全国各省老龄化率分布  ·  分级设色地图</div>
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
          <aside class="right">
            <div class="panel rsmall"><div class="panel-title">医疗需求 vs 医疗供给  ·  双Y轴曲线图</div><div :ref="panels.r1" class="chart small"></div></div>
            <div class="panel rsmall"><div class="panel-title">2024老龄化率Top10  ·  条形图</div><div :ref="panels.r2" class="chart small"></div></div>
            <div class="panel rsmall"><div class="panel-title">Top5省份资源配置雷达  ·  雷达图</div><div :ref="panels.r3" class="chart small"></div></div>
          </aside>
        </section>

        <!-- 底栏：桑基图 + 滚动排行 -->
        <section class="bottom">
          <div class="panel sankey-panel">
            <div class="panel-title">老龄化程度 → 医疗资源投入 → 健康服务产出  ·  桑基图</div>
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
          <div class="panel rank-panel">
            <div class="panel-title">2024老龄化率Top10滚动排行  ·  表格排行</div>
            <div class="rank-list">
              <div class="rank-track">
                <div class="row" v-for="(r, i) in rankingLoop" :key="`${r.province}-${i}`">
                  <span :class="['idx', { top3: i % 10 < 3 }]">{{ (i % 10) + 1 }}</span>
                  <span class="pn">{{ r.province }}</span>
                  <span class="pv">{{ fmt(r.value) }}%</span>
                  <span class="df">{{ r.diff >= 0 ? '+' : '' }}{{ fmt(r.diff) }}</span>
                  <div class="bar"><i :style="{ width: `${Math.min(100, r.value * 4)}%` }"></i></div>
                </div>
              </div>
            </div>
          </div>
        </section>
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
  font-size: 8px;
  line-height: 1.15;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.metric-ring .lab-desc {
  font-size: 8px;
  line-height: 1.18;
  font-weight: 500;
  text-align: center;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: normal;
}
.metric-ring .num {
  font-size: 16px;
  font-weight: 800;
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
.left, .right { display: grid; grid-template-rows: repeat(3, 1fr); gap: 12px; }
.left { transform: perspective(1500px) rotateY(8deg); transform-origin: right center; }
.right { transform: perspective(1500px) rotateY(-8deg); transform-origin: left center; }
.center { min-width: 0; }
/* 略透明，使底层星场能透出；不改变布局与边框 */
.panel { display: flex; flex-direction: column; background: linear-gradient(180deg, rgba(10,39,82,.52), rgba(3,18,44,.58)); border: 1px solid rgba(84,196,255,.5); box-shadow: 0 0 12px rgba(64,172,255,.45), inset 0 0 22px rgba(81,142,255,.18); border-radius: 8px; overflow: hidden; min-height: 0; }
.panel-title { flex-shrink: 0; min-height: 28px; line-height: 1.25; padding: 5px 10px; font-size: 11px; color: #def5ff; background: linear-gradient(90deg, rgba(33,131,198,.38), transparent); word-break: break-word; }
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
