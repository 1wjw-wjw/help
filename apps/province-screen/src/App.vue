<template>
  <div class="screen-root screen-animation">
    <div class="screen-switch-wrap">
      <button type="button" class="screen-switch-btn" @click="navigateToGlobalScreen">
        <span class="screen-switch-btn__text">切换全球</span>
      </button>
      <button type="button" class="screen-switch-btn" @click="navigateToChinaScreen">
        <span class="screen-switch-btn__text">切换中国</span>
      </button>
    </div>
    <div class="star-flow" aria-hidden="true" />
    <div class="stars" />
    <div class="content-body">
      <div class="header">
        <div class="top">
          <div class="top-metrics top-metrics-left" />
          <div class="top-title">
            <div class="title-pedestal">
              <div class="pedestal-bg" aria-hidden="true">
                <svg
                  class="pedestal-svg"
                  viewBox="0 0 1000 48"
                  preserveAspectRatio="xMidYMid meet"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <defs>
                    <linearGradient id="hp-pedFill" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stop-color="rgba(0,180,255,0.55)" />
                      <stop offset="45%" stop-color="rgba(0,100,190,0.32)" />
                      <stop offset="100%" stop-color="rgba(0,140,220,0.48)" />
                    </linearGradient>
                    <linearGradient id="hp-pedEdge" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stop-color="rgba(100,230,255,0.75)" />
                      <stop offset="50%" stop-color="rgba(200,248,255,1)" />
                      <stop offset="100%" stop-color="rgba(100,230,255,0.75)" />
                    </linearGradient>
                    <filter id="hp-pedGlowAura" x="-60%" y="-60%" width="220%" height="220%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="a" />
                      <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="a2" />
                      <feMerge>
                        <feMergeNode in="a" />
                        <feMergeNode in="a2" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="hp-pedGlowCore" x="-35%" y="-45%" width="170%" height="190%">
                      <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="b" />
                      <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <g
                    filter="url(#hp-pedGlowAura)"
                    stroke="url(#hp-pedEdge)"
                    stroke-width="2.2"
                    stroke-linejoin="round"
                    fill="none"
                    opacity="0.85"
                  >
                    <polygon points="25,24 140,10 228,24 140,38" />
                    <polygon points="228,24 500,2 772,24 500,46" />
                    <polygon points="772,24 860,10 975,24 860,38" />
                  </g>
                  <g filter="url(#hp-pedGlowCore)" stroke="url(#hp-pedEdge)" stroke-width="1.35" stroke-linejoin="round">
                    <polygon fill="url(#hp-pedFill)" points="25,24 140,10 228,24 140,38" />
                    <polygon fill="url(#hp-pedFill)" points="228,24 500,2 772,24 500,46" />
                    <polygon fill="url(#hp-pedFill)" points="772,24 860,10 975,24 860,38" />
                  </g>
                </svg>
              </div>
              <h1>中国各省份健康指标可视化大屏</h1>
            </div>
          </div>
          <div class="top-metrics top-metrics-right">
            <div class="header-time">
              <span id="time" ref="timeRef" />
            </div>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="content-con">
          <div class="content-left">
            <div class="content-left-top">
              <div class="panel panel-right-top public-bg" :ref="(el) => setModulePanelEl('wuran', el)">
                <div class="public-title">省份PTE·2012到2024动态变化LAST 10·排行</div>
                <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('wuran')">信息</button>
                  <div
                    v-show="openMenuKey === 'wuran'"
                    class="panel-info-menu"
                    @mouseenter="keepHoverInfo"
                    @mouseleave="closeHoverInfoSoon"
                  >
                    <button @mouseenter="openHoverInfo('wuran', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('wuran', 'conclusion')">研究结论</button>
                  </div>
                </div>
                <div class="title-nav" id="wuran" />
              </div>
              <div class="panel panel-right-mid public-bg" :ref="(el) => setModulePanelEl('leida', el)">
                <div class="public-title">省域健康指标核心概览（2012-2024）</div>
                <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('leida')">信息</button>
                  <div
                    v-show="openMenuKey === 'leida'"
                    class="panel-info-menu"
                    @mouseenter="keepHoverInfo"
                    @mouseleave="closeHoverInfoSoon"
                  >
                    <button @mouseenter="openHoverInfo('leida', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('leida', 'conclusion')">研究结论</button>
                  </div>
                </div>
                <div class="title-nav province-radar-kpi-grid" id="leida">
                  <article class="province-radar-kpi-card">
                    <div class="province-radar-kpi-row">
                      <div class="province-radar-kpi-head">
                        <span class="province-radar-kpi-icon">🧩</span>
                        <div class="province-radar-kpi-label">综合效率 OTE</div>
                      </div>
                      <div class="province-radar-kpi-value" style="color:#00f0ff">
                        <span id="provinceKpi0">--</span>
                      </div>
                    </div>
                  </article>
                  <article class="province-radar-kpi-card">
                    <div class="province-radar-kpi-row">
                      <div class="province-radar-kpi-head">
                        <span class="province-radar-kpi-icon">📈</span>
                        <div class="province-radar-kpi-label">纯技术效率 PTE</div>
                      </div>
                      <div class="province-radar-kpi-value" style="color:#64ffda">
                        <span id="provinceKpi1">--</span>
                      </div>
                    </div>
                  </article>
                  <article class="province-radar-kpi-card">
                    <div class="province-radar-kpi-row">
                      <div class="province-radar-kpi-head">
                        <span class="province-radar-kpi-icon">⚙️</span>
                        <div class="province-radar-kpi-label">规模效率 SE</div>
                      </div>
                      <div class="province-radar-kpi-value" style="color:#ff7e79">
                        <span id="provinceKpi2">--</span>
                      </div>
                    </div>
                  </article>
                  <article class="province-radar-kpi-card">
                    <div class="province-radar-kpi-row">
                      <div class="province-radar-kpi-head">
                        <span class="province-radar-kpi-icon">🧒</span>
                        <div class="province-radar-kpi-label">3岁以下儿童系统管理率</div>
                      </div>
                      <div class="province-radar-kpi-value" style="color:#f9f06b">
                        <span id="provinceKpi3">--</span>
                      </div>
                    </div>
                  </article>
                </div>
              </div>
            </div>

            <div class="content-left-bottom">
              <div class="panel panel-bottom-left public-bg" :ref="(el) => setModulePanelEl('zhexian', el)">
                <div class="public-title">医疗健康指标分析·折线图</div>
                <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('zhexian')">信息</button>
                  <div
                    v-show="openMenuKey === 'zhexian'"
                    class="panel-info-menu"
                    @mouseenter="keepHoverInfo"
                    @mouseleave="closeHoverInfoSoon"
                  >
                    <button @mouseenter="openHoverInfo('zhexian', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('zhexian', 'conclusion')">研究结论</button>
                  </div>
                </div>
                <div class="title-nav" id="zhexian" />
              </div>
              <div class="panel panel-bottom-mid public-bg" :ref="(el) => setModulePanelEl('qipao', el)">
                <div class="public-title">PTE × SE 效率分布 · 气泡图（气泡大小=OTE）</div>
                <div class="panel-info-control" @mouseleave="closeHoverInfoSoon">
                  <button class="panel-info-btn" @click.stop="toggleModuleMenu('qipao')">信息</button>
                  <div
                    v-show="openMenuKey === 'qipao'"
                    class="panel-info-menu"
                    @mouseenter="keepHoverInfo"
                    @mouseleave="closeHoverInfoSoon"
                  >
                    <button @mouseenter="openHoverInfo('qipao', 'explain')">图表说明</button>
                    <button @mouseenter="openHoverInfo('qipao', 'conclusion')">研究结论</button>
                  </div>
                </div>
                <div class="title-nav" id="qipao" />
              </div>
            </div>
          </div>

          <div class="content-right">
            <div class="panel panel-map public-bg" :ref="(el) => setModulePanelEl('map', el)">
              <div class="public-title">省域医疗资源综合效率（OTE）时空演化图</div>
              <div class="panel-info-control panel-info-control--right-shift" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('map')">信息</button>
                <div
                  v-show="openMenuKey === 'map'"
                  class="panel-info-menu"
                  @mouseenter="keepHoverInfo"
                  @mouseleave="closeHoverInfoSoon"
                >
                  <button @mouseenter="openHoverInfo('map', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('map', 'conclusion')">研究结论</button>
                </div>
              </div>
              <div class="panel-body">
                <div class="map-particles" />
                <div id="map" class="map" />
                <div id="mapControls" class="map-controls" style="display: none">
                  <div class="map-controls-row">
                    <div id="mapYearLabel" class="map-year">年份：-</div>
                    <input id="mapYearSlider" type="range" min="0" max="0" step="1" value="0" />
                  </div>
                </div>
              </div>
            </div>
            <div class="panel panel-right-bottom public-bg" :ref="(el) => setModulePanelEl('huaxing', el)">
              <div class="public-title">省份OTE·2012到2024动态变化LAST 10·排行</div>
              <div class="panel-info-control panel-info-control--right-shift" @mouseleave="closeHoverInfoSoon">
                <button class="panel-info-btn" @click.stop="toggleModuleMenu('huaxing')">信息</button>
                <div
                  v-show="openMenuKey === 'huaxing'"
                  class="panel-info-menu"
                  @mouseenter="keepHoverInfo"
                  @mouseleave="closeHoverInfoSoon"
                >
                  <button @mouseenter="openHoverInfo('huaxing', 'explain')">图表说明</button>
                  <button @mouseenter="openHoverInfo('huaxing', 'conclusion')">研究结论</button>
                </div>
              </div>
              <div class="title-nav" id="huaxing" />
            </div>
          </div>
        </div>
      </div>
    </div>
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
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

