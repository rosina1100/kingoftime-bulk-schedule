// King of Time API通信モジュール
// KOTのネイティブJS関数を利用してスケジュールを登録する

const KotApi = {
  LOG_PREFIX: '[KOT API]',

  /**
   * 指定月のスケジュール登録画面をfetchして取得（コピー元データ取得用）
   */
  async fetchMonth(formAction, year, month, csrf, filterParams = {}) {
    const params = new URLSearchParams();
    params.set('year', year.toString());
    params.set('month', month.toString().padStart(2, '0'));
    params.set('page_id', '/schedule/monthly_section_schedule_edit');
    params.set('date_selection_type', filterParams.date_selection_type || '1');
    params.set('display_limit', filterParams.display_limit || '100');
    params.set('pattern_name_flag', filterParams.pattern_name_flag || '');

    if (filterParams.selected_section_id) {
      params.set('selected_section_id', filterParams.selected_section_id);
    }
    if (filterParams.selected_working_type_id) {
      params.set('selected_working_type_id', filterParams.selected_working_type_id);
    }

    if (csrf) {
      params.set(csrf.key, csrf.value);
    }

    console.log(this.LOG_PREFIX, `Fetching schedule for ${year}/${month}...`);

    const response = await fetch(formAction, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      credentials: 'same-origin',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const doc = KotParser.parseHTML(html);

    console.log(this.LOG_PREFIX, `Fetched ${year}/${month} successfully`);
    return doc;
  },

  /**
   * チェックボックスを一括クリックする（保存はユーザーが手動で行う）
   * パターンごとにセレクトを切り替えながら .click() でチェックを入れる
   *
   * @param {Object} plan - ScheduleLogic.generatePlan() の結果
   * @param {Function} onProgress - 進捗コールバック (current, total, message)
   * @returns {Object} 実行結果 { applied, skipped, patternCount }
   */
  async applyCheckboxes(plan, onProgress) {
    // パターンIDごとにグルーピング
    const patternGroups = new Map();

    for (const item of plan.apply) {
      const patternId = item.sourcePattern.patternId;
      if (!patternGroups.has(patternId)) {
        patternGroups.set(patternId, []);
      }
      patternGroups.get(patternId).push({
        empId: item.empId,
        dateStr: item.dateStr,
      });
    }

    console.log(this.LOG_PREFIX, `Grouped into ${patternGroups.size} pattern(s)`);

    const patternSelect = document.querySelector('select[name="schedule_pattern_id"]');
    if (!patternSelect) {
      throw new Error('schedule_pattern_id セレクトが見つかりません');
    }

    const totalEntries = plan.apply.length;
    let totalApplied = 0;
    let totalSkipped = 0;
    let currentGroup = 0;

    for (const [patternId, entries] of patternGroups) {
      currentGroup++;

      // パターンIDが選択肢に存在するか確認
      const optionExists = [...patternSelect.options].some(o => o.value === patternId);
      if (!optionExists) {
        console.warn(this.LOG_PREFIX, `Pattern ID ${patternId} not found in select options, skipping ${entries.length} entries`);
        totalSkipped += entries.length;
        continue;
      }

      // セレクトにパターンIDをセット
      patternSelect.value = patternId;
      patternSelect.dispatchEvent(new Event('change', { bubbles: true }));
      console.log(this.LOG_PREFIX, `Set pattern to ${patternId} (group ${currentGroup}/${patternGroups.size})`);

      await this.sleep(300);

      // 対象のチェックボックスを .click() でONにする
      for (const entry of entries) {
        const cbId = `schedule_copy_${entry.empId}_${entry.dateStr}`;
        const cb = document.getElementById(cbId);

        if (!cb) {
          console.warn(this.LOG_PREFIX, `Checkbox not found: ${cbId}`);
          totalSkipped++;
          continue;
        }

        if (!cb.checked) {
          cb.click();
        }

        totalApplied++;
        await this.sleep(50);

        // 進捗表示
        if (totalApplied % 10 === 0 || totalApplied === totalEntries) {
          onProgress(totalApplied, totalEntries,
            `チェック中... ${totalApplied}/${totalEntries}件（パターン ${currentGroup}/${patternGroups.size}）`);
        }
      }

      // パターン切替前に少し待つ（set_scheduleの処理完了を待つ）
      await this.sleep(500);
    }

    console.log(this.LOG_PREFIX, `Done: ${totalApplied} checked, ${totalSkipped} skipped`);
    return { applied: totalApplied, skipped: totalSkipped, patternCount: patternGroups.size };
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};
