$(function(){

	map();
    initProvinceRadarKpiCards();
    qipao();
    wuran();
    huaxing();
	zhexian();

    //大屏

	function leida1(){
	var myChart = echarts.init(document.getElementById('map'));


	myChart.setOption(option);
	window.addEventListener("resize",function(){
        myChart.resize();
    });

	}




})

var PROVINCE_PANEL_CSV_URL = 'data/province-screen/panel_data_tobit.csv';
var __provincePanelRowsCache = null;
var __provincePanelRowsPromise = null;
var __provinceYear = '2012';
var __provinceYearListeners = [];

function parseProvincePanelRows(text) {
    var raw = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!raw) return [];
    var lines = raw.split(/\r?\n/).filter(function (l) { return String(l).trim().length > 0; });
    if (lines.length < 2) return [];

    function splitLine(line) {
        return String(line).split(',').map(function (s) { return String(s).trim(); });
    }

    var header = splitLine(lines[0]);
    var idxProvince = header.indexOf('省份');
    var idxYear = header.indexOf('年份');
    var idxOTE = header.indexOf('综合效率_OTE');
    var idxPTE = header.indexOf('纯技术效率_PTE');
    var idxSE = header.indexOf('规模效率_SE');
    var idxChild = header.indexOf('3岁以下儿童系统管理率%');
    if (idxProvince < 0 || idxYear < 0 || idxOTE < 0 || idxPTE < 0 || idxSE < 0 || idxChild < 0) return [];

    var rows = [];
    for (var i = 1; i < lines.length; i++) {
        var cols = splitLine(lines[i]);
        var need = Math.max(idxProvince, idxYear, idxOTE, idxPTE, idxSE, idxChild) + 1;
        if (cols.length < need) continue;
        rows.push({
            province: cols[idxProvince],
            year: String(cols[idxYear]).trim(),
            ote: Number(cols[idxOTE]),
            pte: Number(cols[idxPTE]),
            se: Number(cols[idxSE]),
            child: Number(cols[idxChild])
        });
    }
    return rows;
}

function loadProvincePanelRows() {
    if (__provincePanelRowsCache) return Promise.resolve(__provincePanelRowsCache);
    if (__provincePanelRowsPromise) return __provincePanelRowsPromise;
    __provincePanelRowsPromise = fetch(PROVINCE_PANEL_CSV_URL)
        .then(function (res) {
            if (!res.ok) throw new Error('加载失败：' + res.status);
            return res.text();
        })
        .then(function (text) {
            var rows = parseProvincePanelRows(text);
            __provincePanelRowsCache = rows;
            return rows;
        });
    return __provincePanelRowsPromise;
}

function emitProvinceYear(year) {
    __provinceYear = String(year || '');
    for (var i = 0; i < __provinceYearListeners.length; i++) {
        try { __provinceYearListeners[i](__provinceYear); } catch (_e) {}
    }
}

function watchProvinceYear(handler) {
    if (typeof handler !== 'function') return function () {};
    __provinceYearListeners.push(handler);
    handler(__provinceYear);
    return function () {
        __provinceYearListeners = __provinceYearListeners.filter(function (h) { return h !== handler; });
    };
}

function initProvinceRadarKpiCards() {
    var el0 = document.getElementById('provinceKpi0')
    var el1 = document.getElementById('provinceKpi1')
    var el2 = document.getElementById('provinceKpi2')
    var el3 = document.getElementById('provinceKpi3')
    if (!el0 || !el1 || !el2 || !el3) return

    var cacheByYear = {}

    function fmtRatio(v, decimals) {
        if (!isFinite(v)) return '--'
        return Number(v).toFixed(decimals)
    }

    function fmtPercent(v, decimals) {
        if (!isFinite(v)) return '--'
        return Number(v).toFixed(decimals) + '%'
    }

    loadProvincePanelRows()
        .then(function (rows) {
            var sums = {}
            rows.forEach(function (r) {
                var y = String(r.year || '')
                if (!y) return
                if (!sums[y]) {
                    sums[y] = { oteSum: 0, oteCnt: 0, pteSum: 0, pteCnt: 0, seSum: 0, seCnt: 0, childSum: 0, childCnt: 0 }
                }
                if (isFinite(r.ote)) { sums[y].oteSum += r.ote; sums[y].oteCnt += 1 }
                if (isFinite(r.pte)) { sums[y].pteSum += r.pte; sums[y].pteCnt += 1 }
                if (isFinite(r.se)) { sums[y].seSum += r.se; sums[y].seCnt += 1 }
                if (isFinite(r.child)) { sums[y].childSum += r.child; sums[y].childCnt += 1 }
            })

            Object.keys(sums).forEach(function (y) {
                var s = sums[y]
                cacheByYear[y] = {
                    oteAvg: s.oteCnt ? (s.oteSum / s.oteCnt) : NaN,
                    pteAvg: s.pteCnt ? (s.pteSum / s.pteCnt) : NaN,
                    seAvg: s.seCnt ? (s.seSum / s.seCnt) : NaN,
                    childAvg: s.childCnt ? (s.childSum / s.childCnt) : NaN
                }
            })

            watchProvinceYear(function (year) {
                var d = cacheByYear[String(year)] || {}
                el0.innerText = fmtRatio(d.oteAvg, 3)
                el1.innerText = fmtRatio(d.pteAvg, 3)
                el2.innerText = fmtRatio(d.seAvg, 3)
                el3.innerText = fmtPercent(d.childAvg, 2)
            })
        })
        .catch(function (e) {
            console && console.warn && console.warn('panel_data_tobit.csv 加载失败（卡片）', e)
        })
}

