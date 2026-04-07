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
              <div class="panel panel-right-top public-bg">
                <div class="public-title">省份耦合度TOP10 · 排行</div>
                <div class="title-nav" id="wuran" />
              </div>
              <div class="panel panel-right-mid public-bg">
                <div class="public-title">水质量分布情况 · 雷达图</div>
                <div class="title-nav" id="leida" />
              </div>
            </div>

            <div class="content-left-bottom">
              <div class="panel panel-bottom-left public-bg">
                <div class="public-title">区域健康指标趋势（均值） · 折线图</div>
                <div class="title-nav" id="zhexian" />
              </div>
              <div class="panel panel-bottom-mid public-bg">
                <div class="public-title">耦合度时间序列 · 气泡图</div>
                <div class="title-nav" id="qipao" />
              </div>
            </div>
          </div>

          <div class="content-right">
            <div class="panel panel-map public-bg">
              <div class="public-title">耦合度热力图 · 热力地图 · 流波</div>
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
            <div class="panel panel-right-bottom public-bg">
              <div class="public-title">省份OTE均值TOP10 · 排行</div>
              <div class="title-nav" id="huaxing" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const GLOBAL_DEV_PORT = 5172
const CHINA_DEV_PORT = 5173

function navigateToGlobalScreen() {
  const override = import.meta.env.VITE_GLOBAL_SCREEN_URL
  if (override) {
    window.location.assign(override)
    return
  }
  const { protocol, hostname } = window.location
  window.location.assign(`${protocol}//${hostname}:${GLOBAL_DEV_PORT}/`)
}

function navigateToChinaScreen() {
  const override = import.meta.env.VITE_CHINA_SCREEN_URL
  if (override) {
    window.location.assign(override)
    return
  }
  const { protocol, hostname } = window.location
  window.location.assign(`${protocol}//${hostname}:${CHINA_DEV_PORT}/`)
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
    '/js/china.js',
    '/js/index.js'
  ]

  loadScriptsSequential(urls).catch((e) => {
    console.error('[大屏] 图表脚本加载失败', e)
  })
})

onUnmounted(() => {
  if (clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
  if (window._qipaoRaceTimer) {
    clearInterval(window._qipaoRaceTimer)
    window._qipaoRaceTimer = null
  }
})
</script>

<style>
@import '/css/index.css';
@import '/css/header-pedestal.css';
@import '/css/star-background.css';
@import '/css/screen-enter.css';
@import '/css/screen-switch-buttons.css';

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
