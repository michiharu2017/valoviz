// 利用可能なマップリスト（エクスポート時に置換される）
const AVAILABLE_MAPS = ['Pearl', 'Haven', 'Breeze', 'Split', 'Corrode', 'Abyss', 'Bind'];

let userData = null;
let kdData = null;
let currentTab = 'user';

// レスポンシブなプロットサイズを計算
function getPlotSize() {
    const container = document.getElementById('plotDiv');
    const containerWidth = container.offsetWidth || window.innerWidth - 40;
    const isMobile = window.innerWidth < 768;

    return {
        width: Math.min(containerWidth, 1800),
        height: isMobile ? Math.min(containerWidth, 500) : 600,
        isMobile: isMobile
    };
}

// タブ切り替え
function switchTab(tab) {
    currentTab = tab;

    // タブボタンのアクティブ状態を更新
    document.querySelectorAll('.tab-button').forEach((btn, idx) => {
        btn.classList.toggle('active', (tab === 'user' && idx === 0) || (tab === 'kd' && idx === 1));
    });

    // コントロールの表示切り替え
    document.getElementById('userControls').classList.toggle('active', tab === 'user');
    document.getElementById('kdControls').classList.toggle('active', tab === 'kd');

    // サイド選択の「両方」オプションを制御
    const sideSelect = document.getElementById('sideSelect');
    const bothOption = sideSelect.querySelector('option[value="both"]');
    if (tab === 'kd') {
        bothOption.disabled = true;
        if (sideSelect.value === 'both') {
            sideSelect.value = 'attacker';
        }
    } else {
        bothOption.disabled = false;
    }

    // プロット更新
    const mapName = document.getElementById('mapSelect').value;
    if (mapName) {
        loadData(mapName);
    }
}

// 初期化: マップリストを作成
function initializeMapSelect() {
    const select = document.getElementById('mapSelect');
    AVAILABLE_MAPS.forEach(mapName => {
        const option = document.createElement('option');
        option.value = mapName;
        option.textContent = mapName;
        select.appendChild(option);
    });
}

// データを読み込む
async function loadData(mapName) {
    if (!mapName) {
        document.getElementById('plotDiv').innerHTML = '<p style="color: #888;">マップを選択してください。</p>';
        return;
    }

    try {
        if (currentTab === 'user') {
            const response = await fetch(`data/${mapName}_user.json`);
            userData = await response.json();
            document.getElementById('mapName').textContent = userData.map_name;
            const sliderValues = timeRangeSlider.noUiSlider.get();
            updateUserPlot(parseInt(sliderValues[0]), parseInt(sliderValues[1]));
        } else {
            const response = await fetch(`data/${mapName}_killrate.json`);
            kdData = await response.json();
            document.getElementById('mapName').textContent = kdData.map_name;
            updateKdPlot();
        }
    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('plotDiv').innerHTML = '<p style="color: red;">データの読み込みに失敗しました。<br>ローカルHTTPサーバーで実行していることを確認してください。</p>';
    }
}

// 時間範囲でデータをフィルタリング
function filterDataByTime(data, minTime, maxTime) {
    return data.filter(d => {
        const time = d.round_time / 1000;
        return time >= minTime && time <= maxTime;
    });
}