function qipao(){
    var el = document.getElementById('qipao');
    if (!el) return;
    var myChart = echarts.init(el);

    // 区域颜色映射
    var REGION_COLORS = {
        '东部': { h: 200, legend: '#2eb4ff' },
        '中部': { h: 145, legend: '#2ed28c' },
        '西部': { h: 38,  legend: '#ffb93c' },
        '东北': { h: 290, legend: '#c864ff' }
    };
    var REGION_ORDER = ['东部', '中部', '西部', '东北'];

    // 象限阈值（PTE=0.95, SE=0.95）
    var Q_PTE = 0.95, Q_SE = 0.95;

    var _parsed = null;
    var _currentYear = null;

    function renderEmpty() {
        myChart.setOption({ tooltip:{show:false}, xAxis:{show:false}, yAxis:{show:false}, series:[] }, true);
    }

    function radialFill(h) {
        return new echarts.graphic.RadialGradient(0.38, 0.35, 0.62, [
            { offset: 0,    color: 'hsla('+h+',100%,92%,0.95)' },
            { offset: 0.30, color: 'hsla('+h+', 95%,72%,0.82)' },
            { offset: 0.65, color: 'hsla('+h+', 88%,52%,0.60)' },
            { offset: 1,    color: 'hsla('+h+', 80%,34%,0.35)' }
        ]);
    }

    function parseDEACsv(text) {
        var raw = String(text||'').replace(/^\uFEFF/,'').trim();
        if (!raw) return null;
        var lines = raw.split(/\r?\n/).filter(function(l){ return String(l).trim().length>0; });
        if (lines.length < 2) return null;
        function sp(line){ return String(line).split(',').map(function(s){ return String(s).trim(); }); }
        var hdr = sp(lines[0]);
        var iP=hdr.indexOf('省份'), iR=hdr.indexOf('区域'), iY=hdr.indexOf('年份');
        var iO=hdr.indexOf('综合效率_OTE'), iPTE=hdr.indexOf('纯技术效率_PTE'), iSE=hdr.indexOf('规模效率_SE');
        if (iP<0||iY<0||iO<0||iPTE<0||iSE<0) return null;
        var rows=[];
        for (var i=1;i<lines.length;i++){
            var c=sp(lines[i]);
            var need=Math.max(iP,iR,iY,iO,iPTE,iSE)+1;
            if (c.length<need) continue;
            var ote=Number(c[iO]), pte=Number(c[iPTE]), se=Number(c[iSE]);
            if (!isFinite(ote)||!isFinite(pte)||!isFinite(se)) continue;
            rows.push({ province:c[iP], region:iR>=0?c[iR]:'东部', year:c[iY], ote:ote, pte:pte, se:se });
        }
        if (!rows.length) return null;
        var yearSet={}, provRegion={};
        rows.forEach(function(r){ yearSet[r.year]=true; provRegion[r.province]=r.region; });
        var years=Object.keys(yearSet).sort(function(a,b){ return Number(a)-Number(b); });
        var allProv=Object.keys(provRegion).sort();
        var provYearMap={};
        allProv.forEach(function(p){ provYearMap[p]={}; });
        rows.forEach(function(r){ provYearMap[r.province][r.year]={ote:r.ote,pte:r.pte,se:r.se}; });
        return { years:years, allProvinces:allProv, provYearMap:provYearMap, provRegionMap:provRegion };
    }

    function buildOption(parsed, year) {
        var allProv = parsed.allProvinces;
        var provYearMap = parsed.provYearMap;
        var provRegionMap = parsed.provRegionMap;

        // 全局 OTE 范围（用于气泡大小，跨年一致）
        var oteMin=Infinity, oteMax=-Infinity;
        allProv.forEach(function(p){
            parsed.years.forEach(function(y){
                var d=provYearMap[p][y];
                if(d){ oteMin=Math.min(oteMin,d.ote); oteMax=Math.max(oteMax,d.ote); }
            });
        });
        if(!isFinite(oteMin)){oteMin=0;oteMax=1;}

        // 当年数据
        var yearData = [];
        allProv.forEach(function(p){
            var d = provYearMap[p][year];
            if (!d) return;
            yearData.push({ province:p, region:provRegionMap[p]||'东部', ote:d.ote, pte:d.pte, se:d.se });
        });

        // 轴范围（当年数据）
        var seVals  = yearData.map(function(d){return d.se;});
        var pteVals = yearData.map(function(d){return d.pte;});
        var seMin=Math.min.apply(null,seVals),  seMax=Math.max.apply(null,seVals);
        var pteMin=Math.min.apply(null,pteVals),pteMax=Math.max.apply(null,pteVals);
        if(!isFinite(seMin)){seMin=0.6;seMax=1.05;}
        if(!isFinite(pteMin)){pteMin=0.6;pteMax=1.05;}
        var padX=(seMax-seMin)*0.12||0.03, padY=(pteMax-pteMin)*0.12||0.03;
        var xMin=Math.max(0.55,seMin-padX),  xMax=Math.min(1.05,seMax+padX);
        var yMin=Math.max(0.55,pteMin-padY), yMax=Math.min(1.05,pteMax+padY);

        function sizeFor(ote){
            var t=(ote-oteMin)/(oteMax-oteMin||1);
            t=Math.max(0,Math.min(1,t));
            t=Math.pow(t,0.5);
            return 6+t*16; // 6~22px
        }

        // 按区域分组 series
        var seriesMap={};
        REGION_ORDER.forEach(function(reg){ seriesMap[reg]=[]; });
        yearData.forEach(function(d){
            var reg=d.region, c=REGION_COLORS[reg]||REGION_COLORS['东部'];
            var h=c.h;
            seriesMap[reg].push({
                value:[d.se, d.pte],
                symbolSize: sizeFor(d.ote),
                _province: d.province,
                _ote: d.ote,
                itemStyle:{
                    color: radialFill(h),
                    borderColor:'hsla('+h+',95%,85%,0.85)',
                    borderWidth:1,
                    shadowBlur:14,
                    shadowColor:'hsla('+h+',90%,65%,0.55)',
                    opacity:0.92
                }
            });
        });

        var bubbleSeries = REGION_ORDER.map(function(reg){
            var c=REGION_COLORS[reg]||REGION_COLORS['东部'];
            return {
                name: reg,
                type:'scatter',
                color:'hsl('+c.h+',78%,58%)',
                data: seriesMap[reg],
                emphasis:{
                    itemStyle:{
                        borderColor:'rgba(255,255,255,0.95)',
                        borderWidth:2,
                        shadowBlur:20,
                        shadowColor:'rgba(46,200,207,0.6)',
                        opacity:1
                    }
                },
                label:{
                    show:false
                }
            };
        }).filter(function(s){return s.data&&s.data.length;});

        // 象限背景（markArea）附在第一个 series 上
        var qSE  = Math.max(xMin+0.001, Math.min(xMax-0.001, Q_SE));
        var qPTE = Math.max(yMin+0.001, Math.min(yMax-0.001, Q_PTE));
        var quadrantSeries = {
            name:'_quad',
            type:'scatter',
            data:[],
            silent:true,
            markArea:{
                silent:true,
                data:[
                    // 右上：效率前沿型
                    [{ coord:[qSE,qPTE], itemStyle:{color:'rgba(46,200,140,0.06)'} },
                     { coord:[xMax,yMax] }],
                    // 左上：规模待优化型
                    [{ coord:[xMin,qPTE], itemStyle:{color:'rgba(255,185,60,0.05)'} },
                     { coord:[qSE,yMax] }],
                    // 右下：转化短板型
                    [{ coord:[qSE,yMin], itemStyle:{color:'rgba(255,100,80,0.05)'} },
                     { coord:[xMax,qPTE] }],
                    // 左下：双重改进型
                    [{ coord:[xMin,yMin], itemStyle:{color:'rgba(120,120,180,0.05)'} },
                     { coord:[qSE,qPTE] }]
                ]
            },
            markLine:{
                silent:true,
                symbol:['none','none'],
                lineStyle:{ color:'rgba(46,200,207,0.22)', type:'dashed', width:1 },
                data:[
                    [{ coord:[qSE,yMin] },{ coord:[qSE,yMax] }],
                    [{ coord:[xMin,qPTE] },{ coord:[xMax,qPTE] }]
                ]
            }
        };

        return {
            animationDuration: 500,
            animationEasingUpdate: 'cubicOut',
            grid:{ left:'8%', right:'10%', top:'10%', bottom:'23%', containLabel:false },
            legend:{
                type:'plain',
                orient:'horizontal',
                bottom:45,
                left:'center',
                itemWidth:16, itemHeight:16, itemGap:18,
                textStyle:{ color:'rgba(207,232,255,0.9)', fontSize:13 },
                data: REGION_ORDER.map(function(reg){
                    var c=REGION_COLORS[reg];
                    return { name:reg, icon:'circle', itemStyle:{color:c.legend} };
                })
            },
            tooltip:{
                trigger:'item',
                backgroundColor:'rgba(8,18,42,0.94)',
                borderColor:'rgba(46,200,207,0.45)',
                borderWidth:1,
                textStyle:{ color:'#e8f4ff', fontSize:12 },
                formatter:function(p){
                    if(!p||!p.data||p.seriesName==='_quad') return '';
                    var d=p.data;
                    var se  =isFinite(d.value[0])?Number(d.value[0]).toFixed(4):'-';
                    var pte =isFinite(d.value[1])?Number(d.value[1]).toFixed(4):'-';
                    var ote =isFinite(d._ote)?Number(d._ote).toFixed(4):'-';
                    // 象限分类
                    var sx=d.value[0], sy=d.value[1];
                    var qtype = sx>=Q_SE&&sy>=Q_PTE?'效率前沿型'
                               :sx<Q_SE&&sy>=Q_PTE?'规模待优化型'
                               :sx>=Q_SE&&sy<Q_PTE?'转化短板型':'双重改进型';
                    return '<b>'+(d._province||p.seriesName)+'</b>&nbsp;&nbsp;'+year+' 年'
                        +'<br/>SE（规模效率）：'+se
                        +'<br/>PTE（纯技术效率）：'+pte
                        +'<br/>OTE（综合效率）：'+ote
                        +'<br/><span style="color:rgba(46,200,207,0.9)">类型：'+qtype+'</span>';
                }
            },
            xAxis:{
                type:'value', min:xMin, max:xMax,
                name:'',
                nameLocation:'end',
                nameGap:8,
                nameTextStyle:{ color:'rgba(180,220,255,0.8)', fontSize:10 },
                axisLine:{ lineStyle:{ color:'rgba(46,200,207,0.45)', width:1 } },
                axisTick:{ show:false },
                axisLabel:{ color:'rgba(200,228,255,0.85)', fontSize:9,
                    formatter:function(v){ return Number(v).toFixed(2); },
                    margin:4
                },
                splitLine:{ lineStyle:{ color:'rgba(46,200,207,0.08)', type:'dashed' } }
            },
            yAxis:{
                type:'value', min:yMin, max:yMax,
                name:'PTE',
                nameTextStyle:{ color:'rgba(180,220,255,0.8)', fontSize:10 },
                axisLine:{ show:true, lineStyle:{ color:'rgba(46,200,207,0.25)' } },
                splitLine:{ lineStyle:{ color:'rgba(46,200,207,0.08)', type:'dashed' } },
                axisLabel:{ color:'rgba(200,228,255,0.82)', fontSize:9,
                    formatter:function(v){ return Number(v).toFixed(2); },
                    margin:4
                }
            },
            // 年份滑动条（X轴 dataZoom 改为年份选择，用 graphic 文字显示当前年）
            graphic:[
                {
                    type:'text',
                    left:'center',
                    bottom:20,
                    style:{
                        text:'当前年份：'+year,
                        fill:'rgba(46,200,207,0.92)',
                        fontSize:14,
                        fontWeight:'bold'
                    }
                },
                {
                    type:'text',
                    right:'10%',
                    bottom:'23%',
                    style:{
                        text:'SE（规模效率）',
                        fill:'rgba(180,220,255,0.8)',
                        fontSize:10,
                        textAlign:'right'
                    }
                }
            ],
            series: [quadrantSeries].concat(bubbleSeries)
        };
    }

    function renderYear(year) {
        if (!_parsed) return;
        _currentYear = year;
        myChart.setOption(buildOption(_parsed, year), true);
    }

    fetch('data/DEA_health_results.csv')
        .then(function(res){
            if(!res.ok) throw new Error('加载失败：'+res.status);
            return res.text();
        })
        .then(function(text){
            var parsed = parseDEACsv(text);
            if (!parsed) return renderEmpty();
            _parsed = parsed;

            // 初始渲染：用当前地图年份或第一年
            var initYear = __provinceYear || parsed.years[0];
            if (parsed.years.indexOf(initYear) < 0) initYear = parsed.years[0];
            renderYear(initYear);

            // 监听地图年份变化
            watchProvinceYear(function(year){
                if (!_parsed) return;
                var y = String(year||'');
                if (_parsed.years.indexOf(y) >= 0) {
                    renderYear(y);
                }
            });
        })
        .catch(function(e){
            console && console.warn && console.warn('DEA_health_results.csv 加载失败', e);
            renderEmpty();
        });

    window.addEventListener('resize', function(){ myChart.resize(); });
}


