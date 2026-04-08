<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import {
  BarChart,
  LineChart,
  PieChart,
  MapChart,
  RadarChart
} from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  VisualMapComponent
} from 'echarts/components'
import Papa from 'papaparse'

echarts.use([
  CanvasRenderer,
  BarChart,
  LineChart,
  PieChart,
  MapChart,
  RadarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  VisualMapComponent
])

const currentTime = ref('')
const currentYear = ref(2008)
const isPlaying = ref(false)
const screenEnterState = ref('screen-enter-pending')
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)
const DESIGN_WIDTH = 1920
const DESIGN_HEIGHT = 1080

const metricTargets = reactive({
  lifeExpectancy: 73.5,
  healthExp: 8.4,
  u5Mortality: 35.2,
  dpt: 86.7
})

const metricDisplay = reactive({
  lifeExpectancy: 0,
  healthExp: 0,
  u5Mortality: 0,
  dpt: 0
})

const refs = {
  whoGap: ref(null),
  trend: ref(null),
  riskDonut: ref(null),
  worldHeat: ref(null),
  lisa: ref(null),
  stack: ref(null),
  radar: ref(null),
  regionPie: ref(null)
}

const chartInstances = {}
let clockTimer = null
let refreshTimer = null
let playTimer = null
let worldMapReady = false
const EXTERNAL_DATA_DIR = '/@fs/e:/cursor/projects/bigbig_screen'
const CHART_ANIM_MS = 3200
let isFirstPaint = true

/** 与 two_bigscreen / screen 的 Vite 端口一致 */
const CHINA_DEV_PORT = 5173
const PROVINCES_DEV_PORT = 5174

/** 与当前页同一 hostname（localhost / 127.0.0.1），避免混用导致 Windows 下某一环回地址未监听而打不开 */
function navigateToOtherScreen() {
  const override = import.meta.env.VITE_CHINA_SCREEN_URL
  if (override) {
    window.location.assign(override)
    return
  }
  if (import.meta.env.DEV) {
    const { protocol, hostname } = window.location
    window.location.assign(`${protocol}//${hostname}:${CHINA_DEV_PORT}/`)
    return
  }
  window.location.assign('/two_bigscreen/')
}

function navigateToProvincesScreen() {
  const override = import.meta.env.VITE_PROVINCES_SCREEN_URL
  if (override) {
    window.location.assign(override)
    return
  }
  if (import.meta.env.DEV) {
    const { protocol, hostname } = window.location
    window.location.assign(`${protocol}//${hostname}:${PROVINCES_DEV_PORT}/`)
    return
  }
  window.location.assign('/screen/')
}

const WHO_REGION_MAP = {
  Afghanistan: 'EMRO',
  Albania: 'EURO',
  Algeria: 'AFRO',
  Angola: 'AFRO',
  Argentina: 'AMRO',
  Armenia: 'EURO',
  Australia: 'WPRO',
  Austria: 'EURO',
  Azerbaijan: 'EURO',
  Bangladesh: 'SEARO',
  Belarus: 'EURO',
  Belgium: 'EURO',
  Benin: 'AFRO',
  Bolivia: 'AMRO',
  Botswana: 'AFRO',
  Brazil: 'AMRO',
  Bulgaria: 'EURO',
  Cameroon: 'AFRO',
  Canada: 'AMRO',
  Chile: 'AMRO',
  China: 'WPRO',
  Colombia: 'AMRO',
  Croatia: 'EURO',
  Czechia: 'EURO',
  Denmark: 'EURO',
  Egypt: 'EMRO',
  Ethiopia: 'AFRO',
  Finland: 'EURO',
  France: 'EURO',
  Germany: 'EURO',
  Ghana: 'AFRO',
  Greece: 'EURO',
  Hungary: 'EURO',
  Iceland: 'EURO',
  India: 'SEARO',
  Indonesia: 'SEARO',
  Iran: 'EMRO',
  Iraq: 'EMRO',
  Ireland: 'EURO',
  Israel: 'EURO',
  Italy: 'EURO',
  Japan: 'WPRO',
  Jordan: 'EMRO',
  Kazakhstan: 'EURO',
  Kenya: 'AFRO',
  Mexico: 'AMRO',
  Morocco: 'EMRO',
  Netherlands: 'EURO',
  NewZealand: 'WPRO',
  Nigeria: 'AFRO',
  Norway: 'EURO',
  Pakistan: 'EMRO',
  Peru: 'AMRO',
  Philippines: 'WPRO',
  Poland: 'EURO',
  Portugal: 'EURO',
  Romania: 'EURO',
  RussianFederation: 'EURO',
  SaudiArabia: 'EMRO',
  SouthAfrica: 'AFRO',
  Spain: 'EURO',
  Sweden: 'EURO',
  Switzerland: 'EURO',
  Thailand: 'SEARO',
  Turkey: 'EURO',
  Ukraine: 'EURO',
  UnitedKingdom: 'EURO',
  UnitedStatesofAmerica: 'AMRO',
  VietNam: 'WPRO'
}