const GLOBAL_DEV_PORT = 5172
const CHINA_DEV_PORT = 5173

const moduleText = {
  wuran: {
    explain:
      '该图展示2012-2024年各省纯技术效率（PTE）最后10期排名，反映技术利用与管理协同能力的省际差异；整体来看，PTE相对偏弱且差异主要体现在“纯技术”维度。',
    conclusion:
      '论文指出综合效率提升的主要约束在纯技术效率；模型结果表明基层承载能力与服务利用对PTE具有正向作用。由此，PTE排名差异对应“资源是否用得好”的结构性差别。'
  },
  leida: {
    explain:
      '该图汇总2012-2024年省域核心指标的年度平均水平，用于对比OTE、PTE、SE与3岁以下儿童系统管理率的总体态势；从数据看，综合效率多数年份保持高位，而PTE相对偏低、SE长期接近前沿，产出端与效率提升呈同步改善。',
    conclusion:
      '论文显示OTE总体处于较高水平，分解结果表明SE长期接近前沿而PTE相对偏低。因而短板主要集中在资源利用与健康产出转化的技术效率环节，同时儿童管理率等产出体现转化表现。'
  },
  zhexian: {
    explain:
      '该图上半部分展示千人床位/千人医师/千人护士的投入变化，下半部分展示儿童管理率与预期寿命的健康产出走势，用于观察医疗资源—健康结果的整体联动；从整体趋势看，投入端随年份增加，产出端同步改善。',
    conclusion:
      '论文强调关注的不是单纯扩量，而是资源向“一老一小”及健康结果的支撑效率。结合投入与产出的动态变化，可以理解为：效率提升更依赖资源利用和健康转化环节的技术效率，而非投入规模本身。'
  },
  qipao: {
    explain:
      '该图以SE为横轴、PTE为纵轴，气泡大小表示OTE，并按象限刻画省域效率状态；从整体象限分布看，SE更接近效率前沿，而PTE相对受限，说明效率差异的核心仍在资源利用与健康转化的技术环节。',
    conclusion:
      '论文指出SE长期接近效率前沿、真正短板更多集中在PTE。由象限位置可将不同省份的短板类型对应到治理着力点：前沿巩固、转化短板强化资源利用与管理协同。'
  },
  map: {
    explain:
      '该图展示2012-2024年省域综合效率（OTE）的时空演化，用于识别地区梯度及其收敛/分化；从整体分布看，东部地区OTE水平更高，中部存在追赶态势，西部相对偏低，省际差异主要来源于区域内部演变。',
    conclusion:
      'Theil分解表明区域内差异始终是总体差异的主要来源，贡献率由2012年的80.98%降至2024年的72.33%。这说明效率不均衡并非仅由区位决定，更与区域内部资源配置、管理能力及健康服务转化条件相关。'
  },
  huaxing: {
    explain:
      '该图展示2012-2024年各省综合效率（OTE）最后10期排名，用于把握总体效率水平与省际差距；整体来看，多数省份处于较高效率区间，而排名差异主要反映纯技术效率不足带来的综合效率差别。',
    conclusion:
      '论文结果表明OTE总体处于较高水平但省际差距仍存在，且效率差异主要来自纯技术效率不足。后续配置重点应更多落在城乡卫技差缩减和基层结构调整上，而不是简单扩量投入。'
  }
}

