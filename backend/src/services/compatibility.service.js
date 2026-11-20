/**
 * PCHelper (курсовая) — правила совместимости комплектующих.
 *
 * Правила вынесены на сервер: клиент не решает, совместимы ли детали,
 * а только показывает результат. Один и тот же код используется
 * конфигуратором, сохранёнными сборками и калькулятором БП.
 */

/** Поле ссылки на компонент в таблицах сборки. */
export const COMPONENT_FIELDS = {
  cpu: 'процессор_id',
  motherboard: 'материнская_плата_id',
  ram: 'озу_id',
  gpu: 'видеокарта_id',
  cooling: 'охлаждение_id',
  storage: 'накопитель_id',
  psu: 'блокпитания_id',
  case: 'корпус_id',
};

/** Обязательные категории сборки. */
export const REQUIRED_CATEGORIES = [
  'cpu',
  'motherboard',
  'ram',
  'cooling',
  'storage',
  'psu',
  'case',
];

/** Ранги форм-фактора: крупный корпус вмещает меньшую плату. */
const FORM_RANK = {
  ATX: 3,
  EATX: 4,
  MATX: 2,
  MICROATX: 2,
  'MICRO-ATX': 2,
  'MINI-ITX': 1,
  ITX: 1,
};

/**
 * Приводит форм-фактор к опорному виду.
 *
 * @param {unknown} value Значение из базы.
 * @returns {string}
 */
export function normalizeFormFactor(value) {
  const text = String(value || '')
    .trim()
    .toUpperCase();
  if (!text) return '';
  if (text.includes('EATX') || text.includes('E-ATX')) return 'EATX';
  if (text.includes('MICRO') || text.includes('MATX') || text.includes('M-ATX')) {
    return 'MATX';
  }
  if (text.includes('MINI') || text.includes('ITX')) return 'ITX';
  if (text.includes('ATX')) return 'ATX';
  return text;
}

/**
 * Возвращает ранг форм-фактора.
 *
 * @param {unknown} value Значение.
 * @returns {number}
 */
function formRank(value) {
  const key = normalizeFormFactor(value);
  return FORM_RANK[key] ?? 2;
}

/**
 * Безопасное число.
 *
 * @param {unknown} value Значение.
 * @returns {number}
 */
function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Читает характеристику товара.
 *
 * В боевом режиме доступна исходная строка Supabase (`data`), а в CI —
 * только подписи характеристик. Функция понимает оба источника.
 *
 * @param {object|null} product Товар.
 * @param {string} field Поле таблицы.
 * @param {string} label Подпись характеристики.
 * @returns {string}
 */
export function textField(product, field, label) {
  const raw = product?.data?.[field];
  if (raw !== undefined && raw !== null) return String(raw);
  const spec = product?.specs?.find((item) => item.label === label);
  return spec ? String(spec.value) : '';
}

/**
 * Читает числовую характеристику и отбрасывает единицы измерения.
 *
 * @param {object|null} product Товар.
 * @param {string} field Поле таблицы.
 * @param {string} label Подпись характеристики.
 * @returns {number}
 */
export function boolField(product, field, label) {
  const raw = product?.data?.[field];
  if (typeof raw === 'boolean') return raw;
  const text = textField(product, field, label).trim().toLowerCase();
  return ['да', 'true', '1', 'есть', 'yes'].includes(text);
}