const FALLBACK_WHO_GAP = [
  { WHO_Region: 'AFRO', Mean_Gap: 0.233 },
  { WHO_Region: 'SEARO', Mean_Gap: 0.034 },
  { WHO_Region: 'WPRO', Mean_Gap: -0.061 },
  { WHO_Region: 'EMRO', Mean_Gap: -0.075 },
  { WHO_Region: 'AMRO', Mean_Gap: -0.161 },
  { WHO_Region: 'EURO', Mean_Gap: -0.279 }
]

const healthRows = ref([])
const lisaRows = ref([])
const whoGapRows = ref([])
const trendRows = ref([])
const stageStyle = computed(() => {
  const scale = Math.min(viewportWidth.value / DESIGN_WIDTH, viewportHeight.value / DESIGN_HEIGHT)
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  return {
    width: `${DESIGN_WIDTH}px`,
    height: `${DESIGN_HEIGHT}px`,
    transform: `scale(${safeScale})`
  }
})

const metricCards = computed(() => [
  { label: '全球平均预期寿命', value: metricDisplay.lifeExpectancy, unit: '岁', color: '#00f0ff', icon: '🫀' },
  { label: '医疗支出占GDP比例', value: metricDisplay.healthExp, unit: '%', color: '#64ffda', icon: '💰' },
  { label: '5岁以下死亡率', value: metricDisplay.u5Mortality, unit: '‰', color: '#ff7e79', icon: '🧒' },
  { label: 'DPT接种率', value: metricDisplay.dpt, unit: '%', color: '#f9f06b', icon: '💉' }
])

function formatDate(now = new Date()) {
  const pad = (num) => String(num).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function parseNumeric(value, fallback = 0) {
  const num = Number.parseFloat(value)
  return Number.isFinite(num) ? num : fallback
}

function getField(row, keys, fallback = undefined) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key]
  }
  return fallback
}

function normalizeCountryKey(country) {
  return String(country || '').replace(/[\s\-().]/g, '')
}

function cleanHeaderKey(key) {
  return String(key || '').replace(/^\uFEFF/, '').trim()
}

function sanitizeCsvRows(rows) {
  return rows.map((row) => {
    const normalized = {}
    Object.entries(row || {}).forEach(([k, v]) => {
      normalized[cleanHeaderKey(k)] = v
    })
    return normalized
  })
}

function hasRequiredFields(rows, requiredFields = []) {
  if (!requiredFields.length) return rows.length > 0
  if (!rows.length) return false
  const headers = new Set(Object.keys(rows[0] || {}))
  return requiredFields.every((field) => {
    if (Array.isArray(field)) return field.some((alias) => headers.has(alias))
    return headers.has(field)
  })
}

async function loadCsvRows(fileCandidates, requiredFields = []) {
  for (const file of fileCandidates) {
    try {
      const res = await fetch(file)
      if (!res.ok) continue
      const text = await res.text()
      const parsed = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true })
      const cleaned = sanitizeCsvRows(parsed?.data || [])
      if (hasRequiredFields(cleaned, requiredFields)) return cleaned
    } catch (_e) {
      // ignore this candidate and try next
    }
  }
  return []
}

function buildFallbackTrend(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const y = Number(row.year)
    if (!Number.isFinite(y)) continue
    if (!grouped.has(y)) {
      grouped.set(y, { need: [], u3: [], gap: [] })
    }
    const bucket = grouped.get(y)
    bucket.need.push(parseNumeric(row.U1_Score))
    bucket.u3.push(parseNumeric(row.U3_Score))
    bucket.gap.push(parseNumeric(row.D_Value) - parseNumeric(row.U1_Score))
  }
  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, bucket]) => ({
      Year: year,
      Mean_Need_Score: bucket.need.reduce((s, n) => s + n, 0) / (bucket.need.length || 1),
      Mean_U3_Score: bucket.u3.reduce((s, n) => s + n, 0) / (bucket.u3.length || 1),
      Mean_Resource_Gap: bucket.gap.reduce((s, n) => s + n, 0) / (bucket.gap.length || 1)
    }))
}

