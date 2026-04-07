// King of Time 一括スケジュール登録 - メインコンテンツスクリプト
// KOTのスケジュール登録画面を検出し、一括登録UIを注入する

(function () {
  'use strict';

  const LOG_PREFIX = '[KOT Bulk Schedule]';

  // ページ検出: スケジュール登録画面かどうか判定
  function isScheduleEditPage() {
    const pageIdInput = document.querySelector('input[name="page_id"]');
    if (!pageIdInput) return false;
    return pageIdInput.value.includes('schedule') && pageIdInput.value.includes('edit');
  }

  // 現在表示中の月情報を取得（KotParserに委譲）
  function getCurrentDisplayMonth() {
    return KotParser.extractDisplayMonth();
  }

  // 現在のページデータをキャッシュ
  let cachedPageData = null;
  let cachedPlan = null;

  // UIパネルを生成
  function createPanel() {
    const currentMonth = getCurrentDisplayMonth();
    const currentYear = currentMonth ? currentMonth.year : new Date().getFullYear();
    const currentMon = currentMonth ? currentMonth.month : new Date().getMonth() + 1;

    // コピー先の表示テキスト
    const targetText = currentMonth
      ? `現在表示中の月（${currentYear}年${currentMon}月）`
      : '現在表示中の月';

    // トグルボタン
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'kot-bulk-toggle-btn';
    toggleBtn.textContent = '一括スケジュール登録';

    // パネル本体
    const panel = document.createElement('div');
    panel.className = 'kot-bulk-panel';
    panel.innerHTML = `
      <div class="kot-bulk-header">
        <span>一括スケジュール登録</span>
        <button class="kot-bulk-close-btn" title="閉じる">✕</button>
      </div>
      <div class="kot-bulk-body">
        <div class="kot-bulk-section">
          <span class="kot-bulk-label">コピー元（この日のスケジュールをコピー）</span>
          <div class="kot-bulk-row">
            <select id="kot-bulk-src-year" class="kot-bulk-select"></select>
            <span>年</span>
            <select id="kot-bulk-src-month" class="kot-bulk-select"></select>
            <span>月</span>
            <select id="kot-bulk-src-day" class="kot-bulk-select"></select>
            <span>日</span>
          </div>
        </div>

        <div class="kot-bulk-section">
          <span class="kot-bulk-label">コピー先</span>
          <div class="kot-bulk-target-text">${targetText} の全平日に適用</div>
        </div>

        <div class="kot-bulk-section">
          <span class="kot-bulk-label">既存スケジュールの扱い</span>
          <div class="kot-bulk-radio-group">
            <label>
              <input type="radio" name="kot-bulk-overwrite" value="skip" checked>
              スキップ（既に登録済みの日は触らない）
            </label>
            <label>
              <input type="radio" name="kot-bulk-overwrite" value="overwrite">
              上書き（全て置き換える）
            </label>
          </div>
        </div>

        <div class="kot-bulk-actions">
          <button id="kot-bulk-preview-btn" class="kot-bulk-btn kot-bulk-btn-preview">プレビュー</button>
          <button id="kot-bulk-execute-btn" class="kot-bulk-btn kot-bulk-btn-execute" disabled>一括チェック</button>
        </div>

        <div class="kot-bulk-preview" id="kot-bulk-preview-area"></div>

        <div class="kot-bulk-status" id="kot-bulk-status">待機中</div>
        <div class="kot-bulk-progress" id="kot-bulk-progress">
          <div class="kot-bulk-progress-bar" id="kot-bulk-progress-bar"></div>
        </div>
      </div>
    `;

    // 表示ボタンの右隣に絶対配置で挿入
    const displayBtn = document.getElementById('display_button');
    if (displayBtn) {
      displayBtn.parentElement.appendChild(toggleBtn);
      // 表示ボタンの右端から8px空けて配置
      const leftPos = displayBtn.offsetLeft + displayBtn.offsetWidth + 8;
      toggleBtn.style.left = leftPos + 'px';
    } else {
      document.body.appendChild(toggleBtn);
    }
    document.body.appendChild(panel);

    // コピー元セレクター初期化
    initSourceSelectors(currentYear, currentMon);

    // イベント設定
    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('kot-bulk-open');
    });

    panel.querySelector('.kot-bulk-close-btn').addEventListener('click', () => {
      panel.classList.remove('kot-bulk-open');
    });

    // 月変更時に日数を更新
    document.getElementById('kot-bulk-src-year').addEventListener('change', updateDayOptions);
    document.getElementById('kot-bulk-src-month').addEventListener('change', updateDayOptions);

    // プレビューボタン
    document.getElementById('kot-bulk-preview-btn').addEventListener('click', handlePreview);

    // 実行ボタン
    document.getElementById('kot-bulk-execute-btn').addEventListener('click', handleExecute);

    console.log(LOG_PREFIX, 'UI panel injected');
  }

  // コピー元のセレクター初期化
  function initSourceSelectors(defaultYear, defaultMonth) {
    const yearSelect = document.getElementById('kot-bulk-src-year');
    const monthSelect = document.getElementById('kot-bulk-src-month');

    // 年: 前年〜翌年
    for (let y = defaultYear - 1; y <= defaultYear + 1; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === defaultYear) opt.selected = true;
      yearSelect.appendChild(opt);
    }

    // 月: 1〜12
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      // デフォルトは前月
      const prevMonth = defaultMonth === 1 ? 12 : defaultMonth - 1;
      if (m === prevMonth) opt.selected = true;
      monthSelect.appendChild(opt);
    }

    // 前月選択時に年も調整
    if (defaultMonth === 1) {
      yearSelect.value = defaultYear - 1;
    }

    updateDayOptions();
  }

  // 日セレクターを年月に応じて更新
  function updateDayOptions() {
    const year = parseInt(document.getElementById('kot-bulk-src-year').value);
    const month = parseInt(document.getElementById('kot-bulk-src-month').value);
    const daySelect = document.getElementById('kot-bulk-src-day');
    const daysInMonth = new Date(year, month, 0).getDate();

    const currentValue = parseInt(daySelect.value) || 1;
    daySelect.innerHTML = '';

    for (let d = 1; d <= daysInMonth; d++) {
      const opt = document.createElement('option');
      opt.value = d;
      // 曜日も表示
      const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][new Date(year, month - 1, d).getDay()];
      opt.textContent = `${d}（${dayOfWeek}）`;
      if (d === Math.min(currentValue, daysInMonth)) opt.selected = true;
      daySelect.appendChild(opt);
    }
  }

  // ステータス表示更新
  function setStatus(message, type = '') {
    const statusEl = document.getElementById('kot-bulk-status');
    statusEl.textContent = message;
    statusEl.className = 'kot-bulk-status';
    if (type) {
      statusEl.classList.add(`kot-bulk-status-${type}`);
    }
  }

  // プレビュー処理
  async function handlePreview() {
    const previewBtn = document.getElementById('kot-bulk-preview-btn');
    const executeBtn = document.getElementById('kot-bulk-execute-btn');
    const previewArea = document.getElementById('kot-bulk-preview-area');

    previewBtn.disabled = true;
    executeBtn.disabled = true;
    setStatus('プレビュー準備中...', 'loading');

    try {
      // 1. 現ページのデータを解析
      console.log(LOG_PREFIX, 'Parsing current page...');
      cachedPageData = KotParser.parseAll(document);

      if (!cachedPageData.csrf) {
        throw new Error('CSRFトークンが見つかりません。ページを再読み込みしてください。');
      }

      if (cachedPageData.employees.length === 0) {
        throw new Error('社員データが見つかりません。');
      }

      // 2. コピー元の月をfetch
      const srcYear = parseInt(document.getElementById('kot-bulk-src-year').value);
      const srcMonth = parseInt(document.getElementById('kot-bulk-src-month').value);
      const srcDay = parseInt(document.getElementById('kot-bulk-src-day').value);
      const srcDateStr = `${srcYear}${String(srcMonth).padStart(2, '0')}${String(srcDay).padStart(2, '0')}`;

      setStatus(`コピー元 ${srcYear}年${srcMonth}月 を取得中...`, 'loading');

      const sourceDoc = await KotApi.fetchMonth(
        cachedPageData.formAction,
        srcYear,
        srcMonth,
        cachedPageData.csrf,
        cachedPageData.filterParams
      );

      // 2.5. サーバーのセッション状態を表示中の月に戻す
      // fetchMonthのPOSTでサーバー側が「最後に見た月」を更新してしまうため、
      // コピー先の月を再fetchしてセッションをリセットする
      const displayMonth = cachedPageData.displayMonth;
      if (displayMonth && (displayMonth.year !== srcYear || displayMonth.month !== srcMonth)) {
        setStatus(`セッション復帰中...`, 'loading');
        await KotApi.fetchMonth(
          cachedPageData.formAction,
          displayMonth.year,
          displayMonth.month,
          cachedPageData.csrf,
          cachedPageData.filterParams
        );
        console.log(LOG_PREFIX, `Session reset to ${displayMonth.year}/${displayMonth.month}`);
      }

      // 3. コピー元の指定日のスケジュールを解析
      const sourceAllSchedules = KotParser.extractSchedules(sourceDoc);
      const sourceOneDaySchedules = new Map();

      for (const [empId, empSchedule] of sourceAllSchedules) {
        const dayData = empSchedule.get(srcDateStr);
        if (dayData) {
          // param_ JSON も取得
          const paramInput = sourceDoc.querySelector(`input[name="param_${empId}_${srcDateStr}"]`);
          sourceOneDaySchedules.set(empId, {
            ...dayData,
            paramJson: paramInput ? paramInput.value : '',
          });
        }
      }

      console.log(LOG_PREFIX, `Source date ${srcDateStr}: ${sourceOneDaySchedules.size} employees with data`);

      // 4. コピー先の平日・既存スケジュール
      const targetWorkdays = cachedPageData.workdays;
      const targetSchedules = cachedPageData.schedules;
      const mode = document.querySelector('input[name="kot-bulk-overwrite"]:checked')?.value || 'skip';

      // 5. 適用計画を生成
      cachedPlan = ScheduleLogic.generatePlan(sourceOneDaySchedules, targetSchedules, targetWorkdays, mode);

      // コピー元データもキャッシュ（実行時に使う）
      cachedPlan._sourceSchedules = sourceOneDaySchedules;
      cachedPlan._sourceDateStr = srcDateStr;

      // 6. プレビュー表示
      const summary = cachedPlan.summary;
      previewArea.innerHTML = ScheduleLogic.generatePreviewHTML(cachedPlan);
      previewArea.style.display = 'block';

      if (summary.applyCount > 0) {
        setStatus(`適用: ${summary.applyCount}件 / スキップ: ${summary.skipCount}件`, 'success');
        executeBtn.disabled = false;
      } else {
        setStatus('適用対象がありません。コピー元の日付やモードを確認してください。', 'error');
      }

    } catch (error) {
      console.error(LOG_PREFIX, 'Preview error:', error);
      setStatus(`エラー: ${error.message}`, 'error');
      previewArea.style.display = 'none';
    } finally {
      previewBtn.disabled = false;
    }
  }

  // 一括チェック処理（チェックボックスをONにするだけ。保存はユーザーが手動で行う）
  async function handleExecute() {
    if (!cachedPlan || cachedPlan.summary.applyCount === 0) {
      setStatus('先にプレビューを実行してください。', 'error');
      return;
    }

    const summary = cachedPlan.summary;
    const patternIds = new Set(cachedPlan.apply.map(item => item.sourcePattern.patternId));

    let confirmMsg = `${summary.employeesWithSource}名 × 対象日 = ${summary.applyCount}件のチェックを入れます。`;
    confirmMsg += `\n（${patternIds.size}種類のスケジュールパターン）`;
    confirmMsg += `\n\nチェック後、内容を確認してから保存ボタンを押してください。`;
    confirmMsg += `\n\nよろしいですか？`;

    if (!confirm(confirmMsg)) {
      setStatus('キャンセルしました', '');
      return;
    }

    const executeBtn = document.getElementById('kot-bulk-execute-btn');
    const previewBtn = document.getElementById('kot-bulk-preview-btn');
    const progressEl = document.getElementById('kot-bulk-progress');
    const progressBar = document.getElementById('kot-bulk-progress-bar');

    executeBtn.disabled = true;
    previewBtn.disabled = true;
    progressEl.style.display = 'block';
    progressBar.style.width = '5%';
    setStatus('チェック中...', 'loading');

    try {
      const result = await KotApi.applyCheckboxes(
        cachedPlan,
        (current, total, message) => {
          const pct = Math.round((current / total) * 100);
          progressBar.style.width = `${pct}%`;
          setStatus(message, 'loading');
        }
      );

      progressBar.style.width = '100%';
      setStatus(`チェック完了！ ${result.applied}件にチェックを入れました。内容を確認して保存ボタンを押してください。`, 'success');

    } catch (error) {
      console.error(LOG_PREFIX, 'Execute error:', error);
      setStatus(`エラー: ${error.message}`, 'error');
      previewBtn.disabled = false;
      executeBtn.disabled = true;
      cachedPlan = null;
    }
  }

  // メイン: ページ検出 → UI注入
  function main() {
    if (!isScheduleEditPage()) {
      console.log(LOG_PREFIX, 'Not a schedule edit page, skipping');
      return;
    }

    console.log(LOG_PREFIX, 'Schedule edit page detected');
    initUI();
  }

  function initUI() {
    const currentMonth = getCurrentDisplayMonth();
    if (currentMonth) {
      console.log(LOG_PREFIX, `Current display: ${currentMonth.year}/${currentMonth.month}`);
    }

    createPanel();
  }

  // DOM準備完了後に実行
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