function map(){
    var myChart = echarts.init(document.getElementById('map'));

    function normalizeProvinceName(name) {
        if (name == null) return '';
        var n = String(name).trim();
        n = n.replace(/\s+/g, '');
        n = n.replace(/省|市/g, '');
        n = n.replace(/壮族自治区|回族自治区|维吾尔自治区|自治区/g, '');
        n = n.replace(/特别行政区/g, '');
        return n;
    }

    function parseCsvSimple(text) {
        var raw = String(text || '').replace(/^\uFEFF/, '').trim();
        if (!raw) return [];
        var lines = raw.split(/\r?\n/).filter(function (l) { return String(l).trim().length > 0; });
        if (!lines.length) return [];

        function splitLine(line) {
            // 简化版：支持无引号/无逗号转义的 CSV
            return String(line).split(',').map(function (s) { return String(s).trim(); });
        }

        var header = splitLine(lines[0]);
        var hasHeader = header.length >= 3 && (
            header[0].indexOf('省') !== -1 ||
            header[0].indexOf('地区') !== -1 ||
            header[1].indexOf('年') !== -1 ||
            header[2].indexOf('耦') !== -1
        );

        var startIdx = hasHeader ? 1 : 0;
        var rows = [];
        for (var i = startIdx; i < lines.length; i++) {
            var cols = splitLine(lines[i]);
            if (cols.length < 3) continue;
            rows.push({
                province: cols[0],
                year: cols[1],
                value: cols[2]
            });
        }
        return rows;
    }

    var _mapBorderBreathPhase = 0;
    var _mapBorderBreathTimer = null;

    function buildHeatmapOption(minV, maxV, seriesData, yearLabel) {
        var bt = (Math.sin(_mapBorderBreathPhase) + 1) / 2;
        /* 省界描边略细；呼吸仅微调亮度，避免线宽过粗 */
        var borderW = 0.55 + bt * 0.35;
        var borderA = 0.88 + bt * 0.12;
        var shadowB = 24 + bt * 38;
        var shadowA = 0.72 + bt * 0.28;
        return {
            tooltip: {
                trigger: 'item',
                formatter: function (p) {
                    var raw = (p && p.data && p.data.rawValue != null) ? p.data.rawValue : ((p && p.value != null) ? p.value : '-');
                    var ote = Number(raw);
                    var oteText = isFinite(ote) ? ote.toFixed(4) : raw;
                    return (p && p.name ? p.name : '') + '<br/>年份：' + yearLabel + '<br/>OTE：' + oteText;
                }
            },
            visualMap: {
                min: isFinite(minV) ? minV : 0,
                max: isFinite(maxV) ? maxV : 1,
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: 44,
                text: ['高', '低'],
                textStyle: { color: '#cfe8ff' },
                inRange: {
                    // 深蓝 -> 蓝 -> 青 -> 黄 -> 橙红，层次跨度更大
                    color: ['#0b1f3a', '#165DFF', '#00B8D9', '#FFD166', '#FF6B35']
                }
            },
            geo: {
                map: 'china',
                aspectScale: 0.85,
                layoutCenter: ["50%", "42%"],
                layoutSize: '102%',
                roam: false,
                /* 省名由 geo 统一绘制，避免仅 series.data 有数据的省才出字 */
                label: {
                    normal: {
                        show: true,
                        textStyle: {
                            color: 'rgba(220, 245, 255, 0.92)',
                            fontSize: 10
                        }
                    },
                    emphasis: {
                        show: true,
                        textStyle: {
                            color: 'rgba(255, 255, 255, 0.98)',
                            fontSize: 11,
                            fontWeight: 'bold'
                        }
                    }
                },
		            itemStyle: {
		                normal: {
                        areaColor: '#0c274b',
                        borderColor: 'rgba(200, 252, 255, ' + borderA + ')',
                        borderWidth: borderW,
                        shadowBlur: shadowB,
                        shadowColor: 'rgba(120, 240, 255, ' + shadowA + ')',
                        shadowOffsetX: 0,
                        shadowOffsetY: 0
                    },
                    emphasis: {
                        areaColor: 'rgba(255, 255, 255, 0.88)',
                        borderColor: '#2ec8cf'
                    }
                },
                regions: [{
                    name: '南海诸岛',
                    itemStyle: {
                        areaColor: 'rgba(0, 10, 52, 1)',
                        borderColor: 'rgba(0, 10, 52, 1)',
                        normal: { opacity: 0, label: { show: false } }
                    },
                    label: { show: false }
                }]
            },
            series: [{
                name: 'OTE',
                type: 'map',
                mapType: 'china',
                geoIndex: 0,
                data: seriesData,
                /* 省名已在 geo.label 显示，此处关闭避免叠字/闪烁 */
                label: {
                    normal: { show: false },
                    emphasis: { show: false }
                },
                emphasis: {
                    itemStyle: {
                        areaColor: 'rgba(255, 255, 255, 0.88)',
                        borderColor: '#2ec8cf'
                    }
                }
            }]
        };
    }

    function startMapBorderBreath(myChart) {
        if (_mapBorderBreathTimer) {
            clearInterval(_mapBorderBreathTimer);
            _mapBorderBreathTimer = null;
        }
        _mapBorderBreathTimer = setInterval(function () {
            _mapBorderBreathPhase += 0.07;
            var t = (Math.sin(_mapBorderBreathPhase) + 1) / 2;
            var bw = 0.5 + t * 0.42;
            var ba = 0.82 + t * 0.18;
            var sb = 26 + t * 42;
            var sa = 0.68 + t * 0.32;
            myChart.setOption({
                geo: {
                    itemStyle: {
                        normal: {
                            borderColor: 'rgba(210, 252, 255, ' + ba + ')',
                            borderWidth: bw,
                            shadowBlur: sb,
                            shadowColor: 'rgba(130, 245, 255, ' + sa + ')',
                            shadowOffsetX: 0,
                            shadowOffsetY: 0
                        }
                    }
                }
            }, false);
        }, 48);
    }

    function percentileSorted(sortedVals, p) {
        var n = sortedVals.length;
        if (!n) return NaN;
        if (n === 1) return sortedVals[0];
        var idx = (n - 1) * (p / 100);
        var lo = Math.floor(idx);
        var hi = Math.ceil(idx);
        if (lo === hi) return sortedVals[lo];
        return sortedVals[lo] * (hi - idx) + sortedVals[hi] * (idx - lo);
    }

    /** 用分位数区间做色标，避免单省极端值把主体省份挤到同一色段（如 2012 极低值 + 其余都很高） */
    function getRobustYearRangeForMap(rawData) {
        var vals = [];
        for (var i = 0; i < rawData.length; i++) {
            var v = Number(rawData[i] && rawData[i].value);
            if (isFinite(v)) vals.push(v);
        }
        if (!vals.length) return { lo: 0, hi: 1 };
        vals.sort(function (a, b) { return a - b; });
        var n = vals.length;
        if (n < 5) {
            return { lo: vals[0], hi: vals[n - 1] };
        }
        var lo = percentileSorted(vals, 10);
        var hi = percentileSorted(vals, 90);
        if (!isFinite(lo) || !isFinite(hi) || hi - lo < 1e-9) {
            return { lo: vals[0], hi: vals[n - 1] };
        }
        return { lo: lo, hi: hi };
    }

    function enhanceMapValues(data, minV, maxV) {
        var safeMin = isFinite(minV) ? minV : 0;
        var safeMax = isFinite(maxV) ? maxV : 1;
        var span = Math.max(1e-9, safeMax - safeMin);
        var gamma = 0.45; // <1 放大中低区间差异，让颜色变化更敏感
        var out = [];

        for (var i = 0; i < data.length; i++) {
            var item = data[i] || {};
            var raw = Number(item.value);
            if (!isFinite(raw)) continue;
            var n = (raw - safeMin) / span;
            if (n < 0) n = 0;
            if (n > 1) n = 1;
            var stretched = Math.pow(n, gamma);
            out.push({
                name: item.name,
                value: stretched,
                rawValue: raw
            });
        }

        return out;
    }

    var slider = document.getElementById('mapYearSlider');
    var yearLabelEl = document.getElementById('mapYearLabel');
    var controlsEl = document.getElementById('mapControls');
    var playBtnEl = document.getElementById('mapPlayToggle');
    var yearPlayTimer = null;
    var isYearPlaying = true;
    var YEAR_START = 2012;
    var YEAR_END = 2024;
    var YEAR_PLAY_INTERVAL = 1800;

    function ensureMapPlayButton() {
        if (playBtnEl) return playBtnEl;
        if (!slider || !slider.parentNode) return null;
        playBtnEl = document.createElement('button');
        playBtnEl.id = 'mapPlayToggle';
        playBtnEl.type = 'button';
        playBtnEl.innerText = '暂停';
        playBtnEl.style.marginLeft = '10px';
        playBtnEl.style.padding = '0 10px';
        playBtnEl.style.height = '24px';
        playBtnEl.style.lineHeight = '24px';
        playBtnEl.style.fontSize = '12px';
        playBtnEl.style.fontWeight = '500';
        playBtnEl.style.whiteSpace = 'nowrap';
        playBtnEl.style.color = '#cfe8ff';
        playBtnEl.style.background = 'rgba(12,26,52,0.72)';
        playBtnEl.style.border = '1px solid rgba(46,200,207,0.4)';
        playBtnEl.style.borderRadius = '4px';
        playBtnEl.style.cursor = 'pointer';
        slider.parentNode.appendChild(playBtnEl);
        return playBtnEl;
    }

    function updatePlayBtnText() {
        if (!playBtnEl) return;
        playBtnEl.innerText = isYearPlaying ? '暂停' : '播放';
    }

    function stopYearPlay() {
        if (yearPlayTimer) {
            clearInterval(yearPlayTimer);
            yearPlayTimer = null;
        }
    }

    function loadAndRenderFromRows(rows) {
            var byYear = {};
            var yearsSet = {};

            rows.forEach(function (r) {
                var prov = normalizeProvinceName(r.province);
                var year = String(r.year || '').trim();
                var v = Number(r.value);
                if (!prov || !year || !isFinite(v)) return;
                yearsSet[year] = true;
                if (!byYear[year]) byYear[year] = [];
                byYear[year].push({ name: prov, value: v });
            });

            var years = Object.keys(yearsSet).filter(function (y) {
                var ny = Number(y);
                return isFinite(ny) && ny >= YEAR_START && ny <= YEAR_END;
            }).sort(function (a, b) {
                var na = Number(a), nb = Number(b);
                if (isFinite(na) && isFinite(nb)) return na - nb;
                return String(a).localeCompare(String(b));
            });

            if (!years.length) {
                myChart.setOption(buildHeatmapOption(0, 1, [], '-'), true);
                if (controlsEl) controlsEl.style.display = 'none';
                return;
            }

            startMapBorderBreath(myChart);

            function renderAtIndex(idx) {
                var safeIdx = Math.max(0, Math.min(idx, years.length - 1));
                var y = years[safeIdx];
                if (yearLabelEl) yearLabelEl.innerText = '年份：' + y;
                emitProvinceYear(y);
                var rawData = byYear[y] || [];
                // 当前年份内用 P10~P90 作色标区间，避免单省极端值拉满跨度导致主体省份同色
                var yr = getRobustYearRangeForMap(rawData);
                var enhancedData = enhanceMapValues(rawData, yr.lo, yr.hi);
                myChart.setOption(buildHeatmapOption(0, 1, enhancedData, y), true);
            }

            if (slider) {
                slider.min = 0;
                slider.max = Math.max(0, years.length - 1);
                slider.step = 1;
                var startIdx = years.indexOf(String(YEAR_START));
                if (startIdx < 0) startIdx = 0;
                slider.value = startIdx;
                slider.oninput = function () {
                    renderAtIndex(Number(slider.value));
                };
            }

            ensureMapPlayButton();
            if (playBtnEl) {
                playBtnEl.onclick = function () {
                    isYearPlaying = !isYearPlaying;
                    updatePlayBtnText();
                };
            }
            updatePlayBtnText();

            if (controlsEl) controlsEl.style.display = '';
            var initIdx = years.indexOf(String(YEAR_START));
            if (initIdx < 0) initIdx = 0;
            renderAtIndex(initIdx);

            stopYearPlay();
            yearPlayTimer = setInterval(function () {
                if (!isYearPlaying || !years.length) return;
                var curr = slider ? Number(slider.value) : initIdx;
                if (!isFinite(curr)) curr = 0;
                var next = (curr + 1) % years.length;
                if (slider) slider.value = next;
                renderAtIndex(next);
            }, YEAR_PLAY_INTERVAL);
    }

    function renderEmpty() {
        stopYearPlay();
        myChart.setOption(buildHeatmapOption(0, 1, [], '-'), true);
        if (controlsEl) controlsEl.style.display = 'none';
    }

    (function loadPanelCsv() {
        loadProvincePanelRows()
            .then(function (rows) {
                var mapped = rows.map(function (r) {
                    return {
                        province: r.province,
                        year: r.year,
                        value: r.ote
                    };
                });
                loadAndRenderFromRows(mapped);
            })
            .catch(function (e) {
                console && console.warn && console.warn('地图数据加载失败', e);
                renderEmpty();
            });
    })();

    window.addEventListener("resize", function () {
        myChart.resize();
    });
	}


