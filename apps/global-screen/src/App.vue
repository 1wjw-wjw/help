<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
const asset = (relativePath) => `${import.meta.env.BASE_URL}${relativePath}`
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
const clusterRows = ref([])
const clusterSummaryRows = ref([])
const representativeProfileRows = ref([])
const moduleText = {
  whoGap: {
    explain:
      '该图用于比较 WHO 六大区域在 2023 年资源需求缺口的平均水平。柱体正负反映缺口方向，绝对值反映结构压力强弱：缺口越大说明需要优先补足的资源缺口越明显，据此形成区域治理优先序。',
    conclusion:
      '论文显示全球协同水平虽在提升，但区域分异长期存在。资源端约束在多数国家普遍可见，区域层面同样体现明显不均衡，需按区域差异开展针对性补短板。'
  },
  trend: {
    explain:
      '该图展示 2000—2023 年全球需求水平、资源水平与资源缺口的动态演化。通过三条序列相对位置的变化，可观察资源投入与健康结果改善在时间维度上的匹配程度；同时用于识别长期上升与阶段性拐点，而非单一国家横向比较。',
    conclusion:
      '论文结果表明全球三系统协调度总体上升，但后期增幅趋缓。资源投入与健康结果改善并非线性同步，资源转化效率与结构适配仍是关键约束。'
  },
  riskDonut: {
    explain:
      '该图展示主要健康风险因素在样本国家中的相对占比结构。占比差异反映各风险在“风险暴露—健康损失”链条中的权重高低，从而提示治理应优先聚焦占比更高、影响更集中的风险类型，并在结构干预中形成差异化路径。',
    conclusion:
      '论文指出风险暴露会显著传导至健康损失，且在资源不足情景下影响更强。风险治理应从“总量控制”转向“结构干预”，按风险类型实施差异化策略。'
  },
  worldHeat: {
    explain:
      '该图按年份展示全球三系统耦合协调度 D 值的空间分布，颜色越深代表协同水平越高。结合时间轴可以从整体上判断：高值区与低值区在演化中保持相对稳定的空间层级，同时总体协同水平随时间呈提升趋势。',
    conclusion:
      '论文显示高值区主要在欧洲、北美和大洋洲，低值区更多位于撒哈拉以南非洲及南亚部分地区。全球平均 D 值总体提升，但空间分层特征仍持续存在。'
  },
  lisa: {
    explain:
      '该图用于识别 2023 年 D 值在局部空间上的集聚关系。图中呈现的“高值集聚/低值集聚”说明协同差异并非随机分布，而是存在局部空间联动：高值区域在周边更易延续、低值区域则更易形成连续低位，从而反映稳定的空间依赖结构。',
    conclusion:
      '论文中 Moran’s I 检验结果显著，说明全球协同差异存在稳定空间依赖。欧洲高值集聚明显、撒哈拉以南非洲低值集聚突出，中国周边高值联动仍有提升空间。'
  },
  stack: {
    explain:
      '该图按四种国家结构类型选取代表国家，展示 D 值与三类结构差值指标的堆叠画像。堆叠中各差值指标的正负与高度共同刻画了不同类型国家的“相对优势—短板来源”，因此可用于比较各类型内部结构特征差异，而不仅是单点水平高低。',
    conclusion:
      '论文将国家划分为结果优势型、资源支撑型、资源短板型、协调脆弱型四类，并指出类型间存在明显结构差异与演化惯性。治理应按类型分层施策，而非统一配置。'
  },
  radar: {
    explain:
      '该图从多维指标对比中国与全球在风险—资源—结果系统中的相对结构位置，用于识别中国在协同水平与短板维度上的差异。通过雷达各轴的整体形态可判断，中国在资源支撑相关维度的表现相对更突出，而结果改善维度的相对优势相对不足。',
    conclusion:
      '论文指出中国处于中高协调轨道并归入资源支撑型，但与结果优势型国家相比，结果改善与整体协同仍有提升空间，后续重点在于强化资源转化效率。'
  },
  regionPie: {
    explain:
      '该图基于 K=4 结构分型结果，按各类型国家数量展示全球样本中的类型规模占比。扇区面积反映全球结构构成的“类型权重”，并提示不同类型在样本中所占比重差异显著；结合悬浮信息可进一步理解每一类型的主导特征与关键结构差值。',
    conclusion:
      '论文显示四类国家在特征空间形成清晰分布且存在连续过渡。结果优势型维持高协调概率更高，协调脆弱型低位锁定更突出，全球治理应采用类型化差异路径。'
  }
}
const openMenuKey = ref('')
const hoverInfo = reactive({ key: '', type: '' })
const modulePanelEls = {}
const popupPosition = reactive({ left: 0, top: 0, width: 300, maxHeight: 300 })
let hoverTimer = null
const stageStyle = computed(() => {
  const scale = Math.min(viewportWidth.value / DESIGN_WIDTH, viewportHeight.value / DESIGN_HEIGHT)
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1
  return {
    width: `${DESIGN_WIDTH}px`,
    height: `${DESIGN_HEIGHT}px`,
    transform: `scale(${safeScale})`
  }
})

