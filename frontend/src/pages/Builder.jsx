/**
 * PCHelper — конфигуратор ПК.
 *
 * Девять шагов: процессор, плата, память, охлаждение, видеокарта,
 * накопители, блок питания, корпус и итог. Выбранные детали хранятся
 * в черновике localStorage, несовместимые варианты отфильтровываются,
 * а на шаге 9 проверяются совместимость, остатки и цена.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { getProducts, money } from '../api.js';
import { readAuth } from '../auth.js';
import { addBuildToCart } from '../cart.js';
import { checkCompatibility, getBuild, saveBuild } from '../builds.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  booleanOf,
  formRank,
  hasIntegratedGraphics,
  numberOf,
  textOf,
} from '../productFields.js';

/**
 * Убирает из сборки компоненты, ставшие несовместимыми после выбора
 * нового процессора, платы, охлаждения и т. п.
 *
 * Например, при смене процессора на другой сокет материнская плата
 * сбрасывается, а остальные детали остаются. Так пользователь не тащит
 * в итог заведомо конфликтующую сборку и видит только актуальный выбор.
 *
 * @param {object} selection Текущий выбор по категориям.
 * @param {boolean} skipGpu Сборка без дискретной видеокарты.
 * @returns {object} Новый выбор без несовместимых деталей.
 */
function pruneIncompatible(selection, skipGpu) {
  let next = selection;

  const cpuSocket = textOf(next.cpu, 'сокет', 'Сокет');
  const boardSocket = textOf(next.motherboard, 'сокет', 'Сокет');
  if (cpuSocket && boardSocket && cpuSocket !== boardSocket) {
    next = { ...next, motherboard: null };
  }

  const memoryType = textOf(next.motherboard, 'тип_памяти', 'Тип памяти');
  const ramType = textOf(next.ram, 'тип', 'Тип');
  if (memoryType && ramType && memoryType !== ramType) {
    next = { ...next, ram: null };
  }

  const cpuTdp = numberOf(next.cpu, 'tdp', 'TDP');
  const coolerTdp = numberOf(next.cooling, 'tdp', 'Рассеиваемая мощность');
  if (cpuTdp && coolerTdp && coolerTdp < cpuTdp) {
    next = { ...next, cooling: null };
  }

  const gpuTdp = skipGpu ? 0 : numberOf(next.gpu, 'tdp', 'TDP');
  const needWatts = Math.ceil((cpuTdp + gpuTdp) * 1.25);
  const psuWatts = numberOf(next.psu, 'мощность_в_ваттах', 'Мощность');
  if (needWatts && psuWatts && psuWatts < needWatts) {
    next = { ...next, psu: null };
  }

  if (next.case) {
    const boardRank = formRank(textOf(next.motherboard, 'форм_фактор', 'Форм-фактор'));
    const caseRank = formRank(textOf(next.case, 'форм_фактор', 'Форм-фактор'));
    const gpuLength = numberOf(next.gpu, 'длина', 'Длина');
    const maxGpu = numberOf(
      next.case,
      'макс_длина_gpu',
      'Максимальная длина видеокарты',
    );
    const coolerHeight = numberOf(next.cooling, 'высота', 'Высота');
    const maxCooler = numberOf(
      next.case,
      'макс_высота_кулера',
      'Максимальная высота кулера',
    );
    const coolingType = textOf(next.cooling, 'тип', 'Тип').toLowerCase();
    const isLiquid = ['жидк', 'водян', 'сжо', 'aio'].some((word) =>
      coolingType.includes(word),
    );
    const radiator = numberOf(next.cooling, 'длина_радиатора', 'Длина радиатора');
    const maxRadiator = numberOf(
      next.case,
      'макс_длина_радиатора',
      'Максимальная длина радиатора',
    );

    const caseTooSmall =
      (boardRank > 0 && caseRank > 0 && caseRank < boardRank) ||
      (gpuLength > 0 && maxGpu > 0 && gpuLength > maxGpu) ||
      (coolerHeight > 0 && maxCooler > 0 && coolerHeight > maxCooler) ||
      (isLiquid && radiator > 0 && maxRadiator > 0 && radiator > maxRadiator);

    if (caseTooSmall) next = { ...next, case: null };
  }

  return next;
}

/**
 * Ключ черновика привязан к пользователю: сборка одного аккаунта
 * не должна всплывать в конфигураторе другого.
 *
 * @returns {string}
 */
