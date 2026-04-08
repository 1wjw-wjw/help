$(function(){

	map();

    leidatu();
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

function qipao(){
    var el = document.getElementById('qipao');
    if (!el) return;
    var myChart = echarts.init(el);

    function renderEmpty() {
        if (window._qipaoRaceTimer) {
            clearInterval(window._qipaoRaceTimer);
            window._qipaoRaceTimer = null;
        }
        myChart.setOption({
            tooltip: { show: false },
            xAxis: { show: false },
            yAxis: { show: false },
            series: []
        }, true);
    }

    function normalizeProvinceName(name) {
        if (name == null) return '';
        var n = String(name).trim();
        n = n.replace(/\s+/g, '');
        n = n.replace(/省|市/g, '');
        n = n.replace(/壮族自治区|回族自治区|维吾尔自治区|自治区/g, '');
        n = n.replace(/特别行政区/g, '');
        return n;
    }

    function parseQipaoXlsx(arrayBuffer) {
        if (!window.XLSX) throw new Error('XLSX 未加载');
        var wb = window.XLSX.read(arrayBuffer, { type: 'array' });
        var sheetName = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : null;
        if (!sheetName) return null;
        var sheet = wb.Sheets[sheetName];
        var table = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        if (!table || table.length < 2) return null;

        var rows = table.filter(function (r) {
            return r && r.length && String(r.join('')).trim() !== '';
        });
        if (rows.length < 2) return null;

        var header = rows[0].map(function (x) { return String(x || '').trim(); });
        function normalizeYear(v) {
            if (v == null) return '';
            if (typeof v === 'number') {
                // 直接年份
                if (v >= 1900 && v <= 2200) return String(Math.round(v));
                // Excel 日期序列号
                if (window.XLSX && window.XLSX.SSF && v > 20000 && v < 90000) {
                    var d = window.XLSX.SSF.parse_date_code(v);
                    if (d && d.y) return String(d.y);
                }
                return String(Math.round(v));
            }
            if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
                return String(v.getFullYear());
            }
            var s = String(v).trim();
            var m = s.match(/(19|20)\d{2}/);
            return m ? m[0] : s;
        }
        function findCol(re) {
            for (var i = 0; i < header.length; i++) if (re.test(header[i])) return i;
            return -1;
        }

        var hasHeader = header.some(function (h) { return /省|地区|年|耦|value|name/i.test(h); });
        var start = hasHeader ? 1 : 0;

        var provinceCol = findCol(/省|地区|province|name/i);
        if (provinceCol < 0) provinceCol = 0;
        var yearCol = findCol(/年份|时间|year/i);
        var valueCol = findCol(/耦合度|value|值/i);

        var raw = [];

        // 1) 优先按宽表：首列省份，后续列名是年份
        var yearCols = [];
        for (var c = 0; c < header.length; c++) {
            if (c === provinceCol) continue;
            var yFromHeader = normalizeYear(header[c]);
            if (/^(19|20)\d{2}$/.test(yFromHeader)) {
                yearCols.push({ col: c, year: yFromHeader });
            }
        }
        if (yearCols.length > 0) {
            for (var rr = start; rr < rows.length; rr++) {
                var row = rows[rr] || [];
                var prov = normalizeProvinceName(row[provinceCol]);
                if (!prov) continue;
                for (var yc = 0; yc < yearCols.length; yc++) {
                    var meta = yearCols[yc];
                    var val = Number(row[meta.col]);
                    if (!isFinite(val)) continue;
                    raw.push({ province: prov, year: meta.year, value: val });
                }
            }
        }

        // 2) 宽表未命中时，再按长表：省份/年份/耦合度
        if (!raw.length && yearCol >= 0 && valueCol >= 0) {
            for (var r = start; r < rows.length; r++) {
                var line = rows[r] || [];
                var p = normalizeProvinceName(line[provinceCol]);
                var y = normalizeYear(line[yearCol]);
                var v = Number(line[valueCol]);
                if (!p || !y || !isFinite(v)) continue;
                raw.push({ province: p, year: y, value: v });
            }
        }
        if (!raw.length) return null;

        // 使用完整省份数据（不裁剪）
        var provSet = {};
        raw.forEach(function (d) { provSet[d.province] = true; });
        var allProvinces = Object.keys(provSet).sort();

        var yearSet = {};
        raw.forEach(function (d) { yearSet[d.year] = true; });
        var years = Object.keys(yearSet).sort(function (a, b) {
            var na = Number(a), nb = Number(b);
            if (isFinite(na) && isFinite(nb)) return na - nb;
            return String(a).localeCompare(String(b));
        });

        var yearIndex = {};
        years.forEach(function (y, i) { yearIndex[y] = i; });
        var provIndex = {};
        allProvinces.forEach(function (p, i) { provIndex[p] = i; });

        var points = raw
            .filter(function (d) { return provIndex[d.province] != null && yearIndex[d.year] != null; })
            .map(function (d) {
                return {
                    name: d.province,
                    year: d.year,
                    value: [yearIndex[d.year], provIndex[d.province], d.value]
                };
            });

        if (!points.length) return null;
        var minS = Math.min.apply(null, points.map(function (p) { return p.value[2]; }));
        var maxS = Math.max.apply(null, points.map(function (p) { return p.value[2]; }));

        return { points: points, minS: minS, maxS: maxS, years: years, provinces: allProvinces };
    }

    fetch(encodeURI('data/qipao.xlsx'))
        .then(function (res) {
            if (!res.ok) throw new Error('加载失败：' + res.status);
            return res.arrayBuffer();
        })
        .then(function (buf) {
            var parsed = parseQipaoXlsx(buf);
            if (!parsed) return renderEmpty();

            // 组装“省份 -> 各年份耦合度”序列
            var provYearMap = {};
            parsed.provinces.forEach(function (p) { provYearMap[p] = {}; });
            parsed.points.forEach(function (pt) {
                var yi = Number(pt.value[0]);
                var pi = Number(pt.value[1]);
                var year = parsed.years[yi];
                var province = parsed.provinces[pi];
                var val = Number(pt.value[2]);
                if (province && year && isFinite(val)) {
                    provYearMap[province][year] = val;
                }
            });

            var years = parsed.years;
            var allProv = parsed.provinces;

            var globalMin = Infinity;
            var globalMax = -Infinity;
            allProv.forEach(function (p) {
                years.forEach(function (y) {
                    var v = provYearMap[p][y];
                    if (isFinite(v)) {
                        globalMin = Math.min(globalMin, v);
                        globalMax = Math.max(globalMax, v);
                    }
                });
            });
            if (!isFinite(globalMin)) {
                globalMin = 0;
                globalMax = 1;
            }
            var padY = (globalMax - globalMin) * 0.08 || 0.02;
            var yMin = Math.max(0, globalMin - padY);
            var yMax = globalMax + padY;

            function sizeFor(v) {
                var t = (v - globalMin) / (globalMax - globalMin || 1);
                t = Math.max(0, Math.min(1, t));
                t = Math.pow(t, 0.62);
                return 10 + t * 36;
            }

            /** 黄金角分布全色相，相邻省色差大、易辨认 */
            function hueForProvince(i) {
                return Math.floor((i * 137.508) % 360);
            }

            function radialFill(h) {
                return new echarts.graphic.RadialGradient(0.42, 0.38, 0.58, [
                    { offset: 0, color: 'hsla(' + h + ', 92%, 74%, 0.78)' },
                    { offset: 0.32, color: 'hsla(' + h + ', 88%, 56%, 0.52)' },
                    { offset: 0.72, color: 'hsla(' + h + ', 78%, 40%, 0.34)' },
                    { offset: 1, color: 'hsla(' + h + ', 70%, 26%, 0.2)' }
                ]);
            }

            function radialFillTibet() {
                return new echarts.graphic.RadialGradient(0.45, 0.4, 0.55, [
                    { offset: 0, color: 'rgba(186, 200, 255, 0.72)' },
                    { offset: 0.4, color: 'rgba(120, 140, 255, 0.48)' },
                    { offset: 1, color: 'rgba(60, 40, 120, 0.35)' }
                ]);
            }

            if (window._qipaoRaceTimer) {
                clearInterval(window._qipaoRaceTimer);
                window._qipaoRaceTimer = null;
            }

            var lastYearIdx = years.length - 1;
            var tierTop = { '北京': true, '上海': true };
            var bubbleSeries = allProv.map(function (province, pi) {
                var h = hueForProvince(pi);
                var isTibet = province === '西藏';
                var pts = [];
                years.forEach(function (y, i) {
                    var v = provYearMap[province][y];
                    if (!isFinite(v)) return;
                    v = Number(v);
                    var sz = sizeFor(v);
                    var isHLJLast = province === '黑龙江' && i === lastYearIdx;
                    var isTopTier = !!tierTop[province];
                    var fill = isTibet ? radialFillTibet() : radialFill(h);
                    var borderW = 1.2;
                    var borderC = 'hsla(' + h + ', 88%, 72%, 0.62)';
                    var blur = 14;
                    var sh = 'hsla(' + h + ', 82%, 52%, 0.48)';
                    if (isTopTier) {
                        borderW = 1.5;
                        borderC = 'rgba(255, 224, 140, 0.65)';
                        blur = 18;
                        sh = 'rgba(255, 210, 120, 0.4)';
                    }
                    if (isHLJLast) {
                        sz *= 1.18;
                        borderW = 2;
                        borderC = 'rgba(255, 200, 100, 0.92)';
                        blur = 22;
                        sh = 'rgba(255, 180, 60, 0.55)';
                    }
                    if (isTibet) {
                        borderC = 'rgba(180, 190, 255, 0.6)';
                        blur = 16;
                        sh = 'rgba(140, 150, 255, 0.42)';
                    }
                    pts.push({
                        value: [i, v],
                        symbolSize: sz,
                        itemStyle: {
                            color: fill,
                            borderColor: borderC,
                            borderWidth: borderW,
                            shadowBlur: blur,
                            shadowColor: sh,
                            shadowOffsetY: 0,
                            opacity: 0.82
                        }
                    });
                });
                var legendHue = isTibet ? 248 : h;
                return {
                    name: province,
                    type: 'scatter',
                    color: 'hsl(' + legendHue + ', 78%, 58%)',
                    data: pts,
                    emphasis: {
                        itemStyle: {
                            borderColor: 'rgba(255, 255, 255, 0.95)',
                            borderWidth: 2.2,
                            shadowBlur: 26,
                            shadowColor: 'rgba(46, 200, 207, 0.55)',
                            opacity: 0.98
                        }
                    }
                };
            }).filter(function (s) { return s.data && s.data.length; });

            if (!bubbleSeries.length) return renderEmpty();

            myChart.setOption({
                animationDuration: 750,
                animationEasingUpdate: 'cubicOut',
                grid: { left: '7.5%', right: '10%', top: '9%', bottom: '30%' },
                legend: {
                    type: 'scroll',
                    orient: 'horizontal',
                    bottom: 80,
                    left: 'center',
                    width: '90%',
                    textStyle: { color: 'rgba(207, 232, 255, 0.88)', fontSize: 9 },
                    pageTextStyle: { color: 'rgba(207, 232, 255, 0.9)' },
                    pageIconColor: 'rgba(46, 200, 207, 0.75)',
                    itemWidth: 19,
                    itemHeight: 19,
                    itemGap: 5
                },
                tooltip: {
                    trigger: 'item',
                    backgroundColor: 'rgba(8, 18, 42, 0.94)',
                    borderColor: 'rgba(46, 200, 207, 0.45)',
                    borderWidth: 1,
                    textStyle: { color: '#e8f4ff', fontSize: 12 },
                    formatter: function (p) {
                        if (!p || !p.seriesName || !p.value) return '';
                        var yi = p.value[0];
                        var val = p.value[1];
                        var yr = years[yi];
                        return p.seriesName + '<br/>' + yr + ' 年<br/>耦合度：' + (isFinite(val) ? Number(val).toFixed(4) : '');
                    }
                },
                xAxis: {
                    type: 'category',
                    data: years,
                    name: '年份',
                    nameGap: 24,
                    nameTextStyle: { color: 'rgba(180, 220, 255, 0.8)', fontSize: 11 },
                    axisLine: { lineStyle: { color: 'rgba(46, 200, 207, 0.45)', width: 1 } },
                    axisTick: { show: false },
                    axisLabel: { color: 'rgba(200, 228, 255, 0.88)', fontSize: 11 },
                    splitLine: { show: false }
                },
                yAxis: {
                    type: 'value',
                    min: yMin,
                    max: yMax,
                    name: '耦合度',
                    nameTextStyle: { color: 'rgba(180, 220, 255, 0.8)', fontSize: 11 },
                    axisLine: { show: true, lineStyle: { color: 'rgba(46, 200, 207, 0.25)' } },
                    splitLine: {
                        lineStyle: {
                            color: 'rgba(46, 200, 207, 0.12)',
                            type: 'dashed'
                        }
                    },
                    axisLabel: { color: 'rgba(200, 228, 255, 0.82)', fontSize: 10 }
                },
                dataZoom: [
                    { type: 'inside', xAxisIndex: 0, start: 0, end: 100 },
                    {
                        type: 'slider',
                        xAxisIndex: 0,
                        height: 20,
                        bottom: 35,
                        borderColor: 'rgba(46, 200, 207, 0.25)',
                        fillerColor: 'rgba(46, 200, 207, 0.28)',
                        backgroundColor: 'rgba(12, 26, 52, 0.65)',
                        handleStyle: { color: 'rgba(120, 220, 255, 0.85)', borderColor: 'rgba(46, 200, 207, 0.6)' },
                        textStyle: { color: 'rgba(200, 228, 255, 0.75)', fontSize: 10 }
                    }
                ],
                series: bubbleSeries
            }, true);
        })
        .catch(function (e) {
            console && console.warn && console.warn('qipao.xlsx 加载失败', e);
            renderEmpty();
        });

    window.addEventListener('resize', function () { myChart.resize(); });
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
                    return (p && p.name ? p.name : '') + '<br/>年份：' + yearLabel + '<br/>耦合度：' + raw;
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
                name: '耦合度',
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

    function parseXlsxToRows(arrayBuffer) {
        if (!window.XLSX) throw new Error('XLSX 未加载');
        var wb = window.XLSX.read(arrayBuffer, { type: 'array' });
        var sheetName = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : null;
        if (!sheetName) return [];
        var sheet = wb.Sheets[sheetName];
        // header:1 -> 二维数组（每行一个数组），更好做表头识别
        var table = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        if (!table || !table.length) return [];

        var headerRow = table[0].map(function (x) { return String(x || '').trim(); });
        var hasHeader = headerRow.length >= 3 && (
            headerRow[0].indexOf('省') !== -1 ||
            headerRow[0].indexOf('地区') !== -1 ||
            headerRow[1].indexOf('年') !== -1 ||
            headerRow[2].indexOf('耦') !== -1
        );

        var start = hasHeader ? 1 : 0;
        var rows = [];
        for (var i = start; i < table.length; i++) {
            var r = table[i] || [];
            if (r.length < 3) continue;
            rows.push({
                province: r[0],
                year: r[1],
                value: r[2]
            });
        }
        return rows;
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

            var years = Object.keys(yearsSet).sort(function (a, b) {
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
                slider.value = 0;
                slider.oninput = function () {
                    renderAtIndex(Number(slider.value));
                };
            }

            if (controlsEl) controlsEl.style.display = '';
            renderAtIndex(0);
    }

    function renderEmpty() {
        myChart.setOption(buildHeatmapOption(0, 1, [], '-'), true);
        if (controlsEl) controlsEl.style.display = 'none';
    }

    (function loadXlsx() {
        fetch('data/map.xlsx')
            .then(function (res) {
                if (!res.ok) throw new Error('加载失败：' + res.status);
                return res.arrayBuffer();
            })
            .then(function (buf) {
                var rows = parseXlsxToRows(buf);
                loadAndRenderFromRows(rows);
            })
            .catch(function (e) {
                // 兼容：如果你仍然保留了 map.csv，也可以作为降级数据源
                $.get('data/map.csv')
                    .done(function (csvText) {
                        var rows = parseCsvSimple(csvText);
                        loadAndRenderFromRows(rows);
                    })
                    .fail(function () {
                        console && console.warn && console.warn('地图数据加载失败', e);
                        renderEmpty();
                    });
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
        var pad = span > 1e-12 ? Math.max(span * 0.2, 1e-4) : 0.02;
        var xMin = values.length ? minVal - pad : 0;
        var xMax = values.length ? maxVal + pad * 0.35 : 1;
        var bg = values.map(function () { return xMax; });
        var colorGamma = 0.45;

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
                name: 'D值',
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

    function parseTopDXlsx(buffer) {
        if (!window.XLSX) throw new Error('XLSX 未加载');
        var wb = window.XLSX.read(buffer, { type: 'array' });
        var sheetName = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : null;
        if (!sheetName) return [];
        var sheet = wb.Sheets[sheetName];
        var rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        if (!rows || rows.length < 2) return [];

        var header = (rows[0] || []).map(function (x) { return String(x || '').trim(); });
        var hasHeader = header.some(function (h) { return /D|值|name|名称|地区|省/i.test(h); });
        var start = hasHeader ? 1 : 0;

        var nameCol = 0;
        var dCol = (header.length > 0 ? header.length - 1 : -1);
        if (hasHeader) {
            for (var i = 0; i < header.length; i++) {
                if (/name|名称|地区|省|企业/i.test(header[i])) { nameCol = i; break; }
            }
            for (var j = 0; j < header.length; j++) {
                if (/^D$|D值|d值|耦合|score|value/i.test(header[j])) dCol = j;
            }
        }
        if (dCol < 0) return [];

        var list = [];
        for (var r = start; r < rows.length; r++) {
            var row = rows[r] || [];
            var name = String(row[nameCol] || '').trim();
            var dVal = Number(row[dCol]);
            if (!name || !isFinite(dVal)) continue;
            list.push({ name: name, value: dVal });
        }
        return list.sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
    }

    fetch(encodeURI('data/top-D.xlsx'))
        .then(function (res) {
            if (!res.ok) throw new Error('加载失败：' + res.status);
            return res.arrayBuffer();
        })
        .then(function (buf) {
            var top10 = parseTopDXlsx(buf);
            if (!top10.length) return renderBar([], []);
            renderBar(
                top10.map(function (d) { return d.name; }),
                top10.map(function (d) { return Number(d.value.toFixed(4)); })
            );
        })
        .catch(function (e) {
            console && console.warn && console.warn('top-D.xlsx 加载失败', e);
            renderBar([], []);
        });

    window.addEventListener("resize", function () {
        myChart.resize();
    });
}

function huaxing(){
    var myChart = echarts.init(document.getElementById('huaxing'));

    function renderBar(names, values) {
        var maxVal = values.length ? Math.max.apply(null, values) : 0;
        var minVal = values.length ? Math.min.apply(null, values) : 0;
        var span = maxVal - minVal;
        var pad = span > 1e-12 ? Math.max(span * 0.2, 1e-4) : 0.02;
        var xMin = values.length ? minVal - pad : 0;
        var xMax = values.length ? maxVal + pad * 0.35 : 1;
        var bg = values.map(function () { return xMax; });
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
                name: 'OTE均值',
                type: 'bar',
                zlevel: 1,
	            itemStyle: {
	                normal: {
                        barBorderRadius: 30,
                        color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                            { offset: 0, color: 'rgb(97,63,209,1)' },
                            { offset: 1, color: 'rgb(33,212,168,1)' }
                        ])
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

    function parseOTEXlsx(buffer) {
        if (!window.XLSX) throw new Error('XLSX 未加载');
        var wb = window.XLSX.read(buffer, { type: 'array' });
        var sheetName = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : null;
        if (!sheetName) return [];
        var sheet = wb.Sheets[sheetName];
        var rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        if (!rows || rows.length < 2) return [];

        var header = (rows[0] || []).map(function (x) { return String(x || '').trim(); });
        var hasHeader = header.some(function (h) { return /OTE|均值|省|地区|name|名称/i.test(h); });
        var start = hasHeader ? 1 : 0;

        var nameCol = 0;
        var oteCol = (header.length > 0 ? header.length - 1 : -1);
        if (hasHeader) {
            for (var i = 0; i < header.length; i++) {
                if (/name|名称|地区|省/i.test(header[i])) { nameCol = i; break; }
            }
            for (var j = 0; j < header.length; j++) {
                if (/ote均值|OTE均值|ote均值值|OTE|均值/i.test(header[j])) { oteCol = j; break; }
            }
        }
        if (oteCol < 0) return [];

        var list = [];
        for (var r = start; r < rows.length; r++) {
            var row = rows[r] || [];
            var name = String(row[nameCol] || '').trim();
            var val = Number(row[oteCol]);
            if (!name || !isFinite(val)) continue;
            list.push({ name: name, value: val });
        }
        return list.sort(function (a, b) { return b.value - a.value; }).slice(0, 10);
    }

    fetch(encodeURI('data/OTE排名.xlsx'))
        .then(function (res) {
            if (!res.ok) throw new Error('加载失败：' + res.status);
            return res.arrayBuffer();
        })
        .then(function (buf) {
            var top10 = parseOTEXlsx(buf);
            if (!top10.length) return renderBar([], []);
            renderBar(
                top10.map(function (d) { return d.name; }),
                top10.map(function (d) { return Number(d.value.toFixed(4)); })
            );
        })
        .catch(function (e) {
            console && console.warn && console.warn('OTE排名.xlsx 加载失败', e);
            renderBar([], []);
        });

    window.addEventListener("resize", function () {
        myChart.resize();
    });
}


function zhexian() {
	var myChart = echarts.init(document.getElementById('zhexian'));

    function extractYear(cell) {
        if (cell == null) return '';
        if (typeof cell === 'number') {
            if (cell >= 1900 && cell <= 2200) return String(Math.round(cell));
            if (window.XLSX && window.XLSX.SSF && cell > 20000 && cell < 90000) {
                var d = window.XLSX.SSF.parse_date_code(cell);
                if (d && d.y) return String(d.y);
            }
        }
        var s = String(cell).trim();
        var m = s.match(/(19|20)\d{2}/);
        return m ? m[0] : '';
    }

    function findCol(header, re) {
        for (var i = 0; i < header.length; i++) {
            if (re.test(String(header[i] || '').trim())) return i;
        }
        return -1;
    }

    function mean(arr) {
        var a = arr.filter(function (x) { return isFinite(x); });
        if (!a.length) return null;
        var s = 0;
        for (var i = 0; i < a.length; i++) s += a[i];
        return s / a.length;
    }

    /** 四列：省份年份、儿童管理率、老年健康覆盖指数、区域 —— 按「区域+年份」聚合成各区域均值 */
    function parseTwoXlsx(buffer) {
        if (!window.XLSX) throw new Error('XLSX 未加载');
        var wb = window.XLSX.read(buffer, { type: 'array' });
        var sheetName = wb.SheetNames && wb.SheetNames.length ? wb.SheetNames[0] : null;
        if (!sheetName) return null;
        var sheet = wb.Sheets[sheetName];
        var rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
        if (!rows || rows.length < 2) return null;

        var header = (rows[0] || []).map(function (x) { return String(x || '').trim(); });
        var hasHeader = header.some(function (h) { return /省|年|儿童|老年|区域/i.test(h); });
        var start = hasHeader ? 1 : 0;

        var colPy = findCol(header, /省份年份|省.*年|省份.*年/i);
        var colYearOnly = findCol(header, /^年份$|年度|year/i);
        var colChild = findCol(header, /儿童管理率|儿童/i);
        var colElder = findCol(header, /老年健康覆盖|老年.*覆盖|覆盖指数/i);
        var colRegion = findCol(header, /^区域$|区域/);

        if (colPy < 0) colPy = 0;
        if (colChild < 0) colChild = 1;
        if (colElder < 0) colElder = 2;
        if (colRegion < 0) colRegion = 3;

        var agg = {};
        for (var r = start; r < rows.length; r++) {
            var row = rows[r] || [];
            var region = String(row[colRegion] || '').trim();
            var year = colYearOnly >= 0 ? extractYear(row[colYearOnly]) : extractYear(row[colPy]);
            var c = Number(row[colChild]);
            var e = Number(row[colElder]);
            if (!region || !year) continue;
            var key = region + '\t' + year;
            if (!agg[key]) agg[key] = { region: region, year: year, child: [], elder: [] };
            if (isFinite(c)) agg[key].child.push(c);
            if (isFinite(e)) agg[key].elder.push(e);
        }

        var keys = Object.keys(agg);
        if (!keys.length) return null;

        var yearSet = {};
        var regionSet = {};
        keys.forEach(function (k) {
            var o = agg[k];
            yearSet[o.year] = true;
            regionSet[o.region] = true;
        });
        var years = Object.keys(yearSet).sort(function (a, b) { return Number(a) - Number(b); });
        var regions = Object.keys(regionSet).sort();

        function buildSeriesField(field) {
            var out = {};
            regions.forEach(function (reg) {
                out[reg] = years.map(function (y) {
                    var k = reg + '\t' + y;
                    var o = agg[k];
                    if (!o) return null;
                    var m = mean(o[field]);
                    return m != null ? Number(m.toFixed(4)) : null;
                });
            });
            return out;
        }

        return {
            years: years,
            regions: regions,
            childByRegion: buildSeriesField('child'),
            elderByRegion: buildSeriesField('elder')
        };
    }

    function renderEmpty() {
        myChart.setOption({ series: [], xAxis: [], yAxis: [], grid: [], title: [] }, true);
    }

    var palette = ['#f0c725', '#16f892', '#0BE3FF', '#eb5757', '#9b59b6', '#3498db', '#e67e22', '#1abc9c'];

    fetch(encodeURI('data/two.xlsx'))
        .then(function (res) {
            if (!res.ok) throw new Error('加载失败：' + res.status);
            return res.arrayBuffer();
        })
        .then(function (buf) {
            var parsed = parseTwoXlsx(buf);
            if (!parsed || !parsed.years.length || !parsed.regions.length) return renderEmpty();

            var series = [];
            parsed.regions.forEach(function (reg, idx) {
                var color = palette[idx % palette.length];
                series.push({
                    name: reg,
                    type: 'line',
                    smooth: true,
                    symbolSize: 6,
                    xAxisIndex: 0,
                    yAxisIndex: 0,
                    data: parsed.childByRegion[reg],
                    itemStyle: { normal: { color: color } },
                    lineStyle: { normal: { width: 2 } }
                });
                series.push({
                    name: reg,
                    type: 'line',
                    smooth: true,
                    symbolSize: 6,
                    xAxisIndex: 1,
                    yAxisIndex: 1,
                    data: parsed.elderByRegion[reg],
                    itemStyle: { normal: { color: color } },
                    lineStyle: { normal: { width: 2 } }
                });
            });

            myChart.setOption({
                color: palette,
                title: [
                    {
                        text: '儿童管理率（区域均值）',
			left: 'center',
                        top: '0.5%',
                        textStyle: { color: '#cfe8ff', fontSize: 12 }
                    },
                    {
                        text: '老年健康覆盖指数（区域均值）',
                        left: 'center',
                        top: '47.5%',
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
                    data: parsed.regions
                },
                /* 双格上下拉开，避免老年图标题/轴与儿童图 X 轴年份重叠 */
                grid: [
                    { left: '10%', right: '6%', top: '15%', bottom: '58%' },
                    { left: '10%', right: '6%', top: '54%', bottom: '9%' }
                ],
                xAxis: [
                    {
                        type: 'category',
                        boundaryGap: false,
                        data: parsed.years,
                        gridIndex: 0,
                        axisLine: { lineStyle: { color: 'rgba(240,199,37,0.45)' } },
                        axisLabel: { color: '#c1cadf', fontSize: 11 }
                    },
                    {
			type: 'category',
			boundaryGap: false,
                        data: parsed.years,
                        gridIndex: 1,
                        axisLine: { lineStyle: { color: 'rgba(240,199,37,0.45)' } },
                        axisLabel: { color: '#c1cadf', fontSize: 11 }
                    }
                ],
                yAxis: [
                    {
			type: 'value',
                        name: '儿童管理率',
                        gridIndex: 0,
                        min: 80,
                        nameTextStyle: { color: '#c1cadf', fontSize: 11 },
                        axisLine: { lineStyle: { color: 'rgba(240,199,37,0.45)' } },
                        axisLabel: { color: '#c1cadf', fontSize: 11 },
                        splitLine: { lineStyle: { color: 'rgba(17,56,101,0.45)' } }
                    },
                    {
                        type: 'value',
                        name: '老年健康覆盖指数',
                        gridIndex: 1,
                        nameTextStyle: { color: '#c1cadf', fontSize: 11 },
                        axisLine: { lineStyle: { color: 'rgba(240,199,37,0.45)' } },
                        axisLabel: { color: '#c1cadf', fontSize: 11 },
                        splitLine: { lineStyle: { color: 'rgba(17,56,101,0.45)' } }
                    }
                ],
                series: series
            }, true);
        })
        .catch(function (e) {
            console && console.warn && console.warn('two.xlsx 加载失败', e);
            renderEmpty();
        });

    window.addEventListener('resize', function () {
		myChart.resize();
	});
}
