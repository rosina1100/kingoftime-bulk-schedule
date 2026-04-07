// スケジュールビジネスロジックモジュール
// コピー・スキップ/上書き判定・プレビュー生成

const ScheduleLogic = {
  LOG_PREFIX: '[KOT Logic]',

  /**
   * コピー元データとコピー先データから、適用計画を生成
   * @param {Map} sourceSchedules - コピー元の1日分: empId -> scheduleData
   * @param {Map} targetSchedules - コピー先の全データ: empId -> dateStr -> scheduleData
   * @param {string[]} targetWorkdays - コピー先の平日リスト
   * @param {string} mode - 'skip' or 'overwrite'
   * @returns {Object} 適用計画
   */
  generatePlan(sourceSchedules, targetSchedules, targetWorkdays, mode = 'skip') {
    const plan = {
      apply: [],   // { empId, dateStr, sourcePattern }
      skip: [],    // { empId, dateStr, reason }
      noSource: [], // コピー元にスケジュールがない社員
      summary: {},
    };

    // コピー先に存在する社員IDセット
    const targetEmployees = [...targetSchedules.keys()];

    for (const empId of targetEmployees) {
      const sourceData = sourceSchedules.get(empId);

      // コピー元にこの社員のスケジュールがない場合
      if (!sourceData || !sourceData.hasSchedule) {
        plan.noSource.push(empId);
        // 全平日をスキップ
        for (const dateStr of targetWorkdays) {
          plan.skip.push({ empId, dateStr, reason: 'コピー元にスケジュールなし' });
        }
        continue;
      }

      const empTargetSchedule = targetSchedules.get(empId);

      for (const dateStr of targetWorkdays) {
        const targetData = empTargetSchedule?.get(dateStr);
        const hasExisting = targetData && targetData.hasSchedule;

        if (hasExisting && mode === 'skip') {
          plan.skip.push({ empId, dateStr, reason: '既存スケジュールあり（スキップ）' });
        } else {
          plan.apply.push({ empId, dateStr, sourcePattern: sourceData });
        }
      }
    }

    plan.summary = {
      totalEmployees: targetEmployees.length,
      employeesWithSource: targetEmployees.length - plan.noSource.length,
      employeesWithoutSource: plan.noSource.length,
      totalWorkdays: targetWorkdays.length,
      applyCount: plan.apply.length,
      skipCount: plan.skip.length,
    };

    console.log(this.LOG_PREFIX, 'Plan generated:', plan.summary);
    return plan;
  },

  /**
   * プレビュー用のHTML生成
   */
  generatePreviewHTML(plan) {
    const s = plan.summary;

    let html = `
      <div style="padding: 6px; font-size: 12px;">
        <div style="margin-bottom: 8px;">
          <strong>適用予定:</strong> ${s.applyCount}件（${s.employeesWithSource}名 × 対象日）<br>
          <strong>スキップ:</strong> ${s.skipCount}件<br>
    `;

    if (s.employeesWithoutSource > 0) {
      html += `<span style="color: #e65100;">⚠ コピー元にスケジュールがない社員: ${s.employeesWithoutSource}名</span><br>`;
    }

    html += `</div>`;

    // 社員ごとの内訳テーブル
    const empMap = new Map();
    for (const item of plan.apply) {
      if (!empMap.has(item.empId)) empMap.set(item.empId, { apply: 0, skip: 0 });
      empMap.get(item.empId).apply++;
    }
    for (const item of plan.skip) {
      if (!empMap.has(item.empId)) empMap.set(item.empId, { apply: 0, skip: 0 });
      empMap.get(item.empId).skip++;
    }

    html += `<table>
      <tr><th>社員ID</th><th>適用</th><th>スキップ</th></tr>`;

    for (const [empId, counts] of empMap) {
      const applyClass = counts.apply > 0 ? 'kot-bulk-apply' : '';
      const skipClass = counts.skip > 0 ? 'kot-bulk-skip' : '';
      html += `<tr>
        <td>${empId}</td>
        <td class="${applyClass}">${counts.apply}日</td>
        <td class="${skipClass}">${counts.skip}日</td>
      </tr>`;
    }

    html += `</table></div>`;
    return html;
  },
};