function leidatu(){
	var myChart = echarts.init(document.getElementById('leida'));

    function buildRadarOption(indicators, legends, seriesData) {
        // 使用跨色系高对比配色，提升区域之间的可辨识度
        var palette = ['#00B8D9', '#FF8A00', '#8E5CFF', '#FF4D6D'];
        return {
            color: palette,
	    legend: {
	        show: true,
	        bottom: 14,
	        center: 0,
                itemWidth: 14,
                itemHeight: 14,
                itemGap: 16,
                textStyle: { fontSize: 12, color: '#ade3ff' },
                data: legends
            },
            tooltip: { trigger: 'item' },
	    radar: [{
                indicator: indicators,
	        center: ['50%', '46%'],
                radius: '70%',
	        startAngle: 90,
                splitNumber: 4,
	        name: {
	            formatter: '{value}',
                    textStyle: { fontSize: 12, color: '#5b81cb' }
	        },
                splitArea: {
	            show: true,
                    areaStyle: { color: ['#141c42', '#141c42'] }
                },
                axisLine: { lineStyle: { color: '#153269' } },
                splitLine: { lineStyle: { color: '#113865', width: 1 } }
            }],
	    series: [{
	        name: '雷达图',
	        type: 'radar',
                data: seriesData,
                animationDuration: 1200,
                animationEasing: 'cubicOut',
                emphasis: {
                    lineStyle: { width: 4.5 },
                    areaStyle: { opacity: 0.55 }
                }
            }]
        };
    }

    function renderEmpty() {
        myChart.setOption(buildRadarOption([], [], []), true);
    }

    function parseRadarXlsx(arrayBuffer) {
        if (!window.XLSX) throw new Error('XLSX 未加载');
        var wb = window.XLSX.read(arrayBuffer, { type: 'array' });
        var sheetName = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : null;
        if (!sheetName) return null;
        var sheet = wb.Sheets[sheetName];
        var table = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        if (!table || table.length < 2) return null;

        var header = (table[0] || []).map(function (x) { return String(x || '').trim(); });
        // 约定格式：
        // A列：区域（东部/中部/西部/东北）
        // 第1行（从B列开始）：雷达维度（如 U1~U5）
        var dims = header.slice(1).filter(function (x) { return x !== ''; });
        if (!dims.length) return null;

        var regionNames = [];
        var seriesData = [];
        var maxPerAxis = [];
        var dlen = dims.length;
        for (var ax = 0; ax < dlen; ax++) maxPerAxis[ax] = 0;

        for (var i = 1; i < table.length; i++) {
            var row = table[i] || [];
            var regionName = String(row[0] || '').trim();
            if (!regionName) continue;
            var rowValues = [];
            for (var c = 0; c < dims.length; c++) {
                var v = Number(row[c + 1]);
                if (!isFinite(v)) v = 0;
                rowValues.push(v);
                maxPerAxis[c] = Math.max(maxPerAxis[c], v);
            }
            regionNames.push(regionName);
            seriesData.push({
                name: regionName,
                value: rowValues,
	            symbolSize: 8,
                lineStyle: { width: 3.5, opacity: 1 },
                itemStyle: { borderWidth: 2.5 },
                areaStyle: { opacity: 0.42 }
            });
        }

        if (!regionNames.length) return null;
        // 按轴取 max；MAX_PAD 为相对数据的刻度放大系数，越大则多边形越靠内、与外圈留白越多（约 1.33 → 顶点约在外圈半径的 75% 处）
        var MAX_PAD = 1.53;
        var indicators = dims.map(function (t, idx) {
            var m = maxPerAxis[idx];
            if (!isFinite(m) || m <= 0) m = 1;
            return { text: t, max: m * MAX_PAD };
        });

        return { indicators: indicators, legends: regionNames, seriesData: seriesData };
    }

    fetch(encodeURI('data/雷达.xlsx'))
        .then(function (res) {
            if (!res.ok) throw new Error('加载失败：' + res.status);
            return res.arrayBuffer();
        })
        .then(function (buf) {
            var parsed = parseRadarXlsx(buf);
            if (!parsed) return renderEmpty();
            myChart.setOption(buildRadarOption(parsed.indicators, parsed.legends, parsed.seriesData), true);
        })
        .catch(function (e) {
            console && console.warn && console.warn('雷达.xlsx 加载失败', e);
            renderEmpty();
        });

    window.addEventListener("resize", function () {
        myChart.resize();
    });
}