const openMenuKey = ref('')
const hoverInfo = reactive({ key: '', type: '' })
const modulePanelEls = {}
const popupPosition = reactive({ left: 0, top: 0, width: 300, maxHeight: 300 })
let hoverTimer = null

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

  // 右侧大模块（map / huaxing）把悬浮板挪到左侧；其余挪到右侧。
  let left = rect.right + 12
  let top = rect.top + 30
  if (['map', 'huaxing'].includes(key)) {
    left = rect.left - width - 24
    top = rect.top + 24
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

const popupTitle = computed(() => (hoverInfo.type === 'conclusion' ? '研究结论' : '图表说明'))
const popupToneClass = computed(() => (hoverInfo.type === 'conclusion' ? 'popup-conclusion' : 'popup-explain'))
const popupText = computed(() => {
  if (!hoverInfo.key || !moduleText[hoverInfo.key]) return ''
  return hoverInfo.type === 'conclusion' ? moduleText[hoverInfo.key].conclusion : moduleText[hoverInfo.key].explain
})

watch(
  () => [hoverInfo.key, openMenuKey.value],
  () => {
    nextTick(() => syncPopupPosition())
  },
  { flush: 'post' }
)

function handleResize() {
  syncPopupPosition()
}

function navigateToGlobalScreen() {
  const override = import.meta.env.VITE_GLOBAL_SCREEN_URL
  if (override) {
    window.location.assign(override)
    return
  }
  if (import.meta.env.DEV) {
    const { protocol, hostname } = window.location
    window.location.assign(`${protocol}//${hostname}:${GLOBAL_DEV_PORT}/`)
    return
  }
  window.location.assign('/bigbig_screen/')
}

function navigateToChinaScreen() {
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

const timeRef = ref(null)
let clockTimer = null

function fillZero(n) {
  return n < 10 ? '0' + n : String(n)
}

function tick() {
  const el = timeRef.value
  if (!el) return
  const d = new Date()
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  el.innerHTML =
    d.getFullYear() +
    '年' +
    fillZero(d.getMonth() + 1) +
    '月' +
    fillZero(d.getDate()) +
    '日' +
    '\u00a0\u00a0' +
    fillZero(d.getHours()) +
    ':' +
    fillZero(d.getMinutes()) +
    ':' +
    fillZero(d.getSeconds()) +
    '\u00a0\u00a0' +
    week[d.getDay()] +
    '\u00a0\u00a0'
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('加载脚本失败: ' + src))
    document.body.appendChild(s)
  })
}