const toggleModuleMenu = (key) => {
  openMenuKey.value = openMenuKey.value === key ? '' : key
  if (!openMenuKey.value) {
    hoverInfo.key = ''
    hoverInfo.type = ''
  }
}

const openHoverInfo = (key, type) => {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverInfo.key = key
  hoverInfo.type = type
  nextTick(() => {
    updatePopupPosition(key)
  })
}

const closeHoverInfoSoon = () => {
  if (hoverTimer) clearTimeout(hoverTimer)
  hoverTimer = setTimeout(() => {
    hoverInfo.key = ''
    hoverInfo.type = ''
  }, 120)
}

const keepHoverInfo = () => {
  if (hoverTimer) clearTimeout(hoverTimer)
}

const closeMenuOnOutsideClick = (evt) => {
  const target = evt?.target
  if (!(target instanceof Element)) return
  if (target.closest('.panel-info-control') || target.closest('.panel-info-popup')) return
  openMenuKey.value = ''
  hoverInfo.key = ''
  hoverInfo.type = ''
}

const popupVisible = (key) => !!key && hoverInfo.key === key && openMenuKey.value === key

const setModulePanelEl = (key, el) => {
  if (el) modulePanelEls[key] = el
}

const updatePopupPosition = (key) => {
  const panelEl = modulePanelEls[key]
  if (!panelEl) return
  const rect = panelEl.getBoundingClientRect()
  const width = 300
  const viewportW = window.innerWidth
  const viewportH = window.innerHeight

  let left = rect.right + 14
  let top = rect.top + 40

  if (['stack', 'radar', 'regionPie'].includes(key)) {
    left = rect.left - width - 24
    top = rect.top + 30
  } else if (['worldHeat', 'lisa'].includes(key)) {
    left = rect.right + 16
    top = rect.top + 40
  } else if (['whoGap', 'trend', 'riskDonut'].includes(key)) {
    left = rect.right + 12
    top = rect.top + 30
  }

  const margin = 8
  const maxHeight = Math.min(300, viewportH - margin * 2)
  left = Math.max(margin, Math.min(left, viewportW - width - margin))
  top = Math.max(margin, Math.min(top, viewportH - maxHeight - margin))

  popupPosition.left = Math.round(left)
  popupPosition.top = Math.round(top)
  popupPosition.width = width
  popupPosition.maxHeight = Math.round(maxHeight)
}

const popupStyle = computed(() => ({
  position: 'fixed',
  left: `${popupPosition.left}px`,
  top: `${popupPosition.top}px`,
  width: `${popupPosition.width}px`,
  maxHeight: `${popupPosition.maxHeight}px`
}))

const syncPopupPosition = () => {
  if (!hoverInfo.key || openMenuKey.value !== hoverInfo.key) return
  updatePopupPosition(hoverInfo.key)
}