function buildFallbackWhoGap(rows) {
  const currentRows = rows.filter((r) => Number(r.year) === 2023)
  if (!currentRows.length) return FALLBACK_WHO_GAP
  const grouped = new Map()
  currentRows.forEach((row) => {
    const key = WHO_REGION_MAP[normalizeCountryKey(row.country)] || 'OTHER'
    if (key === 'OTHER') return
    if (!grouped.has(key)) grouped.set(key, [])
    const gap = parseNumeric(row.D_Value) - parseNumeric(row.U1_Score)
    grouped.get(key).push(gap)
  })
  const arr = ['AFRO', 'SEARO', 'WPRO', 'EMRO', 'AMRO', 'EURO'].map((region) => {
    const values = grouped.get(region) || []
    return {
      WHO_Region: region,
      Mean_Gap: values.length ? values.reduce((s, n) => s + n, 0) / values.length : 0
    }
  })
  return arr.some((d) => d.Mean_Gap !== 0) ? arr : FALLBACK_WHO_GAP
}

function computeMetrics() {
  const rows2023 = healthRows.value.filter((r) => Number(r.year) === 2023)
  const avg = (field, fb) => {
    if (!rows2023.length) return fb
    const vals = rows2023.map((r) => parseNumeric(r[field])).filter((n) => Number.isFinite(n))
    return vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : fb
  }
  metricTargets.lifeExpectancy = avg('U3_Life_Expectancy', 73.5)
  metricTargets.healthExp = avg('U3_Health_Expenditure_pct_GDP_pct_of_GDP', 8.4)
  metricTargets.u5Mortality = avg('Under5_Mortality_Rate', 35.2)
  metricTargets.dpt = avg('DPT_Immunization_Coverage', 86.7)
}

function animateMetricNumbers() {
  const duration = CHART_ANIM_MS
  const start = performance.now()
  const begin = { ...metricDisplay }
  const targets = { ...metricTargets }
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration)
    // Bounce-like growth for KPI cards
    const eased = p < 0.85 ? 1 - Math.pow(1 - p / 0.85, 3) : 1 + 0.06 * Math.sin((p - 0.85) * 35) * (1 - p)
    Object.keys(begin).forEach((key) => {
      metricDisplay[key] = begin[key] + (targets[key] - begin[key]) * eased
    })
    if (p < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

function getCommonChartBase(title) {
  return {
    backgroundColor: 'transparent',
    animationDuration: isFirstPaint ? 0 : CHART_ANIM_MS,
    animationDurationUpdate: isFirstPaint ? 0 : CHART_ANIM_MS,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    title: {
      text: title,
      left: 12,
      top: 10,
      textStyle: { color: '#ffffff', fontSize: 16, fontWeight: 600 }
    },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(10,25,47,0.94)',
      borderColor: 'rgba(0,240,255,0.5)',
      borderWidth: 1,
      textStyle: { color: '#ffffff' }
    },
    grid: { left: 45, right: 24, top: 52, bottom: 36, containLabel: true }
  }
}