function wuran(){
	var myChart = echarts.init(document.getElementById('wuran'));

    function mixRgbStops(t) {
        t = Math.max(0, Math.min(1, t));
        var stops = [
            { p: 0, rgb: [22, 93, 255] },
            { p: 0.5, rgb: [0, 184, 217] },
            { p: 1, rgb: [255, 107, 53] }
        ];
        var i;
        for (i = 0; i < stops.length - 1; i++) {
            if (t <= stops[i + 1].p) break;
        }
        var a = stops[i];
        var b = stops[i + 1];
        var u = (t - a.p) / (b.p - a.p || 1);
        return [
            Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * u),
            Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * u),
            Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * u)
        ];
    }

    function renderBar(names, values) {
        var maxVal = values.length ? Math.max.apply(null, values) : 0;
        var minVal = values.length ? Math.min.apply(null, values) : 0;
        var span = maxVal - minVal;
        var pad = span > 1e-12 ? Math.max(span * 0.08, 1e-4) : 0.02;
        var xMin = values.length ? minVal - pad : 0;
        var xMax = values.length ? maxVal + pad * 0.35 : 1;
        var bg = values.map(function () { return xMax; });
        var colorGamma = 0.28;

        function barColorByValue(v) {
            var r = span > 1e-12 ? (v - minVal) / span : 0.5;
            r = Math.pow(Math.max(0, Math.min(1, r)), colorGamma);
            var c0 = mixRgbStops(r * 0.92);
            var c1 = mixRgbStops(Math.min(1, r * 0.92 + 0.08));
            return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: 'rgb(' + c0.join(',') + ')' },
                { offset: 1, color: 'rgb(' + c1.join(',') + ')' }
            ]);
        }

        myChart.setOption({
	    grid: {
                left: '3%',
                right: '3%',
                bottom: '1%',
	        top: '8%',
	        containLabel: true
	    },
	    tooltip: {
	        trigger: 'axis',
                axisPointer: { type: 'none' },
	        formatter: function(params) {
                    return params[0].name + ' : ' + params[0].value;
	        }
	    },
            xAxis: {
                show: false,
                type: 'value',
                min: xMin,
                max: xMax,
                scale: true
            },
	    yAxis: [{
	        type: 'category',
	        inverse: true,
                axisLabel: { show: true, textStyle: { color: '#fff' } },
                splitLine: { show: false },
                axisTick: { show: false },
                axisLine: { show: false },
                data: names
	    }, {
	        type: 'category',
	        inverse: true,
	        axisTick: 'none',
	        axisLine: 'none',
	        show: true,
                axisLabel: { textStyle: { color: '#ffffff', fontSize: '12' } },
                data: values
	    }],
	    series: [{
                name: 'PTE',
	            type: 'bar',
	            zlevel: 1,
	            itemStyle: {
	                normal: {
	                    barBorderRadius: 30,
                        color: function (params) {
                            var v = Number(params.data);
                            if (!isFinite(v)) v = minVal;
                            return barColorByValue(v);
                        }
                    }
	            },
	            barWidth: 10,
                data: values
            }, {
	            name: '背景',
	            type: 'bar',
	            barWidth: 10,
	            barGap: '-100%',
                data: bg,
	            itemStyle: {
	                normal: {
	                    color: 'rgba(24,31,68,1)',
                        barBorderRadius: 30
                    }
                }
            }]
        }, true);
    }

    function buildYearTop10(rows, year) {
        var target = String(year || '').trim();
        var list = rows
            .filter(function (r) { return String(r.year) === target && isFinite(r.pte); })
            .map(function (r) { return { name: String(r.province || '').trim(), value: Number(r.pte) }; })
            .sort(function (a, b) { return a.value - b.value; })
            .slice(0, 10);
        return list;
    }

    loadProvincePanelRows()
        .then(function (rows) {
            watchProvinceYear(function (year) {
                var top10 = buildYearTop10(rows, year);
                if (!top10.length) return renderBar([], []);
                renderBar(
                    top10.map(function (d) { return d.name; }),
                    top10.map(function (d) { return Number(d.value.toFixed(4)); })
                );
            });
        })
        .catch(function (e) {
            console && console.warn && console.warn('panel_data_tobit.csv 加载失败', e);
            renderBar([], []);
        });

    window.addEventListener("resize", function () {
        myChart.resize();
    });
}