// ユーザー別プロットを更新
function updateUserPlot(minTime, maxTime) {
    if (!userData) return;

    const plotSize = getPlotSize();
    const traces = [];
    const targetUsers = userData.target_users;
    const selectedSide = document.getElementById('sideSelect').value;

    let sides = selectedSide === 'both' ? ['attacker', 'defender'] : [selectedSide];

    // モバイルでは1列、PCでは複数列
    const cols = plotSize.isMobile ? 1 : targetUsers.length;
    const rows = plotSize.isMobile ? targetUsers.length * sides.length : sides.length;

    for (let sideIdx = 0; sideIdx < sides.length; sideIdx++) {
        const side = sides[sideIdx];

        for (let userIdx = 0; userIdx < targetUsers.length; userIdx++) {
            const user = targetUsers[userIdx];
            const userKills = userData.kills[user] || [];
            const userDeaths = userData.deaths[user] || [];

            const filteredKills = filterDataByTime(
                userKills.filter(d => d.side === side), minTime, maxTime
            );
            const filteredDeaths = filterDataByTime(
                userDeaths.filter(d => d.side === side), minTime, maxTime
            );

            const axisIdx = plotSize.isMobile
                ? sideIdx * targetUsers.length + userIdx + 1
                : sideIdx * cols + userIdx + 1;

            // Kill→Victim線
            for (let i = 0; i < filteredKills.length; i++) {
                const kill = filteredKills[i];
                if (kill.victim_x_pixel != null && kill.victim_y_pixel != null) {
                    traces.push({
                        x: [kill.x_pixel, kill.victim_x_pixel],
                        y: [kill.y_pixel, kill.victim_y_pixel],
                        mode: 'lines', type: 'scatter',
                        line: { color: 'red', width: 1, dash: 'dot' },
                        opacity: 0.3, showlegend: false, hoverinfo: 'skip',
                        xaxis: `x${axisIdx}`, yaxis: `y${axisIdx}`,
                    });
                }
            }

            // Victim位置
            const victimXs = filteredKills.filter(d => d.victim_x_pixel != null).map(d => d.victim_x_pixel);
            const victimYs = filteredKills.filter(d => d.victim_y_pixel != null).map(d => d.victim_y_pixel);
            if (victimXs.length > 0) {
                traces.push({
                    x: victimXs, y: victimYs, mode: 'markers', type: 'scatter',
                    marker: { color: 'pink', size: plotSize.isMobile ? 3 : 4, opacity: 0.5, symbol: 'x' },
                    showlegend: false, hoverinfo: 'skip',
                    xaxis: `x${axisIdx}`, yaxis: `y${axisIdx}`,
                });
            }

            // Kill位置
            traces.push({
                x: filteredKills.map(d => d.x_pixel),
                y: filteredKills.map(d => d.y_pixel),
                mode: 'markers', type: 'scatter',
                marker: { color: 'red', size: plotSize.isMobile ? 5 : 7, opacity: 0.8 },
                name: `Kill (${filteredKills.length})`,
                showlegend: sideIdx === 0 && userIdx === 0,
                xaxis: `x${axisIdx}`, yaxis: `y${axisIdx}`,
            });

            // Killer→Death線
            for (let i = 0; i < filteredDeaths.length; i++) {
                const death = filteredDeaths[i];
                if (death.killer_x_pixel != null && death.killer_y_pixel != null) {
                    traces.push({
                        x: [death.killer_x_pixel, death.x_pixel],
                        y: [death.killer_y_pixel, death.y_pixel],
                        mode: 'lines', type: 'scatter',
                        line: { color: 'blue', width: 1, dash: 'dot' },
                        opacity: 0.3, showlegend: false, hoverinfo: 'skip',
                        xaxis: `x${axisIdx}`, yaxis: `y${axisIdx}`,
                    });
                }
            }

            // Killer位置
            const killerXs = filteredDeaths.filter(d => d.killer_x_pixel != null).map(d => d.killer_x_pixel);
            const killerYs = filteredDeaths.filter(d => d.killer_y_pixel != null).map(d => d.killer_y_pixel);
            if (killerXs.length > 0) {
                traces.push({
                    x: killerXs, y: killerYs, mode: 'markers', type: 'scatter',
                    marker: { color: 'lightblue', size: plotSize.isMobile ? 3 : 4, opacity: 0.5, symbol: 'x' },
                    showlegend: false, hoverinfo: 'skip',
                    xaxis: `x${axisIdx}`, yaxis: `y${axisIdx}`,
                });
            }

            // Death位置
            traces.push({
                x: filteredDeaths.map(d => d.x_pixel),
                y: filteredDeaths.map(d => d.y_pixel),
                mode: 'markers', type: 'scatter',
                marker: { color: 'blue', size: plotSize.isMobile ? 5 : 7, opacity: 0.8 },
                name: `Death (${filteredDeaths.length})`,
                showlegend: sideIdx === 0 && userIdx === 0,
                xaxis: `x${axisIdx}`, yaxis: `y${axisIdx}`,
            });
        }
    }

    const subplotHeight = plotSize.isMobile ? 300 : plotSize.height;
    const totalHeight = plotSize.isMobile ? rows * subplotHeight : (rows === 1 ? subplotHeight : subplotHeight * 2);

    const layout = {
        title: '',
        grid: { rows: rows, columns: cols, pattern: 'independent', roworder: 'top to bottom' },
        showlegend: !plotSize.isMobile,
        width: plotSize.width,
        height: totalHeight,
        plot_bgcolor: '#2a2a2a',
        paper_bgcolor: '#1a1a1a',
        font: { color: '#ffffff', size: plotSize.isMobile ? 10 : 12 },
        margin: { l: 40, r: 20, t: 40, b: 40 },
        images: [],
        annotations: []
    };

    // サブプロットタイトル
    for (let sideIdx = 0; sideIdx < sides.length; sideIdx++) {
        const sideLabel = sides[sideIdx] === 'attacker' ? '攻め' : '守り';
        for (let userIdx = 0; userIdx < targetUsers.length; userIdx++) {
            const idx = plotSize.isMobile
                ? sideIdx * targetUsers.length + userIdx + 1
                : sideIdx * cols + userIdx + 1;
            layout.annotations.push({
                text: `${targetUsers[userIdx]} (${sideLabel})`,
                xref: idx === 1 ? 'x domain' : `x${idx} domain`,
                yref: idx === 1 ? 'y domain' : `y${idx} domain`,
                x: 0.5, y: 1.02, xanchor: 'center', yanchor: 'bottom',
                showarrow: false, font: { size: plotSize.isMobile ? 10 : 12, color: '#ffffff' }
            });
        }
    }

    // マップ画像
    if (userData.map_image_url) {
        for (let sideIdx = 0; sideIdx < sides.length; sideIdx++) {
            for (let userIdx = 0; userIdx < targetUsers.length; userIdx++) {
                const idx = plotSize.isMobile
                    ? sideIdx * targetUsers.length + userIdx + 1
                    : sideIdx * cols + userIdx + 1;
                layout.images.push({
                    source: userData.map_image_url,
                    xref: idx === 1 ? 'x' : `x${idx}`,
                    yref: idx === 1 ? 'y' : `y${idx}`,
                    x: 0, y: 0,
                    sizex: userData.image_width,
                    sizey: userData.image_height,
                    sizing: 'stretch', opacity: 0.5, layer: 'below'
                });
            }
        }
    }

    // 軸設定
    const imageWidth = userData.image_width || 512;
    const imageHeight = userData.image_height || 512;
    for (let sideIdx = 0; sideIdx < sides.length; sideIdx++) {
        for (let userIdx = 0; userIdx < targetUsers.length; userIdx++) {
            const idx = plotSize.isMobile
                ? sideIdx * targetUsers.length + userIdx + 1
                : sideIdx * cols + userIdx + 1;
            const axisName = idx === 1 ? '' : idx;
            layout[`xaxis${axisName}`] = {
                title: '',
                range: [0, imageWidth], showgrid: true, gridcolor: '#444',
                showticklabels: false
            };
            layout[`yaxis${axisName}`] = {
                title: '',
                range: [imageHeight, 0], showgrid: true, gridcolor: '#444',
                scaleanchor: `x${axisName}`, scaleratio: 1,
                showticklabels: false
            };
        }
    }

    Plotly.newPlot('plotDiv', traces, layout, {responsive: true, displayModeBar: !plotSize.isMobile});
}