function setWhoGapChart() {
  const chart = chartInstances.whoGap
  if (!chart) return
  const rows = whoGapRows.value
  chart.setOption({
    ...getCommonChartBase('WHO 各区域 2023 年平均资源需求缺口'),
    grid: {
      left: 65,    // 左边距（越小图表越靠左）
      right: 40,   // 右边距
      top: 56,     // 上边距（控制图表上下位置）
      bottom: 80,  // 下边距
      width: '80%',// 整个图表宽度（越大越宽）
      height: '68%'// 整个图表高度（越大越高）
    },
    xAxis: {
      type: 'category',
      data: rows.map((d) => d.WHO_Region),
      axisLabel: { color: '#81a1c1' },
      axisLine: { lineStyle: { color: '#4e6a8d' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#81a1c1' },
      splitLine: { lineStyle: { color: 'rgba(78,106,141,0.35)' } }
    },
    series: [
      {
        type: 'bar',
        barWidth: '76%',
        data: rows.map((d) => ({
          value: d.Mean_Gap,
          itemStyle: { color: d.Mean_Gap >= 0 ? '#00f0ff' : '#ff7e79' }
        })),
        label: {
          show: true,
          position: 'top',
          color: '#ffffff',
          formatter: ({ value }) => Number(value).toFixed(3)
        }
      },
      {
        type: 'line',
        data: rows.map(() => 0),
        symbol: 'none',
        lineStyle: { type: 'dashed', color: '#81a1c1', width: 1 }
      }
    ]
  })
}

function setTrendChart() {
  const chart = chartInstances.trend
  if (!chart) return
  const rows = trendRows.value
  chart.setOption({
    ...getCommonChartBase('全球资源需求、资源容量与缺口趋势（2000-2023）'),
    grid: {
      left: 65,      // 左边距
      right: 40,     // 右边距
      top: 50,       // 上边距（数字越大，图表越往下）
      bottom: 40,    // 下边距
      width: "80%",  // 整个图表宽度（越大越宽）
      height: "62%"  // 整个图表高度（越大越高）
    },
    legend: {
      bottom: 3,
      right: 27,
      textStyle: { color: '#81a1c1' }
    },
    xAxis: {
      type: 'category',
      data: rows.map((d) => Number(getField(d, ['Year', 'year'], 0))),
      axisLabel: { color: '#81a1c1' },
      axisLine: { lineStyle: { color: '#4e6a8d' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#81a1c1' },
      splitLine: { lineStyle: { color: 'rgba(78,106,141,0.35)' } }
    },
    series: [
      {
        name: 'Mean Need Score',
        type: 'line',
        smooth: true,
        animationDuration: CHART_ANIM_MS,
        animationEasing: 'linear',
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#007acc' },
        itemStyle: { color: '#007acc' },
        data: rows.map((d) => Number(d.Mean_Need_Score))
      },
      {
        name: 'Mean Resource Score (U3)',
        type: 'line',
        smooth: true,
        animationDuration: CHART_ANIM_MS,
        animationEasing: 'linear',
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#ff9f43' },
        itemStyle: { color: '#ff9f43' },
        data: rows.map((d) => Number(d.Mean_U3_Score))
      },
      {
        name: 'Mean Resource Gap',
        type: 'line',
        smooth: true,
        animationDuration: CHART_ANIM_MS,
        animationEasing: 'linear',
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#4caf50' },
        itemStyle: { color: '#4caf50' },
        data: rows.map((d) => Number(d.Mean_Resource_Gap))
      },
      {
        type: 'line',
        data: rows.map(() => 0),
        symbol: 'none',
        lineStyle: { type: 'dashed', color: '#81a1c1', width: 1 }
      }
    ]
  })
}

function setRiskDonutChart() {
  const chart = chartInstances.riskDonut
  if (!chart) return
  const rows2023 = healthRows.value.filter((r) => Number(r.year) === 2023)
  const fields = [
    { label: '空气污染', key: 'Ambient particulate matter pollution' },
    { label: '饮食风险', key: 'Dietary risks' },
    { label: '吸烟', key: 'Smoking' },
    { label: '高BMI', key: 'High body-mass index' },
    { label: '缺乏运动', key: 'Low physical activity' }
  ]
  const data = fields.map((f) => {
    const vals = rows2023.map((r) => parseNumeric(r[f.key])).filter((n) => Number.isFinite(n))
    return { name: f.label, value: vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : 0 }
  })
  chart.setOption({
    ...getCommonChartBase('主要健康风险因素占比（2023 多国均值）'),
    title: {
      ...getCommonChartBase('').title,
      text: '主要健康风险因素占比（2023 多国均值）',
      top: 8,
      left: 12,
      textStyle: { color: '#ffffff', fontSize: 16, fontWeight: 600 }
    },
    legend: {
      orient: 'vertical',
      right: 35,
      top: 'middle',
      width: 210,
      itemWidth: 25,
      itemHeight: 15,
      itemGap: 18,
      textStyle: { color: '#81a1c1', fontSize: 12, padding: [0, 0, 0, 6] }
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '73%'],
        center: ['40%', '57%'],
        avoidLabelOverlap: true,
        selectedMode: 'single',
        itemStyle: {
          borderColor: '#0a192f',
          borderWidth: 3
        },
        emphasis: {
          scale: true,
          scaleSize: 12
        },
        label: { color: '#ffffff', fontSize: 12 },
        labelLine: { length: 14, length2: 10 },
        labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
        color: ['#00f0ff', '#64ffda', '#ff7e79', '#f9f06b', '#a78bfa'],
        data
      }
    ]
  })
}

function setWorldHeatMap() {
  const chart = chartInstances.worldHeat
  if (!chart || !worldMapReady) return
  const yearRows = healthRows.value.filter((r) => Number(r.year) === Number(currentYear.value))
  const data = yearRows.map((r) => ({ name: r.country, value: parseNumeric(r.U3_Physicians_per_1000) }))
  const max = Math.max(...data.map((d) => d.value), 1)
  chart.setOption({
    ...getCommonChartBase(`世界地图·每千人医生数（${currentYear.value}年）热力`),
    tooltip: {
      ...getCommonChartBase('').tooltip,
      formatter: ({ name, value }) => {
        const row = yearRows.find((r) => r.country === name)
        if (!row) return `${name}<br/>每千人医生数: 0`
        return `${name}<br/>每千人医生数: ${parseNumeric(value).toFixed(3)}<br/>预期寿命: ${parseNumeric(row.U3_Life_Expectancy).toFixed(2)}`
      }
    },
    visualMap: {
      min: 0,
      max,
      right: 14,
      bottom: 18,
      text: ['高', '低'],
      textStyle: { color: '#81a1c1' },
      calculable: true,
      inRange: { color: ['#00f0ff', '#0066ff', '#001a8f'] }
    },
    series: [
      {
        type: 'map',
        map: 'world',
        roam: true,
        zoom: 1.05,
            // 👇 👇 【唯一能移动地图的配置】
        layoutCenter: ['50%', '55%'], // 第二个数字越大 → 越往下
        layoutSize: '140%',
        
        emphasis: {
          label: { color: '#ffffff' },
          itemStyle: { borderColor: '#00f0ff', borderWidth: 2 }
        },
        itemStyle: {
          borderColor: '#4e6a8d',
          borderWidth: 0.8,
          areaColor: '#173a66'
        },
        data
      }
    ]
  })
}

function setLisaMap() {
  const chart = chartInstances.lisa
  if (!chart || !worldMapReady) return
  const data = lisaRows.value.map((r) => {
    const clusterType = r.cluster || r.lisa_cluster || 'Other'
    let value = 0
    let color = '#81a1c1'
    if (clusterType === 'High-High') {
      value = 2
      color = '#ff4757'
    } else if (clusterType === 'Low-Low') {
      value = 1
      color = '#007acc'
    }
    return { name: r.country, value, dValue: parseNumeric(r.D_Value), cluster: clusterType, itemStyle: { areaColor: color } }
  })
  chart.setOption({
    ...getCommonChartBase('2023 年 D 值 LISA 聚类全球空间分布地图'),
    tooltip: {
      ...getCommonChartBase('').tooltip,
      formatter: ({ data: d, name }) => `${name}<br/>D_Value: ${(d?.dValue ?? 0).toFixed(4)}<br/>聚类: ${d?.cluster ?? '其他'}`
    },
    series: [
      {
        type: 'map',
        map: 'world',
        roam: false,

            // 👇 👇 【唯一能移动地图的配置】
        layoutCenter: ['50%', '55%'], // 第二个数字越大 → 越往下
        layoutSize: '140%',

        emphasis: {
          itemStyle: { borderColor: '#00f0ff', borderWidth: 2 }
        },
        itemStyle: {
          borderColor: '#4e6a8d',
          borderWidth: 0.8,
          areaColor: '#2a3f5f'
        },
        data
      }
    ]
  })
}

function setStackChart() {
  const chart = chartInstances.stack
  if (!chart) return
  const rows = healthRows.value.filter((r) => Number(r.year) === 2023).sort((a, b) => parseNumeric(b.D_Value) - parseNumeric(a.D_Value)).slice(0, 6)
  const countries = rows.map((r) => r.country)
  const stackSeriesBase = {
    type: 'bar',
    stack: 'total',
    barWidth: 16,
    barMaxWidth: 20,
    barCategoryGap: '48%'
  }
  chart.setOption({
    ...getCommonChartBase('全球健康资源指标堆叠分布'),
    // Leave a dedicated right-side legend column:
    // - grid shrinks a bit and shifts left
    // - legend becomes vertical on the right
    grid: { left: 25, right: 110, top: 62, bottom: 20, containLabel: true },
    legend: {
      orient: 'vertical',
      right: 12,
      top: 'middle',
      data: ['D_Value', 'U1_Score', 'U2_Score', 'U3_Score'],
      itemWidth: 14,
      itemHeight: 10,
      itemGap: 10,
      textStyle: {
        color: '#81a1c1',
        fontSize: 11,
        lineHeight: 12,
        padding: [0, 0, 0, 6]
      }
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#81a1c1' },
      axisLine: { lineStyle: { color: '#4e6a8d' } }
    },
    yAxis: {
      type: 'category',
      data: countries,
      axisLabel: { color: '#81a1c1', fontSize: 11, margin: 12, interval: 0 },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(78,106,141,0.35)' } }
    },
    series: [
      {
        name: 'U1_Score',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#00f0ff' },
        data: rows.map((r) => parseNumeric(r.U1_Score)),
        barWidth: '16px',
        barCategoryGap: '40%'
      },
      {
        name: 'U2_Score',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#64ffda' },
        data: rows.map((r) => parseNumeric(r.U2_Score)),
        barWidth: '12px',
        barCategoryGap: '40%'
      },
      {
        name: 'U3_Score',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#ff7e79' },
        data: rows.map((r) => parseNumeric(r.U3_Score)),
        barWidth: '12px',
        barCategoryGap: '40%'
      },
      {
        name: 'D_Value',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#f9f06b' },
        data: rows.map((r) => parseNumeric(r.D_Value)),
        barWidth: '12px',
        barCategoryGap: '40%'
      }
    ]
  }, { notMerge: true, lazyUpdate: false })
}

function setRadarChart() {
  const chart = chartInstances.radar
  if (!chart) return
  const dims = ['D_Value', 'T_Value', 'U1_Score', 'U2_Score', 'U3_Score']
  const rows2023 = healthRows.value.filter((r) => Number(r.year) === 2023)
  const chinaRows2023 = rows2023.filter((r) => String(r.country).toLowerCase() === 'china')

  const buildValues = (rows) =>
    dims.map((dim) => {
      const arr = rows.map((r) => parseNumeric(r[dim])).filter((n) => Number.isFinite(n))
      return arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0
    })

  const seriesData = [
    {
      name: '全球',
      value: buildValues(rows2023),
      lineStyle: { color: '#f9f06b', width: 2 },
      itemStyle: { color: '#f9f06b' },
      areaStyle: { color: 'rgba(249, 240, 107, 0.28)' }
    },
    {
      name: '中国',
      value: buildValues(chinaRows2023),
      lineStyle: { color: '#64ff7a', width: 2 },
      itemStyle: { color: '#64ff7a' },
      areaStyle: { color: 'rgba(100, 255, 122, 0.28)' }
    }
  ]
  chart.setOption({
    ...getCommonChartBase('23年全球 vs 中国健康资源多维度雷达评估'),
    grid: { left: 45, right: 76, top: 52, bottom: 36, containLabel: true },
    legend: {
      orient: 'horizontal',
      right: 15,
      top: 10,
      itemGap: 10,
      data: ['全球', '中国'],
      textStyle: { color: '#81a1c1', fontSize: 11 }
    },
    radar: {
      center: ['50%', '62%'],
      radius: '70%',
      splitNumber: 5,
      axisName: { color: '#81a1c1' },
      splitLine: { lineStyle: { color: 'rgba(129,161,193,0.35)' } },
      splitArea: { areaStyle: { color: ['rgba(0,0,0,0)', 'rgba(0,240,255,0.03)'] } },
      indicator: dims.map((d) => ({ name: d, max: 1.2 }))
    },
    series: [
      {
        type: 'radar',
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: { width: 2 },
        data: seriesData
      }
    ]
  })
}

function setRegionPieChart() {
  const chart = chartInstances.regionPie
  if (!chart) return
  const rows = healthRows.value.filter((r) => Number(r.year) === 2023)
  const grouped = new Map()
  rows.forEach((r) => {
    const region = WHO_REGION_MAP[normalizeCountryKey(r.country)] || 'OTHER'
    if (!grouped.has(region)) grouped.set(region, [])
    grouped.get(region).push(parseNumeric(r.D_Value))
  })
  const data = [...grouped.entries()].map(([name, values]) => ({
    name,
    value: values.reduce((s, n) => s + n, 0) / (values.length || 1)
  }))
  chart.setOption({
    ...getCommonChartBase('健康数据地区分布占比'),
    title: {
      ...getCommonChartBase('').title,
      text: '健康数据地区分布占比',
      top: 8,
      left: 12,
      textStyle: { color: '#ffffff', fontSize: 16, fontWeight: 600 }
    },
    grid: { left: 45, right: 68, top: 52, bottom: 36, containLabel: true },
    legend: {
      orient: 'vertical',
      right: 48,
      top: 'middle',
      width: 210,
      itemWidth: 24,
      itemHeight: 18,
      itemGap: 12,
      textStyle: { color: '#81a1c1', fontSize: 12, padding: [0, 0, 0, 6] }
    },
    series: [
      {
        type: 'pie',
        radius: '70%',
        center: ['40%', '57%'],
        label: { color: '#ffffff', fontSize: 12 },
        labelLine: { length: 14, length2: 10 },
        labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
        emphasis: { scale: true, scaleSize: 10 },
        data
      }
    ]
  })
}

function renderAllCharts() {
  setWhoGapChart()
  setTrendChart()
  setRiskDonutChart()
  setWorldHeatMap()
  setLisaMap()
  setStackChart()
  setRadarChart()
  setRegionPieChart()
}

function renderZeroCharts() {
  const zeroWho = whoGapRows.value.map((d) => ({ ...d, Mean_Gap: 0 }))
  const zeroTrend = trendRows.value.map((d) => ({ ...d, Mean_Need_Score: 0, Mean_U3_Score: 0, Mean_Resource_Gap: 0 }))
  const oldWho = whoGapRows.value
  const oldTrend = trendRows.value
  whoGapRows.value = zeroWho
  trendRows.value = zeroTrend
  setWhoGapChart()
  setTrendChart()
  whoGapRows.value = oldWho
  trendRows.value = oldTrend
}

async function loadAllData() {
  const healthCandidates = [
    '/health_datas.csv',
    './health_datas.csv',
    '../health_datas.csv',
    '../../health_datas.csv',
    `${EXTERNAL_DATA_DIR}/health_datas.csv`
  ]
  const lisaCandidates = [
    '/lisa_cluster_result_knn5.csv',
    './lisa_cluster_result_knn5.csv',
    '../lisa_cluster_result_knn5.csv',
    '../../lisa_cluster_result_knn5.csv',
    `${EXTERNAL_DATA_DIR}/lisa_cluster_result_knn5.csv`
  ]
  const whoGapCandidates = [
    '/WHO_Region_Mean_Resource_Demand_Gap_2023.csv',
    './WHO_Region_Mean_Resource_Demand_Gap_2023.csv',
    '../WHO_Region_Mean_Resource_Demand_Gap_2023.csv',
    '../../WHO_Region_Mean_Resource_Demand_Gap_2023.csv',
    `${EXTERNAL_DATA_DIR}/WHO_Region_Mean_Resource_Demand_Gap_2023.csv`
  ]
  const trendCandidates = [
    '/Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv',
    './Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv',
    '../Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv',
    '../../Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv',
    `${EXTERNAL_DATA_DIR}/Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv`
  ]
  const [health, lisa, whoGap, trend] = await Promise.all([
    loadCsvRows(healthCandidates, ['country', 'year', 'U1_Score', 'U2_Score', 'U3_Score', 'D_Value']),
    loadCsvRows(lisaCandidates, ['country', 'year', 'D_Value']),
    loadCsvRows(whoGapCandidates, ['WHO_Region', 'Mean_Gap']),
    loadCsvRows(trendCandidates, [['Year', 'year'], 'Mean_Need_Score', 'Mean_U3_Score', 'Mean_Resource_Gap'])
  ])
  healthRows.value = health
  lisaRows.value = lisa
  whoGapRows.value = whoGap.length ? whoGap : buildFallbackWhoGap(health)
  trendRows.value = trend.length ? trend : buildFallbackTrend(health)
  computeMetrics()
  animateMetricNumbers()
}

async function ensureWorldMap() {
  if (worldMapReady) return
  try {
    const res = await fetch('/world.geo.json')
    if (res.ok) {
      const geoJson = await res.json()
      echarts.registerMap('world', geoJson)
      worldMapReady = true
      return
    }
  } catch (_error) {
    // ignore and try fallback source
  }
  try {
    const res = await fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
    if (res.ok) {
      const geoJson = await res.json()
      echarts.registerMap('world', geoJson)
      worldMapReady = true
      return
    }
  } catch (_error) {
    // If remote map loading fails, use fallback minimal map to keep app running.
  }
  echarts.registerMap('world', { type: 'FeatureCollection', features: [] })
  worldMapReady = true
}

function initCharts() {
  Object.keys(refs).forEach((key) => {
    const el = refs[key].value
    if (el && !chartInstances[key]) {
      chartInstances[key] = echarts.init(el, null, { renderer: 'canvas' })
    }
  })
}

function handleResize() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
  Object.values(chartInstances).forEach((chart) => chart?.resize())
}

async function waitForChartContainersReady(timeoutMs = 2500) {
  const start = performance.now()
  const getEls = () =>
    Object.values(refs)
      .map((r) => r?.value)
      .filter(Boolean)

  const tick = (resolve) => {
    const els = getEls()
    const allReady = els.every((el) => el.clientWidth > 0 && el.clientHeight > 0)
    if (allReady) return resolve(true)
    if (performance.now() - start > timeoutMs) return resolve(false)
    requestAnimationFrame(() => tick(resolve))
  }

  return new Promise((resolve) => tick(resolve))
}

function togglePlay() {
  isPlaying.value = !isPlaying.value
  if (isPlaying.value) {
    playTimer = setInterval(() => {
      currentYear.value = currentYear.value >= 2023 ? 2000 : currentYear.value + 1
      setWorldHeatMap()
    }, 1000)
  } else if (playTimer) {
    clearInterval(playTimer)
    playTimer = null
  }
}

function onYearChange(event) {
  currentYear.value = Number(event.target.value)
  setWorldHeatMap()
}

async function refreshDataWithMotion(useZeroStaging = true) {
  await loadAllData()
  // Disable periodic zero-staging animation for left charts (bar/line)
  // to keep them static between refresh cycles.
  if (useZeroStaging) {
    // renderZeroCharts()
  }
  renderAllCharts()
  // Data refresh may happen while layout is being scaled; ensure final size.
  await nextTick()
  handleResize()
}

onMounted(async () => {
  document.body.classList.add('screen-enter-pending')
  document.body.classList.remove('screen-enter-play')
  currentTime.value = formatDate()
  clockTimer = setInterval(() => {
    currentTime.value = formatDate()
  }, 1000)

  await nextTick()
  await ensureWorldMap()
  // Avoid ECharts: Can't get DOM width or height (charts created before layout)
  await waitForChartContainersReady()
  initCharts()
  await refreshDataWithMotion(false)
  isFirstPaint = false
  // Play the 4.2s screen intro only after charts/data are ready.
  requestAnimationFrame(() => {
    screenEnterState.value = 'screen-enter-play'
    document.body.classList.remove('screen-enter-pending')
    document.body.classList.add('screen-enter-play')
  })
  window.addEventListener('resize', handleResize)

  refreshTimer = setInterval(async () => {
    await refreshDataWithMotion(true)
  }, 15000)
})

onBeforeUnmount(() => {
  document.body.classList.remove('screen-enter-pending')
  document.body.classList.remove('screen-enter-play')
  if (clockTimer) clearInterval(clockTimer)
  if (refreshTimer) clearInterval(refreshTimer)
  if (playTimer) clearInterval(playTimer)
  window.removeEventListener('resize', handleResize)
  Object.values(chartInstances).forEach((chart) => chart?.dispose())
})
</script>

<template>
  <div class="viewport">
    <div class="stage" :style="stageStyle">
      <div class="screen" :class="screenEnterState">
    <div class="screen-switch-wrap">
      <button type="button" class="screen-switch-btn" @click="navigateToOtherScreen">
        <span class="screen-switch-btn__text">切换中国</span>
      </button>
      <button type="button" class="screen-switch-btn" @click="navigateToProvincesScreen">
        <span class="screen-switch-btn__text">切换各省</span>
      </button>
    </div>
    <header class="top top-bar panel fade-in">
      <div class="top-metrics top-metrics-left"></div>
      <div class="top-title">
        <div class="title-pedestal">
          <div class="pedestal-bg" aria-hidden="true">
            <svg class="pedestal-svg" viewBox="0 0 900 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="diamondLine" x1="0%" y1="50%" x2="100%" y2="50%">
                  <stop offset="0%" stop-color="#2fdcff" stop-opacity="0.2" />
                  <stop offset="30%" stop-color="#7cebff" stop-opacity="1" />
                  <stop offset="70%" stop-color="#37b8ff" stop-opacity="1" />
                  <stop offset="100%" stop-color="#2fdcff" stop-opacity="0.2" />
                </linearGradient>
                <filter id="diamondGlow" x="-20%" y="-60%" width="140%" height="220%">
                  <feGaussianBlur stdDeviation="3.8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g filter="url(#diamondGlow)" fill="none" stroke="url(#diamondLine)" stroke-width="3">
                <polygon points="140,62 220,35 300,62 220,89" />
                <polygon points="300,62 450,16 600,62 450,108" />
                <polygon points="600,62 680,35 760,62 680,89" />
              </g>
            </svg>
          </div>
          <h1>全球健康资源分布可视化大屏</h1>
        </div>
      </div>
      <div class="top-metrics top-metrics-right">
        <div class="time">{{ currentTime }}</div>
      </div>
    </header>

        <section class="kpi-grid fade-in">
          <article v-for="item in metricCards" :key="item.label" class="panel kpi-card">
            <div class="kpi-head">
              <span class="kpi-icon">{{ item.icon }}</span>
              <span class="kpi-label">{{ item.label }}</span>
            </div>
            <div class="kpi-value" :style="{ color: item.color }">{{ item.value.toFixed(2) }} <small>{{ item.unit }}</small></div>
          </article>
        </section>

        <main class="dashboard-grid">
          <section class="left-col">
            <div class="panel chart-card fade-in">
              <div :ref="refs.whoGap" class="chart"></div>
            </div>
            <div class="panel chart-card fade-in">
              <div :ref="refs.trend" class="chart"></div>
            </div>
            <div class="panel chart-card fade-in">
              <div :ref="refs.riskDonut" class="chart"></div>
            </div>
          </section>

          <section class="center-col">
            <div class="panel map-card fade-in">
              <div :ref="refs.worldHeat" class="chart map-chart"></div>
              <div class="timeline-control">
                <button class="play-btn" @click="togglePlay">{{ isPlaying ? '❚❚' : '▶' }}</button>
                <span>2000</span>
                <input type="range" min="2000" max="2023" :value="currentYear" @input="onYearChange" />
                <strong>{{ currentYear }}</strong>
                <span>2023</span>
              </div>
            </div>
            <div class="panel map-card fade-in">
              <div :ref="refs.lisa" class="chart map-chart"></div>
            </div>
          </section>

          <section class="right-col">
            <div class="panel chart-card fade-in">
              <div :ref="refs.stack" class="chart"></div>
            </div>
            <div class="panel chart-card fade-in">
              <div :ref="refs.radar" class="chart"></div>
            </div>
            <div class="panel chart-card fade-in">
              <div :ref="refs.regionPie" class="chart"></div>
            </div>
          </section>
        </main>
      </div>
    </div>
  </div>
</template>