const panelLayerStyle = (key) =>
  openMenuKey.value === key || hoverInfo.key === key ? { zIndex: 5200 } : { zIndex: 1 }

const popupTitle = computed(() => (hoverInfo.type === 'conclusion' ? '研究结论' : '图表说明'))
const popupToneClass = computed(() => (hoverInfo.type === 'conclusion' ? 'popup-conclusion' : 'popup-explain'))
const popupText = computed(() => {
  if (!hoverInfo.key || !moduleText[hoverInfo.key]) return ''
  return hoverInfo.type === 'conclusion' ? moduleText[hoverInfo.key].conclusion : moduleText[hoverInfo.key].explain
})

watch(
  () => [hoverInfo.key, openMenuKey.value],
  () => {
    nextTick(() => {
      syncPopupPosition()
    })
  },
  { flush: 'post' }
)

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

const CHINA_UNIFIED_NAME = 'China'
const TAIWAN_ALIASES = new Set(['taiwan', 'taiwanprovinceofchina'])
const COUNTRY_NAME_ALIASES = new Map([
  ['russia', 'Russian Federation'],
  ['russianfederation', 'Russian Federation'],
  ['czechrepublic', 'Czechia'],
  ['czechia', 'Czechia'],
  ['vietnam', 'Viet Nam'],
  ['brunei', 'Brunei Darussalam'],
  ['easttimor', 'Timor-Leste'],
  ['egypt', 'Egypt, Arab Rep.'],
  ['kyrgyzstan', 'Kyrgyz Republic'],
  ['laos', 'Lao PDR'],
  ['macedonia', 'North Macedonia'],
  ['republicofserbia', 'Serbia'],
  ['slovakia', 'Slovak Republic'],
  ['southkorea', 'Korea, Rep.'],
  ['syria', 'Syrian Arab Republic'],
  ['swaziland', 'Eswatini'],
  ['turkey', 'Turkiye'],
  ['unitedrepublicoftanzania', 'Tanzania'],
  ['usa', 'United States'],
  ['unitedstatesofamerica', 'United States'],
  ['unitedstates', 'United States']
])

function normalizeCountryNameForMap(country) {
  const raw = String(country || '').trim()
  const normalized = normalizeCountryKey(raw).toLowerCase()
  if (normalized === 'china' || TAIWAN_ALIASES.has(normalized)) return CHINA_UNIFIED_NAME
  return raw
}

function normalizeCountryNameForData(country) {
  const raw = String(country || '').trim()
  const normalized = normalizeCountryKey(raw).toLowerCase()
  if (normalized === 'china' || TAIWAN_ALIASES.has(normalized)) return CHINA_UNIFIED_NAME
  return COUNTRY_NAME_ALIASES.get(normalized) || raw
}

function mergeCountryRows(rows, valueFields = []) {
  const grouped = new Map()
  rows.forEach((row) => {
    const country = normalizeCountryNameForMap(row.country)
    if (!grouped.has(country)) grouped.set(country, [])
    grouped.get(country).push(row)
  })
  return [...grouped.entries()].map(([country, list]) => {
    const base = { ...list[0], country }
    valueFields.forEach((field) => {
      const vals = list.map((r) => parseNumeric(r[field], NaN)).filter((n) => Number.isFinite(n))
      if (vals.length) {
        base[field] = vals.reduce((s, n) => s + n, 0) / vals.length
      }
    })
    return base
  })
}

function unifyChinaFeatureNames(geoJson) {
  // Keep original feature names (including Taiwan) to avoid duplicate China labels.
  return geoJson
}

function duplicateChinaDataForTaiwan(rows, valueFields = []) {
  const hasTaiwan = rows.some((r) => String(r?.country || '').trim() === 'Taiwan')
  if (hasTaiwan) return rows
  const chinaRow = rows.find((r) => normalizeCountryNameForMap(r.country) === CHINA_UNIFIED_NAME)
  if (!chinaRow) return rows
  const taiwanRow = { ...chinaRow, country: 'Taiwan' }
  valueFields.forEach((field) => {
    taiwanRow[field] = chinaRow[field]
  })
  return [...rows, taiwanRow]
}

