// 利用可能なマップリスト（エクスポート時に置換される）
const AVAILABLE_MAPS = ['Abyss', 'Bind', 'Breeze', 'Corrode', 'Haven', 'Pearl', 'Split'];

let userData = null;
let kdData = null;
let positionData = null;
let userKdData = null;
let statsData = null;
let currentTab = 'stats';

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
    const tabNames = ['user', 'kd', 'position', 'userkd', 'stats'];
    document.querySelectorAll('.tab-button').forEach((btn, idx) => {
        btn.classList.toggle('active', tab === tabNames[idx]);
    });

    // コントロールの表示切り替え
    document.getElementById('userControls').classList.toggle('active', tab === 'user');
    document.getElementById('kdControls').classList.toggle('active', tab === 'kd');
    document.getElementById('positionControls').classList.toggle('active', tab === 'position');
    document.getElementById('userkdControls').classList.toggle('active', tab === 'userkd');
    document.getElementById('statsControls').classList.toggle('active', tab === 'stats');

    // ユーザー選択の表示切り替え
    document.getElementById('userSelectContainer').style.display =
        (tab === 'user' || tab === 'userkd') ? '' : 'none';

    // 勝率タブではマップ・攻守プルダウンを非表示
    const hideMapAndSide = tab === 'stats';
    document.getElementById('sideSelectContainer').style.display =
        (tab === 'position' || hideMapAndSide) ? 'none' : '';
    document.getElementById('mapSelectContainer').style.display =
        hideMapAndSide ? 'none' : '';

    // プロット更新
    if (tab === 'stats') {
        loadStats();
        return;
    }
    const mapName = document.getElementById('mapSelect').value;
    if (mapName) {
        loadData(mapName);
    }
}