export function numField(product, field, label) {
  const text = textField(product, field, label).replace(',', '.');
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/**
 * Проверяет, есть ли у процессора встроенная графика.
 *
 * @param {object|null} cpu Процессор.
 * @returns {boolean}
 */
export function hasIntegratedGraphics(cpu) {
  const value = cpu?.data?.['встроенная_графика'];
  if (typeof value === 'boolean') return value;
  const text = textField(cpu, 'встроенная_графика', 'Встроенная графика')
    .trim()
    .toLowerCase();
  return !['', 'нет', 'false', '0', 'no', 'none', 'null', '—'].includes(text);
}

/**
 * Разбирает идентификатор вида «cpu:12».
 *
 * @param {unknown} value Значение из запроса.
 * @param {string} expectedCategory Ожидаемая категория.
 * @returns {{category: string, productId: number}|null}
 */
export function parseProductId(value, expectedCategory) {
  const raw = typeof value === 'object' && value !== null ? value.id : value;
  const [category, id] = String(raw || '').split(':');
  if (category !== expectedCategory) return null;
  const productId = Number(id);
  if (!Number.isInteger(productId) || productId <= 0) return null;
  return { category, productId };
}

/**
 * Считает стоимость выбранных компонентов.
 *
 * @param {object} selection Выбор по категориям.
 * @returns {number}
 */
export function selectionTotal(selection) {
  let total = 0;
  for (const value of Object.values(selection)) {
    const list = Array.isArray(value) ? value : [value];
    for (const product of list) {
      if (product) total += num(product.price);
    }
  }
  return total;
}

/**
 * Проверяет совместимость сборки.
 *
 * @param {object} selection Продукты по категориям.
 * @param {{cpu?: object|null, motherboard?: object|null, ram?: object|null, cooling?: object|null, gpu?: object|null, storage?: object[], psu?: object|null, case?: object|null}} selection
 * @returns {{compatible: boolean, errors: string[], warnings: string[]}}
 */
export function checkCompatibility(selection) {
  const errors = [];
  const warnings = [];
  const { cpu, motherboard: mb, ram, cooling, gpu, psu, case: pcCase } = selection;
  const storages = selection.storage || [];

  for (const category of REQUIRED_CATEGORIES) {
    const value = category === 'storage' ? storages : selection[category];
    if (!value || (Array.isArray(value) && value.length === 0)) {
      const labels = {
        cpu: 'процессор',
        motherboard: 'материнская плата',
        ram: 'модуль ОЗУ',
        cooling: 'система охлаждения',
        storage: 'накопитель',
        psu: 'блок питания',
        case: 'корпус',
      };
      errors.push(`Не выбран ${labels[category]}.`);
    }
  }

  if (cpu && mb) {
    const cpuSocket = textField(cpu, 'сокет', 'Сокет');
    const mbSocket = textField(mb, 'сокет', 'Сокет');
    if (cpuSocket && mbSocket && cpuSocket !== mbSocket) {
      errors.push(
        `Сокет процессора (${cpuSocket}) не совпадает с сокетом платы (${mbSocket}).`,
      );
    }
  }

  if (mb && ram) {
    const boardMemory = textField(mb, 'тип_памяти', 'Тип памяти');
    const ramType = textField(ram, 'тип', 'Тип');
    if (boardMemory && ramType && boardMemory !== ramType) {
      errors.push(
        `Тип памяти платы (${boardMemory}) не совпадает с типом ОЗУ (${ramType}).`,
      );
    }
  }

  if (mb && pcCase) {
    const caseForm = textField(pcCase, 'форм_фактор', 'Форм-фактор');
    const boardForm = textField(mb, 'форм_фактор', 'Форм-фактор');
    if (formRank(caseForm) < formRank(boardForm)) {
      errors.push(
        `Форм-фактор корпуса (${caseForm}) не подходит для платы (${boardForm}).`,
      );
    }
  }

  if (gpu && pcCase) {
    const length = numField(gpu, 'длина', 'Длина');
    const maxLength = numField(
      pcCase,
      'макс_длина_gpu',
      'Максимальная длина видеокарты',
    );
    if (length > 0 && maxLength > 0 && length > maxLength) {
      errors.push(
        `Длина видеокарты (${length} мм) превышает максимум корпуса (${maxLength} мм).`,
      );
    }
  }

  if (cpu && cooling) {
    const coolingTdp = numField(cooling, 'tdp', 'Рассеиваемая мощность');
    const cpuTdp = numField(cpu, 'tdp', 'TDP');
    if (cpuTdp > 0 && coolingTdp > 0 && coolingTdp < cpuTdp) {
      errors.push(
        `Рассеиваемая мощность кулера (${coolingTdp} Вт) меньше TDP процессора (${cpuTdp} Вт).`,
      );
    }
  }

  if (cooling && pcCase) {
    const type = textField(cooling, 'тип', 'Тип').toLowerCase();
    const isLiquid =
      type.includes('жидк') ||
      type.includes('водян') ||
      type.includes('сжо') ||
      type.includes('aio');

    if (isLiquid) {
      const radiator = numField(cooling, 'длина_радиатора', 'Длина радиатора');
      const maxRadiator = numField(
        pcCase,
        'макс_длина_радиатора',
        'Максимальная длина радиатора',
      );
      if (radiator > 0 && maxRadiator > 0 && radiator > maxRadiator) {
        errors.push(
          `Длина радиатора СЖО (${radiator} мм) больше максимума корпуса (${maxRadiator} мм).`,
        );
      }
    } else {
      const height = numField(cooling, 'высота', 'Высота');
      const maxHeight = numField(
        pcCase,
        'макс_высота_кулера',
        'Максимальная высота кулера',
      );
      if (height > 0 && maxHeight > 0 && height > maxHeight) {
        errors.push(
          `Высота башни (${height} мм) больше максимума корпуса (${maxHeight} мм).`,
        );
      }
    }
  }

  const cpuTdp = numField(cpu, 'tdp', 'TDP');
  const gpuTdp = numField(gpu, 'tdp', 'TDP');
  const recommended = Math.ceil((cpuTdp + gpuTdp) * 1.25);
  if (psu && (cpuTdp > 0 || gpuTdp > 0)) {
    const watts = numField(psu, 'мощность_в_ваттах', 'Мощность');
    if (watts > 0 && watts < recommended) {
      errors.push(
        `Мощность БП (${watts} Вт) ниже рекомендуемой с запасом 25% (${recommended} Вт).`,
      );
    }
  }

  const ssds = storages.filter((item) =>
    textField(item, 'тип', 'Тип').toUpperCase().includes('SSD'),
  );
  const hdds = storages.filter((item) =>
    textField(item, 'тип', 'Тип').toUpperCase().includes('HDD'),
  );
  if (storages.length > 0) {
    if (ssds.length !== 1) {
      errors.push('В сборке должен быть ровно один SSD.');
    }
    if (hdds.length > 1) {
      errors.push('В сборке допускается не более одного HDD.');
    }
  }

  if (mb) {
    const m2Slots = numField(mb, 'm2_слоты', 'Слоты M.2');
    const m2Drives = storages.filter(
      (item) => textField(item, 'интерфейс', 'Интерфейс').toUpperCase() === 'M.2',
    );
    if (m2Slots > 0 && m2Drives.length > m2Slots) {
      errors.push(
        `Накопителей M.2 (${m2Drives.length}) больше, чем слотов на плате (${m2Slots}).`,
      );
    }
  }

  if (!gpu && cpu && !hasIntegratedGraphics(cpu)) {
    warnings.push(
      'Дискретная видеокарта не выбрана, а у процессора нет встроенной графики: изображения не будет.',
    );
  }

  if (gpu && gpuTdp > 0 && psu) {
    const watts = numField(psu, 'мощность_в_ваттах', 'Мощность');
    const load = Math.round(((cpuTdp + gpuTdp) / watts) * 100);
    if (watts > 0 && load > 80) {
      warnings.push(
        `Нагрузка на блок питания около ${load}%: для тихой работы лучше взять модель мощнее.`,
      );
    }
  }

  return { compatible: errors.length === 0, errors, warnings };
}

/**
 * Рассчитывает рекомендуемую мощность блока питания.
 *
 * @param {object|null} cpu Процессор.
 * @param {object|null} gpu Видеокарта.
 * @returns {{cpuTdp: number, gpuTdp: number, recommendedWatts: number, reservePercent: number}}
 */
export function recommendPsu(cpu, gpu) {
  const cpuTdp = numField(cpu, 'tdp', 'TDP');
  const gpuTdp = numField(gpu, 'tdp', 'TDP');
  return {
    cpuTdp,
    gpuTdp,
    recommendedWatts: Math.ceil((cpuTdp + gpuTdp) * 1.25),
    reservePercent: 25,
  };
}