function draftKey() {
  const user = readAuth().user;
  return `pchelper_builder_v2:${user?.id || 'guest'}`;
}

/**
 * Читает черновик синхронно при первом рендере.
 *
 * Если читать его внутри эффекта загрузки, эффект автосохранения успевает
 * записать пустой черновик раньше — и сборка теряется при перезагрузке.
 *
 * @returns {object|null}
 */
function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(draftKey()) || 'null');
  } catch {
    return null;
  }
}

/** Восемь шагов конфигуратора и итоговый экран. */
const STEPS = [
  { key: 'cpu', title: 'Процессор', next: 'Материнская плата' },
  { key: 'motherboard', title: 'Материнская плата', next: 'Оперативная память' },
  { key: 'ram', title: 'Оперативная память', next: 'Охлаждение' },
  { key: 'cooling', title: 'Система охлаждения', next: 'Видеокарта' },
  { key: 'gpu', title: 'Видеокарта', next: 'Накопители' },
  { key: 'storage', title: 'Накопители', next: 'Блок питания' },
  { key: 'psu', title: 'Блок питания', next: 'Корпус' },
  { key: 'case', title: 'Корпус', next: 'Проверка сборки' },
  { key: 'summary', title: 'Проверка и сохранение' },
];

/** Колонки таблиц подбора. */
const COLUMNS = {
  cpu: [
    { label: 'Сокет', value: (p) => textOf(p, 'сокет', 'Сокет') },
    {
      label: 'Ядра / потоки',
      value: (p) => {
        const spec = p.specs.find((s) => s.label === 'Ядра / потоки');
        return spec?.value || '—';
      },
    },
    {
      label: 'Частота',
      value: (p) => {
        const spec = p.specs.find((s) => s.label === 'Частота');
        return spec?.value || '—';
      },
    },
    { label: 'TDP', value: (p) => `${numberOf(p, 'tdp', 'TDP')} Вт` },
    {
      label: 'Графика',
      value: (p) => (hasIntegratedGraphics(p) ? 'встроенная' : 'нет'),
    },
  ],
  motherboard: [
    { label: 'Сокет', value: (p) => textOf(p, 'сокет', 'Сокет') },
    { label: 'Чипсет', value: (p) => textOf(p, 'чипсет', 'Чипсет') },
    { label: 'Память', value: (p) => textOf(p, 'тип_памяти', 'Тип памяти') },
    { label: 'Форм-фактор', value: (p) => textOf(p, 'форм_фактор', 'Форм-фактор') },
    { label: 'M.2', value: (p) => numberOf(p, 'm2_слоты', 'Слоты M.2') || '—' },
  ],
  ram: [
    { label: 'Тип', value: (p) => textOf(p, 'тип', 'Тип') },
    { label: 'Объём', value: (p) => `${numberOf(p, 'объем', 'Объём')} ГБ` },
    { label: 'Частота', value: (p) => `${numberOf(p, 'частота', 'Частота')} МГц` },
    { label: 'Тайминги', value: (p) => textOf(p, 'тайминги', 'Тайминги') || '—' },
  ],
  cooling: [
    { label: 'Тип', value: (p) => textOf(p, 'тип', 'Тип') },
    {
      label: 'Рассеиваемая мощность',
      value: (p) => `${numberOf(p, 'tdp', 'Рассеиваемая мощность')} Вт`,
    },
    { label: 'Высота', value: (p) => `${numberOf(p, 'высота', 'Высота')} мм` },
    {
      label: 'Радиатор',
      value: (p) => {
        const size = numberOf(p, 'длина_радиатора', 'Длина радиатора');
        return size ? `${size} мм` : '—';
      },
    },
  ],
  gpu: [
    { label: 'Память', value: (p) => `${numberOf(p, 'объем_памяти', 'Память')} ГБ` },
    { label: 'Длина', value: (p) => `${numberOf(p, 'длина', 'Длина')} мм` },
    { label: 'TDP', value: (p) => `${numberOf(p, 'tdp', 'TDP')} Вт` },
    {
      label: 'Вентиляторы',
      value: (p) => numberOf(p, 'количество_вентиляторов', 'Вентиляторы') || '—',
    },
  ],
  storage: [
    { label: 'Тип', value: (p) => textOf(p, 'тип', 'Тип') },
    { label: 'Объём', value: (p) => `${numberOf(p, 'объем_в_гб', 'Объём')} ГБ` },
    { label: 'Интерфейс', value: (p) => textOf(p, 'интерфейс', 'Интерфейс') },
    {
      label: 'Скорость',
      value: (p) => {
        const spec = p.specs.find((s) => s.label === 'Скорость чтения / записи');
        return spec?.value || '—';
      },
    },
  ],
  psu: [
    {
      label: 'Мощность',
      value: (p) => `${numberOf(p, 'мощность_в_ваттах', 'Мощность')} Вт`,
    },
    {
      label: '80 PLUS',
      value: (p) => textOf(p, 'сертификат_80plus', 'Сертификат 80 PLUS') || '—',
    },
    {
      label: 'Модульный',
      value: (p) => (booleanOf(p, 'модульный', 'Модульный') ? 'да' : 'нет'),
    },
    {
      label: 'PCIe 5.0',
      value: (p) => (booleanOf(p, 'pcie_gen5', 'PCIe 5.0') ? 'да' : 'нет'),
    },
  ],
  case: [
    { label: 'Форм-фактор', value: (p) => textOf(p, 'форм_фактор', 'Форм-фактор') },
    {
      label: 'Макс. видеокарта',
      value: (p) =>
        `${numberOf(p, 'макс_длина_gpu', 'Максимальная длина видеокарты')} мм`,
    },
    {
      label: 'Макс. кулер',
      value: (p) =>
        `${numberOf(p, 'макс_высота_кулера', 'Максимальная высота кулера')} мм`,
    },
  ],
};