async function loadScriptsSequential(urls) {
  for (let i = 0; i < urls.length; i++) {
    await loadScript(urls[i])
  }
}

onMounted(() => {
  tick()
  clockTimer = setInterval(tick, 1000)

  const urls = [
    'https://cdnjs.cloudflare.com/ajax/libs/echarts/4.3.0/echarts.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jquery/1.10.2/jquery.min.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    `${import.meta.env.BASE_URL}js/china.js`,
    `${import.meta.env.BASE_URL}js/index.js`
  ]

  loadScriptsSequential(urls).catch((e) => {
    console.error('[大屏] 图表脚本加载失败', e)
  })

  document.addEventListener('click', closeMenuOnOutsideClick)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
  if (hoverTimer) clearTimeout(hoverTimer)
  if (window._qipaoRaceTimer) {
    clearInterval(window._qipaoRaceTimer)
    window._qipaoRaceTimer = null
  }

  document.removeEventListener('click', closeMenuOnOutsideClick)
  window.removeEventListener('resize', handleResize)
})
</script>

<style>

html,
body,
#app,
.screen-root {
  width: 100%;
  height: 100%;
  margin: 0;
}

.screen-root {
  position: relative;
  min-height: 100vh;
  overflow: auto;
  background: #0d325f;
}
</style>