// Kill Rateヒートマッププロットを更新
function updateKdPlot() {
    if (!kdData) return;

    const plotSize = getPlotSize();
    const selectedSide = document.getElementById('sideSelect').value === 'both'
        ? 'attacker'
        : document.getElementById('sideSelect').value;
    const sideData = kdData.sides[selectedSide];

    if (!sideData) return;

    const sideLabel = selectedSide === 'attacker' ? '攻め側' : '守り側';

    // ヒートマップトレース（透過付き）
    const trace = {
        z: sideData.kill_rate,
        x: sideData.x_bin_centers,
        y: sideData.y_bin_centers,
        type: 'heatmap',
        colorscale: [
            [0, 'rgba(0, 0, 255, 0.7)'],
            [0.5, 'rgba(128, 128, 128, 0.5)'],
            [1, 'rgba(255, 0, 0, 0.7)']
        ],
        zmin: 0,
        zmax: 1,
        colorbar: {
            title: plotSize.isMobile ? '' : 'Kill Rate',
            len: 0.8,
            thickness: plotSize.isMobile ? 15 : 20,
        },
        hovertemplate: 'Kill Rate: %{z:.2f}<extra></extra>',
        showscale: true,
    };

    const size = Math.min(plotSize.width, plotSize.isMobile ? 400 : 800);

    const layout = {
        title: {
            text: `${kdData.map_name} (${sideLabel})`,
            font: { size: plotSize.isMobile ? 14 : 18 }
        },
        width: size,
        height: size,
        xaxis: {
            title: '',
            range: [0, kdData.image_width],
            scaleanchor: 'y',
            scaleratio: 1,
            showticklabels: false,
        },
        yaxis: {
            title: '',
            range: [kdData.image_height, 0],
            showticklabels: false,
        },
        plot_bgcolor: '#2a2a2a',
        paper_bgcolor: '#1a1a1a',
        font: { color: '#ffffff' },
        margin: { l: 20, r: 60, t: 50, b: 20 },
        images: []
    };

    // マップ画像を背景として追加
    if (kdData.map_image_url) {
        layout.images.push({
            source: kdData.map_image_url,
            xref: 'x',
            yref: 'y',
            x: 0,
            y: 0,
            sizex: kdData.image_width,
            sizey: kdData.image_height,
            sizing: 'stretch',
            opacity: 0.5,
            layer: 'below'
        });
    }

    Plotly.newPlot('plotDiv', [trace], layout, {responsive: true, displayModeBar: !plotSize.isMobile});
}