// ユーザーセレクトを更新
function updateUserSelect(users) {
    const select = document.getElementById('userSelect');
    const currentValue = select.value;
    select.innerHTML = '';
    users.forEach(user => {
        const option = document.createElement('option');
        option.value = user;
        option.textContent = user;
        select.appendChild(option);
    });
    // 以前の選択を維持、なければ最初のユーザー
    if (currentValue && users.includes(currentValue)) {
        select.value = currentValue;
    } else {
        select.value = users[0];
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
            updateUserSelect(userData.target_users);
            document.getElementById('userSelectContainer').style.display = '';
            const sliderValues = timeRangeSlider.noUiSlider.get();
            updateUserPlot(parseInt(sliderValues[0]), parseInt(sliderValues[1]));
        } else if (currentTab === 'kd') {
            const response = await fetch(`data/${mapName}_killrate.json`);
            kdData = await response.json();
            document.getElementById('mapName').textContent = kdData.map_name;
            updateKdPlot();
        } else if (currentTab === 'position') {
            const response = await fetch(`data/${mapName}_position.json`);
            positionData = await response.json();
            document.getElementById('mapName').textContent = positionData.map_name;
            updatePositionPlot();
        } else if (currentTab === 'userkd') {
            const response = await fetch(`data/${mapName}_userkd.json`);
            userKdData = await response.json();
            document.getElementById('mapName').textContent = userKdData.map_name;
            updateUserSelect(userKdData.target_users);
            updateUserKdPlot();
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

    const selectedUser = document.getElementById('userSelect').value;
    if (!selectedUser) return;

    const plotSize = getPlotSize();
    const traces = [];
    const user = selectedUser;
    const selectedSide = document.getElementById('sideSelect').value;

    const userKills = userData.kills[user] || [];
    const userDeaths = userData.deaths[user] || [];

    const filteredKills = filterDataByTime(
        userKills.filter(d => d.side === selectedSide), minTime, maxTime
    );
    const filteredDeaths = filterDataByTime(
        userDeaths.filter(d => d.side === selectedSide), minTime, maxTime
    );

    const sideLabel = selectedSide === 'attacker' ? '攻め側' : '守り側';

    // Kill→Victim背景線 (1トレースにまとめる)
    const killLineX = [], killLineY = [];
    filteredKills.forEach(k => {
        if (k.victim_x_pixel != null && k.victim_y_pixel != null) {
            killLineX.push(k.x_pixel, k.victim_x_pixel, null);
            killLineY.push(k.y_pixel, k.victim_y_pixel, null);
        }
    });
    if (killLineX.length > 0) {
        traces.push({
            x: killLineX, y: killLineY,
            mode: 'lines', type: 'scatter',
            line: { color: 'rgba(255,80,80,0.2)', width: 1, dash: 'dot' },
            showlegend: false, hoverinfo: 'skip',
        });
    }

    // Kill位置 (customdata付き)
    traces.push({
        x: filteredKills.map(d => d.x_pixel),
        y: filteredKills.map(d => d.y_pixel),
        customdata: filteredKills.map(d => ({
            type: 'kill',
            vx: d.victim_x_pixel, vy: d.victim_y_pixel,
            target: d.victim_id, round: d.round,
            time: Math.round(d.round_time / 1000),
        })),
        mode: 'markers', type: 'scatter',
        marker: { color: 'red', size: 7, opacity: 0.7 },
        name: `Kill (${filteredKills.length})`,
    });

    // Killer→Death背景線 (1トレースにまとめる)
    const deathLineX = [], deathLineY = [];
    filteredDeaths.forEach(d => {
        if (d.killer_x_pixel != null && d.killer_y_pixel != null) {
            deathLineX.push(d.killer_x_pixel, d.x_pixel, null);
            deathLineY.push(d.killer_y_pixel, d.y_pixel, null);
        }
    });
    if (deathLineX.length > 0) {
        traces.push({
            x: deathLineX, y: deathLineY,
            mode: 'lines', type: 'scatter',
            line: { color: 'rgba(80,80,255,0.2)', width: 1, dash: 'dot' },
            showlegend: false, hoverinfo: 'skip',
        });
    }

    // Death位置 (customdata付き)
    traces.push({
        x: filteredDeaths.map(d => d.x_pixel),
        y: filteredDeaths.map(d => d.y_pixel),
        customdata: filteredDeaths.map(d => ({
            type: 'death',
            kx: d.killer_x_pixel, ky: d.killer_y_pixel,
            target: d.user_id, round: d.round,
            time: Math.round(d.round_time / 1000),
        })),
        mode: 'markers', type: 'scatter',
        marker: { color: 'blue', size: 7, opacity: 0.7 },
        name: `Death (${filteredDeaths.length})`,
    });

    const size = Math.min(plotSize.width, 600);
    const hlR = Math.round(size * 0.015); // ハイライト円の半径

    const layout = {
        title: {
            text: `${user} (${sideLabel})`,
            font: { size: 16 }
        },
        showlegend: true,
        legend: { x: 0, y: -0.1, orientation: 'h' },
        width: size,
        height: size,
        plot_bgcolor: '#2a2a2a',
        paper_bgcolor: '#1a1a1a',
        font: { color: '#ffffff' },
        margin: { l: 20, r: 20, t: 50, b: 50 },
        xaxis: {
            range: [0, userData.image_width], showgrid: true, gridcolor: '#444',
            showticklabels: false, scaleanchor: 'y', scaleratio: 1,
        },
        yaxis: {
            range: [userData.image_height, 0], showgrid: true, gridcolor: '#444',
            showticklabels: false,
        },
        images: [],
        shapes: [],
        annotations: [],
    };

    // マップ画像
    if (userData.map_image_url) {
        layout.images.push({
            source: userData.map_image_url,
            xref: 'x', yref: 'y',
            x: 0, y: 0,
            sizex: userData.image_width,
            sizey: userData.image_height,
            sizing: 'stretch', opacity: 0.5, layer: 'below'
        });
    }

    Plotly.newPlot('plotDiv', traces, layout, {responsive: true, displayModeBar: false});

    // ホバーでハイライト
    const plotEl = document.getElementById('plotDiv');
    let hoverTimer = null;
    plotEl.on('plotly_hover', function(data) {
        clearTimeout(hoverTimer);
        const pt = data.points[0];
        const cd = pt.customdata;
        if (!cd || !cd.type) return;

        const shapes = [];
        const annotations = [];
        let pairX, pairY, lineColor, fillColor, pairFill, label;

        if (cd.type === 'kill' && cd.vx != null && cd.vy != null) {
            pairX = cd.vx; pairY = cd.vy;
            lineColor = 'rgba(255,100,100,0.9)';
            fillColor = 'rgba(255,0,0,0.4)';
            pairFill = 'rgba(255,150,150,0.4)';
            label = `Kill → ${cd.target} R${cd.round} ${cd.time}s`;
        } else if (cd.type === 'death' && cd.kx != null && cd.ky != null) {
            pairX = cd.kx; pairY = cd.ky;
            lineColor = 'rgba(100,100,255,0.9)';
            fillColor = 'rgba(0,0,255,0.4)';
            pairFill = 'rgba(150,150,255,0.4)';
            label = `Death ← ${cd.target} R${cd.round} ${cd.time}s`;
        } else {
            return;
        }

        // 破線
        shapes.push({
            type: 'line', xref: 'x', yref: 'y',
            x0: pt.x, y0: pt.y, x1: pairX, y1: pairY,
            line: { color: lineColor, width: 2.5, dash: 'dash' },
        });
        // ホバー位置のハイライト円
        shapes.push({
            type: 'circle', xref: 'x', yref: 'y',
            x0: pt.x - hlR, y0: pt.y - hlR, x1: pt.x + hlR, y1: pt.y + hlR,
            line: { color: '#fff', width: 2 }, fillcolor: fillColor,
        });
        // 対応位置のハイライト円
        shapes.push({
            type: 'circle', xref: 'x', yref: 'y',
            x0: pairX - hlR, y0: pairY - hlR, x1: pairX + hlR, y1: pairY + hlR,
            line: { color: '#fff', width: 2 }, fillcolor: pairFill,
        });
        // ラベル
        annotations.push({
            x: pt.x, y: pt.y, xref: 'x', yref: 'y',
            text: label, showarrow: true, arrowhead: 0,
            ax: 0, ay: -30,
            font: { color: '#fff', size: 11 },
            bgcolor: 'rgba(0,0,0,0.75)', bordercolor: lineColor,
            borderwidth: 1, borderpad: 4,
        });

        Plotly.relayout('plotDiv', { shapes, annotations });
    });

    // ホバー解除で消す（少し遅延を入れてチラつき防止）
    plotEl.on('plotly_unhover', function() {
        hoverTimer = setTimeout(function() {
            Plotly.relayout('plotDiv', { shapes: [], annotations: [] });
        }, 150);
    });
}

// Kill Rateヒートマッププロットを更新
function updateKdPlot() {
    if (!kdData) return;

    const plotSize = getPlotSize();
    const selectedSide = document.getElementById('sideSelect').value;
    const timeKey = document.getElementById('kdTimeSelect').value;
    const sideData = kdData.sides[selectedSide]?.[timeKey];

    if (!sideData) return;

    const sideLabel = selectedSide === 'attacker' ? '攻め側' : '守り側';
    const timeLabel = timeKey === 'early' ? '前半' : (timeKey === 'late' ? '後半' : '');

    // kill/deathカウントをcustomdataに格納
    const customdata = sideData.kill_grid.map((row, i) =>
        row.map((k, j) => [k, sideData.death_grid[i][j]])
    );

    // ヒートマップトレース（透過付き）
    const trace = {
        z: sideData.kill_rate,
        x: sideData.x_bin_centers,
        y: sideData.y_bin_centers,
        customdata: customdata,
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
        hovertemplate: 'Kill Rate: %{z:.2f}<br>Kill: %{customdata[0]}, Death: %{customdata[1]}<extra></extra>',
        showscale: true,
    };

    const size = Math.min(plotSize.width, plotSize.isMobile ? 400 : 800);

    const layout = {
        title: {
            text: `${kdData.map_name} (${sideLabel}${timeLabel ? ', ' + timeLabel : ''})`,
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

// ポジションタブ用: ラウンド結果と表示対象からデータキーを生成
function getPositionFilterKeys(roundOutcome, displayTarget) {
    // JSONキー: attacker_won, attacker_lost, defender_won, defender_lost
    if (roundOutcome === 'attacker_won') {
        return [`${displayTarget}_won`];
    } else if (roundOutcome === 'attacker_lost') {
        return [`${displayTarget}_lost`];
    }
    // all: 両方のラウンド結果を合算
    return [`${displayTarget}_won`, `${displayTarget}_lost`];
}

// 指定キーのカウントとkillイベント数を合算
function getPositionCount(filters, keys) {
    const firstKey = Object.keys(filters)[0];
    const gridSize = filters[firstKey].count.length;
    const count = Array(gridSize).fill(null).map(() => Array(gridSize).fill(0));
    let totalKillEvents = 0;

    for (const key of keys) {
        if (filters[key]) {
            totalKillEvents += filters[key].total_kill_events;
            for (let i = 0; i < gridSize; i++) {
                for (let j = 0; j < gridSize; j++) {
                    count[i][j] += filters[key].count[i][j] || 0;
                }
            }
        }
    }
    return { count, totalKillEvents };
}

// ポジションヒートマッププロットを更新
function updatePositionPlot() {
    if (!positionData) return;

    const plotSize = getPlotSize();
    const roundOutcome = document.getElementById('roundResultSelect').value;
    const displayTarget = document.getElementById('displayTargetSelect').value;

    const outcomeLabel = roundOutcome === 'attacker_won' ? '攻め側勝ち' : (roundOutcome === 'attacker_lost' ? '攻め側負け' : '全ラウンド');

    const firstKey = Object.keys(positionData.filters)[0];
    const xBinCenters = positionData.filters[firstKey].x_bin_centers;
    const yBinCenters = positionData.filters[firstKey].y_bin_centers;
    const gridSize = xBinCenters.length;

    const size = Math.min(plotSize.width, plotSize.isMobile ? 400 : 800);

    const keys = getPositionFilterKeys(roundOutcome, displayTarget);
    const data = getPositionCount(positionData.filters, keys);
    const totalKillEvents = data.totalKillEvents;

    const probability = data.count.map(row =>
        row.map(v => totalKillEvents > 0 ? v / totalKillEvents : 0)
    );

    const targetLabel = displayTarget === 'attacker' ? '攻め側' : '守り側';
    const colorscale = displayTarget === 'attacker' ? [
        [0, 'rgba(0, 50, 50, 0.1)'],
        [0.3, 'rgba(0, 150, 150, 0.4)'],
        [0.6, 'rgba(0, 220, 220, 0.6)'],
        [1, 'rgba(0, 255, 255, 0.9)']
    ] : [
        [0, 'rgba(50, 50, 0, 0.1)'],
        [0.3, 'rgba(150, 150, 0, 0.4)'],
        [0.6, 'rgba(220, 220, 0, 0.6)'],
        [1, 'rgba(255, 255, 0, 0.9)']
    ];

    const traces = [{
        z: probability,
        x: xBinCenters,
        y: yBinCenters,
        type: 'heatmap',
        colorscale: colorscale,
        zmin: 0,
        colorbar: {
            title: plotSize.isMobile ? '' : '確率',
            len: 0.8,
            thickness: plotSize.isMobile ? 15 : 20,
            tickformat: '.0%',
        },
        hovertemplate: '%{z:.1%}<extra></extra>',
        showscale: true,
    }];

    const titleText = `${positionData.map_name} (${outcomeLabel}, ${targetLabel}) - kill${totalKillEvents}件`;

    const layout = {
        title: {
            text: titleText,
            font: { size: plotSize.isMobile ? 14 : 18 }
        },
        width: size,
        height: size,
        xaxis: {
            title: '',
            range: [0, positionData.image_width],
            scaleanchor: 'y',
            scaleratio: 1,
            showticklabels: false,
        },
        yaxis: {
            title: '',
            range: [positionData.image_height, 0],
            showticklabels: false,
        },
        plot_bgcolor: '#2a2a2a',
        paper_bgcolor: '#1a1a1a',
        font: { color: '#ffffff' },
        margin: { l: 20, r: 60, t: 50, b: 20 },
        images: [],
    };

    if (positionData.map_image_url) {
        layout.images.push({
            source: positionData.map_image_url,
            xref: 'x', yref: 'y',
            x: 0, y: 0,
            sizex: positionData.image_width,
            sizey: positionData.image_height,
            sizing: 'stretch', opacity: 0.5, layer: 'below'
        });
    }

    Plotly.newPlot('plotDiv', traces, layout, {responsive: true, displayModeBar: !plotSize.isMobile});
}

// ユーザー別Kill Rate差分プロットを更新
function updateUserKdPlot() {
    if (!userKdData) return;

    const selectedUser = document.getElementById('userSelect').value;
    if (!selectedUser) return;

    const plotSize = getPlotSize();
    const selectedSide = document.getElementById('sideSelect').value;
    const timeKey = document.getElementById('userkdTimeSelect').value;
    const sideData = userKdData.sides[selectedSide]?.[timeKey];

    if (!sideData) return;

    const userData_kd = sideData.users[selectedUser];
    if (!userData_kd) return;

    const sideLabel = selectedSide === 'attacker' ? '攻め側' : '守り側';
    const timeLabel = timeKey === 'early' ? '前半' : (timeKey === 'late' ? '後半' : '');

    // hover用customdata: [user_kill_rate, overall_kill_rate, user_kill, user_death]
    const customdata = userData_kd.diff.map((row, i) =>
        row.map((d, j) => [
            userData_kd.kill_rate[i][j],
            sideData.overall_kill_rate[i][j],
            userData_kd.kill_grid[i][j],
            userData_kd.death_grid[i][j],
        ])
    );

    const trace = {
        z: userData_kd.diff,
        x: sideData.x_bin_centers,
        y: sideData.y_bin_centers,
        customdata: customdata,
        type: 'heatmap',
        colorscale: [
            [0, 'rgba(0, 0, 255, 0.7)'],
            [0.5, 'rgba(128, 128, 128, 0.3)'],
            [1, 'rgba(255, 0, 0, 0.7)']
        ],
        zmin: -0.5,
        zmax: 0.5,
        colorbar: {
            title: plotSize.isMobile ? '' : '差分',
            len: 0.8,
            thickness: plotSize.isMobile ? 15 : 20,
        },
        hovertemplate: '差分: %{z:+.2f}<br>本人: %{customdata[0]:.2f} (K:%{customdata[2]} D:%{customdata[3]})<br>全体: %{customdata[1]:.2f}<extra></extra>',
        showscale: true,
    };

    const size = Math.min(plotSize.width, plotSize.isMobile ? 400 : 800);

    const layout = {
        title: {
            text: `${userKdData.map_name} ${selectedUser} vs 全体 (${sideLabel}${timeLabel ? ', ' + timeLabel : ''})`,
            font: { size: plotSize.isMobile ? 14 : 18 }
        },
        width: size,
        height: size,
        xaxis: {
            title: '',
            range: [0, userKdData.image_width],
            scaleanchor: 'y',
            scaleratio: 1,
            showticklabels: false,
        },
        yaxis: {
            title: '',
            range: [userKdData.image_height, 0],
            showticklabels: false,
        },
        plot_bgcolor: '#2a2a2a',
        paper_bgcolor: '#1a1a1a',
        font: { color: '#ffffff' },
        margin: { l: 20, r: 60, t: 50, b: 20 },
        images: []
    };

    if (userKdData.map_image_url) {
        layout.images.push({
            source: userKdData.map_image_url,
            xref: 'x', yref: 'y',
            x: 0, y: 0,
            sizex: userKdData.image_width,
            sizey: userKdData.image_height,
            sizing: 'stretch', opacity: 0.5, layer: 'below'
        });
    }

    Plotly.newPlot('plotDiv', [trace], layout, {responsive: true, displayModeBar: !plotSize.isMobile});
}

// 勝率データを読み込む
async function loadStats() {
    try {
        const response = await fetch('data/stats.json');
        statsData = await response.json();
        document.getElementById('mapName').textContent = '勝率';
        updateStatsTable();
    } catch (error) {
        console.error('Error loading stats:', error);
        document.getElementById('plotDiv').innerHTML = '<p style="color: red;">勝率データの読み込みに失敗しました。</p>';
    }
}

// 勝率ソート状態
let statsSortKey = null;    // ソートキー: "user|side" (e.g. "kok|overall")
let statsSortAsc = false;

// 勝率テーブルを描画
function updateStatsTable() {
    if (!statsData) return;

    const users = Object.keys(statsData.users);
    const sides = [
        { key: 'attacker', label: '攻め' },
        { key: 'defender', label: '守り' },
    ];
    let maps = [...statsData.maps];

    // ソート
    if (statsSortKey) {
        const [sortUser, sortSide] = statsSortKey.split('|');
        maps.sort((a, b) => {
            const aData = statsData.users[sortUser]?.[a]?.[sortSide];
            const bData = statsData.users[sortUser]?.[b]?.[sortSide];
            const aRate = aData && aData.total > 0 ? aData.won / aData.total : -1;
            const bRate = bData && bData.total > 0 ? bData.won / bData.total : -1;
            return statsSortAsc ? aRate - bRate : bRate - aRate;
        });
    }

    // ユーザーごとに攻め・守りまとめてTop2/Bottom2を算出
    const highlights = {}; // key: "user|side|map" → 'top' or 'bottom'
    users.forEach(u => {
        const rates = [];
        sides.forEach(side => {
            maps.forEach(map => {
                const s = statsData.users[u]?.[map]?.[side.key];
                if (s && s.total > 0) rates.push({ map, side: side.key, rate: s.won / s.total });
            });
        });
        if (rates.length < 5) return;
        const sorted = [...rates].sort((a, b) => b.rate - a.rate);
        sorted.slice(0, 2).forEach(r => { highlights[`${u}|${r.side}|${r.map}`] = 'top'; });
        sorted.slice(-2).forEach(r => { highlights[`${u}|${r.side}|${r.map}`] = 'bottom'; });
    });

    function winRateCell(stats, highlight) {
        if (!stats || stats.total === 0) return '<td class="stats-cell">-</td>';
        const rate = stats.won / stats.total;
        const pct = (rate * 100).toFixed(0);
        // 50%から離れるほど強い色: 青(不利) → グレー(中立) → 赤(有利)
        const dev = (rate - 0.5) * 2; // -1 ~ +1
        const abs = Math.abs(dev);
        const alpha = Math.min(0.15 + abs * 0.55, 0.7);
        let bg;
        if (dev > 0) {
            const g = Math.round(60 - abs * 40);
            bg = `rgba(220, ${g}, ${g}, ${alpha})`;
        } else if (dev < 0) {
            const g = Math.round(60 - abs * 40);
            bg = `rgba(${g}, ${g}, 220, ${alpha})`;
        } else {
            bg = 'rgba(128, 128, 128, 0.15)';
        }
        const textColor = abs > 0.3 ? '#fff' : '#ccc';
        let badge = '';
        if (highlight === 'top') badge = ' <span class="stats-badge stats-badge-top">&#9650;</span>';
        else if (highlight === 'bottom') badge = ' <span class="stats-badge stats-badge-bottom">&#9660;</span>';
        return `<td class="stats-cell" style="background:${bg};color:${textColor}">${pct}%${badge}<br><span class="stats-detail">${stats.won}/${stats.total}</span></td>`;
    }

    // ヘッダー1行目: ユーザー名 (colspan=2)
    let html = '<table class="stats-table"><thead><tr><th rowspan="2">マップ</th>';
    users.forEach(u => {
        html += `<th colspan="2">${u}</th>`;
    });
    html += '</tr><tr>';
    // ヘッダー2行目: サイド
    users.forEach(u => {
        sides.forEach(side => {
            const key = `${u}|${side.key}`;
            const arrow = statsSortKey === key ? (statsSortAsc ? ' \u25b2' : ' \u25bc') : '';
            html += `<th class="stats-sortable stats-side-header" data-key="${key}">${side.label}${arrow}</th>`;
        });
    });
    html += '</tr></thead><tbody>';

    maps.forEach(map => {
        html += '<tr>';
        html += `<td class="stats-map">${map}</td>`;
        users.forEach(u => {
            const mapData = statsData.users[u]?.[map];
            sides.forEach(side => {
                const hl = highlights[`${u}|${side.key}|${map}`] || null;
                html += winRateCell(mapData?.[side.key], hl);
            });
        });
        html += '</tr>';
    });

    html += '</tbody></table>';
    document.getElementById('plotDiv').innerHTML = html;

    // ヘッダークリックでソート
    document.querySelectorAll('.stats-sortable').forEach(th => {
        th.addEventListener('click', function() {
            const key = this.dataset.key;
            if (statsSortKey === key) {
                statsSortAsc = !statsSortAsc;
            } else {
                statsSortKey = key;
                statsSortAsc = false;
            }
            updateStatsTable();
        });
    });
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
        } else if (currentTab === 'kd') {
            updateKdPlot();
        } else if (currentTab === 'position') {
            updatePositionPlot();
        } else if (currentTab === 'userkd') {
            updateUserKdPlot();
        }
    }
});

// Kill Rate時間帯選択イベント
document.getElementById('kdTimeSelect').addEventListener('change', function() {
    if (currentTab === 'kd' && kdData) {
        updateKdPlot();
    }
});

// ラウンド結果選択イベント
document.getElementById('roundResultSelect').addEventListener('change', function() {
    if (currentTab === 'position' && positionData) {
        updatePositionPlot();
    }
});

// 表示対象選択イベント
document.getElementById('displayTargetSelect').addEventListener('change', function() {
    if (currentTab === 'position' && positionData) {
        updatePositionPlot();
    }
});

// ユーザー別Kill Rate差分時間帯選択イベント
document.getElementById('userkdTimeSelect').addEventListener('change', function() {
    if (currentTab === 'userkd' && userKdData) {
        updateUserKdPlot();
    }
});

// ユーザー選択イベント
document.getElementById('userSelect').addEventListener('change', function() {
    const mapName = document.getElementById('mapSelect').value;
    if (mapName && currentTab === 'user' && userData) {
        const sliderValues = timeRangeSlider.noUiSlider.get();
        updateUserPlot(parseInt(sliderValues[0]), parseInt(sliderValues[1]));
    }
    if (mapName && currentTab === 'userkd' && userKdData) {
        updateUserKdPlot();
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
            } else if (currentTab === 'position' && positionData) {
                updatePositionPlot();
            } else if (currentTab === 'userkd' && userKdData) {
                updateUserKdPlot();
            }
        }
    }, 250);
});

// 初期化
initializeMapSelect();
if (AVAILABLE_MAPS.length > 0) {
    document.getElementById('mapSelect').value = AVAILABLE_MAPS[0];
}
// デフォルトで勝率タブを表示
switchTab('stats');