function getClusterLabelByCountry(countryName) {
  const target = normalizeCountryNameForData(countryName)
  const row = clusterRows.value.find((r) => normalizeCountryNameForData(r.country) === target)
  return String(getField(row, ['cluster_label', 'clusterLabel'], '--'))
}

function bindChinaUnifiedHover(chart) {
  if (!chart || chart.__chinaUnifiedHoverBound) return
  chart.__chinaUnifiedHoverBound = true
  const showSingleChinaTip = () => {
    const series = chart.getOption()?.series?.[0]
    const data = series?.data || []
    const chinaIndex = data.findIndex((item) => {
      const name = typeof item === 'string' ? item : item?.name
      return normalizeCountryNameForMap(name) === CHINA_UNIFIED_NAME && String(name) === CHINA_UNIFIED_NAME
    })
    if (chinaIndex >= 0) {
      chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: chinaIndex })
    } else {
      chart.dispatchAction({ type: 'showTip', seriesIndex: 0, name: CHINA_UNIFIED_NAME })
    }
  }
  const highlightChinaUnion = () => {
    chart.dispatchAction({ type: 'highlight', seriesIndex: 0, name: CHINA_UNIFIED_NAME })
    chart.dispatchAction({ type: 'highlight', seriesIndex: 0, name: 'Taiwan' })
  }
  const downplayChinaUnion = () => {
    chart.dispatchAction({ type: 'downplay', seriesIndex: 0, name: CHINA_UNIFIED_NAME })
    chart.dispatchAction({ type: 'downplay', seriesIndex: 0, name: 'Taiwan' })
    chart.dispatchAction({ type: 'hideTip' })
  }
  chart.on('mouseover', (params) => {
    if (normalizeCountryNameForMap(params?.name) !== CHINA_UNIFIED_NAME) return
    chart.dispatchAction({ type: 'hideTip' })
    highlightChinaUnion()
    showSingleChinaTip()
  })
  chart.on('mouseout', (params) => {
    if (normalizeCountryNameForMap(params?.name) !== CHINA_UNIFIED_NAME) return
    downplayChinaUnion()
  })
  chart.on('globalout', () => {
    downplayChinaUnion()
  })
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
  const yearRows = mergeCountryRows(
    healthRows.value.filter((r) => Number(r.year) === Number(currentYear.value)),
    ['D_Value', 'U3_Life_Expectancy']
  )
  const mapRows = duplicateChinaDataForTaiwan(yearRows, ['D_Value', 'U3_Life_Expectancy'])
  const data = mapRows.map((r) => ({ name: r.country, value: parseNumeric(r.D_Value) }))
  const allDValues = healthRows.value.map((r) => parseNumeric(r.D_Value)).filter((n) => Number.isFinite(n))
  const globalMin = allDValues.length ? Math.min(...allDValues) : 0
  const globalMax = allDValues.length ? Math.max(...allDValues) : 1
  const safeMin = Number.isFinite(globalMin) ? globalMin : 0
  const safeMax = Number.isFinite(globalMax) && globalMax > safeMin ? globalMax : safeMin + 1
  chart.setOption({
    ...getCommonChartBase(`全球健康系统韧性时空演变 · 耦合协调度D值空间格局变化热力图（${currentYear.value}年）`),
    tooltip: {
      ...getCommonChartBase('').tooltip,
      position: (point, params, dom, rect, size) => {
        if (normalizeCountryNameForMap(params?.name) === CHINA_UNIFIED_NAME) {
          return [size.viewSize[0] * 0.62, size.viewSize[1] * 0.44]
        }
        return point
      },
      formatter: ({ name, value }) => {
        const row = yearRows.find((r) => normalizeCountryNameForData(r.country) === normalizeCountryNameForData(name))
        if (!row) return `${name}<br/>D值: 0`
        return `${CHINA_UNIFIED_NAME === normalizeCountryNameForMap(name) ? CHINA_UNIFIED_NAME : name}<br/>D值: ${parseNumeric(value).toFixed(3)}<br/>预期寿命: ${parseNumeric(row.U3_Life_Expectancy).toFixed(2)}<br/>聚类标签: ${getClusterLabelByCountry(name)}`
      }
    },
    visualMap: {
      min: safeMin,
      max: safeMax,
      right: 14,
      bottom: 18,
      text: ['高', '低'],
      textStyle: { color: '#81a1c1' },
      calculable: true,
      inRange: {
        color: ['#0b1f4f', '#1f53d7', '#3aa6ff', '#6ff7ff', '#f2ff8a']
      }
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
        regions: [
          {
            name: 'Taiwan',
            label: { show: false },
            emphasis: { label: { show: false } }
          }
        ],
        itemStyle: {
          borderColor: '#4e6a8d',
          borderWidth: 0.8,
          areaColor: '#173a66'
        },
        data
      }
    ]
  })
  bindChinaUnifiedHover(chart)
}