// レンジスライダーの初期化
const timeRangeSlider = document.getElementById('timeRangeSlider');
noUiSlider.create(timeRangeSlider, {
    start: [0, 145],
    connect: true,
    step: 5,
    range: { 'min': 0, 'max': 145 },
    tooltips: [
        {to: value => `${Math.round(value)}秒`},
        {to: value => `${Math.round(value)}秒`}
    ],
    format: {
        to: value => Math.round(value),
        from: value => Number(value)
    }
});

// スライダー変更イベント
timeRangeSlider.noUiSlider.on('update', function(values) {
    const minTime = parseInt(values[0]);
    const maxTime = parseInt(values[1]);
    document.getElementById('timeRange').textContent = `${minTime}-${maxTime}秒`;
    if (userData && currentTab === 'user') {
        updateUserPlot(minTime, maxTime);
    }
});

// マップ選択イベント
document.getElementById('mapSelect').addEventListener('change', function(e) {
    loadData(e.target.value);
});

// 攻守選択イベント
document.getElementById('sideSelect').addEventListener('change', function() {
    const mapName = document.getElementById('mapSelect').value;
    if (mapName) {
        if (currentTab === 'user') {
            const sliderValues = timeRangeSlider.noUiSlider.get();
            updateUserPlot(parseInt(sliderValues[0]), parseInt(sliderValues[1]));
        } else {
            updateKdPlot();
        }
    }
});

// ウィンドウリサイズ時にプロットを更新
let resizeTimeout;
window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
        const mapName = document.getElementById('mapSelect').value;
        if (mapName) {
            if (currentTab === 'user' && userData) {
                const sliderValues = timeRangeSlider.noUiSlider.get();
                updateUserPlot(parseInt(sliderValues[0]), parseInt(sliderValues[1]));
            } else if (currentTab === 'kd' && kdData) {
                updateKdPlot();
            }
        }
    }, 250);
});

// 初期化
initializeMapSelect();
document.getElementById('plotDiv').innerHTML = '<p style="color: #888;">マップを選択してください。</p>';