/**
 * Таблица выбора комплектующих.
 */
function ProductTable({ items, columns, isSelected, onPick, emptyText }) {
  if (!items.length) {
    return <div className="state">{emptyText}</div>;
  }

  return (
    <div className="picker-wrap builder-picker">
      <table className="picker">
        <thead>
          <tr>
            <th aria-label="Выбор" />
            <th>Название</th>
            {columns.map((column) => (
              <th key={column.label}>{column.label}</th>
            ))}
            <th>Цена</th>
          </tr>
        </thead>
        <tbody>
          {items.map((product) => {
            const selected = isSelected(product);
            const outOfStock = Number(product.stock ?? 0) <= 0;
            return (
              <tr
                className={`${selected ? 'is-on' : ''}${outOfStock ? ' is-out' : ''}`}
                key={product.id}
                onClick={() => {
                  if (!outOfStock) onPick(product);
                }}
                onKeyDown={(event) => {
                  if (outOfStock) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPick(product);
                  }
                }}
                tabIndex={outOfStock ? -1 : 0}
              >
                <td>
                  <span className="picker-check" aria-hidden="true">
                    {selected ? '✓' : ''}
                  </span>
                </td>
                <td className="picker-name">
                  <div className="picker-product">
                    {product.imageUrl ? (
                      <img
                        alt=""
                        className="picker-thumb"
                        loading="lazy"
                        src={product.imageUrl}
                      />
                    ) : (
                      <span className="picker-thumb picker-thumb-empty">фото</span>
                    )}
                    <span className="picker-name-text">
                      <Link
                        className="picker-link"
                        onClick={(event) => event.stopPropagation()}
                        title="Открыть страницу товара"
                        to={`/product/${product.id}`}
                      >
                        {product.name}
                      </Link>
                      {outOfStock && <span className="picker-out">нет в наличии</span>}
                    </span>
                  </div>
                </td>
                {columns.map((column) => (
                  <td key={column.label}>{column.value(product)}</td>
                ))}
                <td className="picker-price">{money(product.price)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Пошаговый конфигуратор ПК с проверкой совместимости на сервере.
 */
export default function Builder() {
  const [lists, setLists] = useState({
    cpu: [],
    motherboard: [],
    ram: [],
    cooling: [],
    gpu: [],
    storage: [],
    psu: [],
    case: [],
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(0);
  const navigate = useNavigate();
  const [selection, setSelection] = useState({
    cpu: null,
    motherboard: null,
    ram: null,
    cooling: null,
    gpu: null,
    storage: [],
    psu: null,
    case: null,
  });
  const [skipGpu, setSkipGpu] = useState(false);
  const [buildName, setBuildName] = useState('');
  const [note, setNote] = useState('');
  const [check, setCheck] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft] = useState(readDraft);
  const [hydrated, setHydrated] = useState(false);
  const [searchParams] = useSearchParams();
  const buildId = searchParams.get('build');
  const cpuParam = searchParams.get('cpu');
  const gpuParam = searchParams.get('gpu');
  const psuParam = searchParams.get('psu');
  const loadedBuildRef = useRef(false);
  const loadedPartsRef = useRef(false);

  // Загрузка каталога и восстановление черновика.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const keys = [
          'cpu',
          'motherboard',
          'ram',
          'cooling',
          'gpu',
          'storage',
          'psu',
          'case',
        ];
        const loaded = await Promise.all(
          keys.map((category) =>
            getProducts({ category, limit: 100, sort: 'price_asc' }),
          ),
        );
        if (!alive) return;

        const next = {};
        keys.forEach((category, index) => {
          next[category] = loaded[index].items;
        });
        setLists(next);

        if (draft && !buildId) {
          const find = (category, id) =>
            id ? next[category].find((product) => product.id === id) || null : null;
          setSelection({
            cpu: find('cpu', draft.cpu),
            motherboard: find('motherboard', draft.motherboard),
            ram: find('ram', draft.ram),
            cooling: find('cooling', draft.cooling),
            gpu: find('gpu', draft.gpu),
            storage: (draft.storage || [])
              .map((id) => find('storage', id))
              .filter(Boolean),
            psu: find('psu', draft.psu),
            case: find('case', draft.case),
          });
          setSkipGpu(Boolean(draft.skipGpu));
          setStep(Number(draft.step) || 0);
          setBuildName(draft.name || '');
          setNote(draft.note || '');
        }
        setHydrated(true);
      } catch (reason) {
        if (alive) setLoadError(reason.message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [draft, buildId]);

  // Черновик хранится в localStorage: только идентификаторы, без секретов.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        draftKey(),
        JSON.stringify({
          step,
          cpu: selection.cpu?.id || null,
          motherboard: selection.motherboard?.id || null,
          ram: selection.ram?.id || null,
          cooling: selection.cooling?.id || null,
          gpu: selection.gpu?.id || null,
          storage: selection.storage.map((product) => product.id),
          psu: selection.psu?.id || null,
          case: selection.case?.id || null,
          skipGpu,
          name: buildName,
          note,
        }),
      );
    } catch {
      /* приватный режим браузера */
    }
  }, [step, selection, skipGpu, buildName, note, hydrated]);

  const socket = textOf(selection.cpu, 'сокет', 'Сокет');
  const memoryType = textOf(selection.motherboard, 'тип_памяти', 'Тип памяти');
  const cpuTdp = numberOf(selection.cpu, 'tdp', 'TDP');
  const gpuTdp = skipGpu ? 0 : numberOf(selection.gpu, 'tdp', 'TDP');
  const needWatts = Math.ceil((cpuTdp + gpuTdp) * 1.25);
  const integrated = hasIntegratedGraphics(selection.cpu);

  const motherboards = useMemo(
    () =>
      socket
        ? lists.motherboard.filter(
            (product) => textOf(product, 'сокет', 'Сокет') === socket,
          )
        : lists.motherboard,
    [lists.motherboard, socket],
  );

  const rams = useMemo(
    () =>
      memoryType
        ? lists.ram.filter((product) => textOf(product, 'тип', 'Тип') === memoryType)
        : lists.ram,
    [lists.ram, memoryType],
  );

  const coolings = useMemo(
    () =>
      cpuTdp
        ? lists.cooling.filter(
            (product) => numberOf(product, 'tdp', 'Рассеиваемая мощность') >= cpuTdp,
          )
        : lists.cooling,
    [lists.cooling, cpuTdp],
  );

  const psus = useMemo(
    () =>
      needWatts
        ? lists.psu.filter(
            (product) =>
              numberOf(product, 'мощность_в_ваттах', 'Мощность') >= needWatts,
          )
        : lists.psu,
    [lists.psu, needWatts],
  );

  const cases = useMemo(() => {
    const boardRank = formRank(
      textOf(selection.motherboard, 'форм_фактор', 'Форм-фактор'),
    );
    const gpuLength = numberOf(selection.gpu, 'длина', 'Длина');
    const coolerHeight = numberOf(selection.cooling, 'высота', 'Высота');
    const coolingType = textOf(selection.cooling, 'тип', 'Тип').toLowerCase();
    const isLiquid =
      coolingType.includes('жидк') ||
      coolingType.includes('водян') ||
      coolingType.includes('сжо') ||
      coolingType.includes('aio');
    const radiator = numberOf(selection.cooling, 'длина_радиатора', 'Длина радиатора');

    return lists.case.filter((product) => {
      if (selection.motherboard) {
        if (formRank(textOf(product, 'форм_фактор', 'Форм-фактор')) < boardRank) {
          return false;
        }
      }
      if (selection.gpu && !skipGpu) {
        const maxGpu = numberOf(
          product,
          'макс_длина_gpu',
          'Максимальная длина видеокарты',
        );
        if (gpuLength > 0 && maxGpu > 0 && gpuLength > maxGpu) return false;
      }
      if (selection.cooling) {
        if (isLiquid) {
          const maxRadiator = numberOf(
            product,
            'макс_длина_радиатора',
            'Максимальная длина радиатора',
          );
          if (radiator > 0 && maxRadiator > 0 && radiator > maxRadiator) {
            return false;
          }
        } else {
          const maxCooler = numberOf(
            product,
            'макс_высота_кулера',
            'Максимальная высота кулера',
          );
          if (coolerHeight > 0 && maxCooler > 0 && coolerHeight > maxCooler) {
            return false;
          }
        }
      }
      return true;
    });
  }, [lists.case, selection.motherboard, selection.cooling, selection.gpu, skipGpu]);

  // Открытие сохранённой сборки: /builder?build=42.
  useEffect(() => {
    if (!buildId || loading || loadedBuildRef.current) return undefined;
    loadedBuildRef.current = true;
    let alive = true;

    getBuild(buildId)
      .then(({ build }) => {
        if (!alive) return;
        const next = {
          cpu: null,
          motherboard: null,
          ram: null,
          cooling: null,
          gpu: null,
          storage: [],
          psu: null,
          case: null,
        };
        for (const component of build.components) {
          if (component.category === 'storage') {
            next.storage.push(component.product);
          } else {
            next[component.category] = component.product;
          }
        }
        setSelection(next);
        setSkipGpu(!next.gpu);
        setBuildName(build.name);
        setNote(build.note || '');
        setStep(8);
        setHydrated(true);
      })
      .catch((reason) => {
        if (alive) setError(reason.message);
      });

    return () => {
      alive = false;
    };
  }, [buildId, loading]);

  // Открытие из калькулятора БП: /builder?cpu=...&gpu=...&psu=...
  useEffect(() => {
    if (buildId || !cpuParam || loading || loadedPartsRef.current) return;
    loadedPartsRef.current = true;

    const find = (list, id) => list.find((product) => product.id === id) || null;
    const cpu = find(lists.cpu, cpuParam);
    if (!cpu) return;
    const gpu = gpuParam ? find(lists.gpu, gpuParam) : null;
    const psu = psuParam ? find(lists.psu, psuParam) : null;

    setSelection({
      cpu,
      motherboard: null,
      ram: null,
      cooling: null,
      gpu,
      storage: [],
      psu,
      case: null,
    });
    setSkipGpu(!gpu && hasIntegratedGraphics(cpu));
    setBuildName('');
    setNote('');
    setStep(0);
    setHydrated(true);
  }, [buildId, cpuParam, gpuParam, psuParam, loading, lists]);

  // Встроенной графики нет — режим «без видеокарты» недоступен.
  useEffect(() => {
    if (!integrated) setSkipGpu(false);
  }, [integrated]);

  // Если зависимость изменилась — снимаем несовместимый выбор.
  useEffect(() => {
    setSelection((current) => {
      const next = { ...current };
      if (next.motherboard && !motherboards.some((p) => p.id === next.motherboard.id)) {
        next.motherboard = null;
      }
      if (next.ram && !rams.some((p) => p.id === next.ram.id)) next.ram = null;
      if (next.cooling && !coolings.some((p) => p.id === next.cooling.id)) {
        next.cooling = null;
      }
      if (next.psu && !psus.some((p) => p.id === next.psu.id)) next.psu = null;
      if (next.case && !cases.some((p) => p.id === next.case.id)) next.case = null;
      return next;
    });
  }, [motherboards, rams, coolings, psus, cases]);

  const total = useMemo(() => {
    const values = [
      selection.cpu,
      selection.motherboard,
      selection.ram,
      selection.cooling,
      skipGpu ? null : selection.gpu,
      ...selection.storage,
      selection.psu,
      selection.case,
    ];
    return values.reduce((sum, product) => sum + (product ? product.price : 0), 0);
  }, [selection, skipGpu]);

  const payload = useMemo(() => {
    const components = {};
    for (const key of ['cpu', 'motherboard', 'ram', 'cooling', 'psu', 'case']) {
      if (selection[key]) components[key] = selection[key].id;
    }
    if (!skipGpu && selection.gpu) components.gpu = selection.gpu.id;
    if (selection.storage.length) {
      components.storage = selection.storage.map((product) => product.id);
    }
    return components;
  }, [selection, skipGpu]);

  // На итоговом шаге проверяем совместимость автоматически: шаги уже
  // отфильтрованы, а здесь показываем итог перед сохранением.
  useEffect(() => {
    if (step === STEPS.length - 1 && payload.cpu) {
      void handleCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const storageValid =
    selection.storage.filter((p) =>
      textOf(p, 'тип', 'Тип').toUpperCase().includes('SSD'),
    ).length === 1 &&
    selection.storage.filter((p) =>
      textOf(p, 'тип', 'Тип').toUpperCase().includes('HDD'),
    ).length <= 1;

  const current = STEPS[step];

  const canNext =
    current.key === 'summary'
      ? true
      : current.key === 'gpu'
        ? Boolean(selection.gpu) || skipGpu
        : current.key === 'storage'
          ? storageValid
          : Boolean(selection[current.key]);

  /**
   * Выбор комплектующего. Для накопителей действует правило:
   * ровно один SSD и не более одного HDD.
   */
  function pick(product) {
    const key = current.key;
    if (key === 'storage') {
      const type = textOf(product, 'тип', 'Тип').toUpperCase();
      const isSsd = type.includes('SSD');
      const isHdd = type.includes('HDD');
      if (!isSsd && !isHdd) return;
      setSelection((currentSelection) => {
        const exists = currentSelection.storage.some((p) => p.id === product.id);
        let list = currentSelection.storage;
        if (exists) {
          list = list.filter((p) => p.id !== product.id);
        } else {
          list = list.filter((p) =>
            isSsd
              ? !textOf(p, 'тип', 'Тип').toUpperCase().includes('SSD')
              : !textOf(p, 'тип', 'Тип').toUpperCase().includes('HDD'),
          );
          list = [...list, product];
        }
        return { ...currentSelection, storage: list };
      });
      return;
    }

    if (key === 'gpu') setSkipGpu(false);
    // Повторный клик по выбранной строке снимает выбор.
    const isSame = selection[key]?.id === product.id;
    const merged = { ...selection, [key]: isSame ? null : product };
    const pruned = pruneIncompatible(
      merged,
      key === 'gpu' && !isSame ? false : skipGpu,
    );
    const removed = Object.keys(merged).filter(
      (field) =>
        field !== 'storage' && merged[field] && merged[field] !== pruned[field],
    );
    setSelection(pruned);
    setMessage(
      isSame
        ? 'Выбор снят.'
        : removed.length
          ? 'Несовместимые компоненты убраны из сборки.'
          : '',
    );
    setCheck(null);
  }

  function isSelected(product) {
    if (current.key === 'storage') {
      return selection.storage.some((item) => item.id === product.id);
    }
    if (current.key === 'gpu' && skipGpu) return false;
    return selection[current.key]?.id === product.id;
  }

  /**
   * Полный сброс конфигуратора: детали, название, заметка и проверка.
   * Черновик тоже удаляем, чтобы после перезагрузки сборка не вернулась.
   */
  function resetBuilder() {
    setSelection({
      cpu: null,
      motherboard: null,
      ram: null,
      cooling: null,
      gpu: null,
      storage: [],
      psu: null,
      case: null,
    });
    setSkipGpu(false);
    setBuildName('');
    setNote('');
    setCheck(null);
    setMessage('');
    setError('');
    setStep(0);
    setResetOpen(false);
    try {
      localStorage.removeItem(draftKey());
    } catch {
      /* локальное хранилище может быть недоступно */
    }
    if (buildId) navigate('/builder', { replace: true });
  }

  async function handleCheck() {
    setError('');
    setMessage('');
    if (!payload.cpu) {
      setError('Сначала выберите процессор.');
      return null;
    }
    try {
      const result = await checkCompatibility(payload);
      setCheck(result);
      setMessage(
        result.compatible
          ? 'Сборка совместима.'
          : `Найдено проблем: ${result.errors.length}.`,
      );
      return result;
    } catch (reason) {
      setError(reason.message);
      return null;
    }
  }

  async function handleSave() {
    setError('');
    setMessage('');
    if (!readAuth().accessToken) {
      setError('Чтобы сохранить сборку, войдите в аккаунт.');
      return;
    }
    setSaving(true);
    try {
      const name =
        buildName.trim() || `Сборка от ${new Date().toLocaleDateString('ru-RU')}`;
      const result = await saveBuild({ name, note, components: payload });
      setMessage(`Сборка «${result.build.name}» сохранена в профиле.`);
      setBuildName(result.build.name);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  // Добавляет все выбранные комплектующие в корзину и ведёт к оформлению.
  async function handleAddToCart() {
    setError('');
    setMessage('');
    const result = check || (await handleCheck());
    if (!result) return;
    if (!result.compatible) {
      setError('Сборка несовместима: устраните ошибки перед покупкой.');
      return;
    }

    const products = ['cpu', 'motherboard', 'ram', 'cooling', 'psu', 'case']
      .map((key) => selection[key])
      .filter(Boolean);
    if (!skipGpu && selection.gpu) products.push(selection.gpu);
    products.push(...selection.storage);

    const added = addBuildToCart(products);
    if (added.added > 0) {
      navigate('/cart');
    } else {
      setError('Не удалось добавить сборку: проверьте остатки товаров.');
    }
  }

  function renderStep() {
    if (current.key === 'summary') {
      return (
        <div className="builder-summary-step">
          <div className="field">
            <span>Название сборки</span>
            <input
              maxLength={150}
              onChange={(event) => setBuildName(event.target.value)}
              placeholder="Например, «Игровая сборка 1440p»"
              type="text"
              value={buildName}
            />
          </div>
          <div className="field">
            <span>Заметка</span>
            <textarea
              maxLength={1000}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Для каких задач собираете ПК"
              rows={3}
              value={note}
            />
          </div>

          <p className="hint">
            Совместимость проверяется автоматически: шаги уже отфильтрованы, здесь
            показан итог перед сохранением.
          </p>

          <div className="builder-actions">
            <button
              className="btn btn-secondary"
              disabled={!check || check.errors.length > 0}
              onClick={handleAddToCart}
              type="button"
            >
              В корзину
            </button>
            <button
              className="btn"
              disabled={saving}
              onClick={handleSave}
              type="button"
            >
              {saving ? 'Сохраняем…' : 'Сохранить сборку'}
            </button>
            <Link className="btn btn-secondary" to="/builds">
              Мои сборки
            </Link>
          </div>

          {check && (
            <div className="compat-result" aria-live="polite">
              <strong>
                {check.compatible
                  ? 'Проверка пройдена: сборка совместима.'
                  : 'Проверка не пройдена:'}
              </strong>
              {check.errors.length > 0 && (
                <ul className="compat-errors">
                  {check.errors.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
              {check.warnings.length > 0 && (
                <ul className="compat-warnings">
                  {check.warnings.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      );
    }

    if (current.key === 'gpu') {
      return (
        <>
          {integrated && (
            <button
              className={`btn ${skipGpu ? '' : 'btn-secondary'}`}
              onClick={() => {
                setSkipGpu(true);
                setCheck(null);
                setSelection((currentSelection) => ({
                  ...currentSelection,
                  gpu: null,
                }));
              }}
              type="button"
            >
              Без дискретной видеокарты (встроенная графика)
            </button>
          )}
          <ProductTable
            columns={COLUMNS.gpu}
            emptyText="Видеокарты не найдены."
            isSelected={isSelected}
            items={lists.gpu}
            onPick={pick}
          />
        </>
      );
    }

    const items = {
      cpu: lists.cpu,
      motherboard: motherboards,
      ram: rams,
      cooling: coolings,
      storage: lists.storage,
      psu: psus,
      case: cases,
    }[current.key];

    return (
      <>
        {current.key === 'motherboard' && socket && (
          <p className="hint">
            Показаны платы с сокетом <strong>{socket}</strong> под выбранный процессор.
          </p>
        )}
        {current.key === 'ram' && memoryType && (
          <p className="hint">
            Показана память типа <strong>{memoryType}</strong> под выбранную плату.
          </p>
        )}
        {current.key === 'psu' && needWatts > 0 && (
          <p className="hint">
            Рекомендуемая мощность с запасом 25%: <strong>{needWatts} Вт</strong>{' '}
            (процессор {cpuTdp} Вт
            {gpuTdp > 0 ? `, видеокарта ${gpuTdp} Вт` : ''}).
          </p>
        )}
        {current.key === 'storage' && (
          <p className="hint">
            Нужен ровно один SSD; HDD можно добавить один. Повторный клик снимает выбор.
          </p>
        )}
        <ProductTable
          columns={COLUMNS[current.key]}
          emptyText={
            current.key === 'psu'
              ? 'Подходящих блоков питания нет — выберите более мощную модель.'
              : 'Подходящих вариантов нет. Измените предыдущий шаг.'
          }
          isSelected={isSelected}
          items={items}
          onPick={pick}
        />
      </>
    );
  }

  if (loading) {
    return (
      <div className="container">
        <div className="state">Загружаем комплектующие…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="container">
        <div className="state error">Не удалось загрузить каталог: {loadError}</div>
      </div>
    );
  }

  return (
    <div className="container builder">
      <div className="breadcrumbs">
        <Link to="/">Главная</Link>
        <span>Конфигуратор</span>
      </div>

      <div className="builder-head">
        <div>
          <div className="h1" style={{ fontSize: 26 }}>
            {current.title}
          </div>
          <div className="sub">
            Шаг {Math.min(step + 1, STEPS.length)} из {STEPS.length}
          </div>
        </div>
        <div className="builder-head-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setResetOpen(true)}
            type="button"
          >
            Сбросить конфигурацию
          </button>
          <Link className="btn btn-secondary" to="/psu">
            Калькулятор БП
          </Link>
        </div>
      </div>

      {error && (
        <div className="state error" role="alert">
          {error} {!readAuth().accessToken && <Link to="/login">Войти</Link>}
        </div>
      )}

      <div className="step-strip" role="list">
        {STEPS.map((item, index) => {
          const filled =
            item.key === 'storage'
              ? selection.storage.length > 0
              : item.key === 'gpu'
                ? Boolean(selection.gpu) || skipGpu
                : Boolean(selection[item.key]);
          return (
            <button
              className={`step-pill${index === step ? ' is-on' : ''}${
                filled ? ' is-done' : ''
              }`}
              key={item.key}
              onClick={() => setStep(index)}
              type="button"
            >
              <span className="step-num">{index + 1}</span>
              <span>{item.title}</span>
            </button>
          );
        })}
      </div>

      <div className="builder-layout">
        <section className="builder-main">
          {current.key === 'summary' && message && (
            <div className="state">{message}</div>
          )}
          {renderStep()}
        </section>

        <aside className="builder-side">
          <h3>Ваша сборка</h3>
          <dl className="build-parts">
            {STEPS.slice(0, 8).map((item) => {
              const value =
                item.key === 'storage'
                  ? selection.storage.map((p) => p.name).join(', ')
                  : item.key === 'gpu' && skipGpu
                    ? 'встроенная графика'
                    : selection[item.key]?.name || '';
              return (
                <div key={item.key}>
                  <dt>{item.title}</dt>
                  <dd>{value || '—'}</dd>
                </div>
              );
            })}
          </dl>
          <div className="build-total">
            <span>Итого</span>
            <strong>{money(total)}</strong>
          </div>
        </aside>
      </div>

      <div className="builder-nav">
        <button
          className="btn btn-secondary"
          disabled={step === 0}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
          type="button"
        >
          ← Назад
        </button>
        {step < STEPS.length - 1 && (
          <button
            className="btn"
            disabled={!canNext}
            onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
            type="button"
          >
            {current.next} →
          </button>
        )}
      </div>

      <ConfirmDialog
        confirmLabel="Сбросить"
        onCancel={() => setResetOpen(false)}
        onConfirm={resetBuilder}
        open={resetOpen}
        text="Все выбранные комплектующие, название и заметка будут удалены. Черновик тоже очистится."
        title="Сбросить конфигурацию?"
      />
    </div>
  );
}