function setLisaMap() {
  const chart = chartInstances.lisa
  if (!chart || !worldMapReady) return
  const mergedRows = mergeCountryRows(lisaRows.value, ['D_Value', 'Moran_I', 'P_Value', 'Z_Score'])
  const mapRows = duplicateChinaDataForTaiwan(mergedRows, ['D_Value', 'Moran_I', 'P_Value', 'Z_Score'])
  const data = mapRows.map((r) => {
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
    return {
      name: normalizeCountryNameForMap(r.country),
      value,
      dValue: parseNumeric(r.D_Value),
      cluster: clusterType,
      itemStyle: { areaColor: color }
    }
  })
  chart.setOption({
    ...getCommonChartBase('2023 年 D 值 LISA 聚类全球空间分布地图'),
    tooltip: {
      ...getCommonChartBase('').tooltip,
      position: (point, params, dom, rect, size) => {
        if (normalizeCountryNameForMap(params?.name) === CHINA_UNIFIED_NAME) {
          return [size.viewSize[0] * 0.62, size.viewSize[1] * 0.44]
        }
        return point
      },
      formatter: ({ data: d, name }) =>
        `${CHINA_UNIFIED_NAME === normalizeCountryNameForMap(name) ? CHINA_UNIFIED_NAME : name}<br/>D_Value: ${(d?.dValue ?? 0).toFixed(4)}<br/>聚类: ${d?.cluster ?? '其他'}`
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
          label: { color: '#ffffff' },
          itemStyle: { borderColor: '#00f0ff', borderWidth: 2 }
        },
        regions: [
          {
            name: 'Taiwan',
            label: { show: false },
            emphasis: { label: { show: false } }
          }
        ],
        itemStyle: {
          borderColor: '#4e6a8d',
          borderWidth: 0.8,
          areaColor: '#2a3f5f'
        },
        data
      }
    ]
  })
  bindChinaUnifiedHover(chart)
}

