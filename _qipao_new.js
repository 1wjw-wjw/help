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
        return new echarts.graphic.RadialGradient(0.42, 0.38, 0.58, [
            { offset: 0,    color: 'hsla('+h+',92%,74%,0.85)' },
            { offset: 0.35, color: 'hsla('+h+',88%,56%,0.60)' },
            { offset: 0.75, color: 'hsla('+h+',78%,40%,0.38)' },
            { offset: 1,    color: 'hsla('+h+',70%,26%,0.22)' }
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
                    borderColor:'hsla('+h+',88%,72%,0.65)',
                    borderWidth:1,
                    shadowBlur:10,
                    shadowColor:'hsla('+h+',82%,52%,0.4)',
                    opacity:0.88
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
            grid:{ left:'14%', right:'8%', top:'10%', bottom:'32%', containLabel:false },
            legend:{
                type:'plain',
                orient:'horizontal',
                bottom:52,
                left:'center',
                itemWidth:12, itemHeight:12, itemGap:14,
                textStyle:{ color:'rgba(207,232,255,0.9)', fontSize:11 },
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
                name:'SE（规模效率）',
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
            graphic:[{
                type:'text',
                left:'center',
                bottom:28,
                style:{
                    text:'当前年份：'+year,
                    fill:'rgba(46,200,207,0.85)',
                    fontSize:11,
                    fontWeight:'bold'
                }
            }],
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