function huaxing(){
    var myChart = echarts.init(document.getElementById('huaxing'));

    function mixRgbStops(t) {
        t = Math.max(0, Math.min(1, t));
        var stops = [
            { p: 0, rgb: [97, 63, 209] },
            { p: 0.5, rgb: [0, 184, 217] },
            { p: 1, rgb: [33, 212, 168] }
        ];
        var i;
        for (i = 0; i < stops.length - 1; i++) {
            if (t <= stops[i + 1].p) break;
        }
        var a = stops[i];
        var b = stops[i + 1];
        var u = (t - a.p) / (b.p - a.p || 1);
        return [
            Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * u),
            Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * u),
            Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * u)
        ];
    }

    function renderBar(names, values) {
        var maxVal = values.length ? Math.max.apply(null, values) : 0;
        var minVal = values.length ? Math.min.apply(null, values) : 0;
        var span = maxVal - minVal;
        var pad = span > 1e-12 ? Math.max(span * 0.08, 1e-4) : 0.02;
        var xMin = values.length ? minVal - pad : 0;
        var xMax = values.length ? maxVal + pad * 0.35 : 1;
        var bg = values.map(function () { return xMax; });
        var colorGamma = 0.32;

        function barColorByValue(v) {
            var r = span > 1e-12 ? (v - minVal) / span : 0.5;
            r = Math.pow(Math.max(0, Math.min(1, r)), colorGamma);
            var c0 = mixRgbStops(r * 0.9);
            var c1 = mixRgbStops(Math.min(1, r * 0.9 + 0.1));
            return new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                { offset: 0, color: 'rgb(' + c0.join(',') + ')' },
                { offset: 1, color: 'rgb(' + c1.join(',') + ')' }
            ]);
        }
        myChart.setOption({
            grid: {
                left: '3%',
                right: '3%',
                bottom: '1%',
                top: '8%',
                containLabel: true
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'none' },
                formatter: function(params) {
                    return params[0].name + ' : ' + params[0].value;
                }
            },
            xAxis: {
                show: false,
                type: 'value',
                min: xMin,
                max: xMax,
                scale: true
            },
            yAxis: [{
                type: 'category',
                inverse: true,
                axisLabel: { show: true, textStyle: { color: '#fff' } },
                splitLine: { show: false },
                axisTick: { show: false },
                axisLine: { show: false },
                data: names
            }, {
                type: 'category',
                inverse: true,
                axisTick: 'none',
                axisLine: 'none',
	                    show: true,
                axisLabel: { textStyle: { color: '#ffffff', fontSize: '12' } },
                data: values
            }],
            series: [{
                name: 'OTE',
                type: 'bar',
                zlevel: 1,
	            itemStyle: {
	                normal: {
                        barBorderRadius: 30,
                        color: function (params) {
                            var v = Number(params.data);
                            if (!isFinite(v)) v = minVal;
                            return barColorByValue(v);
                        }
                    }
                },
                barWidth: 10,
                data: values
            }, {
                name: '背景',
                type: 'bar',
                barWidth: 10,
                barGap: '-100%',
                data: bg,
	            itemStyle: {
	                normal: {
                        color: 'rgba(24,31,68,1)',
                        barBorderRadius: 30
                    }
                }
            }]
        }, true);
    }

    function buildYearTop10(rows, year) {
        var target = String(year || '').trim();
        var list = rows
            .filter(function (r) { return String(r.year) === target && isFinite(r.ote); })
            .map(function (r) { return { name: String(r.province || '').trim(), value: Number(r.ote) }; })
            .sort(function (a, b) { return a.value - b.value; })
            .slice(0, 10);
        return list;
    }

    loadProvincePanelRows()
        .then(function (rows) {
            watchProvinceYear(function (year) {
                var top10 = buildYearTop10(rows, year);
                if (!top10.length) return renderBar([], []);
                renderBar(
                    top10.map(function (d) { return d.name; }),
                    top10.map(function (d) { return Number(d.value.toFixed(4)); })
                );
            });
        })
        .catch(function (e) {
            console && console.warn && console.warn('panel_data_tobit.csv 加载失败', e);
            renderBar([], []);
        });

    window.addEventListener("resize", function () {
        myChart.resize();
    });
}