function setStackChart() {
  const chart = chartInstances.stack
  if (!chart) return
  const D_VALUE_DISPLAY_SCALE = 0.88
  const RESOURCE_RISK_DISPLAY_SCALE = 1.18
  const selectedRows = []
  const groupCounter = new Map()
  representativeProfileRows.value.forEach((row) => {
    const group = String(getField(row, ['cluster_label'], 'UNKNOWN'))
    const currentCount = groupCounter.get(group) || 0
    if (currentCount >= 2) return
    selectedRows.push(row)
    groupCounter.set(group, currentCount + 1)
  })
  const rows = selectedRows.slice(0, 8)
  const countries = rows.map((r) => r.country)
  chart.setOption({
    ...getCommonChartBase('各类型代表国家指标堆叠图'),
    // Leave a dedicated right-side legend column:
    // - grid shrinks a bit and shifts left
    // - legend becomes vertical on the right
    grid: { left: 8, right: 135, top: 62, bottom: 20, containLabel: true },
    legend: {
      orient: 'vertical',
      right: -6,
      top: 'middle',
      data: ['D_Value', 'risk_result_gap', 'resource_result_gap', 'resource_risk_gap'],
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
      name: '指标值（堆叠）',
      min: 0,
      nameTextStyle: { color: '#81a1c1', padding: [0, 0, 0, 0] },
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
    tooltip: {
      ...getCommonChartBase('').tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const countryName = params?.[0]?.name || '--'
        const lines = [countryName]
        params.forEach((p) => {
          lines.push(`${p.seriesName}: ${Number(p.value).toFixed(4)}`)
        })
        return lines.join('<br/>')
      }
    },
    series: [
      {
        name: 'D_Value',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#f9f06b' },
        data: rows.map((r) => parseNumeric(r.D_Value) * D_VALUE_DISPLAY_SCALE),
        barWidth: '16px',
        barCategoryGap: '40%'
      },
      {
        name: 'risk_result_gap',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#00f0ff' },
        data: rows.map((r) => parseNumeric(r.risk_result_gap)),
        barWidth: '12px',
        barCategoryGap: '40%'
      },
      {
        name: 'resource_result_gap',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#64ffda' },
        data: rows.map((r) => parseNumeric(r.resource_result_gap)),
        barWidth: '12px',
        barCategoryGap: '40%'
      },
      {
        name: 'resource_risk_gap',
        type: 'bar',
        stack: 'total',
        itemStyle: { color: '#ff7e79' },
        data: rows.map((r) => Math.abs(parseNumeric(r.resource_risk_gap)) * RESOURCE_RISK_DISPLAY_SCALE),
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
      top: 42,
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
  const rows = clusterSummaryRows.value
  const data = rows.map((row) => ({
    name: String(getField(row, ['cluster_label'], '未命名类型')),
    value: Math.max(0, parseNumeric(row.n_countries, 0)),
    dominantFeature: String(getField(row, ['dominant_feature'], '--')),
    riskResultGap: parseNumeric(getField(row, ['risk_result_gap'], 0))
  }))
  chart.setOption({
    ...getCommonChartBase('全球国家聚类规模占比（K4初始年）'),
    title: {
      ...getCommonChartBase('').title,
      text: '全球国家聚类规模占比（K4初始年）',
      top: 8,
      left: 12,
      textStyle: { color: '#ffffff', fontSize: 16, fontWeight: 600 }
    },
    grid: { left: 45, right: 68, top: 52, bottom: 36, containLabel: true },
    legend: {
      orient: 'vertical',
      right: 3,
      top: '35%',
      width: 210,
      itemWidth: 24,
      itemHeight: 18,
      itemGap: 12,
      textStyle: { color: '#81a1c1', fontSize: 12, padding: [0, 0, 0, 6] }
    },
    tooltip: {
      ...getCommonChartBase('').tooltip,
      formatter: ({ data: d }) => `${d?.dominantFeature ?? '--'}<br/>${Number(d?.riskResultGap ?? 0).toFixed(4)}`
    },
    series: [
      {
        type: 'pie',
        radius: '70%',
        center: ['40%', '57%'],
        color: ['#00f0ff', '#64ffda', '#f9f06b', '#ff7e79'],
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
    asset('health_datas.csv'),
    '/health_datas.csv',
    './health_datas.csv',
    '../health_datas.csv',
    '../../health_datas.csv',
    `${EXTERNAL_DATA_DIR}/health_datas.csv`
  ]
  const lisaCandidates = [
    asset('lisa_cluster_result_knn5.csv'),
    '/lisa_cluster_result_knn5.csv',
    './lisa_cluster_result_knn5.csv',
    '../lisa_cluster_result_knn5.csv',
    '../../lisa_cluster_result_knn5.csv',
    `${EXTERNAL_DATA_DIR}/lisa_cluster_result_knn5.csv`
  ]
  const whoGapCandidates = [
    asset('WHO_Region_Mean_Resource_Demand_Gap_2023.csv'),
    '/WHO_Region_Mean_Resource_Demand_Gap_2023.csv',
    './WHO_Region_Mean_Resource_Demand_Gap_2023.csv',
    '../WHO_Region_Mean_Resource_Demand_Gap_2023.csv',
    '../../WHO_Region_Mean_Resource_Demand_Gap_2023.csv',
    `${EXTERNAL_DATA_DIR}/WHO_Region_Mean_Resource_Demand_Gap_2023.csv`
  ]
  const trendCandidates = [
    asset('Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv'),
    '/Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv',
    './Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv',
    '../Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv',
    '../../Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv',
    `${EXTERNAL_DATA_DIR}/Global_Resource_Need_Capacity_Gap_Trend_2000_2023.csv`
  ]
  const clusterCandidates = [
    asset('data/initial_year_country_clusters_k4.csv'),
    '/data/initial_year_country_clusters_k4.csv',
    './data/initial_year_country_clusters_k4.csv',
    `${EXTERNAL_DATA_DIR}/initial_year_country_clusters_k4.csv`
  ]
  const clusterSummaryCandidates = [
    asset('data/cluster_summary_k4_initial_year.csv'),
    '/data/cluster_summary_k4_initial_year.csv',
    './data/cluster_summary_k4_initial_year.csv',
    `${EXTERNAL_DATA_DIR}/cluster_summary_k4_initial_year.csv`
  ]
  const representativeProfileCandidates = [
    asset('data/representative_country_profiles.csv'),
    '/data/representative_country_profiles.csv',
    './data/representative_country_profiles.csv',
    `${EXTERNAL_DATA_DIR}/representative_country_profiles.csv`
  ]
  const [health, lisa, whoGap, trend, clusters, clusterSummary, representativeProfiles] = await Promise.all([
    loadCsvRows(healthCandidates, ['country', 'year', 'U1_Score', 'U2_Score', 'U3_Score', 'D_Value']),
    loadCsvRows(lisaCandidates, ['country', 'year', 'D_Value']),
    loadCsvRows(whoGapCandidates, ['WHO_Region', 'Mean_Gap']),
    loadCsvRows(trendCandidates, [['Year', 'year'], 'Mean_Need_Score', 'Mean_U3_Score', 'Mean_Resource_Gap']),
    loadCsvRows(clusterCandidates, ['country', 'cluster_label']),
    loadCsvRows(clusterSummaryCandidates, ['n_countries', 'cluster_label', 'dominant_feature', 'risk_result_gap']),
    loadCsvRows(representativeProfileCandidates, ['country', 'cluster_label', 'D_Value', 'risk_result_gap', 'resource_result_gap', 'resource_risk_gap'])
  ])
  healthRows.value = health
  lisaRows.value = lisa
  whoGapRows.value = whoGap.length ? whoGap : buildFallbackWhoGap(health)
  trendRows.value = trend.length ? trend : buildFallbackTrend(health)
  clusterRows.value = clusters
  clusterSummaryRows.value = clusterSummary
  representativeProfileRows.value = representativeProfiles
  computeMetrics()
  animateMetricNumbers()
}

async function ensureWorldMap() {
  if (worldMapReady) return
  try {
    const res = await fetch(asset('world.geo.json'))
    if (res.ok) {
      const geoJson = await res.json()
      echarts.registerMap('world', unifyChinaFeatureNames(geoJson))
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
      echarts.registerMap('world', unifyChinaFeatureNames(geoJson))
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
  syncPopupPosition()
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
  document.addEventListener('click', closeMenuOnOutsideClick)

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
  document.removeEventListener('click', closeMenuOnOutsideClick)
  if (hoverTimer) clearTimeout(hoverTimer)
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
            <div class="panel chart-card fade-in" :style="panelLayerStyle('whoGap')" :ref="(el) => setModulePanelEl('whoGap', el)">
              <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('whoGap')">信息</button>
                <div v-show="openMenuKey === 'whoGap'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                  <button @mouseenter="openHoverInfo('whoGap', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('whoGap', 'conclusion')">研究结论</button>
                </div>
              </div>
              <div :ref="refs.whoGap" class="chart"></div>
            </div>
            <div class="panel chart-card fade-in" :style="panelLayerStyle('trend')" :ref="(el) => setModulePanelEl('trend', el)">
              <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('trend')">信息</button>
                <div v-show="openMenuKey === 'trend'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                  <button @mouseenter="openHoverInfo('trend', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('trend', 'conclusion')">研究结论</button>
                </div>
              </div>
              <div :ref="refs.trend" class="chart"></div>
            </div>
            <div class="panel chart-card fade-in" :style="panelLayerStyle('riskDonut')" :ref="(el) => setModulePanelEl('riskDonut', el)">
              <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('riskDonut')">信息</button>
                <div v-show="openMenuKey === 'riskDonut'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                  <button @mouseenter="openHoverInfo('riskDonut', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('riskDonut', 'conclusion')">研究结论</button>
                </div>
              </div>
              <div :ref="refs.riskDonut" class="chart"></div>
            </div>
          </section>

          <section class="center-col">
            <div class="panel map-card fade-in" :style="panelLayerStyle('worldHeat')" :ref="(el) => setModulePanelEl('worldHeat', el)">
              <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('worldHeat')">信息</button>
                <div v-show="openMenuKey === 'worldHeat'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                  <button @mouseenter="openHoverInfo('worldHeat', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('worldHeat', 'conclusion')">研究结论</button>
                </div>
              </div>
              <div :ref="refs.worldHeat" class="chart map-chart"></div>
              <div class="timeline-control">
                <button class="play-btn" @click="togglePlay">{{ isPlaying ? '❚❚' : '▶' }}</button>
                <span>2000</span>
                <input type="range" min="2000" max="2023" :value="currentYear" @input="onYearChange" />
                <strong>{{ currentYear }}</strong>
                <span>2023</span>
              </div>
            </div>
            <div class="panel map-card fade-in" :style="panelLayerStyle('lisa')" :ref="(el) => setModulePanelEl('lisa', el)">
              <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('lisa')">信息</button>
                <div v-show="openMenuKey === 'lisa'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                  <button @mouseenter="openHoverInfo('lisa', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('lisa', 'conclusion')">研究结论</button>
                </div>
              </div>
              <div :ref="refs.lisa" class="chart map-chart"></div>
            </div>
          </section>

          <section class="right-col">
            <div class="panel chart-card fade-in" :style="panelLayerStyle('stack')" :ref="(el) => setModulePanelEl('stack', el)">
              <div class="panel-info-control panel-info-control--right-shift" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('stack')">信息</button>
                <div v-show="openMenuKey === 'stack'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                  <button @mouseenter="openHoverInfo('stack', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('stack', 'conclusion')">研究结论</button>
                </div>
              </div>
              <div :ref="refs.stack" class="chart"></div>
            </div>
            <div class="panel chart-card fade-in" :style="panelLayerStyle('radar')" :ref="(el) => setModulePanelEl('radar', el)">
              <div class="panel-info-control panel-info-control--right-shift" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('radar')">信息</button>
                <div v-show="openMenuKey === 'radar'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                  <button @mouseenter="openHoverInfo('radar', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('radar', 'conclusion')">研究结论</button>
                </div>
              </div>
              <div :ref="refs.radar" class="chart"></div>
            </div>
            <div class="panel chart-card fade-in" :style="panelLayerStyle('regionPie')" :ref="(el) => setModulePanelEl('regionPie', el)">
              <div class="panel-info-control panel-info-control--right-shift" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('regionPie')">信息</button>
                <div v-show="openMenuKey === 'regionPie'" class="panel-info-menu" @mouseenter="keepHoverInfo" @mouseleave="closeHoverInfoSoon">
                  <button @mouseenter="openHoverInfo('regionPie', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('regionPie', 'conclusion')">研究结论</button>
                </div>
              </div>
              <div :ref="refs.regionPie" class="chart"></div>
            </div>
          </section>
        </main>
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
