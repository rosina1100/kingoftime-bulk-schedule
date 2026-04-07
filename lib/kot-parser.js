// King of Time DOM解析モジュール
// KOTのスケジュール登録画面からデータを抽出する

const KotParser = {
  LOG_PREFIX: '[KOT Parser]',

  // スケジュール表のテーブルインデックス
  SCHEDULE_TABLE_INDEX: 2,

  // 非平日を示すclass名のキーワード
  NON_WORKDAY_KEYWORDS: ['saturday', 'sunday', 'holiday'],

  // 既知のhiddenフィールド名パターン（CSRF検出時に除外用）
  KNOWN_FIELD_PATTERNS: [
    /^year$/, /^month$/, /^page_id$/, /^end_year$/, /^end_month$/, /^end_day$/,
    /^week_num$/, /^date_selection_type$/, /^break_pattern_counter$/,
    /^leave_type_counter$/, /^edit_button_status_code$/, /^pattern_name_flag$/,
    /^original_schedulepatternid_/, /^working_minute_/, /^param_/,
    /^schedule_copy_/, /^section_id$/, /^working_type_id_list$/,
    /^selected_section_id$/, /^selected_working_type_id$/, /^selected_day_of_week$/,
    /^update_key$/, /^all_employee_summary_flag$/, /^diff_schedule_amount_flag$/,
    /^view_preference_schedule_time_flag$/, /^display_offset$/, /^display_limit$/,
    /^action_id$/, /^date_check_/, /^$/ // 空のname
  ],

  /**
   * 現在のページ（またはパース済みDocument）からすべてのデータを抽出
   * @param {Document} doc - 解析対象のDocument（デフォルトは現在のページ）
   * @returns {Object} 抽出されたデータ
   */
  parseAll(doc = document) {
    const csrf = this.extractCsrfToken(doc);
    const sessionToken = this.extractSessionToken(doc);
    const employees = this.extractEmployeeIds(doc);
    const schedules = this.extractSchedules(doc, employees);
    const workdays = this.extractWorkdays(doc);
    const filterParams = this.extractFilterParams(doc);
    const displayMonth = this.extractDisplayMonth(doc);
    const formAction = this.extractFormAction(doc);

    console.log(this.LOG_PREFIX, 'Parsed data:', {
      csrf: csrf ? { key: csrf.key, value: csrf.value.substring(0, 8) + '...' } : null,
      sessionToken: sessionToken ? sessionToken.substring(0, 12) + '...' : null,
      employeeCount: employees.length,
      workdayCount: workdays.length,
      displayMonth,
      formAction: formAction ? formAction.substring(0, 30) + '...' : null,
    });

    return { csrf, sessionToken, employees, schedules, workdays, filterParams, displayMonth, formAction };
  },

  /**
   * CSRFトークンを抽出
   * 動的キー名のhiddenフィールドを検出する
   */
  extractCsrfToken(doc = document) {
    const form = doc.querySelector('form[name="myForm"]') || doc.querySelector('form');
    if (!form) return null;

    const hiddens = form.querySelectorAll('input[type="hidden"]');
    // 既知のフィールド名以外で、複数回出現するものがCSRFトークン
    const candidates = {};

    for (const input of hiddens) {
      const name = input.name;
      if (!name) continue;

      const isKnown = this.KNOWN_FIELD_PATTERNS.some(p => p.test(name));
      if (isKnown) continue;

      if (!candidates[name]) {
        candidates[name] = { key: name, value: input.value, count: 0 };
      }
      candidates[name].count++;
    }

    // 最も出現回数が多いものをCSRFトークンとして採用
    const sorted = Object.values(candidates).sort((a, b) => b.count - a.count);
    if (sorted.length > 0) {
      console.log(this.LOG_PREFIX, `CSRF token found: ${sorted[0].key} (appeared ${sorted[0].count} times)`);
      return { key: sorted[0].key, value: sorted[0].value };
    }

    console.warn(this.LOG_PREFIX, 'CSRF token not found');
    return null;
  },

  /**
   * セッショントークンをURLから抽出
   */
  extractSessionToken(doc = document) {
    // formのaction属性から取得
    const form = doc.querySelector('form[name="myForm"]') || doc.querySelector('form');
    if (form && form.action) {
      const match = form.action.match(/\/admin\/([^?/]+)/);
      if (match) return match[1];
    }
    // 現在のURLから取得
    const urlMatch = window.location.pathname.match(/\/admin\/([^?/]+)/);
    return urlMatch ? urlMatch[1] : null;
  },

  /**
   * フォームのaction URLを取得
   */
  extractFormAction(doc = document) {
    const form = doc.querySelector('form[name="myForm"]') || doc.querySelector('form');
    return form ? form.getAttribute('action') : null;
  },

  /**
   * 社員ID一覧を抽出
   * original_schedulepatternid_{empId}_{date} フィールドから取得
   */
  extractEmployeeIds(doc = document) {
    const ids = new Set();
    const inputs = doc.querySelectorAll('input[name^="original_schedulepatternid_"]');

    for (const input of inputs) {
      const match = input.name.match(/^original_schedulepatternid_(\d+)_\d{8}$/);
      if (match) {
        ids.add(match[1]);
      }
    }

    const result = [...ids];
    console.log(this.LOG_PREFIX, `Found ${result.length} employees:`, result);
    return result;
  },

  /**
   * 各社員×各日のスケジュールデータを抽出
   * @returns {Map<string, Map<string, Object>>} empId -> dateStr -> scheduleData
   */
  extractSchedules(doc = document, employeeIds = null) {
    if (!employeeIds) {
      employeeIds = this.extractEmployeeIds(doc);
    }

    // empId -> { dateStr -> { patternId, workingMinute, hasSchedule } }
    const schedules = new Map();

    for (const empId of employeeIds) {
      const empSchedule = new Map();
      const inputs = doc.querySelectorAll(`input[name^="original_schedulepatternid_${empId}_"]`);

      for (const input of inputs) {
        const match = input.name.match(/^original_schedulepatternid_\d+_(\d{8})$/);
        if (!match) continue;

        const dateStr = match[1];
        const patternId = input.value || '';
        const workingMinuteInput = doc.querySelector(`input[name="working_minute_${empId}_${dateStr}"]`);
        const workingMinute = workingMinuteInput ? workingMinuteInput.value : '';

        empSchedule.set(dateStr, {
          patternId,
          workingMinute,
          hasSchedule: patternId !== '',
        });
      }

      schedules.set(empId, empSchedule);
    }

    return schedules;
  },

  /**
   * ヘッダー行から平日の日付リストを抽出
   * 土日祝のclassを持つ日を除外
   * @returns {string[]} 平日の日付文字列配列（YYYYMMDD形式）
   */
  extractWorkdays(doc = document) {
    const table = doc.querySelectorAll('table')[this.SCHEDULE_TABLE_INDEX];
    if (!table) {
      console.warn(this.LOG_PREFIX, 'Schedule table not found');
      return [];
    }

    const headerRow = table.rows[0];
    if (!headerRow) return [];

    const workdays = [];
    const allDates = [];

    const ths = headerRow.querySelectorAll('th');
    for (const th of ths) {
      const input = th.querySelector('input[id^="date_check_"]');
      if (!input) continue;

      const dateStr = input.id.replace('date_check_', '');
      const className = th.className.toLowerCase();

      const isNonWorkday = this.NON_WORKDAY_KEYWORDS.some(kw => className.includes(kw));

      allDates.push({ dateStr, isNonWorkday, className: th.className.trim() });

      if (!isNonWorkday) {
        workdays.push(dateStr);
      }
    }

    console.log(this.LOG_PREFIX, `Found ${allDates.length} dates, ${workdays.length} workdays`);
    return workdays;
  },

  /**
   * すべての日付（平日・非平日問わず）を取得
   */
  extractAllDates(doc = document) {
    const table = doc.querySelectorAll('table')[this.SCHEDULE_TABLE_INDEX];
    if (!table) return [];

    const headerRow = table.rows[0];
    if (!headerRow) return [];

    const dates = [];
    const ths = headerRow.querySelectorAll('th');
    for (const th of ths) {
      const input = th.querySelector('input[id^="date_check_"]');
      if (!input) continue;
      dates.push(input.id.replace('date_check_', ''));
    }
    return dates;
  },

  /**
   * 現在の絞り込み条件を取得
   */
  extractFilterParams(doc = document) {
    const getValue = (name) => {
      const el = doc.querySelector(`[name="${name}"]`);
      return el ? el.value : '';
    };

    return {
      selected_section_id: getValue('selected_section_id'),
      selected_working_type_id: getValue('selected_working_type_id'),
      display_limit: getValue('display_limit'),
      date_selection_type: getValue('date_selection_type'),
      pattern_name_flag: getValue('pattern_name_flag'),
    };
  },

  /**
   * 現在表示中の年月を取得
   */
  extractDisplayMonth(doc = document) {
    const yearEl = doc.querySelector('input[name="year"], select[name="year"]');
    const monthEl = doc.querySelector('input[name="month"], select[name="month"]');

    if (yearEl && monthEl) {
      return {
        year: parseInt(yearEl.value),
        month: parseInt(monthEl.value),
      };
    }
    return null;
  },

  /**
   * fetchで取得したHTMLをDocumentとしてパースする
   */
  parseHTML(htmlString) {
    const parser = new DOMParser();
    return parser.parseFromString(htmlString, 'text/html');
  },
};