function zhexian() {
	var myChart = echarts.init(document.getElementById('zhexian'));

    function mean(arr) {
        var a = arr.filter(function (x) { return isFinite(x); });
        if (!a.length) return null;
        var s = 0;
        for (var i = 0; i < a.length; i++) s += a[i];
        return s / a.length;
    }

    function parsePanelTobitCsv(text) {
        var raw = String(text || '').replace(/^\uFEFF/, '').trim();
        if (!raw) return null;
        var lines = raw.split(/\r?\n/).filter(function (l) { return String(l).trim().length > 0; });
        if (lines.length < 2) return null;

        function splitLine(line) {
            return String(line).split(',').map(function (s) { return String(s).trim(); });
        }

        var header = splitLine(lines[0]);
        function idx(name) {
            var i = header.indexOf(name);
            return i;
        }

        var colYear = idx('年份');
        var colBed = idx('每千人床位数');
        var colDoc = idx('每千人医师数');
        var colNurse = idx('每千人护士数');
        var colChild = idx('3岁以下儿童系统管理率%');
        var colLife = idx('人口平均预期寿命（岁）');

        if (colYear < 0 || colBed < 0 || colDoc < 0 || colNurse < 0 || colChild < 0 || colLife < 0) {
            return null;
        }

        var needCols = Math.max(colYear, colBed, colDoc, colNurse, colChild, colLife) + 1;

        var agg = {};
        for (var r = 1; r < lines.length; r++) {
            var cols = splitLine(lines[r]);
            if (cols.length < needCols) continue;
            var y = Number(cols[colYear]);
            if (!isFinite(y)) continue;
            var key = String(y);
            if (!agg[key]) {
                agg[key] = { bed: [], doc: [], nurse: [], child: [], life: [] };
            }
            var b = parseFloat(cols[colBed]);
            var d = parseFloat(cols[colDoc]);
            var n = parseFloat(cols[colNurse]);
            var c = parseFloat(cols[colChild]);
            var l = parseFloat(cols[colLife]);
            if (isFinite(b)) agg[key].bed.push(b);
            if (isFinite(d)) agg[key].doc.push(d);
            if (isFinite(n)) agg[key].nurse.push(n);
            if (isFinite(c)) agg[key].child.push(c);
            if (isFinite(l)) agg[key].life.push(l);
        }

        var years = Object.keys(agg).sort(function (a, b) { return Number(a) - Number(b); });
        if (!years.length) return null;

        function seriesFor(field) {
            return years.map(function (yk) {
                var m = mean(agg[yk][field]);
                return m != null ? Number(m.toFixed(4)) : null;
            });
        }

        return {
            years: years,
            bed: seriesFor('bed'),
            doc: seriesFor('doc'),
            nurse: seriesFor('nurse'),
            child: seriesFor('child'),
            life: seriesFor('life')
        };
    }

    function renderEmpty() {
        myChart.setOption({ series: [], xAxis: [], yAxis: [], grid: [], title: [] }, true);
    }

    var palette = ['#f0c725', '#16f892', '#0BE3FF', '#eb5757', '#9b59b6', '#3498db', '#e67e22', '#1abc9c'];

    var legendNames = ['千人床位', '千人医师', '千人护士', '儿童管理率', '预期寿命'];

    fetch(encodeURI('data/province-screen/panel_data_tobit.csv'))
        .then(function (res) {
            if (!res.ok) throw new Error('加载失败：' + res.status);
            return res.text();
        })
        .then(function (text) {
            var parsed = parsePanelTobitCsv(text);
            if (!parsed || !parsed.years.length) return renderEmpty();

            var c0 = palette[0];
            var c1 = palette[1];
            var c2 = palette[2];
            var c3 = palette[3];
            var c4 = palette[4];

            var series = [
                {
                    name: legendNames[0],
                    type: 'line',
                    smooth: true,
                    symbolSize: 6,
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    data: parsed.bed,
                    itemStyle: { normal: { color: c0 } },
                    lineStyle: { normal: { width: 2 } }
                },
                {
                    name: legendNames[1],
                    type: 'line',
                    smooth: true,
                    symbolSize: 6,
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    data: parsed.doc,
                    itemStyle: { normal: { color: c1 } },
                    lineStyle: { normal: { width: 2 } }
                },
                {
                    name: legendNames[2],
                    type: 'line',
                    smooth: true,
                    symbolSize: 6,
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    data: parsed.nurse,
                    itemStyle: { normal: { color: c2 } },
                    lineStyle: { normal: { width: 2 } }
                },
                {
                    name: legendNames[3],
                    type: 'line',
                    smooth: true,
                    symbolSize: 6,
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: parsed.child,
                    itemStyle: { normal: { color: c3 } },
                    lineStyle: { normal: { width: 2 } }
                },
                {
                    name: legendNames[4],
                    type: 'line',
                    smooth: true,
                    symbolSize: 6,
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: parsed.life,
                    itemStyle: { normal: { color: c4 } },
                    lineStyle: { normal: { width: 2 } }
                }
            ];

            myChart.setOption({
                color: palette,
                title: [
                    {
                        text: '1. 千人床位 / 千人医师 / 千人护士',
                        left: 'center',
                        top: '0.5%',
                        textStyle: { color: '#cfe8ff', fontSize: 12 }
                    },
                    {
                        text: '2. 儿童管理率 / 预期寿命',
                        left: 'center',
                        top: '50%',
                        textStyle: { color: '#cfe8ff', fontSize: 12 }
                    }
                ],
		tooltip: {
			trigger: 'axis',
                    axisPointer: { type: 'line' }
		},
                legend: {
                    type: 'scroll',
                    top: '7.5%',
                    left: 'center',
                    textStyle: { color: '#c1cadf', fontSize: 11 },
                    data: legendNames
                },
                /* 双格上下拉开：略缩上图底、下移下图顶，留出中间空隙；下图抬高底边避免「年份」贴边溢出 */
                grid: [
                    { left: '10%', right: '6%', top: '15%', bottom: '61%' },
                    { left: '10%', right: '6%', top: '57%', bottom: '14%' }
                ],
                xAxis: [
                    {
                        type: 'category',
                        boundaryGap: false,
                        name: '年份',
                        nameLocation: 'middle',
                        nameGap: 28,
                        nameTextStyle: { color: '#c1cadf', fontSize: 11 },
                        data: parsed.years,
                        gridIndex: 0,
                        axisLine: { lineStyle: { color: 'rgba(240,199,37,0.45)' } },
                        axisLabel: { color: '#c1cadf', fontSize: 11 }
                    },
                    {
			type: 'category',
			boundaryGap: false,
                        name: '年份',
                        nameLocation: 'middle',
                        nameGap: 28,
                        nameTextStyle: { color: '#c1cadf', fontSize: 11 },
                        data: parsed.years,
                        gridIndex: 1,
                        axisLine: { lineStyle: { color: 'rgba(240,199,37,0.45)' } },
                        axisLabel: { color: '#c1cadf', fontSize: 11 }
                    }
                ],
                yAxis: [
                    {
			type: 'value',
                        name: '指标值',
                        gridIndex: 0,
                        nameTextStyle: { color: '#c1cadf', fontSize: 11 },
                        axisLine: { lineStyle: { color: 'rgba(240,199,37,0.45)' } },
                        axisLabel: { color: '#c1cadf', fontSize: 11 },
                        splitLine: { lineStyle: { color: 'rgba(17,56,101,0.45)' } }
                    },
                    {
                        type: 'value',
                        name: '指标值',
                        gridIndex: 1,
                        min: 70,
                        max: 100,
                        interval: 5,
                        nameTextStyle: { color: '#c1cadf', fontSize: 11 },
                        axisLine: { lineStyle: { color: 'rgba(240,199,37,0.45)' } },
                        axisLabel: {
                            color: '#c1cadf',
                            fontSize: 11,
                            formatter: function (value) {
                                if (value === 70) return '';
                                return value;
                            }
                        },
                        splitLine: { lineStyle: { color: 'rgba(17,56,101,0.45)' } }
                    }
                ],
                series: series
            }, true);
        })
        .catch(function (e) {
            console && console.warn && console.warn('panel_data_tobit.csv 加载失败', e);
            renderEmpty();
        });

    window.addEventListener('resize', function () {
		myChart.resize();
	});
}
